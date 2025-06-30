import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Quadrant, { TableData } from "../components/Quadrant";
import QuadrantSkeleton from "../components/QuadrantSkeleton";

export default function QuadrantPage() {
  const navigate = useNavigate();
  const { listType: listParam } = useParams<{ listType?: string }>();

  const [listType, setListType] = useState<"portfolio" | "watchlist">(
    listParam === "watchlist" ? "watchlist" : "portfolio"
  );
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);

  // Update state when URL param changes
  useEffect(() => {
    if (listParam === "watchlist" || listParam === "portfolio") {
      setListType(listParam);
    }
  }, [listParam]);

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
          onClick={() => navigate("/quadrant/portfolio")}
        >
          Portfolio
        </button>
        <button
          className={`btn btn-sm ${
            listType === "watchlist" ? "btn-primary" : "btn-outline-primary"
          }`}
          onClick={() => navigate("/quadrant/watchlist")}
        >
          Watchlist
        </button>
      </div>
      {loading && <QuadrantSkeleton />}
      {data && !loading && <Quadrant data={data} />}
    </div>
  );
}
