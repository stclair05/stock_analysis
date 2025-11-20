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

  const momentumBadgeStyle = (score: number) => {
    if (score >= 2) {
      return { background: "#d1fae5", color: "#065f46" }; // strong positive
    }
    if (score >= 1) {
      return { background: "#e0f2fe", color: "#075985" }; // positive
    }
    if (score <= -2) {
      return { background: "#fee2e2", color: "#991b1b" }; // very weak
    }
    if (score <= -1) {
      return { background: "#fff4e6", color: "#9a3412" }; // weak
    }
    return { background: "#f1f3f5", color: "#495057" }; // neutral
  };

  const momentumLegend = [
    {
      key: "very-strong",
      text: "z > +2.0 → very strong outlier to the upside.",
      style: { background: "#d1fae5", color: "#065f46" },
    },
    {
      key: "strong",
      text: "z > +1.0 → top performer vs peers (≈ 1σ above).",
      style: { background: "#e0f2fe", color: "#075985" },
    },
    {
      key: "weak",
      text: "z < -1.0 → clear underperformer.",
      style: { background: "#fff4e6", color: "#9a3412" },
    },
    {
      key: "very-weak",
      text: "z < -2.0 → very weak relative momentum.",
      style: { background: "#fee2e2", color: "#991b1b" },
    },
  ];

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

  const momentumStyle =
    typeof momentumScore === "number"
      ? momentumBadgeStyle(momentumScore)
      : null;

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
                <div className="fw-semibold d-flex align-items-center gap-2">
                  <span>Sector momentum score:</span>
                  {typeof momentumScore === "number" ? (
                    <span
                      className="badge rounded-pill"
                      style={{
                        backgroundColor: momentumStyle?.background,
                        color: momentumStyle?.color,
                        fontSize: "0.95rem",
                        padding: "0.55rem 0.8rem",
                        minWidth: "4.5rem",
                        textAlign: "center",
                        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
                      }}
                    >
                      {momentumScore.toFixed(2)}
                    </span>
                  ) : (
                    "N/A"
                  )}
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
                <div className="mt-3 small fst-italic">
                  {momentumLegend.map((item) => (
                    <div
                      key={item.key}
                      className="d-inline-flex align-items-center rounded px-2 py-1 me-2 mb-2"
                      style={{
                        backgroundColor: item.style.background,
                        color: item.style.color,
                        fontWeight: 600,
                      }}
                    >
                      {item.text}
                    </div>
                  ))}
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
