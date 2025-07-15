import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Quadrant, { TableData } from "../components/Quadrant";
import QuadrantSkeleton from "../components/QuadrantSkeleton";

export default function QuadrantPage() {
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
    fetch(`${import.meta.env.VITE_API_URL}/quadrant_data?list_type=${listType}`)
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
        <Link
          to="/quadrant/portfolio"
          className={`btn btn-sm me-2 ${
            listType === "portfolio" ? "btn-primary" : "btn-outline-primary"
          }`}
        >
          Portfolio
        </Link>
        <Link
          to="/quadrant/watchlist"
          className={`btn btn-sm ${
            listType === "watchlist" ? "btn-primary" : "btn-outline-primary"
          }`}
        >
          Watchlist
        </Link>
      </div>
      {loading && <QuadrantSkeleton />}
      {data && !loading && <Quadrant data={data} />}
    </div>
  );
}
