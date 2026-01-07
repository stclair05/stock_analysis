import { useEffect, useMemo, useState } from "react";
import "./MomentumPage.css";

type MomentumResponse = {
  momentum_weekly: Record<string, number>;
  momentum_monthly: Record<string, number>;
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

export default function MomentumPage() {
  const [portfolioData, setPortfolioData] =
    useState<MomentumResponse>(FALLBACK);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const [mode, setMode] = useState<"portfolio" | "custom">("portfolio");
  const [customInput, setCustomInput] = useState("");
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [customData, setCustomData] = useState<MomentumResponse>(FALLBACK);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1.25);

  useEffect(() => {
    setPortfolioLoading(true);
    fetch("http://localhost:8000/portfolio_status?scope=momentum")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load momentum data");
        }
        return res.json();
      })
      .then((json) => {
        setPortfolioData({
          momentum_weekly: json.portfolio_momentum_weekly || {},
          momentum_monthly: json.portfolio_momentum_monthly || {},
        });
        setPortfolioError(null);
      })
      .catch((err) => {
        console.error(err);
        setPortfolioData(FALLBACK);
        setPortfolioError(
          "Unable to fetch momentum scores. Showing empty view."
        );
      })
      .finally(() => setPortfolioLoading(false));
  }, []);

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
    setCustomLoading(true);
    setMode("custom");
    setCustomSymbols(uniqueSymbols);

    fetch("http://localhost:8000/custom_momentum", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbols: uniqueSymbols }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch custom momentum");
        }
        return res.json();
      })
      .then((json) => {
        setCustomData({
          momentum_weekly: json.momentum_weekly || {},
          momentum_monthly: json.momentum_monthly || {},
        });
        setCustomError(null);
      })
      .catch((err) => {
        console.error(err);
        setCustomData(FALLBACK);
        setCustomError(
          "Unable to fetch momentum scores for that list. Try different symbols."
        );
      })
      .finally(() => setCustomLoading(false));
  };

  const activeData = mode === "portfolio" ? portfolioData : customData;
  const loading = mode === "portfolio" ? portfolioLoading : customLoading;
  const error = mode === "portfolio" ? portfolioError : customError;

  const points: MomentumPoint[] = useMemo(() => {
    const symbols = new Set<string>([
      ...Object.keys(activeData.momentum_weekly || {}),
      ...Object.keys(activeData.momentum_monthly || {}),
    ]);

    return Array.from(symbols)
      .sort()
      .map((symbol) => ({
        symbol,
        weekly: activeData.momentum_weekly?.[symbol],
        monthly: activeData.momentum_monthly?.[symbol],
      }));
  }, [activeData.momentum_monthly, activeData.momentum_weekly]);

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

  const subtitle =
    mode === "portfolio"
      ? "Plot of portfolio stocks by 21-day (x-axis) and 5-day (y-axis) portfolio momentum z-scores."
      : "Plot of your custom stock list by 21-day (x-axis) and 5-day (y-axis) portfolio-relative momentum z-scores.";

  const hasSymbols =
    mode === "portfolio" ? points.length > 0 : customSymbols.length > 0;

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
            Enter any tickers to see how their momentum compares against your
            current portfolio baseline, even if they are not in the portfolio.
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

      {error && <div className="alert alert-warning">{error}</div>}

      <div className="momentum-grid mb-3" aria-live="polite">
        <div className="momentum-quadrant-label positive-developing">
          Positive Developing
        </div>
        <div className="momentum-quadrant-label positive-trend">
          Positive Trend
        </div>
        <div className="momentum-quadrant-label negative-trend">
          Negative Trend
        </div>
        <div className="momentum-quadrant-label negative-developing">
          Negative Developing
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
            key={`x-${tick}`}
            className="momentum-tick"
            style={{ left: `${toPosition(tick)}%`, top: "52%" }}
          >
            <div className="momentum-tick-line momentum-tick-line--x" />
            <div style={{ transform: "translate(-50%, 6px)" }}>{tick}</div>
          </div>
        ))}
        {ticks.map((tick) => (
          <div
            key={`y-${tick}`}
            className="momentum-tick"
            style={{ top: `${100 - toPosition(tick)}%`, left: "48%" }}
          >
            <div className="momentum-tick-line momentum-tick-line--y" />
            <div style={{ transform: "translate(-26px, -50%)" }}>{tick}</div>
          </div>
        ))}

        {points.map((point) => {
          const isPositiveExtreme = extremes.positive.has(point.symbol);
          const isNegativeExtreme = extremes.negative.has(point.symbol);

          return (
            <div
              key={point.symbol}
              className={`momentum-point${
                isPositiveExtreme ? " momentum-point--positive-extreme" : ""
              }${isNegativeExtreme ? " momentum-point--negative-extreme" : ""}`}
              style={{
                left: `${
                  toPosition(point.monthly) + jitterPercent(point.symbol, "x")
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
              <span className="momentum-point__label">{point.symbol}</span>
            </div>
          );
        })}
      </div>

      {loading && <div className="text-muted">Loading momentum data…</div>}
      {!loading && points.length === 0 && (
        <div className="text-muted">
          {hasSymbols
            ? "No momentum data available for these symbols."
            : "Enter symbols above to plot a custom grid."}
        </div>
      )}
    </div>
  );
}
