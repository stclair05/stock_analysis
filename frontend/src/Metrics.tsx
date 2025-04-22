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
};

type MetricsProps = {
  stockSymbol: string;
};

function Metrics({ stockSymbol }: MetricsProps) {
  const [metrics, setMetrics] = useState<MetricsType | null>(null);

  useEffect(() => {
    if (!stockSymbol) return;

    const fetchMetrics = async () => {
      try {
        const response = await fetch("http://localhost:8000/analyse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ symbol: stockSymbol }),
        });

        if (!response.ok) {
          console.error("Server error:", response.status);
          return;
        }

        const data = await response.json();
        setMetrics(data);
      } catch (error) {
        console.error("Error fetching metrics:", error);
      }
    };

    fetchMetrics();
  }, [stockSymbol]);

  const colorize = (value: number | string | null) => {
    if (metrics?.current_price == null || typeof value !== "number") {
      return "text-secondary"; // Grey if cannot compare
    }
    return value < metrics.current_price ? "text-success" : "text-danger";
  };

  const renderColoredCell = (value: number | string | null) => {
    return <td className={colorize(value)}>{value ?? "N/A"}</td>;
  };

  return (
    <div className="table-responsive">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0">
          Metrics for <strong>{stockSymbol || "..."}</strong>
        </h2>
        {metrics?.current_price && (
          <h4 className="text-primary mb-0">Current Price: ${metrics.current_price.toFixed(2)}</h4>
        )}
      </div>

      {!metrics ? (
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
              <td>{metrics.weekly_ichimoku.current ?? "N/A"}</td>
              <td>{metrics.weekly_ichimoku.seven_days_ago ?? "N/A"}</td>
              <td>{metrics.weekly_ichimoku.fourteen_days_ago ?? "N/A"}</td>
              <td>{metrics.weekly_ichimoku.twentyone_days_ago ?? "N/A"}</td>
            </tr>
            <tr>
              <td>📉 Super Trend (Weekly)</td>
              <td>{metrics.super_trend.current ?? "N/A"}</td>
              <td>{metrics.super_trend.seven_days_ago ?? "N/A"}</td>
              <td>{metrics.super_trend.fourteen_days_ago ?? "N/A"}</td>
              <td>{metrics.super_trend.twentyone_days_ago ?? "N/A"}</td>
            </tr>
            <tr>
              <td>📍 ADX (Weekly)</td>
              <td>{metrics.adx.current ?? "N/A"}</td>
              <td>{metrics.adx.seven_days_ago ?? "N/A"}</td>
              <td>{metrics.adx.fourteen_days_ago ?? "N/A"}</td>
              <td>{metrics.adx.twentyone_days_ago ?? "N/A"}</td>
            </tr>
            <tr>
              <td>⚖️ MACE</td>
              <td>{metrics.mace.current ?? "N/A"}</td>
              <td>{metrics.mace.seven_days_ago ?? "N/A"}</td>
              <td>{metrics.mace.fourteen_days_ago ?? "N/A"}</td>
              <td>{metrics.mace.twentyone_days_ago ?? "N/A"}</td>
            </tr>
            <tr>
              <td>🗓️ 40-Week Status</td>
              <td>{metrics.forty_week_status.current ?? "N/A"}</td>
              <td>{metrics.forty_week_status.seven_days_ago ?? "N/A"}</td>
              <td>{metrics.forty_week_status.fourteen_days_ago ?? "N/A"}</td>
              <td>{metrics.forty_week_status.twentyone_days_ago ?? "N/A"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Metrics;
