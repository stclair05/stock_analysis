import { FormEvent, useEffect, useMemo, useState } from "react";
import "./MomentumPage.css";

type BaselineKey = "portfolio" | "spx" | "dji" | "iwm" | "nasdaq";

type MomentumResponse = {
  momentum_weekly: Record<string, number>;
  momentum_monthly: Record<string, number>;
  portfolio_values?: Record<string, number>;
};

type MomentumPoint = {
  symbol: string;
  weekly?: number;
  monthly?: number;
};

const FALLBACK: MomentumResponse = {
  momentum_weekly: {},
  momentum_monthly: {},
};

const BASELINES: BaselineKey[] = ["portfolio", "spx", "dji", "iwm", "nasdaq"];
const BASELINE_LABELS: Record<BaselineKey, string> = {
  portfolio: "Portfolio",
  spx: "SPX",
  dji: "DJI",
  iwm: "IWM",
  nasdaq: "NASDAQ",
};

type MomentumGridProps = {
  baseline: BaselineKey;
  data: MomentumResponse;
  loading: boolean;
  error: string | null;
  mode: "portfolio" | "custom";
  zoomScale: number;
  customSymbols: string[];
};

function MomentumGrid({
  baseline,
  data,
  loading,
  error,
  mode,
  zoomScale,
  customSymbols,
}: MomentumGridProps) {
  const [isGridVisible, setIsGridVisible] = useState(true);
  const points: MomentumPoint[] = useMemo(() => {
    const symbols = new Set<string>([
      ...Object.keys(data.momentum_weekly || {}),
      ...Object.keys(data.momentum_monthly || {}),
    ]);

    return Array.from(symbols)
      .sort()
      .map((symbol) => ({
        symbol,
        weekly: data.momentum_weekly?.[symbol],
        monthly: data.momentum_monthly?.[symbol],
      }));
  }, [data.momentum_monthly, data.momentum_weekly]);

  const extremes = useMemo(() => {
    const scored = points.map((p) => ({
      symbol: p.symbol,
      score: (p.weekly ?? 0) + (p.monthly ?? 0),
    }));

    const positive = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((s) => s.symbol);

    const negative = scored
      .filter((s) => s.score < 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 4)
      .map((s) => s.symbol);

    return {
      positive: new Set(positive),
      negative: new Set(negative),
    };
  }, [points]);

  const range = useMemo(() => {
    const allValues = points.flatMap((p) => [p.weekly ?? 0, p.monthly ?? 0]);
    const maxAbs = Math.max(...allValues.map((v) => Math.abs(v)), 3);
    return maxAbs;
  }, [points]);

  const visibleRange = useMemo(
    () => Math.max(range / zoomScale, 1),
    [range, zoomScale]
  );

  const toPosition = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 50;
    const clamped = Math.max(Math.min(value, visibleRange), -visibleRange);
    return 50 + (clamped / visibleRange) * 45;
  };

  const jitterPercent = (symbol: string, axis: "x" | "y") => {
    // Deterministic, tiny jitter to reduce over-plotting in the center.
    const codeSum = symbol
      .split("")
      .reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
    const axisSeed = axis === "x" ? 17 : 31;
    const normalized = Math.sin(codeSum * axisSeed) * 0.6; // between -0.6 and 0.6
    return normalized;
  };

  const ticks = useMemo(() => {
    const step = Math.max(1, Math.floor(visibleRange / 3));
    const values: number[] = [];
    for (
      let v = -Math.ceil(visibleRange);
      v <= Math.ceil(visibleRange);
      v += step
    ) {
      if (Math.abs(v) < 0.01) continue;
      values.push(parseFloat(v.toFixed(1)));
    }
    return values;
  }, [visibleRange]);

  const portfolioValues = data.portfolio_values || {};

  const quadrantTotals = useMemo(() => {
    const totals = {
      positiveDeveloping: 0,
      positiveTrend: 0,
      negativeTrend: 0,
      negativeDeveloping: 0,
    };

    if (mode !== "portfolio") {
      return totals;
    }

    points.forEach((point) => {
      if (
        typeof point.weekly !== "number" ||
        typeof point.monthly !== "number"
      ) {
        return;
      }
      const value = portfolioValues[point.symbol];
      if (typeof value !== "number") {
        return;
      }

      if (point.monthly >= 0 && point.weekly >= 0) {
        totals.positiveTrend += value;
      } else if (point.monthly < 0 && point.weekly >= 0) {
        totals.positiveDeveloping += value;
      } else if (point.monthly < 0 && point.weekly < 0) {
        totals.negativeTrend += value;
      } else {
        totals.negativeDeveloping += value;
      }
    });

    return totals;
  }, [mode, points, portfolioValues]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);

  const hasSymbols =
    mode === "portfolio" ? points.length > 0 : customSymbols.length > 0;

  return (
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="card-title mb-0">
            {BASELINE_LABELS[baseline]} baseline grid
          </h5>
          <button
            type="button"
            className="btn btn-outline-secondary p-0 d-inline-flex align-items-center justify-content-center"
            style={{ width: "26px", height: "26px", lineHeight: 1 }}
            onClick={() => setIsGridVisible((visible) => !visible)}
            aria-label={`Toggle ${BASELINE_LABELS[baseline]} momentum grid`}
          >
            <span aria-hidden="true">{isGridVisible ? "−" : "+"}</span>
          </button>
        </div>

        {error && <div className="alert alert-warning">{error}</div>}

        {isGridVisible ? (
          <>
            <div className="momentum-grid mb-3" aria-live="polite">
              <div className="momentum-quadrant-label positive-developing">
                <span className="momentum-quadrant-title">
                  Positive Developing
                </span>
                {mode === "portfolio" && (
                  <div className="momentum-quadrant-value">
                    <span className="momentum-quadrant-value-label">
                      Portfolio value
                    </span>
                    <span className="momentum-quadrant-value-amount">
                      {formatCurrency(quadrantTotals.positiveDeveloping)}
                    </span>
                  </div>
                )}
              </div>
              <div className="momentum-quadrant-label positive-trend">
                <span className="momentum-quadrant-title">Positive Trend</span>
                {mode === "portfolio" && (
                  <div className="momentum-quadrant-value">
                    <span className="momentum-quadrant-value-label">
                      Portfolio value
                    </span>
                    <span className="momentum-quadrant-value-amount">
                      {formatCurrency(quadrantTotals.positiveTrend)}
                    </span>
                  </div>
                )}
              </div>
              <div className="momentum-quadrant-label negative-trend">
                <span className="momentum-quadrant-title">Negative Trend</span>
                {mode === "portfolio" && (
                  <div className="momentum-quadrant-value">
                    <span className="momentum-quadrant-value-label">
                      Portfolio value
                    </span>
                    <span className="momentum-quadrant-value-amount">
                      {formatCurrency(quadrantTotals.negativeTrend)}
                    </span>
                  </div>
                )}
              </div>
              <div className="momentum-quadrant-label negative-developing">
                <span className="momentum-quadrant-title">
                  Negative Developing
                </span>
                {mode === "portfolio" && (
                  <div className="momentum-quadrant-value">
                    <span className="momentum-quadrant-value-label">
                      Portfolio value
                    </span>
                    <span className="momentum-quadrant-value-amount">
                      {formatCurrency(quadrantTotals.negativeDeveloping)}
                    </span>
                  </div>
                )}
              </div>

              <div
                className="momentum-axis momentum-axis--x"
                style={{ top: "50%" }}
                aria-hidden
              />
              <div
                className="momentum-axis momentum-axis--y"
                style={{ left: "50%" }}
                aria-hidden
              />

              <div className="momentum-axis-label momentum-axis-label--x">
                21D Momentum Score
              </div>
              <div className="momentum-axis-label momentum-axis-label--y">
                5D Momentum Score
              </div>

              {ticks.map((tick) => (
                <div
                  key={`x-${baseline}-${tick}`}
                  className="momentum-tick"
                  style={{ left: `${toPosition(tick)}%`, top: "52%" }}
                >
                  <div className="momentum-tick-line momentum-tick-line--x" />
                  <div style={{ transform: "translate(-50%, 6px)" }}>
                    {tick}
                  </div>
                </div>
              ))}
              {ticks.map((tick) => (
                <div
                  key={`y-${baseline}-${tick}`}
                  className="momentum-tick"
                  style={{ top: `${100 - toPosition(tick)}%`, left: "48%" }}
                >
                  <div className="momentum-tick-line momentum-tick-line--y" />
                  <div style={{ transform: "translate(-26px, -50%)" }}>
                    {tick}
                  </div>
                </div>
              ))}

              {points.map((point) => {
                const isPositiveExtreme = extremes.positive.has(point.symbol);
                const isNegativeExtreme = extremes.negative.has(point.symbol);
                const quadrantClass =
                  typeof point.weekly === "number" &&
                  typeof point.monthly === "number"
                    ? point.monthly >= 0 && point.weekly >= 0
                      ? " momentum-point--positive-trend"
                      : point.monthly < 0 && point.weekly >= 0
                      ? " momentum-point--positive-developing"
                      : point.monthly < 0 && point.weekly < 0
                      ? " momentum-point--negative-trend"
                      : " momentum-point--negative-developing"
                    : "";

                return (
                  <div
                    key={`${baseline}-${point.symbol}`}
                    className={`momentum-point${
                      isPositiveExtreme
                        ? " momentum-point--positive-extreme"
                        : ""
                    }${
                      isNegativeExtreme
                        ? " momentum-point--negative-extreme"
                        : ""
                    }${quadrantClass}`}
                    style={{
                      left: `${
                        toPosition(point.monthly) +
                        jitterPercent(point.symbol, "x")
                      }%`,
                      top: `${
                        100 -
                        toPosition(point.weekly) +
                        jitterPercent(point.symbol, "y")
                      }%`,
                    }}
                    title={`${point.symbol}: 5D ${point.weekly ?? "-"}, 21D ${
                      point.monthly ?? "-"
                    }`}
                  >
                    <span className="momentum-point__label">
                      {point.symbol}
                    </span>
                  </div>
                );
              })}
            </div>

            {loading && (
              <div className="text-muted">Loading momentum data…</div>
            )}
            {!loading && points.length === 0 && (
              <div className="text-muted">
                {hasSymbols
                  ? "No momentum data available for these symbols."
                  : "Enter symbols above to plot a custom grid."}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted small">
            {BASELINE_LABELS[baseline]} grid hidden.
          </div>
        )}
      </div>
    </div>
  );
}

export default function MomentumPage() {
  const [portfolioData, setPortfolioData] = useState<
    Record<BaselineKey, MomentumResponse>
  >({
    portfolio: FALLBACK,
    spx: FALLBACK,
    dji: FALLBACK,
    iwm: FALLBACK,
    nasdaq: FALLBACK,
  });
  const [portfolioLoading, setPortfolioLoading] = useState<
    Record<BaselineKey, boolean>
  >({
    portfolio: true,
    spx: true,
    dji: true,
    iwm: true,
    nasdaq: true,
  });
  const [portfolioError, setPortfolioError] = useState<
    Record<BaselineKey, string | null>
  >({
    portfolio: null,
    spx: null,
    dji: null,
    iwm: null,
    nasdaq: null,
  });

  const [mode, setMode] = useState<"portfolio" | "custom">("portfolio");
  const [customInput, setCustomInput] = useState("");
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [customData, setCustomData] = useState<
    Record<BaselineKey, MomentumResponse>
  >({
    portfolio: FALLBACK,
    spx: FALLBACK,
    dji: FALLBACK,
    iwm: FALLBACK,
    nasdaq: FALLBACK,
  });
  const [customLoading, setCustomLoading] = useState<
    Record<BaselineKey, boolean>
  >({
    portfolio: false,
    spx: false,
    dji: false,
    iwm: false,
    nasdaq: false,
  });
  const [customError, setCustomError] = useState<
    Record<BaselineKey, string | null>
  >({
    portfolio: null,
    spx: null,
    dji: null,
    iwm: null,
    nasdaq: null,
  });
  const [zoomScale, setZoomScale] = useState(1.25);

  const fetchPortfolioMomentum = (baseline: BaselineKey) => {
    setPortfolioLoading((prev) => ({ ...prev, [baseline]: true }));
    fetch(
      `http://localhost:8000/portfolio_status?scope=momentum&baseline=${baseline}`
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load momentum data");
        }
        return res.json();
      })
      .then((json) => {
        setPortfolioData((prev) => ({
          ...prev,
          [baseline]: {
            momentum_weekly: json.portfolio_momentum_weekly || {},
            momentum_monthly: json.portfolio_momentum_monthly || {},
            portfolio_values: json.portfolio_values || {},
          },
        }));
        setPortfolioError((prev) => ({ ...prev, [baseline]: null }));
      })
      .catch((err) => {
        console.error(err);
        setPortfolioData((prev) => ({ ...prev, [baseline]: FALLBACK }));
        setPortfolioError((prev) => ({
          ...prev,
          [baseline]: "Unable to fetch momentum scores. Showing empty view.",
        }));
      })
      .finally(() =>
        setPortfolioLoading((prev) => ({ ...prev, [baseline]: false }))
      );
  };

  useEffect(() => {
    BASELINES.forEach((baseline) => {
      fetchPortfolioMomentum(baseline);
    });
  }, []);

  const fetchCustomMomentum = (
    symbols: string[],
    selectedBaseline: BaselineKey
  ) => {
    setCustomLoading((prev) => ({ ...prev, [selectedBaseline]: true }));
    fetch("http://localhost:8000/custom_momentum", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbols, baseline: selectedBaseline }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch custom momentum");
        }
        return res.json();
      })
      .then((json) => {
        setCustomData((prev) => ({
          ...prev,
          [selectedBaseline]: {
            momentum_weekly: json.momentum_weekly || {},
            momentum_monthly: json.momentum_monthly || {},
          },
        }));
        setCustomError((prev) => ({ ...prev, [selectedBaseline]: null }));
      })
      .catch((err) => {
        console.error(err);
        setCustomData((prev) => ({ ...prev, [selectedBaseline]: FALLBACK }));
        setCustomError((prev) => ({
          ...prev,
          [selectedBaseline]:
            "Unable to fetch momentum scores for that list. Try different symbols.",
        }));
      })
      .finally(() =>
        setCustomLoading((prev) => ({ ...prev, [selectedBaseline]: false }))
      );
  };

  const onSubmitCustom = (event: FormEvent) => {
    event.preventDefault();
    const parsedSymbols = customInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const uniqueSymbols = Array.from(new Set(parsedSymbols));

    if (uniqueSymbols.length === 0) {
      setCustomError((prev) => ({
        ...prev,
        portfolio: "Enter at least one ticker symbol.",
      }));
      return;
    }

    setCustomError({
      portfolio: null,
      spx: null,
      dji: null,
      iwm: null,
      nasdaq: null,
    });
    setMode("custom");
    setCustomSymbols(uniqueSymbols);
    BASELINES.forEach((baseline) => {
      fetchCustomMomentum(uniqueSymbols, baseline);
    });
  };

  const isCustomLoading = Object.values(customLoading).some(Boolean);

  useEffect(() => {
    if (mode === "custom" && customSymbols.length > 0) {
      BASELINES.forEach((baseline) => {
        fetchCustomMomentum(customSymbols, baseline);
      });
    }
  }, [customSymbols, mode]);

  const subtitle =
    mode === "portfolio"
      ? "Plot of portfolio stocks by 21-day (x-axis) and 5-day (y-axis) relative momentum z-scores across Portfolio, SPX, DJI, IWM, and NASDAQ baselines."
      : "Plot of your custom stock list by 21-day (x-axis) and 5-day (y-axis) relative momentum z-scores across Portfolio, SPX, DJI, IWM, and NASDAQ baselines.";

  return (
    <div className="container-fluid momentum-page py-4">
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <h1 className="fw-bold mb-0">Momentum</h1>
        <div
          className="btn-group"
          role="group"
          aria-label="Momentum view selector"
        >
          <button
            className={`btn btn-outline-primary ${
              mode === "portfolio" ? "active" : ""
            }`}
            type="button"
            onClick={() => setMode("portfolio")}
          >
            Portfolio grid
          </button>
          <button
            className={`btn btn-outline-primary ${
              mode === "custom" ? "active" : ""
            }`}
            type="button"
            onClick={() => setMode("custom")}
          >
            Custom list
          </button>
        </div>
        <div className="d-flex align-items-center gap-2 ms-auto">
          <label
            htmlFor="momentumZoom"
            className="form-label mb-0 small text-muted"
          >
            Zoom
          </label>
          <select
            id="momentumZoom"
            className="form-select form-select-sm w-auto"
            value={zoomScale}
            onChange={(event) => setZoomScale(Number(event.target.value))}
          >
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </div>

      <p className="text-muted mb-4">{subtitle}</p>

      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body">
          <h5 className="card-title mb-3">Plot a custom symbol grid</h5>
          <form className="row g-3" onSubmit={onSubmitCustom}>
            <div className="col-md-8">
              <label htmlFor="customSymbols" className="form-label">
                Enter ticker symbols (comma or space separated)
              </label>
              <input
                id="customSymbols"
                className="form-control"
                placeholder="e.g. AAPL, MU, PTON"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                aria-describedby="customSymbolsHelp"
              />
            </div>
            <div className="col-md-4 d-flex align-items-end">
              <button
                type="submit"
                className="btn btn-primary w-100"
                disabled={isCustomLoading}
              >
                {isCustomLoading ? "Loading…" : "Plot custom grid"}
              </button>
            </div>
          </form>
          <div id="customSymbolsHelp" className="form-text">
            Enter any tickers to see how their momentum compares against your
            selected baselines, even if they are not in the portfolio.
          </div>
          {customError.portfolio && (
            <div className="text-danger small mt-2">
              {customError.portfolio}
            </div>
          )}
          {customSymbols.length > 0 && (
            <div className="text-muted small mt-2">
              Showing custom list: {customSymbols.join(", ")}
            </div>
          )}
        </div>
      </div>

      {BASELINES.map((baseline) => (
        <MomentumGrid
          key={baseline}
          baseline={baseline}
          data={
            mode === "portfolio"
              ? portfolioData[baseline]
              : customData[baseline]
          }
          loading={
            mode === "portfolio"
              ? portfolioLoading[baseline]
              : customLoading[baseline]
          }
          error={
            mode === "portfolio"
              ? portfolioError[baseline]
              : customError[baseline]
          }
          mode={mode}
          zoomScale={zoomScale}
          customSymbols={customSymbols}
        />
      ))}
    </div>
  );
}
