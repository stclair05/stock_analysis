import "./Metrics.css";
import { useEffect, useState } from "react";
import SkeletonCard from "./SkeletonCard";

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
  fifty_dma_and_150_dma: TimeSeriesMetric;
  twenty_dma: TimeSeriesMetric;
  fifty_dma: TimeSeriesMetric;
  mean_rev_weekly: TimeSeriesMetric;
  rsi_and_ma_daily: TimeSeriesMetric;
  rsi_divergence_daily: TimeSeriesMetric;
  bollinger_band_width_percentile_daily: TimeSeriesMetric;
  rsi_ma_weekly: TimeSeriesMetric;
  rsi_divergence_weekly: TimeSeriesMetric;
  rsi_ma_monthly: TimeSeriesMetric;
  rsi_divergence_monthly: TimeSeriesMetric;
  chaikin_money_flow: TimeSeriesMetric;
};

type MetricsProps = {
  stockSymbol: string;
  setParentLoading?: (value: boolean) => void;
};

function Metrics({ stockSymbol, setParentLoading }: MetricsProps) {
  const [metrics, setMetrics] = useState<MetricsType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!stockSymbol || stockSymbol.trim() === "") return;

    setMetrics(null);
    setLoading(true);

    const fetchMetrics = async (retry = 0) => {
      try {
        if (retry === 0) {
          setError(null);
          setLoading(true);
        }
        if (setParentLoading) setParentLoading(true);

        const response = await fetch("http://localhost:8000/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: stockSymbol }),
        });

        if (!response.ok) {
          if (retry >= 3) {
            const errorData = await response.json();
            setError(errorData.detail || "Unexpected error.");
            if (setParentLoading) setParentLoading(false);
          } else {
            setTimeout(() => fetchMetrics(retry + 1), 1000);
          }
          return;
        }

        const data = await response.json();

        const keyFields: (keyof MetricsType)[] = [
          "three_year_ma",
          "mace",
          "forty_week_status",
        ];
        const keyFieldsIncomplete = keyFields.some((field) => {
          const metric = data[field];
          return Object.values(metric).some((v) => v === "in progress");
        });

        if (!keyFieldsIncomplete || retry >= 3) {
          setMetrics(data);
          setLoading(false);
          if (setParentLoading) setParentLoading(false);
        } else {
          setTimeout(() => fetchMetrics(retry + 1), 1000);
        }
      } catch (err) {
        if (retry >= 3) {
          console.error("Error fetching metrics:", err);
          setError("Failed to connect to backend.");
          setLoading(false);
          if (setParentLoading) setParentLoading(false);
        } else {
          setTimeout(() => fetchMetrics(retry + 1), 1000);
        }
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

    // Positional / Relative Terms
    if (lower.includes("below")) return "text-down-strong";
    if (lower.includes("above")) return "text-up-strong";
    if (lower.includes("inside")) return "text-neutral";
    if (lower.includes("between")) return "text-neutral";

    // Sentiment Signals
    if (lower.includes("buy")) return "text-up-strong";
    if (lower.includes("sell")) return "text-down-strong";

    // Market Strength / Trend Labels
    if (lower.includes("strong bullish")) return "text-up-strong";
    if (lower.includes("bullish")) return "text-up-weak";
    if (lower.includes("strong bearish")) return "text-down-strong";
    if (lower.includes("bearish")) return "text-down-weak";
    if (lower.includes("weak")) return "text-neutral";

    // Custom U/D Levels
    if (lower.includes("u1")) return "text-up-weak";
    if (lower.includes("u2")) return "text-up-strong";
    if (lower.includes("u3")) return "text-up-strong fw-bold";
    if (lower.includes("d1")) return "text-down-weak";
    if (lower.includes("d2")) return "text-down-strong";
    if (lower.includes("d3")) return "text-down-strong fw-bold";

    // MA Position Logic
    if (lower.includes("above rising ma")) return "text-up-strong fw-bold";
    if (lower.includes("above falling ma")) return "text-up-strong";
    if (lower.includes("below rising ma")) return "text-neutral";
    if (lower.includes("below falling ma")) return "text-down-strong";

    // Mean Reversion / Conditions
    if (lower.includes("oversold")) return "text-up-strong";
    if (lower.includes("overbought")) return "text-down-strong";
    if (lower.includes("extended")) return "text-neutral";
    if (lower.includes("normal")) return "text-secondary";

    // 50DMA & 150DMA Composite Signal
    if (lower.includes("strong uptrend")) return "text-up-strong fw-bold";
    if (lower.includes("above both mas, but 50dma < 150dma"))
      return "text-up-weak";
    if (lower.includes("strong downtrend")) return "text-down-strong fw-bold";
    if (lower.includes("below both mas, but 50dma > 150dma"))
      return "text-down-weak";
    if (lower.includes("between/inside moving averages")) return "text-neutral";

    // ADX Classification
    if (lower === "green") return "text-up-strong"; // Strong bullish
    if (lower === "light green") return "text-up-weak"; // Weak bullish
    if (lower === "red") return "text-down-strong"; // Strong bearish
    if (lower === "light red") return "text-down-weak"; // Weak bearish
    if (lower === "orange") return "text-neutral"; // Sideways / low ADX
    if (lower === "in progress") return "text-secondary"; // Not enough data

    // 40-Week MA Status
    if (lower.includes("above rising ma") || lower.includes("++"))
      return "text-up-strong fw-bold"; // Best performance
    if (lower.includes("above falling ma") || lower.includes("+-"))
      return "text-up-weak"; // Still positive
    if (lower.includes("below rising ma") || lower.includes("-+"))
      return "text-neutral"; // Neutral/choppy
    if (lower.includes("below falling ma") || lower.includes("--"))
      return "text-down-strong fw-bold"; // Worst performance  // Worst performance

    // RSI Divergence
    if (lower.includes("bullish divergence")) return "text-up-strong fw-bold";
    if (lower.includes("bearish divergence")) return "text-down-strong fw-bold";

    // Bollinger Band Width Percentile
    if (lower.includes("blue band")) return "text-neutral"; // Tight = breakout possible
    if (lower.includes("red band")) return "text-down-strong"; // Volatile
    if (lower.includes("normal")) return "text-secondary";

    // Chaikin Money Flow
    if (lower.includes("money inflow (increasing)"))
      return "text-up-strong fw-bold";
    if (lower.includes("money inflow (weakening)")) return "text-up-weak";
    if (lower.includes("money outflow (increasing)"))
      return "text-down-strong fw-bold";
    if (lower.includes("money outflow (weakening)")) return "text-down-weak";

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
          <h2 className="mb-0 fw-semibold text-dark">
            Metrics for <strong>{stockSymbol}</strong>
          </h2>

          {loading || !metrics?.current_price ? (
            <div className="d-flex align-items-center gap-2">
              <div
                className="spinner-border spinner-border-sm text-primary"
                role="status"
              />
              <span className="text-muted">Fetching price...</span>
            </div>
          ) : (
            <h4 className="mb-0" style={{ color: "var(--primary-color)" }}>
              Current Price: ${metrics.current_price.toFixed(2)}
            </h4>
          )}
        </div>

        {!isMetricsComplete(metrics) ? (
          <SkeletonCard type="metrics" />
        ) : (
          <div className={"fade-in"}>
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
                  {renderColoredCell(
                    metrics.two_hundred_dma.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>☁️ Weekly Ichimoku Cloud</td>
                  {renderColoredCell(metrics.weekly_ichimoku.current)}
                  {renderColoredCell(metrics.weekly_ichimoku.seven_days_ago)}
                  {renderColoredCell(metrics.weekly_ichimoku.fourteen_days_ago)}
                  {renderColoredCell(
                    metrics.weekly_ichimoku.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📉 Super Trend (Weekly)</td>
                  {renderColoredCell(metrics.super_trend.current)}
                  {renderColoredCell(metrics.super_trend.seven_days_ago)}
                  {renderColoredCell(metrics.super_trend.fourteen_days_ago)}
                  {renderColoredCell(metrics.super_trend.twentyone_days_ago)}
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
                  {renderColoredCell(
                    metrics.forty_week_status.fourteen_days_ago
                  )}
                  {renderColoredCell(
                    metrics.forty_week_status.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📏 50DMA & 150DMA</td>
                  {renderColoredCell(metrics.fifty_dma_and_150_dma.current)}
                  {renderColoredCell(
                    metrics.fifty_dma_and_150_dma.seven_days_ago
                  )}
                  {renderColoredCell(
                    metrics.fifty_dma_and_150_dma.fourteen_days_ago
                  )}
                  {renderColoredCell(
                    metrics.fifty_dma_and_150_dma.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📉 20DMA</td>
                  {renderColoredCell(metrics.twenty_dma.current)}
                  {renderColoredCell(metrics.twenty_dma.seven_days_ago)}
                  {renderColoredCell(metrics.twenty_dma.fourteen_days_ago)}
                  {renderColoredCell(metrics.twenty_dma.twentyone_days_ago)}
                </tr>

                <tr>
                  <td>↔️ Mean Reversion (Weekly)</td>
                  {renderColoredCell(metrics.mean_rev_weekly.current)}
                  {renderColoredCell(metrics.mean_rev_weekly.seven_days_ago)}
                  {renderColoredCell(metrics.mean_rev_weekly.fourteen_days_ago)}
                  {renderColoredCell(
                    metrics.mean_rev_weekly.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📊 RSI & MA (Daily)</td>
                  {renderColoredCell(metrics.rsi_and_ma_daily.current)}
                  {renderColoredCell(metrics.rsi_and_ma_daily.seven_days_ago)}
                  {renderColoredCell(
                    metrics.rsi_and_ma_daily.fourteen_days_ago
                  )}
                  {renderColoredCell(
                    metrics.rsi_and_ma_daily.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📊 RSI & MA (Weekly)</td>
                  {renderColoredCell(metrics.rsi_ma_weekly.current)}
                  {renderColoredCell(metrics.rsi_ma_weekly.seven_days_ago)}
                  {renderColoredCell(metrics.rsi_ma_weekly.fourteen_days_ago)}
                  {renderColoredCell(metrics.rsi_ma_weekly.twentyone_days_ago)}
                </tr>

                <tr>
                  <td>📊 RSI & MA (Monthly)</td>
                  {renderColoredCell(metrics.rsi_ma_monthly.current)}
                  {renderColoredCell(metrics.rsi_ma_monthly.seven_days_ago)}
                  {renderColoredCell(metrics.rsi_ma_monthly.fourteen_days_ago)}
                  {renderColoredCell(metrics.rsi_ma_monthly.twentyone_days_ago)}
                </tr>
                <tr>
                  <td>📉 RSI Divergence (Daily)</td>
                  {renderColoredCell(metrics.rsi_divergence_daily.current)}
                  {renderColoredCell(
                    metrics.rsi_divergence_daily.seven_days_ago
                  )}
                  {renderColoredCell(
                    metrics.rsi_divergence_daily.fourteen_days_ago
                  )}
                  {renderColoredCell(
                    metrics.rsi_divergence_daily.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📉 RSI Divergence (Weekly)</td>
                  {renderColoredCell(metrics.rsi_divergence_weekly.current)}
                  {renderColoredCell(
                    metrics.rsi_divergence_weekly.seven_days_ago
                  )}
                  {renderColoredCell(
                    metrics.rsi_divergence_weekly.fourteen_days_ago
                  )}
                  {renderColoredCell(
                    metrics.rsi_divergence_weekly.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📉 RSI Divergence (Monthly)</td>
                  {renderColoredCell(metrics.rsi_divergence_monthly.current)}
                  {renderColoredCell(
                    metrics.rsi_divergence_monthly.seven_days_ago
                  )}
                  {renderColoredCell(
                    metrics.rsi_divergence_monthly.fourteen_days_ago
                  )}
                  {renderColoredCell(
                    metrics.rsi_divergence_monthly.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📈 Bollinger Band Width % (Daily)</td>
                  {renderColoredCell(
                    metrics.bollinger_band_width_percentile_daily.current
                  )}
                  {renderColoredCell(
                    metrics.bollinger_band_width_percentile_daily.seven_days_ago
                  )}
                  {renderColoredCell(
                    metrics.bollinger_band_width_percentile_daily
                      .fourteen_days_ago
                  )}
                  {renderColoredCell(
                    metrics.bollinger_band_width_percentile_daily
                      .twentyone_days_ago
                  )}
                </tr>

                <tr>
                  <td>💰 Chaikin Money Flow</td>
                  {renderColoredCell(metrics.chaikin_money_flow.current)}
                  {renderColoredCell(metrics.chaikin_money_flow.seven_days_ago)}
                  {renderColoredCell(
                    metrics.chaikin_money_flow.fourteen_days_ago
                  )}
                  {renderColoredCell(
                    metrics.chaikin_money_flow.twentyone_days_ago
                  )}
                </tr>
                <tr>
                  <td>📍 ADX (Weekly)</td>
                  {renderColoredCell(metrics.adx.current)}
                  {renderColoredCell(metrics.adx.seven_days_ago)}
                  {renderColoredCell(metrics.adx.fourteen_days_ago)}
                  {renderColoredCell(metrics.adx.twentyone_days_ago)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default Metrics;
