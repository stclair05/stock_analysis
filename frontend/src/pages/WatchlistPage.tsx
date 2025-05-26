import './WatchlistPage.css';
import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, SlidersHorizontal, ClipboardList } from "lucide-react";

interface WatchlistRow {
  symbol: string;
}

function renderCellValue(value: any) {
  if (value == null) return '—';
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("current" in value) return value.current;
    return JSON.stringify(value);
  }
  return String(value);
}

function getCellBgColor(
  value: any,
  colKey?: string,
  rowData?: Record<string, any>
) {
  // Handle metrics that are numbers (e.g. 20DMA, 50DMA, 200DMA)
  const numericColumns = [
    "twenty_dma",
    "fifty_dma",
    "two_hundred_dma",
    "three_year_ma"
    // add any others that are moving averages
  ];

  // If this is a numeric metric and has a current price for reference
  if (
    colKey &&
    numericColumns.includes(colKey) &&
    rowData &&
    rowData["current_price"] !== undefined
  ) {
    // If value is an object, use .current
    let compareVal = value;
    if (value && typeof value === "object" && value.current !== undefined) {
      compareVal = value.current;
    }
    const currentPrice = rowData["current_price"];
    if (typeof compareVal === "number" && typeof currentPrice === "number") {
      if (compareVal < currentPrice) return "#e5fbe5";   // Green (below price, "bullish")
      if (compareVal > currentPrice) return "#ffe5e5";   // Red (above price, "bearish")
      return "#f5f7fa"; // Neutral if exactly equal
    }
  }

  // Now continue with your standard string-based logic...
  if (value && typeof value === "object" && value.current !== undefined) {
    if (typeof value.current === "number") {
      return "transparent"; // Numbers not colored unless in above logic
    }
    value = value.current;
  }

  if (!value) return "transparent";
  const v = String(value).toLowerCase();

   // === Positional / Relative Terms ===
  if (v.includes("below")) return "#ffe9e6";    // Light orange
  if (v.includes("above")) return "#e6f4ff";    // Light blue
  if (v.includes("inside")) return "#edeef2";   // Neutral gray
  if (v.includes("between")) return "#fdf6e3";  // Soft yellow-beige

  // === Sentiment Signals ===
  if (v.includes("buy")) return "#e5fbe5";      // Soft green
  if (v.includes("sell")) return "#ffe5e5";     // Soft red

  // === Market Strength / Trend Labels ===
  if (v.includes("strong bullish")) return "#c3f7e0"; // Strong green
  if (v.includes("bullish")) return "#e5fbe5";        // Soft green
  if (v.includes("strong bearish")) return "#fbcaca"; // Strong red
  if (v.includes("bearish")) return "#ffe5e5";        // Soft red
  if (v.includes("weak")) return "#f5f7fa";           // Neutral light gray

  // === Custom U/D Levels ===
  if (v.includes("u1")) return "#e1f4ff";        // Light blue
  if (v.includes("u2")) return "#b3e5fc";        // Medium blue
  if (v.includes("u3")) return "#a7ffeb";        // Aqua
  if (v.includes("d1")) return "#ffe5e5";        // Soft red
  if (v.includes("d2")) return "#ffc1c1";        // Deeper red
  if (v.includes("d3")) return "#fbcaca";        // Strong red

  // === MA Position Logic ===
  if (v.includes("above rising ma")) return "#b9fbc0";      // Strong green
  if (v.includes("above falling ma")) return "#d9f99d";     // Soft green-yellow
  if (v.includes("below rising ma")) return "#edeef2";      // Neutral gray
  if (v.includes("below falling ma")) return "#ffe9e6";     // Soft red-orange

  // === Mean Reversion / Conditions ===
  if (v.includes("oversold")) return "#e5fbe5";        // Soft green
  if (v.includes("overbought")) return "#ffe5e5";      // Soft red
  if (v.includes("extended")) return "#fffbe7";        // Light yellow
  if (v.includes("normal")) return "#f5f7fa";          // Light neutral

  // === 50DMA & 150DMA Composite Signal ===
  if (v.includes("above both")) return "#c3f7e0";      // Strong uptrend - green
  if (v.includes("above 150dma only")) return "#e5fbe5";   // Mild uptrend - green
  if (v.includes("below both")) return "#ffe5e5";      // Strong downtrend - red
  if (v.includes("below 150dma only")) return "#ffc1c1";   // Mild downtrend - pink
  if (v.includes("between averages")) return "#fffbe7";    // Choppy - yellow

  // === ADX Classification ===
  if (v === "green") return "#e5fbe5";
  if (v === "light green") return "#d9f99d";
  if (v === "red") return "#ffe5e5";
  if (v === "light red") return "#fff1f0";
  if (v === "orange") return "#fff3e0";
  if (v === "in progress") return "#f5f7fa";

  // === 40-Week MA Status ===
  if (v.includes("++")) return "#b9fbc0";      // Best performance - green
  if (v.includes("+-")) return "#d9f99d";      // Still positive - yellow
  if (v.includes("-+")) return "#edeef2";      // Neutral/choppy
  if (v.includes("--")) return "#ffe5e5";      // Worst performance - red

  // === RSI Divergence ===
  if (v.includes("bullish divergence")) return "#c3f7e0";   // Bullish - green
  if (v.includes("bearish divergence")) return "#fbcaca";   // Bearish - red

  // === Bollinger Band Width Percentile ===
  if (v.includes("blue band")) return "#e6f4ff";       // Tight
  if (v.includes("red band")) return "#ffe5e5";        // Volatile
  if (v.includes("normal")) return "#f5f7fa";          // Neutral

  // === Chaikin Money Flow ===
  if (v.includes("positive")) return "#e5fbe5";
  if (v.includes("negative")) return "#ffe5e5";

  // === Special fallback cases ===
  if (v === "neutral") return "#f5f7fa";        // Neutral/gray
  if (v === "average") return "#f5f7fa";        // Average/gray

  return "transparent";
}


