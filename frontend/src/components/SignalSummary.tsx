import { useEffect, useState } from "react";
import "./StockChart/graphing-chart.css";
import { SignalSummary } from "./StockChart/types";

interface SignalSummaryProps {
  stockSymbol: string;
}

const strategies = [
  "trendinvestorpro",
  "stclair",
  "northstar",
  "stclairlongterm",
  "mace_40w",
  "mansfield",
  "ndr",
] as const;

const timeframes = ["daily", "weekly", "monthly"] as const;

const SignalSummaryComponent = ({ stockSymbol }: SignalSummaryProps) => {
  const [signalSummary, setSignalSummary] = useState<SignalSummary>({
    trendinvestorpro: { daily: "", weekly: "", monthly: "" },
    stclair: { daily: "", weekly: "", monthly: "" },
    northstar: { daily: "", weekly: "", monthly: "" },
    stclairlongterm: { daily: "", weekly: "", monthly: "" },
    mace_40w: { daily: "", weekly: "", monthly: "" },
    mansfield: { daily: "", weekly: "", monthly: "" },
    ndr: { daily: "", weekly: "", monthly: "" },
  });

  useEffect(() => {
    let cancelled = false;

    const makeEmptySignalSummary = (): SignalSummary => {
      const summary: any = {};
      strategies.forEach((s) => {
        summary[s] = { daily: "", weekly: "", monthly: "" };
      });
      return summary as SignalSummary;
    };

    async function fetchLatestSignal(
      stock: string,
      strategy: string,
      timeframe: string
    ) {
      try {
        const res = await fetch(
          `http://localhost:8000/api/signals_${timeframe}/${stock}?strategy=${strategy}`
        );
        if (!res.ok) {
          if (res.status === 400) return "";
          return "";
        }
        const data = await res.json();
        if (!Array.isArray(data.markers) || data.markers.length === 0)
          return "";
        const last = data.markers[data.markers.length - 1];
        if (!last || !last.side) return "";
        return last.side.toUpperCase() === "BUY" ? "BUY" : "SELL";
      } catch (err) {
        return "";
      }
    }

    async function fetchAll() {
      const summary = makeEmptySignalSummary();
      await Promise.all(
        strategies.flatMap((strategy) =>
          timeframes.map(async (tf) => {
            const signal = await fetchLatestSignal(stockSymbol, strategy, tf);
            summary[strategy][tf] = signal as any;
          })
        )
      );
      if (!cancelled) setSignalSummary(summary);
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [stockSymbol]);

  const isUnavailable = (
    strategy: (typeof strategies)[number],
    tf: "daily" | "weekly" | "monthly"
  ) => {
    if (
      strategy === "trendinvestorpro" &&
      (tf === "weekly" || tf === "monthly")
    )
      return true;
    if (strategy === "stclair" && (tf === "daily" || tf === "monthly"))
      return true;
    if (strategy === "stclairlongterm" && tf !== "weekly") return true;
    if (strategy === "mace_40w" && tf !== "weekly") return true;
    if (strategy === "mansfield" && tf !== "weekly") return true;
    if (strategy === "ndr" && tf === "monthly") return true;
    return false;
  };

  return (
    <div className="signal-summary-table-wrap">
      <table className="signal-summary-table">
        <thead>
          <tr>
            <th>Strategy</th>
            {timeframes.map((tf) => (
              <th key={tf}>{tf.charAt(0).toUpperCase() + tf.slice(1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strategies.map((strat) => (
            <tr key={strat}>
              <td>
                {strat.charAt(0).toUpperCase() +
                  strat.slice(1).replace("longterm", " LongTerm")}
              </td>
              {timeframes.map((tf) => {
                const unavailable = isUnavailable(strat, tf);
                let content;
                let color = "#bdbdbd";
                if (unavailable) {
                  content = "—";
                  color = "#232323";
                } else if (signalSummary[strat][tf] === "BUY") {
                  content = "BUY";
                  color = "#009944";
                } else if (signalSummary[strat][tf] === "SELL") {
                  content = "SELL";
                  color = "#e91e63";
                }
                return (
                  <td
                    key={tf}
                    style={{
                      color,
                      opacity: unavailable ? 0.7 : 1,
                      textAlign: "center",
                      fontWeight: 700,
                    }}
                  >
                    <span>{content ?? "-"}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SignalSummaryComponent;
