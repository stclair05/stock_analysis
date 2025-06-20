import { useEffect } from "react";
import { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { Candle } from "./types";

export function useMainChartData(
  stockSymbol: string,
  candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>,
  timeframe: "daily" | "weekly" | "monthly",
  chartRef?: React.MutableRefObject<IChartApi | null>,
  onData?: (candles: Candle[]) => void,
  includeFutureBars: boolean = false
) {
  useEffect(() => {
    if (!stockSymbol || !candleSeriesRef.current) return;

    async function fetchData() {
      try {
        const res = await fetch(
          `http://localhost:8000/api/chart_data_${timeframe}/${stockSymbol.toUpperCase()}`
        );
        const data = await res.json();
        const candleSeries = candleSeriesRef.current;
        if (!candleSeries) return;

        if (data.history) {
          let formattedData = (data.history as Candle[]).map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));

          // ====== ADD WHITESPACE BARS FOR FUTURE ======
          if (includeFutureBars && formattedData.length > 0) {
            const FUTURE_BARS = 100; // extra 100 bars into the future!
            let lastTime = formattedData[formattedData.length - 1]
              .time as number;

            // Calculate interval based on your timeframe
            let interval = 0;
            if (timeframe === "daily") interval = 24 * 60 * 60;
            else if (timeframe === "weekly") interval = 7 * 24 * 60 * 60;
            else if (timeframe === "monthly") interval = 31 * 24 * 60 * 60; // crude approx

            const whitespace: { time: UTCTimestamp }[] = [];
            for (let i = 1; i <= FUTURE_BARS; ++i) {
              whitespace.push({
                time: (lastTime + i * interval) as UTCTimestamp,
              });
            }
            formattedData = [...formattedData, ...(whitespace as any)];
          }
          // ===========================================
          candleSeries.setData(formattedData);

          if (onData) onData(formattedData);
        }
      } catch (err) {
        // handle error if needed
        console.log(err);
      }
    }

    fetchData();
  }, [stockSymbol, candleSeriesRef, timeframe, chartRef]);
}
