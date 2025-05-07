import { createChart, LineSeries } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { getTradingViewUrl } from "../utils";

type StockChartProps = {
  stockSymbol: string;
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
        textColor: "#000",
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

    // ✅ KEEP YOUR WORKING LINE HERE
    const lineSeries = chart.addSeries(LineSeries);

    const ws = new WebSocket(`ws://localhost:8000/ws/chart_data_weekly/${stockSymbol.toUpperCase()}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.history) {
        lineSeries.setData(data.history);
      }

      if (data.live) {
        lineSeries.update(data.live);
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
      {/* Floating button */}
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

      <h5 className="fw-bold mb-3">📈 Weekly Stock Chart </h5>

      <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />
    </div>
  );
};

export default StockChart;
