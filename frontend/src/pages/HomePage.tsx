import "../App.css";
import Metrics from "../components/Metrics";
import Fundamentals from "../components/Fundamentals";
import StockChart from "../components/StockChart";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ETFHoldings from "../components/ETFHoldings";
import SignalSummary from "../components/SignalSummary";
import ScoreSummary from "../components/ScoreSummary";
import etfList from "../utils/etfs.json";

function HomePage() {
  const navigate = useNavigate();
  const { symbol } = useParams<{ symbol?: string }>();

  const [inputValue, setInputValue] = useState(symbol?.toUpperCase() ?? "");
  const [stockSymbol, setStockSymbol] = useState(symbol?.toUpperCase() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [momentumScore, setMomentumScore] = useState<number | null>(null);
  const [momentumPeers, setMomentumPeers] = useState<string[]>([]);
  const [momentumLoading, setMomentumLoading] = useState(false);

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

  useEffect(() => {
    if (!stockSymbol) return;

    let cancelled = false;
    setMomentumLoading(true);
    setMomentumScore(null);
    setMomentumPeers([]);

    const fetchMomentum = async () => {
      try {
        const res = await fetch("http://localhost:8000/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: stockSymbol }),
        });

        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;

        const score =
          typeof json.sector_momentum_zscore === "number"
            ? json.sector_momentum_zscore
            : null;
        const peers = Array.isArray(json.sector_peers)
          ? json.sector_peers
              .filter((p: unknown) => typeof p === "string" && p.trim())
              .map((p: string) => p.trim())
          : [];

        setMomentumScore(score);
        setMomentumPeers(peers);
      } catch (err) {
        console.error("Failed to fetch sector momentum", err);
      } finally {
        if (!cancelled) setMomentumLoading(false);
      }
    };

    fetchMomentum();
    return () => {
      cancelled = true;
    };
  }, [stockSymbol]);

  return (
    <div className="app-container">
      <h1 className="mb-5 text-center fw-bold">Analysis</h1>

      {/* Search Bar + Sector Momentum */}
      <div className="d-flex flex-column flex-lg-row align-items-stretch gap-3 mb-5">
        <div className="flex-grow-1">
          <div className="search-bar-container d-flex justify-content-center">
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
        </div>

        {stockSymbol && (
          <div
            className="card shadow-sm border-0 flex-grow-1"
            style={{ maxWidth: "450px" }}
          >
            <div className="card-body">
              <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
                <div className="fw-semibold">
                  Sector momentum score:{" "}
                  {typeof momentumScore === "number"
                    ? momentumScore.toFixed(2)
                    : "N/A"}
                </div>
                <div className="small text-muted fst-italic">
                  Peers:{" "}
                  {momentumPeers.length > 0 ? momentumPeers.join(", ") : "N/A"}
                </div>
              </div>

              {momentumLoading ? (
                <div className="d-flex justify-content-center py-2">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 small text-muted fst-italic">
                  <div>z &gt; +1.0 → top performer vs peers (≈ 1σ above).</div>
                  <div>z &gt; +2.0 → very strong outlier to the upside.</div>
                  <div>z &lt; -1.0 → clear underperformer.</div>
                  <div>z &lt; -2.0 → very weak relative momentum.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
          <ScoreSummary stockSymbol={stockSymbol} />
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
