import { useEffect, useRef } from "react";
import { ISeriesApi } from "lightweight-charts";

export function useWebSocketData(
  stockSymbol: string,
  candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>
) {
  const socketRef = useRef<WebSocket | null>(null);
  const isActive = useRef(true);

  useEffect(() => {
    if (!stockSymbol) return;

    isActive.current = true;

    const timeout = setTimeout(() => {
      const ws = new WebSocket(`ws://localhost:8000/ws/chart_data_weekly/${stockSymbol}`);
      socketRef.current = ws;

      ws.onmessage = (event) => {
        if (!isActive.current) return;

        try {
          const message = JSON.parse(event.data);
          const series = candleSeriesRef.current;

          if (!series || !message || typeof message !== "object") return;

          if (message.history && Array.isArray(message.history)) {
            series.setData(message.history);
          }

          if (message.live && message.live.time && message.live.value !== undefined) {
            series.update({
              time: message.live.time,
              open: message.live.value,
              high: message.live.value,
              low: message.live.value,
              close: message.live.value,
            });
          }
        } catch (err) {
          console.error("WebSocket parse error:", err);
        }
      };

      ws.onclose = () => {
        console.info("WebSocket closed:", stockSymbol);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };
    }, 30); // 💡 small delay ensures refs are initialized

    return () => {
      isActive.current = false;
      clearTimeout(timeout);
      if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
        socketRef.current.close();
      }
    };
  }, [stockSymbol]);
}
