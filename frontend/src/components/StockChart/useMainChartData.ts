import { useEffect } from "react";
import { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { Candle } from "./types";

export function useMainChartData(
  stockSymbol: string,
  candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>,
  timeframe: "daily" | "weekly" | "monthly",
  chartRef?: React.MutableRefObject<IChartApi | null>,
  onData?: (candles: Candle[]) => void // <-- Add this!
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

          if (onData) onData(formattedData); 
        }
      } catch (err) {
        // handle error if needed
        console.log(err)
      }
    }

    fetchData();
  }, [stockSymbol, candleSeriesRef, timeframe, chartRef]);
}