export default function WatchlistPage() {
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);
  const [rows, setRows] = useState<WatchlistRow[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  const [showManageModal, setShowManageModal] = useState(false);
  const [manageInput, setManageInput] = useState(""); // For adding new ticker
  const [isUpdating, setIsUpdating] = useState(false); // To block spam clicks


  // Define the list of available columns (metric keys and user-friendly labels)
  const ALL_METRICS = [
    { key: 'current_price', label: 'Current Price' },
    { key: 'three_year_ma', label: '3-Year MA' },
    { key: 'two_hundred_dma', label: '200 DMA' },
    { key: 'weekly_ichimoku', label: 'Weekly Ichimoku Cloud' },
    { key: 'super_trend', label: 'Super Trend' },
    { key: 'adx', label: 'ADX' },
    { key: 'mace', label: 'MACE' },
    { key: 'forty_week_status', label: '40-Week Status' },
    { key: 'fifty_dma_and_150_dma', label: '50/150 DMA' },
    { key: 'twenty_dma', label: '20 DMA' },
    { key: 'fifty_dma', label: '50 DMA' },
    { key: 'mean_rev_50dma', label: 'Mean Rev. 50DMA' },
    { key: 'mean_rev_200dma', label: 'Mean Rev. 200DMA' },
    { key: 'mean_rev_3yma', label: 'Mean Rev. 3YMA' },
    { key: 'rsi_and_ma_daily', label: 'RSI & MA (Daily)' },
    { key: 'rsi_divergence_daily', label: 'RSI Divergence (Daily)' },
    { key: 'bollinger_band_width_percentile_daily', label: 'BBWP (Daily)' },
    { key: 'rsi_ma_weekly', label: 'RSI & MA (Weekly)' },
    { key: 'rsi_divergence_weekly', label: 'RSI Divergence (Weekly)' },
    { key: 'rsi_ma_monthly', label: 'RSI & MA (Monthly)' },
    { key: 'rsi_divergence_monthly', label: 'RSI Divergence (Monthly)' },
    { key: 'chaikin_money_flow', label: 'Chaikin Money Flow' }
  ];

  const [selectedColumns, setSelectedColumns] = useState<string[]>(['current_price', 'twenty_dma', 'fifty_dma', 'two_hundred_dma', 'three_year_ma', 'weekly_ichimoku', 'mace', 'forty_week_status']);

  type AnalysisData = { [metric: string]: any };
  const [analysisData, setAnalysisData] = useState<{ [symbol: string]: AnalysisData }>({});

  // sorting feature 
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const NUMERIC_SORT_COLUMNS = ["twenty_dma", "fifty_dma", "two_hundred_dma", "three_year_ma"];



  // Calls to backend
  async function addTickerToWatchlist(symbol: string) {
    const sanitized = symbol.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
    if (!sanitized) return false;
    try {
      const res = await fetch(`http://localhost:8000/watchlist/${sanitized}`, {
        method: "POST"
      });
      if (!res.ok) {
        // Handle already in watchlist
        const errorData = await res.json();
        alert(errorData.detail || "Failed to add ticker.");
        return false;
      }
      const data = await res.json();
      setWatchlistTickers(data.watchlist); // Update with latest
      setManageInput("");
      return true;
    } catch (err) {
      alert("Network error. Try again.");
      return false;
    }
  }

  async function removeTickerFromWatchlist(symbol: string) {
  const sanitized = symbol.trim().toUpperCase();
  try {
    const res = await fetch(`http://localhost:8000/watchlist/${sanitized}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      const errorData = await res.json();
      alert(errorData.detail || "Failed to remove ticker.");
      return false;
    }
    const data = await res.json();
    setWatchlistTickers(data.watchlist); // Update with latest
    return true;
  } catch (err) {
    alert("Network error. Try again.");
    return false;
  }
  }
  // this is stock by stock
  const fetchAnalysisData = async (symbol: string, retry = 0) => {
    try {
      const response = await fetch("http://localhost:8000/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });

      if (!response.ok) {
        if (retry >= 3) {
          const errorData = await response.json();
          // Optionally: set some error state for this symbol
          setAnalysisData(prev => ({ ...prev, [symbol]: { error: errorData.detail || "Error" } }));
        } else {
          setTimeout(() => fetchAnalysisData(symbol, retry + 1), 1000);
        }
        return;
      }

      const data = await response.json();
      setAnalysisData(prev => ({ ...prev, [symbol]: data }));

    } catch (err) {
      if (retry >= 3) {
        setAnalysisData(prev => ({ ...prev, [symbol]: { error: "Network error" } }));
      } else {
        setTimeout(() => fetchAnalysisData(symbol, retry + 1), 1000);
      }
    }
  };
  // lets try batching 
  async function fetchBatchAnalysisData(symbols: string[]) {
    // Send the list of stock requests to the backend
    const requests = symbols.map(symbol => ({ symbol }));
    try {
      const response = await fetch("http://localhost:8000/analyse_batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requests),
      });

      if (!response.ok) {
        // Batch error (very rare), handle globally
        throw new Error("Batch analysis failed");
      }
      const data = await response.json(); // Should be {AAPL: {...}, GOOG: {...}, ...}
      setAnalysisData(prev => ({
        ...prev,
        ...data,
      }));
    } catch (err) {
      // Mark all as failed
      setAnalysisData(prev =>
        symbols.reduce((acc, s) => ({ ...acc, [s]: { error: "Batch network error" } }), prev)
      );
    }
  }

  // Sorting columns function 
  function getSortValue(row: WatchlistRow, colKey: string) {
    const data = analysisData[row.symbol];
    if (!data) return null;

    if (NUMERIC_SORT_COLUMNS.includes(colKey)) {
      const maVal = data[colKey]?.current ?? data[colKey];
      const price = data.current_price;
      if (typeof maVal === "number" && typeof price === "number" && maVal !== 0) {
        // Sorting by percentage difference
        return ((price - maVal) / maVal) * 100;
      }
      return null;
    }

    // Fallback for other columns: try to sort by value directly
    const val = data[colKey]?.current ?? data[colKey];
    return typeof val === "string" ? val.toLowerCase() : val;
  }

  const sortedRows = (() => {
    if (!sortConfig) return rows;
    const { key, direction } = sortConfig;
    const sorted = [...rows].sort((a, b) => {
      const valA = getSortValue(a, key);
      const valB = getSortValue(b, key);

      // Numbers
      if (typeof valA === "number" && typeof valB === "number") {
        return direction === "asc" ? valA - valB : valB - valA;
      }
      // Strings
      if (typeof valA === "string" && typeof valB === "string") {
        return direction === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      // Fallback: empty values last
      if (valA == null) return 1;
      if (valB == null) return -1;
      return 0;
    });
    return sorted;
  })();

  // percentage diff between numerical metric and curr price 
  function renderValueWithPercentDiff(
    metricValue: any,
    currentPrice: any
  ): string {
    // Defensive extraction for objects with .current property
    const value = typeof metricValue === "object" && metricValue !== null
      ? metricValue.current
      : metricValue;

    if (typeof value !== "number" || typeof currentPrice !== "number" || !isFinite(value) || !isFinite(currentPrice)) {
      return value == null ? "—" : String(value);
    }
    const diff = ((currentPrice - value) / value) * 100;
    const diffStr =
      diff > 0
        ? `(+${diff.toFixed(2)}%)`
        : `(${diff.toFixed(2)}%)`;
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${diffStr}`;
  }




  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  // Get watchlist
  useEffect(() => {
    fetch("http://localhost:8000/watchlist")
      .then((res) => res.json())
      .then((data) => setWatchlistTickers(data))
      .catch(() => setWatchlistTickers([]));
  }, []);

  // Fetch analysis data 
  useEffect(() => {
    // Only fetch for symbols that don't have data yet (avoid redundant calls)
    const symbolsToFetch = rows
      .map(r => r.symbol)
      .filter(symbol => !analysisData[symbol]);
    if (symbolsToFetch.length > 0) {
      fetchBatchAnalysisData(symbolsToFetch);
    }
    // eslint-disable-next-line
  }, [rows]);



  // On Load up 
  useEffect(() => {
    // Only set if rows is empty to avoid overwriting user edits
    if (watchlistTickers.length > 0 && rows.length === 0) {
      setRows(watchlistTickers.map(symbol => ({ symbol })));
    }
  }, [watchlistTickers]);


  // Column's drop down
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        columnsDropdownRef.current &&
        !columnsDropdownRef.current.contains(event.target as Node)
      ) {
        setShowColumnsDropdown(false);
      }
    }
    if (showColumnsDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnsDropdown]);


  const addTicker = (symbol: string) => {
    symbol = symbol.toUpperCase();
    if (symbol && !rows.some((r) => r.symbol === symbol)) {
      setRows([...rows, { symbol }]);
    }
  };

  const deleteTicker = (symbol: string) => {
    setRows(rows.filter((row) => row.symbol !== symbol));
  };

  return (
    <div className="container-fluid py-5" style={{ minHeight: "100vh" }}>
      <div className="watchlist-page-content px-4 px-md-5">
        {/* Header row */}
        <h1 className="fw-bold mb-4" style={{ fontSize: "2.4rem" }}>
          Watchlist Comparison
        </h1>
        {/* Add Ticker Button + Dropdown */}
        <div className="d-flex align-items-center gap-3 mb-4">
          <div className="position-relative">
            <button
              className="btn add-ticker-btn d-flex align-items-center gap-2 px-4 py-2 shadow-sm"
              onClick={() => setShowDropdown((v) => !v)}
            >
              <Plus size={18} /> Add Ticker
            </button>
          
            {showDropdown && (
              <div
                ref={dropdownRef}
                className="dropdown-menu show p-3 mt-2 shadow rounded-3"
                style={{
                  minWidth: 270,
                  left: 0,
                  top: "110%",
                  display: "block",
                }}
              >
                <div className="mb-2 fw-bold text-dark">Your Watchlist</div>
                <div className="mb-2" style={{ maxHeight: 140, overflowY: "auto" }}>
                  {watchlistTickers.length === 0 ? (
                    <div className="text-muted small">No saved tickers</div>
                  ) : (
                    watchlistTickers.map((s) => (
                      <div
                        key={s}
                        onClick={() => {
                          addTicker(s);
                          setShowDropdown(false);
                        }}
                        className="px-2 py-1 rounded hover-bg text-dark"
                        style={{
                          cursor: "pointer",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#e9ecef")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        {s}
                      </div>
                    ))
                  )}
                </div>
                <hr />
                <input
                  className="form-control"
                  placeholder="Enter any ticker..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value
                        .toUpperCase()
                        .trim();
                      if (val) {
                        addTicker(val);
                        setShowDropdown(false);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                />
              </div>
            )}
          </div>
          {/* Manage Watchlist Button */}
          <button
            className="btn btn-outline-primary d-flex align-items-center gap-2 px-4 py-2 shadow-sm"
            onClick={() => setShowManageModal(true)}
          >
            <ClipboardList size={20} /> Manage Watchlist
          </button>
          {showManageModal && (
            <div className="watchlist-modal-overlay" onClick={() => setShowManageModal(false)}>
              <div
                className="watchlist-modal"
                onClick={e => e.stopPropagation()}
                style={{
                  maxWidth: 400,
                  margin: "8vh auto",
                  background: "#fff",
                  borderRadius: 18,
                  boxShadow: "0 12px 40px 0 rgba(40,40,80,0.13)",
                  padding: "2.5rem 2.1rem 2rem 2.1rem",
                  minHeight: 160,
                  zIndex: 1000,
                  position: "relative"
                }}
              >
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="fw-bold mb-0">Manage Watchlist</h5>
                  <button
                    className="btn btn-light btn-sm rounded-circle border-0"
                    onClick={() => setShowManageModal(false)}
                  >
                    <X size={20} />
                  </button>
                </div>
                {/* Add ticker form */}
                <form
                  className="d-flex mb-3 gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setIsUpdating(true);
                    await addTickerToWatchlist(manageInput);
                    setIsUpdating(false);
                  }}
                >
                  <input
                    className="form-control"
                    placeholder="Add ticker (e.g. AAPL)"
                    value={manageInput}
                    onChange={e => setManageInput(e.target.value)}
                    disabled={isUpdating}
                  />
                  <button className="btn btn-primary" type="submit" disabled={isUpdating}>Add</button>
                </form>
                {/* Watchlist tickers */}
                <ul className="list-unstyled mb-3" style={{ maxHeight: 340, overflowY: "auto" }}>
                  {watchlistTickers.length === 0 ? (
                    <li className="text-muted">Your watchlist is empty.</li>
                  ) : (
                    watchlistTickers.map(symbol => (
                      <li key={symbol} className="d-flex align-items-center justify-content-between py-2 px-1 border-bottom">
                        <span className="fw-semibold">{symbol}</span>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={async () => {
                            setIsUpdating(true);
                            await removeTickerFromWatchlist(symbol);
                            setIsUpdating(false);
                          }}
                          disabled={isUpdating}
                        >
                          Remove
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}

        </div>

        {/* Table / Card */}
        <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
          <div
            className="card shadow-sm border-0 rounded-0"
            style={{
              display: "inline-block",    // Hug the table width
              width: "auto",
              minWidth: 0,
              maxWidth: "100vw",          // Prevent overflow
            }}
          >
            <div className="card-body px-4 py-3">
              {/* Column Selector */}
              <div className="d-flex align-items-center mb-3" style={{ gap: "1.25rem" }}>
                <div className="dropdown" ref={columnsDropdownRef} style={{ position: "relative" }}>
                  <button
                    className="btn btn-outline-primary d-flex align-items-center gap-2 px-3 py-2 rounded-3 shadow-sm"
                    type="button"
                    onClick={() => setShowColumnsDropdown(v => !v)}
                    style={{ fontWeight: 500 }}
                  >
                    <SlidersHorizontal size={18} className="me-2" />
                    Select Columns
                  </button>
                  {showColumnsDropdown && (
                    <div
                      className="dropdown-menu show p-2 mt-2 shadow rounded-3"
                      style={{
                        display: "block",
                        position: "absolute",
                        left: 0,
                        top: "110%",
                        minWidth: 240,
                        maxHeight: 320,
                        overflowY: "auto",
                        zIndex: 30,
                      }}
                      onClick={e => e.stopPropagation()} // so checking a box doesn't close the dropdown
                    >
                      {ALL_METRICS.map(metric => (
                        <label
                          key={metric.key}
                          className="dropdown-item d-flex align-items-center"
                          style={{ userSelect: "none", fontSize: "1.01rem" }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedColumns.includes(metric.key)}
                            onChange={() => {
                              setSelectedColumns(selectedColumns =>
                                selectedColumns.includes(metric.key)
                                  ? selectedColumns.filter(col => col !== metric.key)
                                  : [...selectedColumns, metric.key]
                              );
                            }}
                            className="form-check-input me-2"
                          />
                          {metric.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>


              {/* ACTUAL TABLE */}
              <table
                className="table align-middle mb-0"
                style={{
                  width: "auto",           // Hug content
                  minWidth: 0
                }}
              >
                <thead className="table-light">
                  <tr>
                    <th style={{ minWidth: 100 }}>Ticker</th>
                    {selectedColumns.map(colKey => {
                      const metric = ALL_METRICS.find(m => m.key === colKey);
                      const isSorted = sortConfig && sortConfig.key === colKey;
                      return (
                        <th
                          key={colKey}
                          style={{ minWidth: 100, cursor: "pointer", userSelect: "none" }}
                          onClick={() => {
                            setSortConfig(prev =>
                              prev && prev.key === colKey
                                ? { key: colKey, direction: prev.direction === "asc" ? "desc" : "asc" }
                                : { key: colKey, direction: "desc" }
                            );
                          }}
                        >
                          {metric ? metric.label : colKey}
                          {isSorted && (
                            <span style={{ marginLeft: 6, fontSize: 12 }}>
                              {sortConfig!.direction === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th
                      style={{ width: 60, cursor: "pointer" }}
                      className="text-center"
                      title="Clear all"
                      onClick={() => setRows([])}
                    >
                      <Trash2 size={16} className="ms-1" />
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={selectedColumns.length + 2} className="text-center py-5">
                        <div className="mb-3">
                          <svg width="60" height="60" fill="none" viewBox="0 0 60 60">
                            <circle cx="30" cy="30" r="30" fill="#F4F7FB" />
                            <rect x="15" y="24" width="30" height="13" rx="3" fill="#E1E7EF" />
                            <rect x="22" y="30" width="8" height="4" rx="2" fill="#C3CBD9" />
                            <rect x="35" y="30" width="8" height="4" rx="2" fill="#C3CBD9" />
                          </svg>
                        </div>
                        <div className="fw-semibold text-muted mb-1" style={{ fontSize: "1.1rem" }}>
                          No tickers yet
                        </div>
                        <div className="text-muted">
                          Click <span className="text-primary fw-semibold">Add Ticker</span> to get started!
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map(row => (
                      <tr key={row.symbol} className="watchlist-row">
                        <td className="fw-bold text-dark">{row.symbol}</td>
                        {selectedColumns.map(colKey => {
                          const isNumeric = NUMERIC_SORT_COLUMNS.includes(colKey);
                          const rowData = analysisData[row.symbol];
                          const value = rowData?.[colKey];
                          const price = rowData?.current_price;

                          return (
                            <td
                              key={colKey}
                              style={{
                                backgroundColor: getCellBgColor(
                                  value,
                                  colKey,
                                  rowData
                                ),
                                color: "#111"
                              }}
                            >
                              {rowData
                                ? isNumeric
                                  ? renderValueWithPercentDiff(value, price)
                                  : renderCellValue(value)
                                : <span
                                    className="placeholder"
                                    style={{
                                      width: `${60 + Math.random() * 30}%`,
                                      height: '1.3em',
                                      display: 'inline-block'
                                    }}
                                  >&nbsp;</span>

                              }
                            </td>
                          );
                        })}

                        <td className="text-center">
                          <div className="delete-btn-wrap d-inline-block">
                            <button
                              className="btn btn-light btn-sm rounded-circle border-0 text-danger"
                              style={{
                                background: "#fff",
                                boxShadow: "0 1px 4px 0 rgba(50,50,93,.04)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                              }}
                              title="Remove"
                              onClick={() => deleteTicker(row.symbol)}
                            >
                              <X size={18} strokeWidth={2.3} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
