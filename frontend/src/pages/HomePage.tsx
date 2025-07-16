import "../App.css";
import Metrics from "../components/Metrics";
import Fundamentals from "../components/Fundamentals";
import StockChart from "../components/StockChart";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ETFHoldings from "../components/ETFHoldings";
import SignalSummary from "../components/SignalSummary";
import etfList from "../utils/etfs.json";

function HomePage() {
  const navigate = useNavigate();
  const { symbol } = useParams<{ symbol?: string }>();

  const [inputValue, setInputValue] = useState(symbol?.toUpperCase() ?? "");
  const [stockSymbol, setStockSymbol] = useState(symbol?.toUpperCase() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isETF, setIsETF] = useState<boolean | null>(null);

  // Sync state with URL param
  useEffect(() => {
    if (symbol) {
      const upper = symbol.toUpperCase();
      setInputValue(upper);
      setStockSymbol(upper);
    }
  }, [symbol]);

  const isValidSymbol = (symbol: string) => true;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value.toUpperCase());
    setError(null);
  };

  const handleSearch = () => {
    if (!inputValue.trim()) return;

    if (!isValidSymbol(inputValue)) {
      setError(
        "Invalid symbol. Please enter a valid stock symbol (e.g., AAPL or ^DJI)."
      );
      return;
    }

    setError(null);
    navigate(`/analyse/${inputValue}`);
    setStockSymbol(inputValue);
    setLoading(true); // Metrics will handle turning this off
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  useEffect(() => {
    if (!stockSymbol) return;
    setIsETF(etfList.etfs.includes(stockSymbol.toUpperCase()));
  }, [stockSymbol]);

  return (
    <div className="app-container">
      <h1 className="mb-5 text-center fw-bold">Analysis</h1>

      {/* Search Bar */}
      <div className="search-bar-container d-flex justify-content-center mb-5">
        <div
          className="input-group shadow-sm"
          style={{ maxWidth: "600px", width: "100%" }}
        >
          <input
            type="text"
            className="form-control search-input"
            placeholder="Enter Stock Symbol (e.g., AAPL)"
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
          />
          <button
            className="btn btn-primary search-button"
            onClick={handleSearch}
          >
            {loading ? (
              <div
                className="spinner-border spinner-border-sm text-light"
                role="status"
              >
                <span className="visually-hidden">Loading...</span>
              </div>
            ) : (
              "Search"
            )}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="text-center text-danger mt-2"
          style={{ fontWeight: 500 }}
        >
          {error}
        </div>
      )}

      {/* Metrics + Chart Section */}
      {stockSymbol ? (
        <>
          <div className="cards-wrapper-row">
            <div className="metric-card">
              <Metrics
                stockSymbol={stockSymbol}
                setParentLoading={setLoading}
              />
            </div>

            <div className="chart-card">
              <StockChart stockSymbol={stockSymbol} />
            </div>

            <div className="fundamental-card">
              {isETF ? (
                <ETFHoldings stockSymbol={stockSymbol} />
              ) : (
                <Fundamentals stockSymbol={stockSymbol} />
              )}
              <SignalSummary stockSymbol={stockSymbol} />
            </div>
          </div>
        </>
      ) : (
        <div className="text-center mt-5">
          <h4 className="text-muted">
            🔎 Search for a stock to view metrics and chart
          </h4>
        </div>
      )}
    </div>
  );
}

export default HomePage;
