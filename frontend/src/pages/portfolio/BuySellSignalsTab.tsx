import React, { useState, useEffect } from "react";

const timeframes = ["daily", "weekly", "monthly"];
const strategies = [
  "trend_investor_pro",
  "northstar",
  "st_clair",
  "stclair_longterm",
  "mace_40w",
  // Add other strategies if needed
];

export default function BuySellSignalsTab() {
  const [portfolio, setPortfolio] = useState<{ ticker: string }[]>([]);
  const [signalSummary, setSignalSummary] = useState<any>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState("weekly");
  const [signalsLoading, setSignalsLoading] = useState(false);
  const signalsCache = React.useRef<{
    [key: string]: { [ticker: string]: { [strategy: string]: string } };
  }>({});

  const strategyApiMap: Record<string, string> = {
    trend_investor_pro: "trendinvestorpro",
    st_clair: "stclair",
    northstar: "northstar",
    stclair_longterm: "stclairlongterm",
    mace_40w: "mace_40w",
  };

  // Fetch tickers from portfolio (now from new endpoint)
  useEffect(() => {
    fetch("http://localhost:8000/portfolio_tickers")
      .then((res) => res.json())
      .then((data) => {
        setPortfolio(data.map((ticker: string) => ({ ticker })));
      });
  }, []);

  // Fetch signals for all stocks/strategies/timeframes
  useEffect(() => {
    if (portfolio.length === 0) return;
    setSignalsLoading(true);

    const cacheKey = selectedTimeframe;

    // If cached, use it immediately
    if (signalsCache.current[cacheKey]) {
      setSignalSummary(signalsCache.current[cacheKey]);
      setSignalsLoading(false);
      return;
    }

    async function fetchAllSignals() {
      const summary: any = {};
      await Promise.all(
        portfolio.map(async (holding) => {
          const row: any = {};
          await Promise.all(
            strategies
              .filter((strategy) => !isUnavailable(strategy, selectedTimeframe))
              .map(async (strategy) => {
                try {
                  const apiStrategy = strategyApiMap[strategy] || strategy;
                  const res = await fetch(
                    `http://localhost:8000/api/signals_${selectedTimeframe}/${holding.ticker}?strategy=${apiStrategy}`
                  );
                  if (!res.ok) {
                    row[strategy] = "";
                    return;
                  }
                  const data = await res.json();
                  if (
                    !Array.isArray(data.markers) ||
                    data.markers.length === 0
                  ) {
                    row[strategy] = "";
                  } else {
                    const last = data.markers[data.markers.length - 1];
                    if (!last || !last.side) {
                      row[strategy] = "";
                    } else {
                      const side = String(last.side).toUpperCase();
                      row[strategy] =
                        side === "BUY" ? "BUY" : side === "SELL" ? "SELL" : "";
                    }
                  }
                } catch (e) {
                  row[strategy] = "";
                }
              })
          );
          summary[holding.ticker] = row;
        })
      );
      signalsCache.current[cacheKey] = summary; // <-- Store in cache
      setSignalSummary(summary);
      setSignalsLoading(false);
    }

    fetchAllSignals();
    // eslint-disable-next-line
  }, [portfolio, selectedTimeframe]);

  useEffect(() => {
    setSignalSummary({}); // Clear signals when portfolio is being reloaded
  }, [portfolio]);

  const isUnavailable = (strategy: string, tf: string) => {
    if (
      strategy === "trend_investor_pro" &&
      (tf === "weekly" || tf === "monthly")
    )
      return true;
    if (strategy === "st_clair" && (tf === "daily" || tf === "monthly"))
      return true;
    if (strategy === "stclair_longterm" && tf !== "weekly") return true;
    if (strategy === "mace_40w" && tf !== "weekly") return true;
    return false;
  };

  return (
    <div>
      {/* Timeframe Dropdown */}
      <div className="mb-3">
        <label className="fw-semibold me-2">Timeframe:</label>
        <select
          value={selectedTimeframe}
          onChange={(e) => setSelectedTimeframe(e.target.value)}
        >
          {timeframes.map((tf) => (
            <option key={tf} value={tf}>
              {tf.charAt(0).toUpperCase() + tf.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Loading or No Data States */}
      {signalsLoading ? (
        <div className="text-center my-4">
          <span className="spinner-border" role="status" aria-hidden="true" />
          <span className="ms-2">Loading signals...</span>
        </div>
      ) : portfolio.length === 0 ? (
        <div className="text-center my-4 text-muted">
          No equities in your portfolio.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-bordered signal-summary-table">
            <thead>
              <tr>
                <th>Stock</th>
                {strategies.map((s) => (
                  <th key={s}>
                    {s.replace(/_/g, " ").replace("longterm", " LongTerm")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.map((holding) => (
                <tr key={holding.ticker}>
                  <td>{holding.ticker}</td>
                  {strategies.map((s) => {
                    const signal = signalSummary[holding.ticker]?.[s] ?? "";
                    let color = "#bdbdbd";
                    if (signal === "BUY") color = "#009944";
                    if (signal === "SELL") color = "#e91e63";
                    return (
                      <td
                        key={s}
                        style={{
                          color,
                          textAlign: "center",
                          fontWeight: 700,
                        }}
                      >
                        {signal || "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
