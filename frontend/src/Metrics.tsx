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

    const fetchMetrics = async (retry = 0) => {
      try {
        const response = await fetch("http://localhost:8000/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: stockSymbol }),
        });
    
        if (!response.ok) {
          console.error("Server error:", response.status);
          return;
        }
    
        const data = await response.json();
    
        const keyFields: (keyof MetricsType)[] = ["three_year_ma", "mace", "forty_week_status"];
        const keyFieldsIncomplete = keyFields.some((field) => {
          const metric = data[field];
          return Object.values(metric).some((v) => v === "in progress");
        });
    
        // ✅ Set metrics if data is complete
        if (!keyFieldsIncomplete) {
          setMetrics(data);
          console.log("✅ Fetched complete metrics for", stockSymbol, data);
        }
    
        // 🔁 Retry if not yet complete
        if (keyFieldsIncomplete && retry < 3) {
          console.log(`🔁 Metrics incomplete, retrying (${retry + 1})...`, data);
          setTimeout(() => fetchMetrics(retry + 1), 1000);
        }
    
        // Optional: if final retry still bad, show what we have
        if (retry === 3 && keyFieldsIncomplete) {
          console.warn("⚠️ Max retries reached. Displaying partial data.");
          setMetrics(data);
        }
    
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
    const getColorClass = (val: number | string | null) => {
      if (typeof val === "string") {
        const lowerVal = val.toLowerCase();
        if (lowerVal.includes("below") || lowerVal.includes("above") || lowerVal.includes("inside") ||
         lowerVal.includes("buy") || lowerVal.includes("sell") || 
         lowerVal.includes("weak") || lowerVal.includes("moderate") || lowerVal.includes("strong")
         || lowerVal.includes("u1") || lowerVal.includes("u2") || lowerVal.includes("u3")
         || lowerVal.includes("d1") || lowerVal.includes("d2") || lowerVal.includes("d3")
         || lowerVal.includes("above rising ma") || lowerVal.includes("above falling ma")
         || lowerVal.includes("below rising ma") || lowerVal.includes("below falling ma")) {
          return colorizeString(val);
        }
      }
      return colorize(val);
    };
  
    return <td className={getColorClass(value)}>{value ?? "N/A"}</td>;
  };
  

  const colorizeString = (value: number | string | null) => {
    if (typeof value !== "string") return "text-secondary"; // Grey if invalid
  
    const lowerValue = value.toLowerCase();
    if (lowerValue.includes("below")) return "text-danger";   // red
    if (lowerValue.includes("above")) return "text-success";  // green

    if (lowerValue.includes("inside")) return "text-warning"; // orange
    if (lowerValue.includes("buy")) return "text-success";   // green for buy
    if (lowerValue.includes("sell")) return "text-danger";   // red for sell

    if (lowerValue.includes("weak")) return "text-warning"; // ADX < 20
    if (lowerValue.includes("moderate")) return "text-success";   // ADX 20-40
    if (lowerValue.includes("strong")) return "text-danger";   // ADX > 40

    if (lowerValue.includes("u1")) return "text-up-1"; // U1: possible uptrend
    if (lowerValue.includes("u2")) return "text-success";   // U2: confirmed uptrend
    if (lowerValue.includes("u3")) return "text-success fw-bold";   // U3: well defined uptrend
    if (lowerValue.includes("d1")) return "text-warning"; // D1: possible downtrend
    if (lowerValue.includes("d2")) return "text-danger";   // D2: confirmed downtrend
    if (lowerValue.includes("d3")) return "text-danger fw-bold";   // D3: well defined downtrend

    if (lowerValue.includes("above rising ma")) return "text-success fw-bold";   // price: +, ma:+
    if (lowerValue.includes("above falling ma")) return "text-success"; // price: +, ma: -
    if (lowerValue.includes("below rising ma")) return "text-warning";   // price: -, ma: +
    if (lowerValue.includes("below falling ma")) return "text-danger";   // price: -, ma: -
  
    return "text-secondary"; // fallback
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
      "forty_week_status"
    ];
  
    return mustHaveMetrics.every(key => {
      const metric = data[key] as TimeSeriesMetric;
      return metric.current !== null &&
             metric.seven_days_ago !== null &&
             metric.fourteen_days_ago !== null &&
             metric.twentyone_days_ago !== null;
    });
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
              {renderColoredCell(metrics.weekly_ichimoku.current ?? "N/A")}
              {renderColoredCell(metrics.weekly_ichimoku.seven_days_ago ?? "N/A")}
              {renderColoredCell(metrics.weekly_ichimoku.fourteen_days_ago ?? "N/A")}
              {renderColoredCell(metrics.weekly_ichimoku.twentyone_days_ago ?? "N/A")}
            </tr>
            <tr>
              <td>📉 Super Trend (Weekly)</td>
              {renderColoredCell(metrics.super_trend.current ?? "N/A")}
              {renderColoredCell(metrics.super_trend.seven_days_ago ?? "N/A")}
              {renderColoredCell(metrics.super_trend.fourteen_days_ago ?? "N/A")}
              {renderColoredCell(metrics.super_trend.twentyone_days_ago ?? "N/A")}
            </tr>
            <tr>
              <td>📍 ADX (Weekly)</td>
              {renderColoredCell(metrics.adx.current ?? "N/A")}
              {renderColoredCell(metrics.adx.seven_days_ago ?? "N/A")}
              {renderColoredCell(metrics.adx.fourteen_days_ago ?? "N/A")}
              {renderColoredCell(metrics.adx.twentyone_days_ago ?? "N/A")}
            </tr>
            <tr>
              <td>⚖️ MACE</td>
              {renderColoredCell(metrics.mace.current ?? "N/A")}
              {renderColoredCell(metrics.mace.seven_days_ago ?? "N/A")}
              {renderColoredCell(metrics.mace.fourteen_days_ago ?? "N/A")}
              {renderColoredCell(metrics.mace.twentyone_days_ago ?? "N/A")}
            </tr>
            <tr>
              <td>🗓️ 40-Week Status</td>
              {renderColoredCell(metrics.forty_week_status.current ?? "N/A")}
              {renderColoredCell(metrics.forty_week_status.seven_days_ago ?? "N/A")}
              {renderColoredCell(metrics.forty_week_status.fourteen_days_ago ?? "N/A")}
              {renderColoredCell(metrics.forty_week_status.twentyone_days_ago ?? "N/A")}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Metrics;
