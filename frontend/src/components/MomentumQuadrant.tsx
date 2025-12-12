import { useMemo, useState } from "react";
import "./MomentumQuadrant.css";

type MomentumScope = "sector" | "portfolio";

type MomentumQuadrantProps = {
  isOpen: boolean;
  onClose: () => void;
  sectorWeekly: Record<string, number>;
  sectorMonthly: Record<string, number>;
  portfolioWeekly: Record<string, number>;
  portfolioMonthly: Record<string, number>;
};

type MomentumBucket = "veryStrong" | "strong" | "neutral" | "weak" | "veryWeak";

type BucketedSymbol = {
  symbol: string;
  weekly?: number;
  monthly?: number;
  direction: "up" | "down" | null;
};

type BucketInfo = {
  title: string;
  description: string;
  className: string;
};

const BUCKET_META: Record<MomentumBucket, BucketInfo> = {
  veryStrong: {
    title: "Very strong outlier",
    description: "z > +2.0",
    className: "very-strong",
  },
  strong: {
    title: "Top performer vs peers",
    description: "z > +1.0",
    className: "strong",
  },
  neutral: {
    title: "Near the pack",
    description: "-1.0 ≤ z ≤ +1.0",
    className: "neutral",
  },
  weak: {
    title: "Clear underperformer",
    description: "z < -1.0",
    className: "weak",
  },
  veryWeak: {
    title: "Very weak relative momentum",
    description: "z < -2.0",
    className: "very-weak",
  },
};

const arrowSymbol: Record<
  Exclude<BucketedSymbol["direction"], null>,
  string
> = {
  up: "▲",
  down: "▼",
};

