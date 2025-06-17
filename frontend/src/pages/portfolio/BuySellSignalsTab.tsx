import React, { useState, useEffect, useMemo, useRef } from "react";
import "../PortfolioPage.css";

const timeframes = ["daily", "weekly", "monthly"];
const allStrategies = [
  "trend_investor_pro",
  "northstar",
  "st_clair",
  "stclair_longterm",
  "mace_40w",
  // "demarker",
  // Add other strategies if needed
];

export default function BuySellSignalsTab() {
  // MODIFIED: portfolio state now includes sector
  const [portfolio, setPortfolio] = useState<
    { ticker: string; sector?: string }[]
  >([]);
  const [signalSummary, setSignalSummary] = useState<any>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState("weekly");
  const [signalsLoading, setSignalsLoading] = useState(false);

  // Cache for the actual BUY/SELL signals (based on timeframe and listType)
  const signalsCache = useRef<{
    [key: string]: { [ticker: string]: { [strategy: string]: string } };
  }>({});

  // NEW: Cache for the portfolio/watchlist ticker lists themselves
  // MODIFIED: portfolioDataCache now includes sector
  const portfolioDataCache = useRef<{
    portfolio?: { ticker: string; sector?: string }[];
    watchlist?: { ticker: string; sector?: string }[];
  }>({});

  // State for list type selection
  const [listType, setListType] = useState<"portfolio" | "watchlist">(
    "portfolio"
  ); // Default to 'portfolio'

  // State for sorting
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // State for global signal filtering
  const [filterType, setFilterType] = useState<
    "ALL" | "BUY" | "SELL" | "MIXED"
  >("ALL");

  const strategyApiMap: Record<string, string> = {
    trend_investor_pro: "trendinvestorpro",
    st_clair: "stclair",
    northstar: "northstar",
    stclair_longterm: "stclairlongterm",
    mace_40w: "mace_40w",
    // demarker: "demarker",
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
  // This useEffect now handles the new backend response format
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
        listType === "portfolio" ? "/portfolio_tickers" : "/watchlist"; // Assuming a /watchlist endpoint exists and returns similar data

      try {
        const res = await fetch(`http://localhost:8000${endpoint}`);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();

        // MODIFIED: Safely format tickers, expecting { ticker, sector } objects
        const formattedTickers: { ticker: string; sector?: string }[] =
          Array.isArray(data)
            ? data
                .map((item: any) => {
                  // Handle both string (old backend) and object (new backend) formats
                  if (typeof item === "string") {
                    return { ticker: item, sector: "N/A" }; // Default sector if only ticker string is returned
                  } else if (
                    item &&
                    typeof item === "object" &&
                    "ticker" in item
                  ) {
                    return {
                      ticker: item.ticker,
                      sector: item.sector || "N/A",
                    }; // Use provided sector or default
                  }
                  return { ticker: "", sector: "N/A" }; // Fallback for malformed data
                })
                .filter((item) => item.ticker !== "") // Filter out any empty tickers resulting from malformed data
            : [];

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
                const [resSignals, resStrength] = await Promise.all([
                  fetch(
                    `http://localhost:8000/api/signals_${selectedTimeframe}/${holding.ticker}?strategy=${apiStrategy}`
                  ),
                  fetch(
                    `http://localhost:8000/api/signal_strength/${holding.ticker}?strategy=${apiStrategy}&timeframe=${selectedTimeframe}`
                  ),
                ]);

                const signalData = resSignals.ok
                  ? await resSignals.json()
                  : null;
                const strengthData = resStrength.ok
                  ? await resStrength.json()
                  : null;

                const last =
                  signalData?.markers?.[signalData.markers.length - 1];
                const status =
                  last?.side?.toUpperCase() || strengthData?.status || "";
                const delta = strengthData?.delta || "";

                row[strategy] = { status, delta };
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
  };

  const displayedPortfolio = useMemo(() => {
    let currentPortfolio = [...portfolio];
    const visibleAndOrderedStrategies =
      getVisibleAndOrderedStrategies(selectedTimeframe);

    if (filterType !== "ALL") {
      currentPortfolio = currentPortfolio.filter((holding) => {
        let hasMatchingSignal = false; // For BUY/SELL filters
        let hasContradictorySignal = false;
        let hasBuySignal = false;
        let hasSellSignal = false;

        for (const strategy of visibleAndOrderedStrategies) {
          const signalObj = signalSummary[holding.ticker]?.[strategy];
          const status = signalObj?.status || "";

          if (status === "BUY") hasBuySignal = true;
          if (status === "SELL") hasSellSignal = true;

          if (filterType === "BUY" || filterType === "SELL") {
            if (status === filterType) {
              hasMatchingSignal = true;
            } else if (status && status !== "-") {
              hasContradictorySignal = true;
              break;
            }
          }
        }

        if (filterType === "MIXED") {
          return hasBuySignal && hasSellSignal;
        }
        // Include if it has at least one matching signal AND no contradictory signals
        return hasMatchingSignal && !hasContradictorySignal;
      });
    }

    if (sortColumn && Object.keys(signalSummary).length > 0) {
      const sortOrder = { BUY: 1, SELL: 2, "": 3, "-": 4 };

      currentPortfolio.sort((a, b) => {
        const signalA = signalSummary[a.ticker]?.[sortColumn]?.status || "-";
        const signalB = signalSummary[b.ticker]?.[sortColumn]?.status || "-";

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

  // NEW: Memoized calculation for sector summary
  const sectorSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    // Only calculate for specific filter types (BUY/SELL)
    if (
      filterType === "ALL" ||
      filterType === "MIXED" ||
      displayedPortfolio.length === 0
    ) {
      return {};
    }

    const strategiesToCheck = getVisibleAndOrderedStrategies(selectedTimeframe);

    displayedPortfolio.forEach((holding) => {
      const signals = signalSummary[holding.ticker];
      if (!signals || !holding.sector || holding.sector === "N/A") return; // Skip if no signals or no valid sector info

      // IMPORTANT: The filtering for "all buys/sells even with nil" is now handled
      // by the `displayedPortfolio` itself. So, if a ticker is in `displayedPortfolio`
      // under a specific filterType, it already meets the new criteria.
      // We no longer need to re-check `allSignalsMatch` here in `sectorSummary`.
      // The `displayedPortfolio` will only contain tickers that either
      // (a) have at least one matching signal AND no contradictory signals,
      // or (b) are "ALL" where this logic doesn't apply.

      const sector = holding.sector;
      counts[sector] = (counts[sector] || 0) + 1;
    });

    return counts;
  }, [displayedPortfolio, signalSummary, filterType, selectedTimeframe]); // Depend on relevant states

  const visibleAndOrderedStrategies =
    getVisibleAndOrderedStrategies(selectedTimeframe);

  const emptyListMessage =
    listType === "portfolio"
      ? "No equities in your portfolio."
      : "No equities in your watchlist.";

  // Determine the badge color based on the filterType
  const badgeColorClass =
    filterType === "BUY"
      ? "bg-success"
      : filterType === "SELL"
      ? "bg-danger"
      : "bg-primary";

  // Calculate the total count for the summary
  const totalSectorCount = useMemo(() => {
    return Object.values(sectorSummary).reduce((sum, count) => sum + count, 0);
  }, [sectorSummary]);

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
              setFilterType(e.target.value as "ALL" | "BUY" | "SELL" | "MIXED");
              setSortColumn(null);
            }}
          >
            <option value="ALL">All Signals</option>
            <option value="BUY">BUY Only</option>
            <option value="SELL">SELL Only</option>
            <option value="MIXED">Mixed</option>
          </select>
        </div>
      </div>

      {/* Loading or No Data States */}
      {signalsLoading ? (
        <div className="text-center my-4">
          <span className="spinner-border" role="status" aria-hidden="true" />
          <span className="ms-2">Loading signals...</span>
        </div>
      ) : portfolio.length === 0 ? (
        <div className="text-center my-4 text-muted">{emptyListMessage}</div>
      ) : (
        <>
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
                        const signalObj =
                          signalSummary[holding.ticker]?.[s] ?? {};
                        const status = signalObj.status || "";
                        const delta = signalObj.delta || "";

                        let color = "#bdbdbd";
                        if (status === "BUY") color = "#009944";
                        if (status === "SELL") color = "#e91e63";

                        let icon = "";
                        if (delta === "strengthening") icon = " ↑";
                        else if (delta === "weakening") icon = " ↓";
                        else if (delta === "crossed") icon = " 🔁";
                        const cellStyle: React.CSSProperties = {
                          color,
                          textAlign: "center",
                          fontWeight: 700,
                        };

                        let cellClass = "";
                        if (status === "BUY" && delta === "strengthening")
                          cellClass = "signal-buy-strengthening";
                        else if (status === "BUY" && delta === "weakening")
                          cellClass = "signal-buy-weakening";
                        else if (status === "SELL" && delta === "strengthening")
                          cellClass = "signal-sell-strengthening";
                        else if (status === "SELL" && delta === "weakening")
                          cellClass = "signal-sell-weakening";

                        if (delta === "crossed") {
                          cellClass += " signal-crossed";
                        }

                        return (
                          <td key={s} style={cellStyle} className={cellClass}>
                            <span title={delta}>
                              {status || "-"}
                              {icon}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Display Sector Summary - Improved Look */}
          {filterType !== "ALL" && Object.keys(sectorSummary).length > 0 && (
            <div className="card mt-4 shadow-sm border-0">
              <div className="card-header bg-light fw-bold fs-5 border-bottom-0">
                Summary of {filterType} Signals by Sector (Consistent Signals)
              </div>
              <ul className="list-group list-group-flush">
                {Object.entries(sectorSummary)
                  .sort(([sectorA], [sectorB]) =>
                    sectorA.localeCompare(sectorB)
                  )
                  .map(([sector, count]) => (
                    <li
                      key={sector}
                      className="list-group-item d-flex justify-content-between align-items-center py-3"
                      style={{ fontSize: "1.12rem" }}
                    >
                      <span>{sector}</span>
                      <span
                        className={`badge ${badgeColorClass} rounded-pill px-4 py-2 fs-5 fw-bold`}
                        style={{ minWidth: "2.5rem", textAlign: "center" }}
                      >
                        {count}
                      </span>
                    </li>
                  ))}
                {/* Total Row - Stand Out */}
                <li
                  className="list-group-item d-flex justify-content-between align-items-center fw-bold bg-secondary bg-opacity-10 border-0 py-3"
                  style={{ fontSize: "1.15rem" }}
                >
                  Total Consistent Tickers:
                  <span
                    className={`badge ${badgeColorClass} rounded-pill px-4 py-2 fs-5 fw-bold`}
                    style={{ minWidth: "2.5rem", textAlign: "center" }}
                  >
                    {totalSectorCount}
                  </span>
                </li>
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
