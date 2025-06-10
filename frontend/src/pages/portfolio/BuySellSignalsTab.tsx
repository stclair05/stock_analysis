import React, { useState, useEffect } from "react";

const timeframes = ["daily", "weekly", "monthly"];
const allStrategies = [
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

  // State for sorting
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const strategyApiMap: Record<string, string> = {
    trend_investor_pro: "trendinvestorpro",
    st_clair: "stclair",
    northstar: "northstar",
    stclair_longterm: "stclairlongterm",
    mace_40w: "mace_40w",
  };

  const getVisibleAndOrderedStrategies = (timeframe: string) => {
    let currentVisibleStrategies: string[] = [];

    switch (timeframe) {
      case "weekly":
        currentVisibleStrategies = allStrategies.filter(
          (s) => s !== "trend_investor_pro"
        );
        break;
      case "daily":
        currentVisibleStrategies = ["trend_investor_pro", "northstar"];
        break;
      case "monthly":
        currentVisibleStrategies = ["northstar"];
        break;
      default:
        currentVisibleStrategies = allStrategies;
    }

    const filteredStrategies = currentVisibleStrategies.filter(
      (strategy) => !isUnavailable(strategy, timeframe)
    );

    filteredStrategies.sort((a, b) => {
      if (a === "st_clair") return -1;
      if (b === "st_clair") return 1;

      if (a === "stclair_longterm") return -1;
      if (b === "stclair_longterm") return 1;

      return 0;
    });

    return filteredStrategies;
  };

  // Fetch tickers from portfolio
  useEffect(() => {
    fetch("http://localhost:8000/portfolio_tickers")
      .then((res) => res.json())
      .then((data) => {
        setPortfolio(data.map((ticker: string) => ({ ticker })));
      });
  }, []);

  // Fetch signals
  useEffect(() => {
    if (portfolio.length === 0) return;
    setSignalsLoading(true);

    const cacheKey = selectedTimeframe;

    if (signalsCache.current[cacheKey]) {
      setSignalSummary(signalsCache.current[cacheKey]);
      setSignalsLoading(false);
      return;
    }

    async function fetchAllSignals() {
      const summary: any = {};
      const strategiesToFetch =
        getVisibleAndOrderedStrategies(selectedTimeframe);

      await Promise.all(
        portfolio.map(async (holding) => {
          const row: any = {};
          await Promise.all(
            strategiesToFetch.map(async (strategy) => {
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
                if (!Array.isArray(data.markers) || data.markers.length === 0) {
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
      signalsCache.current[cacheKey] = summary;
      setSignalSummary(summary);
      setSignalsLoading(false);
    }

    fetchAllSignals();
    // eslint-disable-next-line
  }, [portfolio, selectedTimeframe]);

  useEffect(() => {
    setSignalSummary({});
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

  const handleHeaderClick = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc"); // Default to ascending when changing column
    }
  };

  // Prepare sorted portfolio for rendering
  const sortedPortfolio = React.useMemo(() => {
    if (!sortColumn || Object.keys(signalSummary).length === 0) {
      return portfolio;
    }

    const sortOrder = { BUY: 1, SELL: 2, "": 3, "-": 4 }; // Define custom sort order for signals

    return [...portfolio].sort((a, b) => {
      const signalA = signalSummary[a.ticker]?.[sortColumn] || "-";
      const signalB = signalSummary[b.ticker]?.[sortColumn] || "-";

      const valA = sortOrder[signalA as keyof typeof sortOrder] || 4;
      const valB = sortOrder[signalB as keyof typeof sortOrder] || 4;

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;

      // If signals are the same, sort by ticker
      return a.ticker.localeCompare(b.ticker);
    });
  }, [portfolio, signalSummary, sortColumn, sortDirection]);

  const visibleAndOrderedStrategies =
    getVisibleAndOrderedStrategies(selectedTimeframe);

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
                {visibleAndOrderedStrategies.map((s) => (
                  <th
                    key={s}
                    onClick={() => handleHeaderClick(s)} // Add onClick for sorting
                    style={{ cursor: "pointer" }} // Make it clear it's clickable
                  >
                    {s.replace(/_/g, " ").replace("longterm", " LongTerm")}
                    {sortColumn === s && (
                      <span className="ms-1">
                        {sortDirection === "asc" ? " ▲" : " ▼"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPortfolio.map((holding) => (
                <tr key={holding.ticker}>
                  <td>{holding.ticker}</td>
                  {visibleAndOrderedStrategies.map((s) => {
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
