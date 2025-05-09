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
import { Trash2, Ruler, Minus, RotateCcw } from "lucide-react";
import { getTradingViewUrl } from "../utils";

import {
  Candle,
  Drawing,
  DrawingLine,
  DrawingHorizontal,
  DrawingSixPoint,
  StockChartProps,
} from "./StockChart/types";

import { useWebSocketData } from "./StockChart/useWebSocketData";

const StockChart = ({ stockSymbol }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sixPointPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const dotLabelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(new Map());
  const sixPointDotPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sixPointHoverLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  const drawingModeRef = useRef<"trendline" | "horizontal" | "sixpoint" | null>(null);
  const lineBufferRef = useRef<{ time: UTCTimestamp; value: number }[]>([]);
  const drawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
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
    
    chart.subscribeClick((param) => {
      if (!param.time || !param.point || !drawingModeRef.current) return;
      if (!chartRef.current || !candleSeriesRef.current) {
        console.warn("Chart not ready, ignoring click");
        return;
      }
      

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
        if (
          lineBufferRef.current.length >= 6 ||
          lineBufferRef.current.some((p) => p.time === time)
        ) {
          console.warn("Duplicate or too many points. Ignoring click.");         // Prevent duplicates
          return;
        }
        if (lineBufferRef.current.length > 6) {
          console.warn("Resetting buffer: too many points");
          lineBufferRef.current = [];
        }
        
        lineBufferRef.current.push(point);
        console.log("Added point", point, "Total:", lineBufferRef.current.length + 1);

        // Update preview series
        const chart = chartRef.current;

        const previewDotColor = '#1f77b4';
        const seen = new Set();
        const sortedPoints = [...lineBufferRef.current]
          .filter((p) => {
            if (seen.has(p.time)) return false;
            seen.add(p.time);
            return true;
          })
          .sort((a, b) => a.time - b.time);


        if (!sixPointDotPreviewRef.current) {
          sixPointDotPreviewRef.current = chart.addSeries(LineSeries, {
            color: previewDotColor,
            lineWidth: 1,
            pointMarkersVisible: true,
            pointMarkersRadius: 4,
          });
        }

        sixPointDotPreviewRef.current.setData(sortedPoints);

        const label = ['A', 'B', 'C', 'D', 'E', 'X'][lineBufferRef.current.length - 1];
        sixPointDotPreviewRef.current.applyOptions({
          priceLineVisible: false,
          lastValueVisible: true,
          title: label,
        });


        if (chart) {
          const sortedPoints = [...lineBufferRef.current].sort((a, b) => a.time - b.time);

          if (!sixPointPreviewRef.current) {
            sixPointPreviewRef.current = chart.addSeries(LineSeries, {
              color: "#444",
              lineWidth: 1,
              lineStyle: 1,
            });
          }

          sixPointPreviewRef.current.setData(sortedPoints);
        }
        
        // Clear the 6 preview dot labels before drawing the final version
        if (sixPointDotPreviewRef.current) {
          chart.removeSeries(sixPointDotPreviewRef.current);
          sixPointDotPreviewRef.current = null;
        }
        


        if (lineBufferRef.current.length === 6) {
          if (sixPointDotPreviewRef.current) {
            chart.removeSeries(sixPointDotPreviewRef.current);
            sixPointDotPreviewRef.current = null;
          }
          
          const newSixPoint: DrawingSixPoint = {
            type: "sixpoint",
            points: [...lineBufferRef.current].sort((a, b) => a.time - b.time),
          };
          if (sixPointHoverLineRef.current) {
            chart.removeSeries(sixPointHoverLineRef.current);
            sixPointHoverLineRef.current = null;
          }
          
          setDrawings((prev) => [...prev, newSixPoint]);
          lineBufferRef.current = [];

          // Clear preview
          if (sixPointPreviewRef.current) {
            chartRef.current?.removeSeries(sixPointPreviewRef.current);
            sixPointPreviewRef.current = null;
          }
        }
        return;
      }
    });

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
          color: "#708090",
          lineWidth: 1,
          lineStyle: 1,
        });
      }
      previewSeriesRef.current.setData(previewData);
    } else if (
      drawingModeRef.current === "sixpoint" &&
      lineBufferRef.current.length >= 1 &&
      hoverPoint
    ) {
      const lastPoint = lineBufferRef.current[lineBufferRef.current.length - 1];

      if (lastPoint?.time === hoverPoint.time) return;

      const previewLine = [...lineBufferRef.current]; // all clicked points so far
      if (hoverPoint.time !== lastPoint.time) {
        previewLine.push(hoverPoint); // add the hover point only if it's not overlapping
      }

      previewLine.sort((a, b) => a.time - b.time);


      if (!sixPointHoverLineRef.current) {
        sixPointHoverLineRef.current = chart.addSeries(LineSeries, {
          color: "#708090",
          lineWidth: 1,
          lineStyle: 1,
        });
      }

      sixPointHoverLineRef.current.setData(previewLine);
     } else {
      if (previewSeriesRef.current) {
        chart.removeSeries(previewSeriesRef.current);
        previewSeriesRef.current = null;
      }
    }
  }, [hoverPoint]);
  

  const clearDrawings = () => {
    const chart = chartRef.current;
    if (!chart) return; // ✅ avoids undefined crash
  
    drawnSeriesRef.current.forEach((series) => {
      chart.removeSeries(series);
    });
  
    dotLabelSeriesRef.current.forEach((seriesArr) => {
      if (!Array.isArray(seriesArr)) return;
      for (const s of seriesArr) {
        try {
          if (s && typeof s.setData === "function") {
            chart.removeSeries(s);
          }
        } catch (err) {
          console.warn("Failed to remove series:", s, err);
        }
      }
    });
    
  
    dotLabelSeriesRef.current.clear();
    drawnSeriesRef.current.clear();
    setDrawings([]);
    lineBufferRef.current = [];
  
    if (previewSeriesRef.current) {
      chart.removeSeries(previewSeriesRef.current);
      previewSeriesRef.current = null;
    }
  
    if (sixPointPreviewRef.current) {
      chart.removeSeries(sixPointPreviewRef.current);
      sixPointPreviewRef.current = null;
    }

    if (sixPointHoverLineRef.current) {
      chart.removeSeries(sixPointHoverLineRef.current);
      sixPointHoverLineRef.current = null;
    }
    
    
  };
  

  const toggleMode = (mode: "trendline" | "horizontal" | "sixpoint") => {
    drawingModeRef.current =
      drawingModeRef.current === mode ? null : mode;
    lineBufferRef.current = [];
    setHoverPoint(null);
    forceRerender((v) => !v);
  };

  const resetChart = () => {
    clearDrawings();                    // Remove existing drawings
    lineBufferRef.current = [];         // Reset input buffer
    drawingModeRef.current = null;      // Exit drawing mode
    setHoverPoint(null);                // Clear hover preview
    forceRerender((v) => !v);           // Trigger re-render if needed
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