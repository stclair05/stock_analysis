import { createChart, LineSeries } from "lightweight-charts";
import { useEffect, useRef } from "react";

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

    const lineSeries = chart.addSeries(LineSeries);

    const ws = new WebSocket(`ws://localhost:8000/ws/chart_data/${stockSymbol.toUpperCase()}`);


    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
      
        if (data.history) {
          lineSeries.setData(data.history);  // initialize chart with historical data
        }
      
        if (data.live) {
          lineSeries.update(data.live);  //  live update
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
    <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />
  );
};

export default StockChart;
