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
  current_price: number | null;
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
            current_price:
              typeof json.current_price === "number"
                ? json.current_price
                : null,
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

  const buildItems = (scores: TrendScores, labels: Record<string, string>) =>
    Object.entries(scores)
      .filter(([key]) => key !== "total")
      .map(([key, val]) => ({ label: labels[key] ?? key, val }));

  const stItems = buildItems(data.short_term_trend, stLabels);
  const ltItems = buildItems(data.long_term_trend, ltLabels);
  const sellItems = buildItems(data.sell_signal, sellLabels);
  const maxRows = Math.max(stItems.length, ltItems.length, sellItems.length);

  const isShortUptrend = data.short_term_trend.total >= 2;
  const shortTermStatus = isShortUptrend ? "UPTREND" : "DOWNTREND";
  const isLongUptrend = data.long_term_trend.total >= 4;
  const longTermStatus = isLongUptrend ? "UPTREND" : "DOWNTREND";
  const sellSignalCount = Object.entries(data.sell_signal).filter(
    ([key, val]) => key !== "total" && val !== null
  ).length;
  const isSellSignal = data.sell_signal.total >= 4;
  const sellOrHoldStatus = isSellSignal ? "SELL" : "HOLD";

  let overallSignal: "BUY" | "HOLD" | "SELL";
  if (sellOrHoldStatus === "SELL") {
    overallSignal = "SELL";
  } else if (isShortUptrend && isLongUptrend) {
    overallSignal = "BUY";
  } else if (!isShortUptrend && !isLongUptrend) {
    overallSignal = "SELL";
  } else {
    overallSignal = "HOLD";
  }

  const overallSignalClass =
    overallSignal === "BUY"
      ? "text-success"
      : overallSignal === "SELL"
      ? "text-danger"
      : "text-warning";

  const formattedPrice =
    typeof data.current_price === "number"
      ? `$${data.current_price.toFixed(2)}`
      : "N/A";

  const renderCell = (
    item?: { label: string; val: number | null },
    invert = false
  ) => {
    if (!item) return <td>&nbsp;</td>;
    const cls =
      item.val === null
        ? ""
        : item.val
        ? invert
          ? "table-danger"
          : "table-success"
        : invert
        ? "table-success"
        : "table-danger";
    const style =
      item.val === null ? { backgroundColor: "#e0e0e0" } : undefined;
    return (
      <td className={cls} style={style}>
        {item.label}
      </td>
    );
  };

  return (
    <div className="mt-4">
      <h3 className="text-center mb-3">Trend &amp; Signal Summary</h3>
      <div className="d-flex flex-column flex-md-row justify-content-center align-items-center gap-3 mb-3 text-center">
        <div className="fw-semibold">Ticker: {stockSymbol}</div>
        <div>Current Price: {formattedPrice}</div>
        <div className={`fw-bold ${overallSignalClass}`}>
          Signal: {overallSignal}
        </div>
      </div>
      <table className="table text-center excel-table">
        <thead className="bg-white">
          <tr>
            <th>Short-term Trend</th>
            <th>Bull Market (LT Trend)</th>
            <th>Sell or Hold?</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }, (_, i) => (
            <tr key={i}>
              {renderCell(stItems[i])}
              {renderCell(ltItems[i])}
              {renderCell(sellItems[i], true)}
            </tr>
          ))}
          <tr>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
          <tr className="summary-row">
            <td
              className={`text-center fw-bold ${
                isShortUptrend ? "table-success" : "table-danger"
              }`}
            >
              {data.short_term_trend.total} of {Object.keys(stLabels).length}{" "}
              <span>{shortTermStatus}</span>
            </td>
            <td
              className={`text-center fw-bold ${
                isLongUptrend ? "table-success" : "table-danger"
              }`}
            >
              {data.long_term_trend.total} of {Object.keys(ltLabels).length}{" "}
              <span>{longTermStatus}</span>
            </td>
            <td
              className={`text-center fw-bold ${
                isSellSignal ? "table-danger" : "table-success"
              }`}
            >
              ({data.sell_signal.total} of {sellSignalCount}) {sellOrHoldStatus}
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
