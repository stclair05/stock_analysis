import {
  createChart,
  CandlestickSeries,
  LineSeries,
  Time,
  UTCTimestamp,
  CrosshairMode,
  ISeriesApi,
  IChartApi,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { getTradingViewUrl } from "../utils";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface DrawingLine {
  type: "line";
  points: { time: UTCTimestamp; value: number }[];
}

interface DrawingHorizontal {
  type: "horizontal";
  price: number;
  time: UTCTimestamp;
}

type Drawing = DrawingLine | DrawingHorizontal;

interface StockChartProps {
  stockSymbol: string;
}

const StockChart = ({ stockSymbol }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const drawingModeRef = useRef<"trendline" | "horizontal" | null>(null);
  const lineBufferRef = useRef<{ time: UTCTimestamp; value: number }[]>([]);
  const drawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [, forceRerender] = useState(false); // for UI toggle highlight

  useEffect(() => {
    if (!stockSymbol || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#000000",
      },
      crosshair: {
        mode: CrosshairMode.Normal, // ✅ Free movement
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

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    candleSeriesRef.current = candleSeries;

    const ws = new WebSocket(
      `ws://localhost:8000/ws/chart_data_weekly/${stockSymbol.toUpperCase()}`
    );

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.history) {
        const formattedData = (data.history as Candle[]).map((candle) => ({
          time: candle.time as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
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

    chart.subscribeClick((param) => {
      if (!param.time || !param.point || !drawingModeRef.current) return;

      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;

      const time = param.time as UTCTimestamp;

      if (drawingModeRef.current === "trendline") {
        const point = { time, value: price };
        if (lineBufferRef.current.length === 0) {
          lineBufferRef.current = [point];
        } else {
          const newLine: DrawingLine = {
            type: "line",
            points: [lineBufferRef.current[0], point],
          };
          setDrawings((prev) => [...prev, newLine]);
          lineBufferRef.current = [];
          // keep it active — don't clear drawingMode
          // this allows continuous drawing
        }
      } else if (drawingModeRef.current === "horizontal") {
        const horizontalLine: DrawingHorizontal = {
          type: "horizontal",
          price,
          time,
        };
        setDrawings((prev) => [...prev, horizontalLine]);
        // keep it active — don't clear drawingMode
        // this allows continuous drawing
      }
    });

    ws.onclose = () => console.log("WebSocket closed");

    return () => {
      ws.close();
      chart.remove();
    };
  }, [stockSymbol]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    drawings.forEach((drawing, i) => {
      if (drawnSeriesRef.current.has(i)) return;

      if (drawing.type === "line") {
        const series = chart.addSeries(LineSeries, {
          color: "#FF9800",
          lineWidth: 2,
        });
        series.setData(drawing.points);
        drawnSeriesRef.current.set(i, series);
      } else if (drawing.type === "horizontal") {
        const t = drawing.time;
        const YEARS = 10;
        const secondsPerDay = 86400;
        const lineStart = (t - secondsPerDay * 365 * YEARS) as UTCTimestamp;
        const lineEnd = (t + secondsPerDay * 365 * YEARS) as UTCTimestamp;

        const series = chart.addSeries(LineSeries, {
          color: "#03A9F4",
          lineWidth: 1,
        });
        series.setData([
          { time: lineStart, value: drawing.price },
          { time: lineEnd, value: drawing.price },
        ]);
        drawnSeriesRef.current.set(i, series);
      }
    });
  }, [drawings]);

  const clearDrawings = () => {
    const chart = chartRef.current;
    if (chart) {
      drawnSeriesRef.current.forEach((series) => {
        if (series) chart.removeSeries(series);
      });
    }
    drawnSeriesRef.current.clear();
    setDrawings([]);
    lineBufferRef.current = [];
  };

  const toggleMode = (mode: "trendline" | "horizontal") => {
    drawingModeRef.current =
      drawingModeRef.current === mode ? null : mode;
    lineBufferRef.current = []; // clear mid-progress lines
    forceRerender((v) => !v);
  };

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

      <div className="toolbar mb-2">
        <button
          onClick={() => {
            const isActive = drawingModeRef.current === "trendline";
            drawingModeRef.current = isActive ? null : "trendline";
            lineBufferRef.current = [];
            forceRerender((v) => !v);
          }}
          className={`btn btn-sm me-2 ${
            drawingModeRef.current === "trendline"
              ? "btn-success"
              : "btn-outline-primary"
          }`}
        >
          📏 Trendline {drawingModeRef.current === "trendline" ? "✓" : ""}
        </button>


        <button
          onClick={() => {
            const isActive = drawingModeRef.current === "horizontal";
            drawingModeRef.current = isActive ? null : "horizontal";
            forceRerender((v) => !v);
          }}
          className={`btn btn-sm me-2 ${
            drawingModeRef.current === "horizontal"
              ? "btn-success"
              : "btn-outline-secondary"
          }`}
        >
          ➖ Horizontal {drawingModeRef.current === "horizontal" ? "✓" : ""}
        </button>


        <button onClick={clearDrawings} className="btn btn-danger btn-sm">
          ❌ Clear
        </button>
      </div>

      <div
        ref={chartContainerRef}
        style={{ width: "100%", height: "400px", marginBottom: "1rem" }}
      />
    </div>
  );
};

export default StockChart;
