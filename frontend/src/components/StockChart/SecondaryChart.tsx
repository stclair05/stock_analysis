import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { useWebSocketData } from "./useWebSocketData";

interface SecondaryChartProps {
  symbol: string;
  timeframe: "daily" | "weekly" | "monthly";
  chartRef?: React.MutableRefObject<IChartApi | null>;
  seriesRef?: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
  onCrosshairMove?: (time: UTCTimestamp) => void;
  onVisibleRangeChange?: (range: { from: UTCTimestamp; to: UTCTimestamp }) => void;
}

const SecondaryChart = ({
  symbol,
  timeframe,
  chartRef: externalChartRef,
  seriesRef: externalSeriesRef,
  onCrosshairMove,
  onVisibleRangeChange,
}: SecondaryChartProps) => {

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Clear previous chart if any
    chartRef.current.innerHTML = "";

    const chart = createChart(chartRef.current, {
      height: 400,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#000000",
      },
      crosshair: {
        mode: CrosshairMode.Normal,
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

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#4caf50",
      downColor: "#f44336",
      borderVisible: false,
      wickUpColor: "#4caf50",
      wickDownColor: "#f44336",
    });

    chartInstanceRef.current = chart;
    candleSeriesRef.current = series;
    externalChartRef && (externalChartRef.current = chart);
    externalSeriesRef && (externalSeriesRef.current = series);

    chart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.point) return;
        const time = param.time as UTCTimestamp;
        onCrosshairMove?.(time);  // 🔁 Emit time back to parent
    });

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (
            range?.from != null &&
            range?.to != null &&
            typeof range.from === "number" &&
            typeof range.to === "number"
        ) {
            onVisibleRangeChange?.({
            from: range.from as UTCTimestamp,
            to: range.to as UTCTimestamp,
            });
        }
    });


    return () => {
      chart.remove();
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [symbol]);

  // Connect to live WebSocket data
  useWebSocketData(symbol, candleSeriesRef, timeframe);

  return (
    <div
      ref={chartRef}
      style={{ width: "100%", height: "400px", border: "1px solid #ddd", borderRadius: "6px" }}
    />
  );
};

export default SecondaryChart;
