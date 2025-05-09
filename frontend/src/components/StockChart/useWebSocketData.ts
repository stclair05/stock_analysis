import { useEffect } from "react";
import { ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { Candle } from "./types";

export function useWebSocketData(
  stockSymbol: string,
  candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>
) {
  useEffect(() => {
    if (!stockSymbol || !candleSeriesRef.current) return;

    const ws = new WebSocket(
      `ws://localhost:8000/ws/chart_data_weekly/${stockSymbol.toUpperCase()}`
    );

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
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
      }

      if (data.live) {
        candleSeries.update({
          time: data.live.time as UTCTimestamp,
          open: data.live.value,
          high: data.live.value,
          low: data.live.value,
          close: data.live.value,
        });
      }
    };

    ws.onclose = () => console.log("WebSocket closed");

    return () => {
      ws.close();
    };
  }, [stockSymbol, candleSeriesRef]);
}