export default function MomentumQuadrant({
  isOpen,
  onClose,
  sectorWeekly,
  sectorMonthly,
  portfolioWeekly,
  portfolioMonthly,
}: MomentumQuadrantProps) {
  const [scope, setScope] = useState<MomentumScope>("sector");

  const { weeklyData, monthlyData } = useMemo(() => {
    if (scope === "portfolio") {
      return { weeklyData: portfolioWeekly, monthlyData: portfolioMonthly };
    }
    return { weeklyData: sectorWeekly, monthlyData: sectorMonthly };
  }, [portfolioMonthly, portfolioWeekly, scope, sectorMonthly, sectorWeekly]);

  const bucketed = useMemo(() => {
    const allSymbols = new Set<string>([
      ...Object.keys(weeklyData || {}),
      ...Object.keys(monthlyData || {}),
    ]);

    const buckets: Record<MomentumBucket, BucketedSymbol[]> = {
      veryStrong: [],
      strong: [],
      neutral: [],
      weak: [],
      veryWeak: [],
    };

    const classify = (value?: number): MomentumBucket => {
      if (typeof value !== "number" || Number.isNaN(value)) return "neutral";
      if (value > 2) return "veryStrong";
      if (value > 1) return "strong";
      if (value < -2) return "veryWeak";
      if (value < -1) return "weak";
      return "neutral";
    };

    const direction = (
      weekly?: number,
      monthly?: number
    ): "up" | "down" | null => {
      if (typeof weekly !== "number" || typeof monthly !== "number")
        return null;
      if (weekly > monthly) return "up";
      if (weekly < monthly) return "down";
      return null;
    };

    Array.from(allSymbols)
      .sort()
      .forEach((symbol) => {
        const weekly = weeklyData?.[symbol];
        const monthly = monthlyData?.[symbol];
        const bucketKey = classify(weekly);
        buckets[bucketKey].push({
          symbol,
          weekly,
          monthly,
          direction: direction(weekly, monthly),
        });
      });

    return buckets;
  }, [monthlyData, weeklyData]);

  if (!isOpen) return null;

  return (
    <div className="momentum-modal-backdrop" role="dialog" aria-modal="true">
      <div className="momentum-modal">
        <div className="momentum-modal__header">
          <div>
            <h5 className="mb-1">Momentum snapshot</h5>
            <small className="text-muted">
              Weekly z-score momentum by{" "}
              {scope === "sector" ? "sector" : "portfolio"} peers
            </small>
          </div>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="d-flex gap-2 mb-3">
          <div className="btn-group" role="group" aria-label="Momentum scope">
            <button
              type="button"
              className={`btn btn-sm ${
                scope === "sector" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={() => setScope("sector")}
            >
              Sector momentum
            </button>
            <button
              type="button"
              className={`btn btn-sm ${
                scope === "portfolio" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={() => setScope("portfolio")}
            >
              Portfolio momentum
            </button>
          </div>
          <div className="ms-auto d-flex align-items-center gap-2 text-muted">
            <span className="legend-up">▲ Weekly {">"} Monthly</span>
            <span className="legend-down">▼ Weekly {"<"} Monthly</span>
          </div>
        </div>

        <div className="momentum-grid">
          <div className="momentum-cell momentum-cell--positive">
            <h6 className="mb-1">{BUCKET_META.veryStrong.title}</h6>
            <small className="text-muted">
              {BUCKET_META.veryStrong.description}
            </small>
            <div className="momentum-symbols">
              {bucketed.veryStrong.map((item) => (
                <div
                  className="momentum-symbol"
                  key={`${item.symbol}-very-strong`}
                >
                  <span className="symbol-text">{item.symbol}</span>
                  {item.direction && (
                    <span
                      className={`symbol-arrow ${
                        item.direction === "up" ? "arrow-up" : "arrow-down"
                      }`}
                    >
                      {arrowSymbol[item.direction]}
                    </span>
                  )}
                </div>
              ))}
              {bucketed.veryStrong.length === 0 && (
                <div className="text-muted small">No symbols</div>
              )}
            </div>
          </div>
          <div className="momentum-cell momentum-cell--positive">
            <h6 className="mb-1">{BUCKET_META.strong.title}</h6>
            <small className="text-muted">
              {BUCKET_META.strong.description}
            </small>
            <div className="momentum-symbols">
              {bucketed.strong.map((item) => (
                <div className="momentum-symbol" key={`${item.symbol}-strong`}>
                  <span className="symbol-text">{item.symbol}</span>
                  {item.direction && (
                    <span
                      className={`symbol-arrow ${
                        item.direction === "up" ? "arrow-up" : "arrow-down"
                      }`}
                    >
                      {arrowSymbol[item.direction]}
                    </span>
                  )}
                </div>
              ))}
              {bucketed.strong.length === 0 && (
                <div className="text-muted small">No symbols</div>
              )}
            </div>
          </div>
          <div className="momentum-cell momentum-cell--neutral" data-neutral>
            <h6 className="mb-1">{BUCKET_META.neutral.title}</h6>
            <small className="text-muted">
              {BUCKET_META.neutral.description}
            </small>
            <div className="momentum-symbols">
              {bucketed.neutral.map((item) => (
                <div className="momentum-symbol" key={`${item.symbol}-neutral`}>
                  <span className="symbol-text">{item.symbol}</span>
                  {item.direction && (
                    <span
                      className={`symbol-arrow ${
                        item.direction === "up" ? "arrow-up" : "arrow-down"
                      }`}
                    >
                      {arrowSymbol[item.direction]}
                    </span>
                  )}
                </div>
              ))}
              {bucketed.neutral.length === 0 && (
                <div className="text-muted small">No symbols</div>
              )}
            </div>
          </div>
          <div className="momentum-cell momentum-cell--negative">
            <h6 className="mb-1">{BUCKET_META.weak.title}</h6>
            <small className="text-muted">{BUCKET_META.weak.description}</small>
            <div className="momentum-symbols">
              {bucketed.weak.map((item) => (
                <div className="momentum-symbol" key={`${item.symbol}-weak`}>
                  <span className="symbol-text">{item.symbol}</span>
                  {item.direction && (
                    <span
                      className={`symbol-arrow ${
                        item.direction === "up" ? "arrow-up" : "arrow-down"
                      }`}
                    >
                      {arrowSymbol[item.direction]}
                    </span>
                  )}
                </div>
              ))}
              {bucketed.weak.length === 0 && (
                <div className="text-muted small">No symbols</div>
              )}
            </div>
          </div>
          <div className="momentum-cell momentum-cell--negative">
            <h6 className="mb-1">{BUCKET_META.veryWeak.title}</h6>
            <small className="text-muted">
              {BUCKET_META.veryWeak.description}
            </small>
            <div className="momentum-symbols">
              {bucketed.veryWeak.map((item) => (
                <div
                  className="momentum-symbol"
                  key={`${item.symbol}-very-weak`}
                >
                  <span className="symbol-text">{item.symbol}</span>
                  {item.direction && (
                    <span
                      className={`symbol-arrow ${
                        item.direction === "up" ? "arrow-up" : "arrow-down"
                      }`}
                    >
                      {arrowSymbol[item.direction]}
                    </span>
                  )}
                </div>
              ))}
              {bucketed.veryWeak.length === 0 && (
                <div className="text-muted small">No symbols</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
