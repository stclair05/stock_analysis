import { useEffect, useState } from "react";

interface TrendScores {
  [key: string]: number | null;
  total: number;
}

interface AnalysisSummary {
  short_interest: number | null;
  short_term_trend: TrendScores;
  long_term_trend: TrendScores;
  sell_signal: TrendScores;
}

interface ScoreSummaryProps {
  stockSymbol: string;
}

const stLabels: Record<string, string> = {
  above_20_dma: "Above 20 DMA",
  above_50_dma: "Above 50 DMA",
  mace_uptrend: "MACE Uptrend",
};

const ltLabels: Record<string, string> = {
  ndr_buy: "NDR (21 > 252)",
  above_200_dma: "Above 200 DMA",
  above_3yr_ma: "Above 3Y MA",
  stage_2: "Stage 2",
  ichimoku_above_cloud: "Ichimoku Above Cloud",
  super_trend_buy: "Super Trend Buy",
};

const sellLabels: Record<string, string> = {
  below_20_dma: "Below 20 DMA",
  bearish_engulfing_weekly: "Bearish Engulfing Weekly",
  chaikin_money_outflow: "Chaikin Money Outflow",
  bearish_divergence_weekly: "Bearish Divergence Weekly",
  pnl_gt_30: "PnL > 30%",
  near_mean_reversion_upper: "Near Mean Reversion Upper",
  short_interest_gt_20: "Short Interest > 20%",
};

const ScoreSummary = ({ stockSymbol }: ScoreSummaryProps) => {
  const [data, setData] = useState<AnalysisSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:8000/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: stockSymbol }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setData({
            short_interest: json.short_interest ?? null,
            short_term_trend: json.short_term_trend,
            long_term_trend: json.long_term_trend,
            sell_signal: json.sell_signal,
          });
        }
      } catch {
        // ignore errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [stockSymbol]);

  if (loading) {
    return (
      <div className="text-center mt-4">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const renderList = (scores: TrendScores, labels: Record<string, string>) => (
    <ul className="list-unstyled mb-0">
      {Object.entries(scores)
        .filter(([key]) => key !== "total")
        .map(([key, val]) => {
          const bgColor =
            val === null ? "#e0e0e0" : val ? "#c8e6c9" : "#ffcdd2";
          return (
            <li
              key={key}
              style={{
                backgroundColor: bgColor,
                margin: "2px 0",
                padding: "2px 4px",
              }}
            >
              {labels[key] ?? key}
            </li>
          );
        })}
    </ul>
  );

  return (
    <div className="mt-4">
      <h3 className="text-center mb-3">Trend &amp; Signal Summary</h3>
      <table className="table table-bordered">
        <thead>
          <tr>
            <th>Short-term Trend</th>
            <th>Bull Market (LT Trend)</th>
            <th>Sell or Hold?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{renderList(data.short_term_trend, stLabels)}</td>
            <td>{renderList(data.long_term_trend, ltLabels)}</td>
            <td>{renderList(data.sell_signal, sellLabels)}</td>
          </tr>
          <tr>
            <td className="text-center fw-bold">
              {data.short_term_trend.total} of {Object.keys(stLabels).length}{" "}
              <span
                className={
                  data.short_term_trend.total >= 2
                    ? "text-success"
                    : "text-danger"
                }
              >
                {data.short_term_trend.total >= 2 ? "UPTREND" : "DOWNTREND"}
              </span>
            </td>
            <td className="text-center fw-bold">
              {data.long_term_trend.total} of {Object.keys(ltLabels).length}{" "}
              <span
                className={
                  data.long_term_trend.total >= 4
                    ? "text-success"
                    : "text-danger"
                }
              >
                {data.long_term_trend.total >= 4 ? "UPTREND" : "DOWNTREND"}
              </span>
            </td>
            <td className="text-center fw-bold">
              ({data.sell_signal.total} of{" "}
              {
                Object.entries(data.sell_signal).filter(
                  ([key, val]) => key !== "total" && val !== null
                ).length
              }
              ) {data.sell_signal.total >= 4 ? "SELL" : "HOLD"}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 text-center">
        <p
          style={{
            color:
              data.sell_signal.short_interest_gt_20 === null
                ? "#9e9e9e"
                : undefined,
          }}
        >
          Short Interest:{" "}
          {data.short_interest != null
            ? `${data.short_interest.toFixed(2)}%`
            : "N/A"}
        </p>
      </div>
    </div>
  );
};

export default ScoreSummary;
