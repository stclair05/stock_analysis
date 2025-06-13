import React, { useState, useEffect, useMemo, useRef } from "react"; // Added useRef

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
  const [portfolio, setPortfolio] = useState<{ ticker: string }[]>([]); // This will now hold either portfolio or watchlist tickers
  const [signalSummary, setSignalSummary] = useState<any>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState("weekly");
  const [signalsLoading, setSignalsLoading] = useState(false);

  // Cache for the actual BUY/SELL signals (based on timeframe and listType)
  const signalsCache = useRef<{
    [key: string]: { [ticker: string]: { [strategy: string]: string } };
  }>({});

  // NEW: Cache for the portfolio/watchlist ticker lists themselves
  const portfolioDataCache = useRef<{
    portfolio?: { ticker: string }[];
    watchlist?: { ticker: string }[];
  }>({});

  // State for list type selection
  const [listType, setListType] = useState<"portfolio" | "watchlist">(
    "portfolio"
  ); // Default to 'portfolio'

  // State for sorting
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // State for global signal filtering
  const [filterType, setFilterType] = useState<"ALL" | "BUY" | "SELL">("ALL");

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
      // Prioritize "st_clair"
      if (a === "st_clair") return -1;
      if (b === "st_clair") return 1;

      // Then prioritize "stclair_longterm"
      if (a === "stclair_longterm") return -1;
      if (b === "stclair_longterm") return 1;

      // Maintain original order for others
      return 0;
    });

    return filteredStrategies;
  };

  // MODIFIED: Fetch tickers from selected list type, with caching
  useEffect(() => {
    const fetchTickers = async () => {
      // Check cache first
      if (portfolioDataCache.current[listType]) {
        setPortfolio(portfolioDataCache.current[listType]!);
        setSignalSummary({}); // Clear signals to indicate potential change
        setSortColumn(null);
        setFilterType("ALL");
        return;
      }

      setSignalsLoading(true); // Indicate loading when fetching new tickers
      const endpoint =
        listType === "portfolio" ? "/portfolio_tickers" : "/watchlist";

      try {
        const res = await fetch(`http://localhost:8000${endpoint}`);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        const tickers = Array.isArray(data) ? data : [];
        const formattedTickers = tickers.map((ticker: string) => ({ ticker }));

        // Store in cache
        portfolioDataCache.current[listType] = formattedTickers;
        setPortfolio(formattedTickers);

        // Clear caches and reset states when list type changes
        signalsCache.current = {}; // Clear signals cache as the underlying tickers changed
        setSignalSummary({});
        setSortColumn(null);
        setFilterType("ALL");
      } catch (error) {
        console.error(`Error fetching ${listType} tickers:`, error);
        setPortfolio([]); // Clear portfolio on error
        portfolioDataCache.current[listType] = []; // Cache empty array on error
        signalsCache.current = {};
        setSignalSummary({});
        setSortColumn(null);
        setFilterType("ALL");
      } finally {
        setSignalsLoading(false); // End loading indicator
      }
    };

    fetchTickers();
  }, [listType]); // Rerun this effect when listType changes

  // Fetch signals for all stocks/strategies/timeframes
  useEffect(() => {
    // Only fetch signals if portfolio is not empty and not currently fetching new tickers
    if (portfolio.length === 0 || signalsLoading) return;

    setSignalsLoading(true);

    const cacheKey = `${selectedTimeframe}-${listType}`; // Include listType in cache key

    // If cached, use it immediately
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
  }, [portfolio, selectedTimeframe]); // Ensure this effect runs when portfolio changes

  // This useEffect (setSignalSummary({})) is now less critical
  // as state resets are handled in the ticker fetch effect.
  // Keeping it doesn't hurt, but it might be redundant depending on exact timing.
  // I'll leave it for now.
  useEffect(() => {
    setSignalSummary({}); // Clear signals when portfolio is being reloaded (e.g., initial load or manual portfolio refresh)
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
    setFilterType("ALL"); // Reset global filter when sorting a specific column
  };

  const displayedPortfolio = useMemo(() => {
    let currentPortfolio = [...portfolio];
    const visibleAndOrderedStrategies =
      getVisibleAndOrderedStrategies(selectedTimeframe);

    if (filterType !== "ALL") {
      currentPortfolio = currentPortfolio.filter((holding) => {
        let hasRelevantSignal = false;
        let allSignalsMatchFilter = true;

        for (const strategy of visibleAndOrderedStrategies) {
          const signal = signalSummary[holding.ticker]?.[strategy];

          if (signal === "BUY" || signal === "SELL") {
            hasRelevantSignal = true;
            if (signal !== filterType) {
              allSignalsMatchFilter = false;
              break;
            }
          }
        }
        return hasRelevantSignal && allSignalsMatchFilter;
      });
    }

    if (sortColumn && Object.keys(signalSummary).length > 0) {
      const sortOrder = { BUY: 1, SELL: 2, "": 3, "-": 4 };

      currentPortfolio.sort((a, b) => {
        const signalA = signalSummary[a.ticker]?.[sortColumn] || "-";
        const signalB = signalSummary[b.ticker]?.[sortColumn] || "-";

        const valA = sortOrder[signalA as keyof typeof sortOrder] || 4;
        const valB = sortOrder[signalB as keyof typeof sortOrder] || 4;

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;

        return a.ticker.localeCompare(b.ticker);
      });
    }

    return currentPortfolio;
  }, [
    portfolio,
    signalSummary,
    sortColumn,
    sortDirection,
    filterType,
    selectedTimeframe,
  ]);

  const visibleAndOrderedStrategies =
    getVisibleAndOrderedStrategies(selectedTimeframe);

  const emptyListMessage =
    listType === "portfolio"
      ? "No equities in your portfolio."
      : "No equities in your watchlist.";

  return (
    <div>
      <div className="mb-3 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center">
          {/* List Type Dropdown */}
          <label className="fw-semibold me-2">List:</label>
          <select
            value={listType}
            onChange={(e) =>
              setListType(e.target.value as "portfolio" | "watchlist")
            }
            className="me-4"
          >
            <option value="portfolio">Portfolio</option>
            <option value="watchlist">Watchlist</option>
          </select>

          {/* Timeframe Dropdown */}
          <label className="fw-semibold me-2">Timeframe:</label>
          <select
            value={selectedTimeframe}
            onChange={(e) => {
              setSelectedTimeframe(e.target.value);
              setSortColumn(null);
              setFilterType("ALL");
            }}
          >
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {/* Global Signal Filter Dropdown */}
        <div className="d-flex align-items-center">
          <label className="fw-semibold ms-4 me-2">Show:</label>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as "ALL" | "BUY" | "SELL");
              setSortColumn(null);
            }}
          >
            <option value="ALL">All Signals</option>
            <option value="BUY">BUY Only</option>
            <option value="SELL">SELL Only</option>
          </select>
        </div>
      </div>

      {/* Loading or No Data States */}
      {signalsLoading ? ( // This now covers both initial ticker fetch and subsequent signal fetches
        <div className="text-center my-4">
          <span className="spinner-border" role="status" aria-hidden="true" />
          <span className="ms-2">Loading signals...</span>
        </div>
      ) : portfolio.length === 0 ? (
        <div className="text-center my-4 text-muted">{emptyListMessage}</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-bordered signal-summary-table">
            <thead>
              <tr>
                <th>Stock</th>
                {visibleAndOrderedStrategies.map((s) => (
                  <th
                    key={s}
                    onClick={() => handleHeaderClick(s)}
                    style={{ cursor: "pointer" }}
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
              {displayedPortfolio.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleAndOrderedStrategies.length + 1}
                    className="text-center text-muted"
                  >
                    No signals found matching your filter.
                  </td>
                </tr>
              ) : (
                displayedPortfolio.map((holding) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
