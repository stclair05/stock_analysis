import "./App.css";
import Metrics from "./Metrics";
import StockChart from "./StockChart";
import { useState } from "react";

function App() {
  const [inputValue, setInputValue] = useState("");
  const [stockSymbol, setStockSymbol] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value.toUpperCase());
  };

  const handleSearch = () => {
    if (inputValue.trim()) {
      setLoading(true);
      setTimeout(() => {
        setStockSymbol(inputValue);
        setLoading(false);
      }, 1000); // Simulated 1 second loading
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="app-container">
      <h1 className="mb-5 text-center fw-bold">📈 Stock Analysis App</h1>

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
            {loading ? (
              <div className="spinner-border spinner-border-sm text-light" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            ) : (
              "Search"
            )}
          </button>
        </div>
      </div>

      {/* Metrics + Chart Section */}
      {stockSymbol ? (
        <div className="cards-wrapper-row">
          {/* Metrics Card */}
          <div className="metric-card">
            {loading ? (
              <div className="d-flex justify-content-center align-items-center" style={{ height: "400px" }}>
                <div className="spinner-border text-primary" style={{ width: "3rem", height: "3rem" }} role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : (
              <Metrics stockSymbol={stockSymbol} />
            )}
          </div>

          {/* Chart Card */}
          <div className="chart-card">
            {loading ? (
              <div className="d-flex justify-content-center align-items-center" style={{ height: "400px" }}>
                <div className="spinner-border text-primary" style={{ width: "3rem", height: "3rem" }} role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : (
              <StockChart stockSymbol={stockSymbol} />
            )}
          </div>
        </div>
      ) : (
        // Show this only when no stockSymbol is selected
        <div className="text-center mt-5">
          <h4 className="text-muted">🔎 Search for a stock to view metrics and chart</h4>
        </div>
      )}
    </div>
  );
}

export default App;
