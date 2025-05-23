import './WatchlistPage.css';
import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";

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


export default function WatchlistPage() {
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);
  const [rows, setRows] = useState<WatchlistRow[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  // Define the list of available columns (metric keys and user-friendly labels)
  const ALL_METRICS = [
    { key: 'current_price', label: 'Current Price' },
    { key: 'three_year_ma', label: '3-Year MA' },
    { key: 'two_hundred_dma', label: '200 DMA' },
    { key: 'weekly_ichimoku', label: 'Weekly Ichimoku' },
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

  const [selectedColumns, setSelectedColumns] = useState<string[]>(['current_price', 'twenty_dma', 'fifty_dma', 'two_hundred_dma', 'three_year_ma']);

  type AnalysisData = { [metric: string]: any };
  const [analysisData, setAnalysisData] = useState<{ [symbol: string]: AnalysisData }>({});



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
    rows.forEach(row => {
      if (!analysisData[row.symbol]) {
        fetch("http://localhost:8000/analyse", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: row.symbol }),
        })
          .then(res => res.json())
          .then(data => setAnalysisData(prev => ({ ...prev, [row.symbol]: data })))
          .catch(() => setAnalysisData(prev => ({ ...prev, [row.symbol]: {} })));
      }
    });
  }, [rows]);

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
    <div className="container py-5" style={{ minHeight: "100vh" }}>
      <div className="mx-auto" style={{ maxWidth: "100%" }}>
        <h1 className="fw-bold mb-4" style={{ fontSize: "2.4rem" }}>
          Watchlist Comparison
        </h1>
        {/* Add Ticker Button + Dropdown */}
        <div className="position-relative mb-4" style={{ display: "inline-block" }}>
          <button
            className="btn btn-primary d-flex align-items-center gap-2 px-4 py-2 rounded-pill shadow-sm"
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

        <div className="card shadow-sm border-0 rounded-0">
          <div className="card-body p-0">
            {/* Column Selector */}
            <div className="mb-3">
              <div className="dropdown d-inline-block" ref={columnsDropdownRef} style={{ position: "relative" }}>
                <button
                  className="btn btn-outline-secondary dropdown-toggle"
                  type="button"
                  onClick={() => setShowColumnsDropdown(v => !v)}
                >
                  Select Columns
                </button>
                {showColumnsDropdown && (
                  <div
                    className="dropdown-menu show p-2"
                    style={{
                      display: "block",
                      position: "absolute",
                      left: 0,
                      top: "100%",
                      minWidth: 220,
                      maxHeight: 320,
                      overflowY: "auto",
                      zIndex: 20,
                    }}
                    onClick={e => e.stopPropagation()} // so checking a box doesn't close the dropdown
                  >
                    {ALL_METRICS.map(metric => (
                      <label key={metric.key} className="dropdown-item d-flex align-items-center" style={{ userSelect: "none" }}>
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
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ minWidth: 100 }}>Ticker</th>
                    {selectedColumns.map(colKey => {
                      const metric = ALL_METRICS.find(m => m.key === colKey);
                      return (
                        <th key={colKey} style={{ minWidth: 100 }}>
                          {metric ? metric.label : colKey}
                        </th>
                      );
                    })}
                    <th style={{ width: 60 }} className="text-center">
                      <Trash2 size={16} className="ms-1" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
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
                    rows.map(row => (
                      <tr key={row.symbol} className="watchlist-row">
                        <td className="fw-bold text-dark">{row.symbol}</td>
                        {selectedColumns.map(colKey => (
                          <td key={colKey} className="text-secondary">
                            {analysisData[row.symbol]
                              ? renderCellValue(analysisData[row.symbol][colKey])
                              : <span className="text-muted">Loading…</span>
                            }
                          </td>
                        ))}
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
