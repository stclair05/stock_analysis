import { FormEvent, useEffect, useMemo, useState } from "react";
import "./MomentumPage.css";

type MaceScoresResponse = {
  current: Record<string, number>;
  twentyone_days_ago: Record<string, number>;
  recent_weighted_change: Record<string, number>;
};

type MacePoint = {
  symbol: string;
  current?: number;
  twentyoneDaysAgo?: number;
  recentWeightedChange?: number;
};

const FALLBACK: MaceScoresResponse = {
  current: {},
  twentyone_days_ago: {},
  recent_weighted_change: {},
};

type MaceGridProps = {
  data: MaceScoresResponse;
  loading: boolean;
  error: string | null;
  mode: "portfolio" | "custom";
  zoomScale: number;
  customSymbols: string[];
  portfolioValues: Record<string, number>;
};

const BASE_RANGE = 0.5;

const toCentered = (value?: number) =>
  typeof value === "number" && !Number.isNaN(value) ? value - 0.5 : undefined;

const formatScore = (value?: number) =>
  typeof value === "number" ? value.toFixed(2) : "—";

const getTickerColor = (change?: number) => {
  if (typeof change !== "number" || Number.isNaN(change)) {
    return "rgba(148, 163, 184, 0.8)";
  }

  if (change > 0.02) return "rgb(34, 197, 94)";
  if (change < -0.02) return "rgb(239, 68, 68)";
  return "rgb(59, 130, 246)";
};

const getArrowColor = (change?: number) => {
  if (typeof change !== "number" || Number.isNaN(change)) {
    return "rgba(148, 163, 184, 0.8)";
  }

  if (change > 0.02) return "rgb(34, 197, 94)";
  if (change < -0.02) return "rgb(239, 68, 68)";
  if (change > 0) return "rgba(34, 197, 94, 0.55)";
  if (change < 0) return "rgba(239, 68, 68, 0.55)";
  return "rgba(148, 163, 184, 0.8)";
};

