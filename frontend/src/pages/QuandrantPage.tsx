import { useEffect, useState } from "react";
import Quadrant, { TableData } from "../components/Quadrant";
import QuadrantSkeleton from "../components/QuadrantSkeleton";

export default function QuadrantPage() {
  const [listType, setListType] = useState<"portfolio" | "watchlist">(
    "portfolio"
  );
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:8000/quadrant_data?list_type=${listType}`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [listType]);

  return (
    <div className="container mt-4">
      <h1 className="fw-bold mb-4">Quadrant</h1>
      <div className="mb-3">
        <button
          className={`btn btn-sm me-2 ${
            listType === "portfolio" ? "btn-primary" : "btn-outline-primary"
          }`}
          onClick={() => setListType("portfolio")}
        >
          Portfolio
        </button>
        <button
          className={`btn btn-sm ${
            listType === "watchlist" ? "btn-primary" : "btn-outline-primary"
          }`}
          onClick={() => setListType("watchlist")}
        >
          Watchlist
        </button>
      </div>
      {loading && <QuadrantSkeleton />}
      {data && !loading && <Quadrant data={data} />}
    </div>
  );
}
