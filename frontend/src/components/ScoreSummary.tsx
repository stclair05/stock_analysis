import { useEffect, useState } from "react";

interface TrendScores {
  [key: string]: number;
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

  useEffect(() => {
    let cancelled = false;

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
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [stockSymbol]);

  if (!data) return null;

  const renderList = (scores: TrendScores, labels: Record<string, string>) => (
    <ul className="list-unstyled mb-0">
      {Object.entries(scores)
        .filter(([key]) => key !== "total")
        .map(([key, val]) => (
          <li
            key={key}
            style={{
              backgroundColor: val ? "#c8e6c9" : "#ffcdd2",
              margin: "2px 0",
              padding: "2px 4px",
            }}
          >
            {labels[key] ?? key}
          </li>
        ))}
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
              {data.short_term_trend.total} of {Object.keys(stLabels).length}
            </td>
            <td className="text-center fw-bold">
              {data.long_term_trend.total} of {Object.keys(ltLabels).length}
            </td>
            <td className="text-center fw-bold">
              ({data.sell_signal.total} of {Object.keys(sellLabels).length}){" "}
              {data.sell_signal.total >= 4 ? "SELL" : "HOLD"}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 text-center">
        <p>
          Short-term Trend: ({data.short_term_trend.total} of 3){" "}
          {data.short_term_trend.total >= 2 ? "UPTREND" : "DOWNTREND"}
        </p>
        <p>
          Bull Market (LT Trend): ({data.long_term_trend.total} of 6){" "}
          {data.long_term_trend.total >= 4 ? "UPTREND" : "DOWNTREND"}
        </p>
        {data.short_interest != null && (
          <p>Short Interest: {data.short_interest.toFixed(2)}%</p>
        )}
      </div>
    </div>
  );
};

export default ScoreSummary;
