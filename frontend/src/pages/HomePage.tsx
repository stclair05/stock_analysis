import "../App.css";
import Metrics from "../components/Metrics";
import Fundamentals from "../components/Fundamentals";
import StockChart from "../components/StockChart";
import { useCallback, useState } from "react";

function HomePage() {
  const [inputValue, setInputValue] = useState("");
  const [stockSymbol, setStockSymbol] = useState("");
  const [loadingState, setLoadingState] = useState({
    metrics: false,
    fundamentals: false,
    chart: false,
  });
  
  const [error, setError] = useState<string | null>(null);

  const isValidSymbol = (symbol: string) => /^[A-Za-z.^]{1,10}$/.test(symbol);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value.toUpperCase());
    setError(null);
  };

  const handleSearch = () => {
    if (!inputValue.trim()) return;

    if (!isValidSymbol(inputValue)) {
      setError("Invalid symbol. Please enter a valid stock symbol (e.g., AAPL or ^DJI).");
      return;
    }

    setError(null);
    setStockSymbol(inputValue);
    setLoadingState({ metrics: true, fundamentals: true, chart: true });
  };

  const setMetricsLoading = useCallback(
    (v: boolean) => setLoadingState((prev) => ({ ...prev, metrics: v })),
    []
  );
  
  const setChartLoading = useCallback(
    (v: boolean) => setLoadingState((prev) => ({ ...prev, chart: v })),
    []
  );
  
  const setFundamentalsLoading = useCallback(
    (v: boolean) => setLoadingState((prev) => ({ ...prev, fundamentals: v })),
    []
  );
  

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="app-container">
      <h1 className="mb-5 text-center fw-bold">📈 Analysis</h1>

      {/* Search Bar */}
      <div className="search-bar-container d-flex justify-content-center mb-5">
        <div className="input-group shadow-sm" style={{ maxWidth: "600px", width: "100%" }}>
          <input
            type="text"
            className="form-control search-input"
            placeholder="Enter Stock Symbol (e.g., AAPL)"
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
          />
          <button className="btn btn-primary search-button" onClick={handleSearch}>
            {Object.values(loadingState).some(Boolean) ? (
              <div className="spinner-border spinner-border-sm text-light" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            ) : (
              "Search"
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-center text-danger mt-2" style={{ fontWeight: 500 }}>
          {error}
        </div>
      )}

      {/* Metrics + Chart Section */}
      {stockSymbol ? (
        <>
          <div className="cards-wrapper-row">
            <div className="metric-card">
              <Metrics key={stockSymbol} stockSymbol={stockSymbol} setParentLoading={setMetricsLoading} />
            </div>

            <div className="chart-card">
              <StockChart key={stockSymbol} stockSymbol={stockSymbol} setParentLoading={setChartLoading} />
            </div>

            {/* 👉 New Fundamental Metrics Table */}
            <div className="fundamental-card">
              <Fundamentals key={stockSymbol} stockSymbol={stockSymbol} setParentLoading={setFundamentalsLoading} />
            </div>
          </div>   
        </>
      ) : (
        <div className="text-center mt-5">
          <h4 className="text-muted">🔎 Search for a stock to view metrics and chart</h4>
        </div>
      )}


    </div>
  );
}

export default HomePage;
