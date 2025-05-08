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
import { Trash2, Ruler, Minus } from "lucide-react";
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

type Drawing = DrawingLine | DrawingHorizontal | DrawingSixPoint;

interface StockChartProps {
  stockSymbol: string;
}

interface DrawingSixPoint {
  type: "sixpoint";
  points: { time: UTCTimestamp; value: number }[];
}


const StockChart = ({ stockSymbol }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const drawingModeRef = useRef<"trendline" | "horizontal" | "sixpoint" | null>(null);
  const lineBufferRef = useRef<{ time: UTCTimestamp; value: number }[]>([]);
  const drawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const labelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(new Map()); // NEW
  const previewSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [hoverPoint, setHoverPoint] = useState<{ time: UTCTimestamp; value: number } | null>(null);
  const [, forceRerender] = useState(false);

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
          setHoverPoint(null);
          if (previewSeriesRef.current) {
            chartRef.current?.removeSeries(previewSeriesRef.current);
            previewSeriesRef.current = null;
          }
        }
      } else if (drawingModeRef.current === "horizontal") {
        const horizontalLine: DrawingHorizontal = {
          type: "horizontal",
          price,
          time,
        };
        setDrawings((prev) => [...prev, horizontalLine]);
      } else if (drawingModeRef.current === "sixpoint") {
        const point = { time, value: price };
        if (lineBufferRef.current.some((p) => p.time === time)) return; // Prevent duplicates
        lineBufferRef.current.push(point);
      
        if (lineBufferRef.current.length === 6) {
          const newSixPoint: DrawingSixPoint = {
            type: "sixpoint",
            points: [...lineBufferRef.current],
          };
          setDrawings((prev) => [...prev, newSixPoint]);
          lineBufferRef.current = [];
        }
        return;
      }
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || lineBufferRef.current.length !== 1) {
        setHoverPoint((prev) => (prev !== null ? null : prev));
        return;
      }
    
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;
    
      const time = param.time as UTCTimestamp;
    
      // Only update if value changed
      setHoverPoint((prev) => {
        if (!prev || prev.time !== time || prev.value !== price) {
          return { time, value: price };
        }
        return prev;
      });
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
      } else if (drawing.type === "sixpoint") {
        const series = chart.addSeries(LineSeries, {
          color: "#673AB7",
          lineWidth: 2,
        });
      
        series.setData(drawing.points);
        drawnSeriesRef.current.set(i, series);
      
        // Add labels 0–5
        const labels: ISeriesApi<"Line">[] = [];
        drawing.points.forEach((p, idx) => {
          const label = chart.addSeries(LineSeries, {
            color: "#000",
            lineWidth: 1, // must be valid
          });
          label.applyOptions({
            priceLineVisible: false,
            lastValueVisible: true,
            lineVisible: false, // ⬅ optional, if your version supports it
            title: `${idx}`,
          });
          label.setData([{ time: p.time, value: p.value }]);
          label.applyOptions({
            priceLineVisible: false,
            lastValueVisible: true,
            title: `${idx}`,
          });
          labels.push(label);
        });
        labelSeriesRef.current.set(i, labels);
      }
      
    });
  }, [drawings]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
  
    if (
      drawingModeRef.current === "trendline" &&
      lineBufferRef.current.length === 1 &&
      hoverPoint
    ) {
      const [p1, p2] = [lineBufferRef.current[0], hoverPoint];
  
      // If timestamps are the same, skip to avoid assertion error
      if (p1.time === p2.time) return;
  
      const previewData = [p1, p2].sort((a, b) => a.time - b.time);
  
      if (!previewSeriesRef.current) {
        previewSeriesRef.current = chart.addSeries(LineSeries, {
          color: "rgba(255, 152, 0, 0.5)",
          lineWidth: 1,
          lineStyle: 1,
        });
      }
      previewSeriesRef.current.setData(previewData);
    } else {
      if (previewSeriesRef.current) {
        chart.removeSeries(previewSeriesRef.current);
        previewSeriesRef.current = null;
      }
    }
  }, [hoverPoint]);
  

  const clearDrawings = () => {
    const chart = chartRef.current;
    if (chart) {
      drawnSeriesRef.current.forEach((series) => {
        if (series) chart.removeSeries(series);
      });
      labelSeriesRef.current.forEach((seriesArr) => {
        seriesArr.forEach((s) => chart?.removeSeries(s));
      });
      labelSeriesRef.current.clear();
    }
    drawnSeriesRef.current.clear();
    setDrawings([]);
    lineBufferRef.current = [];
    if (previewSeriesRef.current) {
      chart?.removeSeries(previewSeriesRef.current);
      previewSeriesRef.current = null;
    }
  };

  const toggleMode = (mode: "trendline" | "horizontal" | "sixpoint") => {
    drawingModeRef.current =
      drawingModeRef.current === mode ? null : mode;
    lineBufferRef.current = [];
    setHoverPoint(null);
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

      <div className="toolbar mb-2 d-flex gap-2">
        <button
          onClick={() => toggleMode("trendline")}
          className={`tool-button ${drawingModeRef.current === "trendline" ? "active" : ""}`}
          title="Trendline"
        >
          <Ruler size={16} />
        </button>

        <button
          onClick={() => toggleMode("horizontal")}
          className={`tool-button ${drawingModeRef.current === "horizontal" ? "active" : ""}`}
          title="Horizontal Line"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => toggleMode("sixpoint")}
          className={`tool-button ${drawingModeRef.current === "sixpoint" ? "active" : ""}`}
          title="6 Point Tool"
        >
          {/* you can use a new icon here, e.g., Plus or custom SVG */}
          1→5
        </button>


        <button onClick={clearDrawings} className="tool-button danger" title="Clear All">
          <Trash2 size={16} />
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