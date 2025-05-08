import { createChart, CandlestickSeries, Time } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { getTradingViewUrl } from "../utils";

type Candle = {
  time: number; // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
};

type StockChartProps = {
  stockSymbol: string;
};

// Converts Unix timestamp (in seconds) to lightweight-charts Time object
const convertToChartTime = (timestamp: number): Time => {
  const date = new Date(timestamp * 1000); // Convert from seconds to ms
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const StockChart = ({ stockSymbol }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stockSymbol || !chartContainerRef.current) return;

    chartContainerRef.current.innerHTML = "";

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#000000",
      },
      grid: {
        vertLines: { color: "#eee" },
        horzLines: { color: "#eee" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    const ws = new WebSocket(
      `ws://localhost:8000/ws/chart_data_weekly/${stockSymbol.toUpperCase()}`
    );

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.history) {
        const formattedData = (data.history as Candle[]).map((candle) => ({
          time: convertToChartTime(candle.time),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }));
        candleSeries.setData(formattedData);
      }

      if (data.live) {
        candleSeries.update({
          time: convertToChartTime(data.live.time),
          open: data.live.value,
          high: data.live.value,
          low: data.live.value,
          close: data.live.value,
        });
      }
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      ws.close();
      chart.remove();
    };
  }, [stockSymbol]);

  return (
    <div className="position-relative bg-white p-3 shadow-sm rounded border">
      {stockSymbol && (
        <a
          href={getTradingViewUrl(stockSymbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline-secondary btn-sm position-absolute"
          style={{ top: "1rem", right: "1rem" }}
        >
          View in TradingView ↗
        </a>
      )}

      <h5 className="fw-bold mb-3">📈 Weekly Candlestick Chart</h5>
      <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />
    </div>
  );
};

export default StockChart;
