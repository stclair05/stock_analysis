import "./Metrics.css";
import { useEffect, useState } from "react";

type TimeSeriesMetric = {
  current: number | string | null;
  seven_days_ago: number | string | null;
  fourteen_days_ago: number | string | null;
  twentyone_days_ago: number | string | null;
};

type MetricsType = {
  current_price: number | null;
  three_year_ma: TimeSeriesMetric;
  two_hundred_dma: TimeSeriesMetric;
  weekly_ichimoku: TimeSeriesMetric;
  super_trend: TimeSeriesMetric;
  adx: TimeSeriesMetric;
  mace: TimeSeriesMetric;
  forty_week_status: TimeSeriesMetric;
  fifty_and_150_dma: TimeSeriesMetric;
};

type MetricsProps = {
  stockSymbol: string;
  setParentLoading?: (value: boolean) => void;
};

function Metrics({ stockSymbol, setParentLoading }: MetricsProps) {
  const [metrics, setMetrics] = useState<MetricsType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stockSymbol || stockSymbol.trim() === "") return;

    const fetchMetrics = async (retry = 0) => {
      try {
        setError(null);
        if (setParentLoading) setParentLoading(true);

        const response = await fetch("http://localhost:8000/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: stockSymbol }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.detail || "Unexpected error.");
          if (setParentLoading) setParentLoading(false);
          return;
        }

        const data = await response.json();

        const keyFields: (keyof MetricsType)[] = ["three_year_ma", "mace", "forty_week_status"];
        const keyFieldsIncomplete = keyFields.some((field) => {
          const metric = data[field];
          return Object.values(metric).some((v) => v === "in progress");
        });

        if (!keyFieldsIncomplete || retry >= 3) {
          setMetrics(data);
          if (setParentLoading) setParentLoading(false);
        } else {
          setTimeout(() => fetchMetrics(retry + 1), 1000);
        }
      } catch (err) {
        console.error("Error fetching metrics:", err);
        setError("Failed to connect to backend.");
        if (setParentLoading) setParentLoading(false);
      }
    };

    fetchMetrics();
  }, [stockSymbol, setParentLoading]);

  const colorize = (value: number | string | null) => {
    if (metrics?.current_price == null || typeof value !== "number") {
      return "text-secondary";
    }
    return value < metrics.current_price ? "text-success" : "text-danger";
  };

  const colorizeString = (value: number | string | null) => {
    if (typeof value !== "string") return "text-secondary";
    const lower = value.toLowerCase();

    if (lower.includes("below")) return "text-danger";
    if (lower.includes("above")) return "text-success";
    if (lower.includes("inside")) return "text-warning";
    if (lower.includes("buy")) return "text-success";
    if (lower.includes("sell")) return "text-danger";
    if (lower.includes("strong bullish")) return "text-success fw-bold";
    if (lower.includes("bullish")) return "text-success";
    if (lower.includes("strong bearish")) return "text-danger fw-bold";
    if (lower.includes("bearish")) return "text-danger";
    if (lower.includes("weak")) return "text-warning";
    if (lower.includes("u1")) return "text-up-1";
    if (lower.includes("u2")) return "text-success";
    if (lower.includes("u3")) return "text-success fw-bold";
    if (lower.includes("d1")) return "text-warning";
    if (lower.includes("d2")) return "text-danger";
    if (lower.includes("d3")) return "text-danger fw-bold";
    if (lower.includes("above rising ma")) return "text-success fw-bold";
    if (lower.includes("above falling ma")) return "text-success";
    if (lower.includes("below rising ma")) return "text-warning";
    if (lower.includes("below falling ma")) return "text-danger";

    return "text-secondary";
  };

  const renderColoredCell = (value: number | string | null) => {
    const className =
      typeof value === "string" ? colorizeString(value) : colorize(value);
    return <td className={className}>{value ?? "N/A"}</td>;
  };

  const isMetricsComplete = (data: MetricsType | null): boolean => {
    if (!data || data.current_price == null) return false;

    const mustHaveMetrics: (keyof MetricsType)[] = [
      "three_year_ma",
      "two_hundred_dma",
      "weekly_ichimoku",
      "super_trend",
      "adx",
      "mace",
      "forty_week_status",
    ];

    return mustHaveMetrics.every((key) => {
      const metric = data[key] as TimeSeriesMetric;
      return (
        metric.current !== null &&
        metric.seven_days_ago !== null &&
        metric.fourteen_days_ago !== null &&
        metric.twentyone_days_ago !== null
      );
    });
  };

  return (
    <>
      {error && <div className="alert alert-danger text-center">{error}</div>}

      <div className="table-responsive">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="mb-0">
            Metrics for <strong>{stockSymbol}</strong>
          </h2>
          {metrics?.current_price && (
            <h4 className="text-primary mb-0">
              Current Price: ${metrics.current_price.toFixed(2)}
            </h4>
          )}
        </div>

        {!isMetricsComplete(metrics) ? (
          <p>Loading metrics...</p>
        ) : (
          <table className="table table-striped table-hover metrics-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Current</th>
                <th>7 Days Ago</th>
                <th>14 Days Ago</th>
                <th>21 Days Ago</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>📊 3-Year Moving Average</td>
                {renderColoredCell(metrics.three_year_ma.current)}
                {renderColoredCell(metrics.three_year_ma.seven_days_ago)}
                {renderColoredCell(metrics.three_year_ma.fourteen_days_ago)}
                {renderColoredCell(metrics.three_year_ma.twentyone_days_ago)}
              </tr>
              <tr>
                <td>📈 200-Day Moving Average</td>
                {renderColoredCell(metrics.two_hundred_dma.current)}
                {renderColoredCell(metrics.two_hundred_dma.seven_days_ago)}
                {renderColoredCell(metrics.two_hundred_dma.fourteen_days_ago)}
                {renderColoredCell(metrics.two_hundred_dma.twentyone_days_ago)}
              </tr>
              <tr>
                <td>☁️ Weekly Ichimoku Cloud</td>
                {renderColoredCell(metrics.weekly_ichimoku.current)}
                {renderColoredCell(metrics.weekly_ichimoku.seven_days_ago)}
                {renderColoredCell(metrics.weekly_ichimoku.fourteen_days_ago)}
                {renderColoredCell(metrics.weekly_ichimoku.twentyone_days_ago)}
              </tr>
              <tr>
                <td>📉 Super Trend (Weekly)</td>
                {renderColoredCell(metrics.super_trend.current)}
                {renderColoredCell(metrics.super_trend.seven_days_ago)}
                {renderColoredCell(metrics.super_trend.fourteen_days_ago)}
                {renderColoredCell(metrics.super_trend.twentyone_days_ago)}
              </tr>
              <tr>
                <td>📍 ADX (Weekly)</td>
                {renderColoredCell(metrics.adx.current)}
                {renderColoredCell(metrics.adx.seven_days_ago)}
                {renderColoredCell(metrics.adx.fourteen_days_ago)}
                {renderColoredCell(metrics.adx.twentyone_days_ago)}
              </tr>
              <tr>
                <td>⚖️ MACE</td>
                {renderColoredCell(metrics.mace.current)}
                {renderColoredCell(metrics.mace.seven_days_ago)}
                {renderColoredCell(metrics.mace.fourteen_days_ago)}
                {renderColoredCell(metrics.mace.twentyone_days_ago)}
              </tr>
              <tr>
                <td>🗓️ 40-Week Status</td>
                {renderColoredCell(metrics.forty_week_status.current)}
                {renderColoredCell(metrics.forty_week_status.seven_days_ago)}
                {renderColoredCell(metrics.forty_week_status.fourteen_days_ago)}
                {renderColoredCell(metrics.forty_week_status.twentyone_days_ago)}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default Metrics;