function MaceGrid({
  data,
  loading,
  error,
  mode,
  zoomScale,
  customSymbols,
  portfolioValues,
}: MaceGridProps) {
  const [isGridVisible, setIsGridVisible] = useState(true);
  const points: MacePoint[] = useMemo(() => {
    const symbols = new Set<string>([
      ...Object.keys(data.current || {}),
      ...Object.keys(data.twentyone_days_ago || {}),
      ...Object.keys(data.recent_weighted_change || {}),
    ]);

    return Array.from(symbols)
      .sort()
      .map((symbol) => ({
        symbol,
        current: data.current?.[symbol],
        twentyoneDaysAgo: data.twentyone_days_ago?.[symbol],
        recentWeightedChange: data.recent_weighted_change?.[symbol],
      }));
  }, [data.current, data.twentyone_days_ago, data.recent_weighted_change]);

  const extremes = useMemo(() => {
    const scored = points.map((p) => ({
      symbol: p.symbol,
      score:
        (toCentered(p.current) ?? 0) + (toCentered(p.twentyoneDaysAgo) ?? 0),
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

  const visibleRange = useMemo(
    () => Math.max(BASE_RANGE / zoomScale, 0.125),
    [zoomScale]
  );

  const toPosition = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 50;
    const min = 0.5 - visibleRange;
    const max = 0.5 + visibleRange;
    const clamped = Math.max(Math.min(value, max), min);
    return 5 + ((clamped - min) / (max - min)) * 90;
  };

  const jitterPercent = (symbol: string, axis: "x" | "y") => {
    const codeSum = symbol
      .split("")
      .reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
    const axisSeed = axis === "x" ? 17 : 31;
    const normalized = Math.sin(codeSum * axisSeed) * 0.6;
    return normalized;
  };

  const ticks = useMemo(() => [0, 0.5, 1], []);
  const breakoutZone = useMemo(
    () => ({
      xMin: 0,
      xMax: 0.5,
      yMin: 0.54,
      yMax: 0.7,
    }),
    []
  );
  const breakdownZone = useMemo(
    () => ({
      xMin: 0.54,
      xMax: 0.7,
      yMin: 0,
      yMax: 0.5,
    }),
    []
  );
  const toZoneStyle = (zone: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  }) => {
    const left = toPosition(zone.xMin);
    const right = toPosition(zone.xMax);
    const top = 100 - toPosition(zone.yMax);
    const bottom = 100 - toPosition(zone.yMin);

    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${right - left}%`,
      height: `${bottom - top}%`,
    };
  };

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
        typeof point.current !== "number" ||
        typeof point.twentyoneDaysAgo !== "number"
      ) {
        return;
      }

      const value = portfolioValues[point.symbol];
      if (typeof value !== "number") {
        return;
      }

      if (point.current >= 0.5 && point.twentyoneDaysAgo >= 0.5) {
        totals.positiveTrend += value;
      } else if (point.current >= 0.5 && point.twentyoneDaysAgo < 0.5) {
        totals.positiveDeveloping += value;
      } else if (point.current < 0.5 && point.twentyoneDaysAgo < 0.5) {
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
            {mode === "portfolio" ? "Portfolio MACE grid" : "Custom MACE grid"}
          </h5>
          <button
            type="button"
            className="btn btn-outline-secondary p-0 d-inline-flex align-items-center justify-content-center"
            style={{ width: "26px", height: "26px", lineHeight: 1 }}
            onClick={() => setIsGridVisible((visible) => !visible)}
            aria-label="Toggle MACE grid"
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
              <div className="momentum-background-note positive-developing-note">
                <span className="momentum-note-letter momentum-note-letter--down">
                  D
                </span>
                <span aria-hidden className="momentum-note-arrow">
                  {" "}
                  --&gt;{" "}
                </span>
                <span className="momentum-note-letter momentum-note-letter--up">
                  U
                </span>
                <span className="momentum-note-text"> (breakout)</span>
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
              <div className="momentum-background-note negative-developing-note">
                <span className="momentum-note-letter momentum-note-letter--up">
                  U
                </span>
                <span aria-hidden className="momentum-note-arrow">
                  {" "}
                  --&gt;{" "}
                </span>
                <span className="momentum-note-letter momentum-note-letter--down">
                  D
                </span>
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
              {/* Dynamic Diagonal Lines */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                {/* y = x Line (Current = 21D Ago) */}
                <line
                  x1={`${toPosition(0.5 - visibleRange)}`}
                  y1={`${100 - toPosition(0.5 - visibleRange)}`}
                  x2={`${toPosition(0.5 + visibleRange)}`}
                  y2={`${100 - toPosition(0.5 + visibleRange)}`}
                  stroke="rgba(15, 23, 42, 0.2)"
                  strokeWidth="0.2"
                />
                {/* y = -x Line (Inverse relationship) */}
                <line
                  x1={`${toPosition(0.5 - visibleRange)}`}
                  y1={`${100 - toPosition(0.5 + visibleRange)}`}
                  x2={`${toPosition(0.5 + visibleRange)}`}
                  y2={`${100 - toPosition(0.5 - visibleRange)}`}
                  stroke="rgba(15, 23, 42, 0.2)"
                  strokeWidth="0.2"
                />
              </svg>
              <div
                className="momentum-zone momentum-zone--breakout"
                style={toZoneStyle(breakoutZone)}
                aria-hidden
              />
              <div
                className="momentum-zone momentum-zone--breakdown"
                style={toZoneStyle(breakdownZone)}
                aria-hidden
              />

              <div className="momentum-axis-label momentum-axis-label--x">
                Current MACE score
              </div>
              <div className="momentum-axis-label momentum-axis-label--y">
                MACE score 21D ago
              </div>

              {ticks.map((tick) => (
                <div
                  key={`x-${tick}`}
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
                  key={`y-${tick}`}
                  className="momentum-tick"
                  style={{ top: `${100 - toPosition(tick)}%`, left: "48%" }}
                >
                  <div className="momentum-tick-line momentum-tick-line--y" />
                  <div style={{ transform: "translate(-26px, -50%)" }}>
                    {tick}
                  </div>
                </div>
              ))}

              <div className="momentum-zone-note">
                <div className="momentum-zone-note__title">Zones</div>
                <div className="momentum-zone-note__row momentum-zone-note__row--breakout">
                  Green = breakout (Current 0–0.50, 21D 0.54–0.70)
                </div>
                <div className="momentum-zone-note__row momentum-zone-note__row--breakdown">
                  Red = breakdown (Current 0.54–0.70, 21D 0–0.50)
                </div>
              </div>

              {points.map((point) => {
                const currentScaled = point.current;
                const pastScaled = point.twentyoneDaysAgo;
                const isPositiveExtreme = extremes.positive.has(point.symbol);
                const isNegativeExtreme = extremes.negative.has(point.symbol);
                const trendLabel =
                  typeof point.recentWeightedChange === "number" &&
                  !Number.isNaN(point.recentWeightedChange)
                    ? `, 5D trend ${formatScore(point.recentWeightedChange)}`
                    : "";
                const quadrantClass =
                  typeof currentScaled === "number" &&
                  typeof pastScaled === "number"
                    ? currentScaled >= 0.5 && pastScaled >= 0.5
                      ? " momentum-point--positive-trend"
                      : currentScaled >= 0.5 && pastScaled < 0.5
                      ? " momentum-point--positive-developing"
                      : currentScaled < 0.5 && pastScaled < 0.5
                      ? " momentum-point--negative-trend"
                      : " momentum-point--negative-developing"
                    : "";

                return (
                  <div
                    key={point.symbol}
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
                        toPosition(pastScaled) +
                        jitterPercent(point.symbol, "x")
                      }%`,
                      top: `${
                        100 -
                        toPosition(currentScaled) +
                        jitterPercent(point.symbol, "y")
                      }%`,
                    }}
                    title={`${point.symbol}: Current ${formatScore(
                      point.current
                    )}, 21D ${formatScore(
                      point.twentyoneDaysAgo
                    )}${trendLabel}`}
                  >
                    <span className="momentum-point__label">
                      <span
                        className="momentum-point__ticker"
                        style={{
                          color: getTickerColor(point.recentWeightedChange),
                        }}
                      >
                        {point.symbol}
                      </span>
                      {typeof point.recentWeightedChange === "number" &&
                        !Number.isNaN(point.recentWeightedChange) &&
                        point.recentWeightedChange !== 0 && (
                          <span
                            className="momentum-point__trend"
                            style={{
                              color: getArrowColor(point.recentWeightedChange),
                            }}
                            aria-label={
                              point.recentWeightedChange >= 0
                                ? "MACE score improving over the last 5 days"
                                : "MACE score worsening over the last 5 days"
                            }
                          >
                            {point.recentWeightedChange >= 0 ? "▲" : "▼"}
                          </span>
                        )}
                    </span>
                  </div>
                );
              })}
            </div>

            {loading && <div className="text-muted">Loading MACE data…</div>}
            {!loading && points.length === 0 && (
              <div className="text-muted">
                {hasSymbols
                  ? "No MACE data available for these symbols."
                  : "Enter symbols above to plot a custom grid."}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted small">MACE grid hidden.</div>
        )}
      </div>
    </div>
  );
}

