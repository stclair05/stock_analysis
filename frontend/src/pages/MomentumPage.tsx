import { useEffect, useMemo, useState } from "react";
import "./MomentumPage.css";

type MomentumResponse = {
  portfolio_momentum_weekly: Record<string, number>;
  portfolio_momentum_monthly: Record<string, number>;
};

type MomentumPoint = {
  symbol: string;
  weekly?: number;
  monthly?: number;
};

const FALLBACK: MomentumResponse = {
  portfolio_momentum_weekly: {},
  portfolio_momentum_monthly: {},
};

export default function MomentumPage() {
  const [data, setData] = useState<MomentumResponse>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("http://localhost:8000/portfolio_status?scope=momentum")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load momentum data");
        }
        return res.json();
      })
      .then((json) => {
        setData({
          portfolio_momentum_weekly: json.portfolio_momentum_weekly || {},
          portfolio_momentum_monthly: json.portfolio_momentum_monthly || {},
        });
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setData(FALLBACK);
        setError("Unable to fetch momentum scores. Showing empty view.");
      })
      .finally(() => setLoading(false));
  }, []);

  const points: MomentumPoint[] = useMemo(() => {
    const symbols = new Set<string>([
      ...Object.keys(data.portfolio_momentum_weekly || {}),
      ...Object.keys(data.portfolio_momentum_monthly || {}),
    ]);

    return Array.from(symbols)
      .sort()
      .map((symbol) => ({
        symbol,
        weekly: data.portfolio_momentum_weekly?.[symbol],
        monthly: data.portfolio_momentum_monthly?.[symbol],
      }));
  }, [data.portfolio_momentum_monthly, data.portfolio_momentum_weekly]);

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

  const toPosition = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 50;
    const clamped = Math.max(Math.min(value, range), -range);
    return 50 + (clamped / range) * 45;
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
    const step = Math.max(1, Math.floor(range / 3));
    const values: number[] = [];
    for (let v = -Math.ceil(range); v <= Math.ceil(range); v += step) {
      if (Math.abs(v) < 0.01) continue;
      values.push(parseFloat(v.toFixed(1)));
    }
    return values;
  }, [range]);

  return (
    <div className="container-fluid momentum-page py-4">
      <h1 className="fw-bold mb-3">Momentum</h1>
      <p className="text-muted mb-4">
        Plot of portfolio stocks by 5-day (x-axis) and 21-day (y-axis) portfolio
        momentum z-scores.
      </p>

      {error && <div className="alert alert-warning">{error}</div>}

      <div className="momentum-grid mb-3">
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
          5D Portfolio Momentum Score
        </div>
        <div className="momentum-axis-label momentum-axis-label--y">
          21D Portfolio Momentum Score
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
                  toPosition(point.weekly) + jitterPercent(point.symbol, "x")
                }%`,
                top: `${
                  100 -
                  toPosition(point.monthly) +
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
        <div className="text-muted">No portfolio momentum data available.</div>
      )}
    </div>
  );
}
