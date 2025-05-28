import { useEffect } from "react";
import { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { Candle } from "./types";

export function useMainChartData(
  stockSymbol: string,
  candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>,
  timeframe: "daily" | "weekly" | "monthly",
  chartRef?: React.MutableRefObject<IChartApi | null>,
) {
  useEffect(() => {
    if (!stockSymbol || !candleSeriesRef.current) return;

    async function fetchData() {
      try {
        const res = await fetch(`http://localhost:8000/api/chart_data_${timeframe}/${stockSymbol.toUpperCase()}`);
        const data = await res.json();
        const candleSeries = candleSeriesRef.current;
        if (!candleSeries) return;

        if (data.history) {
          const formattedData = (data.history as Candle[]).map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));
          candleSeries.setData(formattedData);

          // Optionally, set visible range to future here:
          if (chartRef?.current) {
            setFutureVisibleRange(candleSeries, chartRef.current);
          }
        }
      } catch (err) {
        // handle error if needed
      }
    }

    fetchData();
  }, [stockSymbol, candleSeriesRef, timeframe, chartRef]);
}

// Utility function (can be imported/shared)
function setFutureVisibleRange <T extends "Candlestick" | "Line" | "Histogram">(
  series: ISeriesApi<T>,
  chart: IChartApi
) {
  if (!series || !chart) return;
  const mainSeriesData = series.data();
  if (!mainSeriesData || mainSeriesData.length === 0) return;

  const FUTURE_WEEKS = 26; // 6 months
  const SECONDS_IN_WEEK = 7 * 24 * 60 * 60;
  const lastTime = mainSeriesData[mainSeriesData.length - 1].time as UTCTimestamp;
  const futureLimit = (lastTime + FUTURE_WEEKS * SECONDS_IN_WEEK) as UTCTimestamp;

  chart.timeScale().setVisibleRange({
    from: mainSeriesData[0].time,
    to: futureLimit,
  });
}
