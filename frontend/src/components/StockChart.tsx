import {
  createChart,
  CandlestickSeries,
  LineSeries,
  UTCTimestamp,
  CrosshairMode,
  ISeriesApi,
  IChartApi,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { Ruler, Minus, RotateCcw } from "lucide-react";
import { getTradingViewUrl } from "../utils";

import {
  DrawingLine,
  DrawingHorizontal,
  DrawingSixPoint,
  StockChartProps,
} from "./StockChart/types";

import { useWebSocketData } from "./StockChart/useWebSocketData";

import { useDrawingManager } from "./StockChart/DrawingManager";

import { usePreviewManager } from "./StockChart/PreviewManager";

import { useDrawingRenderer } from "./StockChart/DrawingRenderer";

import { useClickHandler } from "./StockChart/ClickHandler";


const StockChart = ({ stockSymbol }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sixPointPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const dotLabelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(new Map());
  const sixPointDotPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sixPointHoverLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  const drawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const previewSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  
  const {
    drawingModeRef,
    lineBufferRef,
    drawings,
    setDrawings,
    hoverPoint,
    setHoverPoint,
    toggleMode,
    resetChart,
    clearDrawings,
  } = useDrawingManager(
    chartRef,
    previewSeriesRef,
    sixPointPreviewRef,
    sixPointHoverLineRef,
    dotLabelSeriesRef,
    drawnSeriesRef
  );

  usePreviewManager(
    chartRef,
    drawingModeRef,
    lineBufferRef,
    hoverPoint,
    previewSeriesRef,
    sixPointHoverLineRef
  );

  useDrawingRenderer(chartRef, drawings, drawnSeriesRef, dotLabelSeriesRef);

  useClickHandler(
    chartRef,
    candleSeriesRef,
    drawingModeRef,
    lineBufferRef,
    setDrawings,
    setHoverPoint,
    previewSeriesRef,
    sixPointDotPreviewRef,
    sixPointPreviewRef,
    sixPointHoverLineRef
  );
  

  
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
    

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || lineBufferRef.current.length === 0 || lineBufferRef.current.length >= 6) {
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
    


    return () => {
      chart.remove();
    };
  }, [stockSymbol]);

  useWebSocketData(stockSymbol, candleSeriesRef);

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

        if (drawing.points.length !== 6) {
          console.warn("Invalid sixpoint drawing skipped", drawing.points);
          return;
        }
        const series = chart.addSeries(LineSeries, {
          color: "#2a2a2a",
          lineWidth: 2,
        });
        
        const sortedPoints = [...drawing.points].sort((a, b) => a.time - b.time);

        series.setData(sortedPoints);
        series.applyOptions({
          priceLineVisible: false,
          lastValueVisible: false, 
        });
        drawnSeriesRef.current.set(i, series);
        
        const dotLabels: ISeriesApi<"Line">[] = [];
        const pointLabels = ['A', 'B', 'C', 'D', 'E', 'X'];
        const dotColor = '#1f77b4';

        sortedPoints.forEach((pt, idx) => {
          const dotSeries = chart.addSeries(LineSeries, {
            color: dotColor,
            lineWidth: 1,
            pointMarkersVisible: true,
            pointMarkersRadius: 4,
          });

          dotSeries.setData([{ time: pt.time, value: pt.value }]);

          dotSeries.applyOptions({
            priceLineVisible: false,
            lastValueVisible: true,
            title: pointLabels[idx],
          });

          dotLabels.push(dotSeries);
        });

        dotLabelSeriesRef.current.set(i, dotLabels);

  
      }
      
    });
  }, [drawings]);

  

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

        <button
          onClick={resetChart}
          className="tool-button"
          title="Reload Chart"
        >
          <RotateCcw size={16} />
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