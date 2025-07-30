import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Quadrant, { TableData } from "../components/Quadrant";
import QuadrantSkeleton from "../components/QuadrantSkeleton";
import StageQuadrant, { StageTableData } from "../components/StageQuadrant";

export default function QuadrantPage() {
  const { listType: listParam } = useParams<{ listType?: string }>();

  const [listType, setListType] = useState<"portfolio" | "watchlist">(
    listParam === "watchlist" ? "watchlist" : "portfolio"
  );
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [stageData, setStageData] = useState<StageTableData | null>(null);
  const [stageLoading, setStageLoading] = useState(false);

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

  useEffect(() => {
    setStageLoading(true);
    fetch(`http://localhost:8000/stage_table?list_type=${listType}`)
      .then((res) => res.json())
      .then((d) => {
        setStageData(d);
        setStageLoading(false);
      })
      .catch(() => setStageLoading(false));
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
      <div className="mt-5">
        <h2 className="fw-bold mb-3">Stage Quadrant</h2>
        {stageLoading && <QuadrantSkeleton />}
        {stageData && !stageLoading && <StageQuadrant data={stageData} />}
      </div>
    </div>
  );
}
