import { useEffect, useState } from "react";
import SkeletonCard from "./SkeletonCard";
import "./Metrics.css"; // For consistent table styling

type Holding = {
  asset: string;
  name: string;
  weightPercentage: number;
};

type ETFHoldingsData = {
  symbol: string;
  name?: string;
  holdings: Holding[];
};

const ETFHoldings = ({ stockSymbol }: { stockSymbol: string }) => {
  const [data, setData] = useState<ETFHoldingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stockSymbol) return;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`${import.meta.env.VITE_API_URL}/etf_holdings/${stockSymbol}`)
      .then((res) => {
        if (!res.ok) throw new Error("No ETF holdings found.");
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [stockSymbol]);

  if (loading) return <SkeletonCard type="metrics" />;
  if (error)
    return <div className="no-fundamentals">No ETF holdings available</div>;
  if (!data) return null;

  return (
    <div className="table-responsive fade-in" style={{ width: "100%" }}>
      <h2 className="mb-3" style={{ fontWeight: 700 }}>
        Holdings for <strong>{data.symbol}</strong>
        {data.name ? (
          <>
            : <span className="text-muted">{data.name}</span>
          </>
        ) : null}
      </h2>
      <table className="table table-striped metrics-table">
        <thead>
          <tr>
            <th className="text-start">Ticker</th>
            <th className="text-start">Name</th>
            <th className="text-end">Weight (%)</th>
          </tr>
        </thead>
        <tbody>
          {data.holdings.map((h, idx) => (
            <tr key={h.asset + idx}>
              <td className="fw-bold text-primary">{h.asset}</td>
              <td>{h.name}</td>
              <td className="text-end">{h.weightPercentage?.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-muted" style={{ fontSize: "0.95em" }}>
        <span>Showing top {data.holdings.length} holdings by weight.</span>
      </div>
    </div>
  );
};

export default ETFHoldings;