export default function MacePage() {
  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
  const [portfolioValues, setPortfolioValues] = useState<
    Record<string, number>
  >({});
  const [portfolioData, setPortfolioData] =
    useState<MaceScoresResponse>(FALLBACK);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const [mode, setMode] = useState<"portfolio" | "custom">("portfolio");
  const [customInput, setCustomInput] = useState("");
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [customData, setCustomData] = useState<MaceScoresResponse>(FALLBACK);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1.25);

  useEffect(() => {
    const fetchPortfolioSymbols = async () => {
      try {
        const res = await fetch("http://localhost:8000/portfolio_tickers");
        if (!res.ok) throw new Error("Failed to fetch portfolio tickers");
        const json = await res.json();
        const symbols = Array.isArray(json)
          ? json
              .map((entry: { ticker?: string }) =>
                entry?.ticker ? entry.ticker.toUpperCase() : null
              )
              .filter((ticker: string | null): ticker is string =>
                Boolean(ticker)
              )
          : [];
        setPortfolioSymbols(symbols);
      } catch (err) {
        console.error(err);
        setPortfolioError("Unable to load portfolio tickers.");
        setPortfolioLoading(false);
      }
    };

    const fetchPortfolioValues = async () => {
      try {
        const res = await fetch("http://localhost:8000/portfolio_live_data");
        if (!res.ok) throw new Error("Failed to fetch portfolio values");
        const json = await res.json();
        if (!Array.isArray(json)) return;
        const values: Record<string, number> = {};
        json.forEach((entry: { ticker?: string; market_value?: number }) => {
          if (
            entry?.ticker &&
            typeof entry.market_value === "number" &&
            !Number.isNaN(entry.market_value)
          ) {
            values[entry.ticker.toUpperCase()] = entry.market_value;
          }
        });
        setPortfolioValues(values);
      } catch (err) {
        console.error(err);
      }
    };

    fetchPortfolioSymbols();
    fetchPortfolioValues();
  }, []);

  const fetchMaceScores = async (
    symbols: string[],
    {
      setData,
      setError,
      setLoading,
    }: {
      setData: (value: MaceScoresResponse) => void;
      setError: (value: string | null) => void;
      setLoading: (value: boolean) => void;
    }
  ) => {
    if (symbols.length === 0) {
      setData(FALLBACK);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:8000/mace_scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      if (!res.ok) {
        throw new Error("Failed to fetch MACE scores");
      }
      const json = await res.json();
      setData({
        current: json.current || {},
        twentyone_days_ago: json.twentyone_days_ago || {},
        recent_weighted_change: json.recent_weighted_change || {},
      });
      setError(null);
    } catch (err) {
      console.error(err);
      setData(FALLBACK);
      setError("Unable to fetch MACE scores right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== "portfolio") return;
    if (portfolioSymbols.length === 0) return;
    fetchMaceScores(portfolioSymbols, {
      setData: setPortfolioData,
      setError: setPortfolioError,
      setLoading: setPortfolioLoading,
    });
  }, [mode, portfolioSymbols]);

  const onSubmitCustom = (event: FormEvent) => {
    event.preventDefault();
    const parsedSymbols = customInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const uniqueSymbols = Array.from(new Set(parsedSymbols));

    if (uniqueSymbols.length === 0) {
      setCustomError("Enter at least one ticker symbol.");
      return;
    }

    setCustomError(null);
    setMode("custom");
    setCustomSymbols(uniqueSymbols);
    fetchMaceScores(uniqueSymbols, {
      setData: setCustomData,
      setError: setCustomError,
      setLoading: setCustomLoading,
    });
  };

  useEffect(() => {
    if (mode === "custom" && customSymbols.length > 0) {
      fetchMaceScores(customSymbols, {
        setData: setCustomData,
        setError: setCustomError,
        setLoading: setCustomLoading,
      });
    }
  }, [customSymbols, mode]);

  const subtitle =
    mode === "portfolio"
      ? "Plot of portfolio stocks by current (x-axis) and 21-day (y-axis) MACE scores."
      : "Plot of your custom stock list by current (x-axis) and 21-day (y-axis) MACE scores.";

  return (
    <div className="container-fluid momentum-page py-4">
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <h1 className="fw-bold mb-0">MACE</h1>
        <div className="btn-group" role="group" aria-label="MACE view selector">
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
            htmlFor="maceZoom"
            className="form-label mb-0 small text-muted"
          >
            Zoom
          </label>
          <select
            id="maceZoom"
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
                disabled={customLoading}
              >
                {customLoading ? "Loading…" : "Plot custom grid"}
              </button>
            </div>
          </form>
          <div id="customSymbolsHelp" className="form-text">
            Enter any tickers to see how their MACE scores compare, even if they
            are not in the portfolio.
          </div>
          {customError && (
            <div className="text-danger small mt-2">{customError}</div>
          )}
          {customSymbols.length > 0 && (
            <div className="text-muted small mt-2">
              Showing custom list: {customSymbols.join(", ")}
            </div>
          )}
        </div>
      </div>

      <MaceGrid
        data={mode === "portfolio" ? portfolioData : customData}
        loading={mode === "portfolio" ? portfolioLoading : customLoading}
        error={mode === "portfolio" ? portfolioError : customError}
        mode={mode}
        zoomScale={zoomScale}
        customSymbols={customSymbols}
        portfolioValues={portfolioValues}
      />
    </div>
  );
}
