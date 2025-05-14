import {
  createChart,
  CandlestickSeries,
  LineSeries,
  UTCTimestamp,
  CrosshairMode,
  ISeriesApi,
  IChartApi,
  DeepPartial,
  LineStyleOptions,
  SeriesOptionsCommon,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { Ruler, Minus, RotateCcw, ArrowUpDown } from "lucide-react";
import { getTradingViewUrl } from "../../utils";

import {
  StockChartProps,
} from "./types";

import { useWebSocketData } from "./useWebSocketData";

import { useDrawingManager } from "./DrawingManager";

import { usePreviewManager } from "./PreviewManager";

import { useDrawingRenderer } from "./DrawingRenderer";

import { useClickHandler } from "./ClickHandler";


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

  // Mean Rev Chart
  const meanRevChartRef = useRef<HTMLDivElement>(null);
  const meanRevChartInstance = useRef<IChartApi | null>(null);
  const meanRevLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [limitDrawingMode, setLimitDrawingMode] = useState(false);
  const [meanRevLimitLines, setMeanRevLimitLines] = useState<number[]>([]);

  const meanRevLimitSeries = useRef<ISeriesApi<"Line">[]>([]);
  const limitDrawingModeRef = useRef(false);

  // RSI Chart
  const rsiChartRef = useRef<HTMLDivElement>(null);
  const rsiChartInstance = useRef<IChartApi | null>(null);
  const rsiLineRef = useRef<ISeriesApi<"Line"> | null>(null);






  const [overlayData, setOverlayData] = useState<{
    three_year_ma?: { time: number; value: number }[];
    dma_50?: { time: number; value: number }[];
    mace?: { time: number; value: number }[];
    mean_rev_50dma?: { time: number; value: number }[];
    mean_rev_200dma?: { time: number; value: number }[];
    mean_rev_3yma?: { time: number; value: number }[];
    rsi?: { time: number; value: number }[];
  }>({});
  
  
  const [show3YMA, setShow3YMA] = useState(false);
  const [show50DMA, setShow50DMA] = useState(false);
  const [showMACE, setShowMACE] = useState(false);
  
  const ma3YRef = useRef<ISeriesApi<"Line"> | null>(null);
  const dma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const maceRef = useRef<ISeriesApi<"Line"> | null>(null);
  

  
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
    if (!stockSymbol || !chartContainerRef.current || !meanRevChartRef.current || !rsiChartRef.current ) return;

    chartContainerRef.current.innerHTML = "";
    meanRevChartRef.current.innerHTML = "";
    rsiChartRef.current.innerHTML = "";


    const chart = createChart(chartContainerRef.current, {
      height: 400,
      width: 0,
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

    if (!meanRevChartRef.current) return;

    const meanChart = createChart(meanRevChartRef.current, {
      width: meanRevChartRef.current.clientWidth,
      height: 200,
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
    meanRevChartInstance.current = meanChart;
    // Create and assign the line series for the bottom chart
    const meanRevLineSeries = meanChart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 2,
    });

    

    meanRevLineSeries.setData([
      {
        time: Date.now() / 1000 as UTCTimestamp, // dummy time
        value: 0,                                // dummy value
      },
    ]);
    
    meanRevLineRef.current = meanRevLineSeries;

    // RSI Chart
    if (!rsiChartRef.current) return;

    const rsiChart = createChart(rsiChartRef.current, {
      width: rsiChartRef.current.clientWidth,
      height: 150,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#000000",
      },
      grid: {
        vertLines: { color: "#eee" },
        horzLines: { color: "#eee" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });
    rsiChartInstance.current = rsiChart;

    // === 🔁 Full 3-Way Safe Sync ===

    function safeSetVisibleRange(chart: IChartApi | null, range: any) {
      if (
        !chart ||
        !chart.timeScale ||
        typeof chart.timeScale !== "function" ||
        !range ||
        range.from == null ||
        range.to == null
      ) return;
    
      try {
        chart.timeScale().setVisibleRange(range);
      } catch (err) {
        console.warn("⛔ safeSetVisibleRange failed", err);
      }
    }

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(meanRevChartInstance.current, range);
      safeSetVisibleRange(rsiChartInstance.current, range);
    });

    meanRevChartInstance.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(rsiChartInstance.current, range);
    });

    rsiChartInstance.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(meanRevChartInstance.current, range);
    });



    const rsiLine = rsiChart.addSeries(LineSeries, {
      color: "#f44336",
      lineWidth: 1,
    });
    rsiLine.setData([
      { time: Date.now() / 1000 as UTCTimestamp, value: 50 }, // Mid-band dummy
    ]);
    rsiLineRef.current = rsiLine;   


    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect) {
          chart.resize(entry.contentRect.width, 400);
          meanChart.resize(entry.contentRect.width, 200);
        }
      }
    });
    
    resizeObserver.observe(chartContainerRef.current);


    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    candleSeriesRef.current = candleSeries;

   

    function findClosestTime(series: ISeriesApi<any>, time: UTCTimestamp): UTCTimestamp | null {
      const data = series?.data?.() ?? [];  // If you're storing data elsewhere, replace this
      if (!data.length) return null;
    
      let closest = data[0].time;
      let minDiff = Math.abs(time - closest);
    
      for (let i = 1; i < data.length; i++) {
        const diff = Math.abs(data[i].time - time);
        if (diff < minDiff) {
          closest = data[i].time;
          minDiff = diff;
        }
      }
    
      return closest;
    }
    
    

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
    
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;
    
      const time = param.time as UTCTimestamp;
    
      if (!(lineBufferRef.current.length === 0 || lineBufferRef.current.length >= 6)) {
        setHoverPoint((prev) => {
          if (!prev || prev.time !== time || prev.value !== price) {
            return { time, value: price };
          }
          return prev;
        });
      }
    
      const meanChart = meanRevChartInstance.current;
      const meanSeries = meanRevLineRef.current;
      const rsiChart = rsiChartInstance.current;
      const rsiSeries = rsiLineRef.current;

      if (meanChart && meanSeries) {
        const snappedTime = findClosestTime(meanSeries, time);
        if (snappedTime) {
          meanChart.setCrosshairPosition(0, snappedTime, meanSeries);
        }
      }
      if (rsiChart && rsiSeries) {
        const snappedTime = findClosestTime(rsiSeries, time);
        if (snappedTime) {
          rsiChart.setCrosshairPosition(0, snappedTime, rsiSeries);
        }
      }
      
      
    });
    
    // SYNC CROSS HAIRS 
    meanChart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
  
      const topChart = chartRef.current;
      const topSeries = candleSeriesRef.current;
      if (topChart && topSeries) {
        const price = topSeries.coordinateToPrice(param.point.y) ?? 0;
        const snappedTime = findClosestTime(topSeries, param.time as UTCTimestamp);
        if (snappedTime) {
          topChart.setCrosshairPosition(price, snappedTime, topSeries);
        }
      }
    });
    rsiChart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
    
      const main = chartRef.current;
      const mainSeries = candleSeriesRef.current;
    
      if (main && mainSeries) {
        const price = mainSeries.coordinateToPrice(param.point.y) ?? 0;
        const snappedTime = findClosestTime(mainSeries, param.time as UTCTimestamp);
        if (snappedTime) {
          main.setCrosshairPosition(price, snappedTime, mainSeries);
        }
      }
    });
    

    meanChart.subscribeClick((param) => {
      console.log("📌 Click detected on meanRev chart:", param);
    
      if (!limitDrawingModeRef.current) {
        console.log("🚫 Not in limit drawing mode — ignoring click.");
        return;
      }
    
      if (!param.point || param.time === undefined) {
        console.warn("⚠️ Invalid click param:", param.point, param.time);
        return;
      }
    
      const seriesFromMap = param.seriesData?.keys().next().value;

      if (!seriesFromMap) {
        console.error("❌ No series found at click point.");
        return;
      }

      const price = seriesFromMap.coordinateToPrice(param.point.y);

      console.log("💵 Price from Y:", price);
      if (price == null) {
        console.warn("⚠️ Could not compute price from coordinate.");
        return;
      }
    
      const baseTime = param.time as UTCTimestamp;
      const earliestTime = (baseTime - 5 * 365 * 86400) as UTCTimestamp;
      const latestTime = (baseTime + 5 * 365 * 86400) as UTCTimestamp;

      if (price == null) {
        console.warn("⚠️ Could not compute price from coordinate.");
        return;
      }

      const chart = meanRevChartInstance.current;
      if (!chart) return;

      // Mirror price around 0
      const upper = price;
      const lower = -price;

      [upper, lower].forEach((val, idx) => {
        const series = chart.addSeries(LineSeries, {
          color: idx === 0 ? "#e91e63" : "#009688",
          lineWidth: 1,
        });
        series.setData([
          { time: earliestTime, value: val },
          { time: latestTime, value: val },
        ]);
        meanRevLimitSeries.current.push(series);
        setMeanRevLimitLines([upper, lower]);

      });

      // 🔚 Exit draw mode
      setLimitDrawingMode(false);
      limitDrawingModeRef.current = false;

    });
    

    return () => {
      chart.remove();
      meanChart.remove();
      rsiChart.remove(); 
      resizeObserver.disconnect();

      // Reset the refs
      chartRef.current = null;
      meanRevChartInstance.current = null;
      rsiChartInstance.current = null;
      rsiLineRef.current = null;
      meanRevLineRef.current = null;
      candleSeriesRef.current = null;
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
    const fetchOverlayData = async () => {
      try {
        const res = await fetch(`http://localhost:8000/overlay_data/${stockSymbol}`);
        const data = await res.json();
        setOverlayData(data);
      } catch (err) {
        console.error("Failed to fetch overlay data", err);
      }
    };
  
    fetchOverlayData();
  }, [stockSymbol]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const timeScale = chart.timeScale();
    const currentRange = timeScale.getVisibleRange(); // 👈 capture current range
  
    // --- 3Y MA ---
    if (show3YMA && overlayData.three_year_ma) {
      if (!ma3YRef.current) {
        ma3YRef.current = chart.addSeries(LineSeries, {
          color: "#0066ff",
          lineWidth: 1,
          lineStyle: 2, // dotted
          priceLineVisible: false,
          lastValueVisible: false,
        });        
      }
      ma3YRef.current.setData(
        overlayData.three_year_ma?.map(d => ({ time: d.time as UTCTimestamp, value: d.value })) || []
      );
      
    } else if (!show3YMA && ma3YRef.current) {
      chart.removeSeries(ma3YRef.current);
      ma3YRef.current = null;
    }
  
    // --- 50DMA ---
    if (show50DMA && overlayData.dma_50) {
      if (!dma50Ref.current) {
        dma50Ref.current = chart.addSeries(LineSeries, {
          color: "#00bcd4",
          lineWidth: 2,
          lineStyle: 0, // solid
          priceLineVisible: false,
          lastValueVisible: false,
        });        
      }
      dma50Ref.current.setData(
        overlayData.dma_50.map(d => ({ time: d.time as UTCTimestamp, value: d.value }))
      );
    } else if (!show50DMA && dma50Ref.current) {
      chart.removeSeries(dma50Ref.current);
      dma50Ref.current = null;
    }
  
    // --- MACE ---
    if (showMACE && overlayData.mace) {
      if (!maceRef.current) {
        maceRef.current = chart.addSeries(LineSeries, {
          color: "#9c27b0",
          lineWidth: 1,
          lineStyle: 1, // dashed
          priceLineVisible: false,
          lastValueVisible: false,
        });        
      }
      maceRef.current.setData(
        overlayData.mace.map(d => ({ time: d.time as UTCTimestamp, value: d.value }))
      );
    } else if (!showMACE && maceRef.current) {
      chart.removeSeries(maceRef.current);
      maceRef.current = null;
    }

  }, [show3YMA, show50DMA, showMACE, overlayData]);

  useEffect(() => {
    const chart = meanRevChartInstance.current;
    if (!chart) return;
  
    const lineOptions: DeepPartial<LineStyleOptions & SeriesOptionsCommon> = {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    };
  
    const colors = {
      mean_rev_50dma: "#3f51b5",   // indigo
      mean_rev_200dma: "#4caf50",  // green
      mean_rev_3yma: "#3f51b5",    // indigo
    };
  
    // Clear old series if any
    meanRevLineRef.current && chart.removeSeries(meanRevLineRef.current);
    meanRevLineRef.current = null;
  
    // Optional: use a map to keep track of multiple lines
    const lines: Record<string, ISeriesApi<"Line">> = {};
  
    (["mean_rev_50dma", "mean_rev_200dma", "mean_rev_3yma"] as const).forEach((key) => {
      const data = overlayData[key];
      if (!data) return;
  
      const series = chart.addSeries(LineSeries, {
        color: colors[key],
        ...lineOptions,
      });
  
      series.setData(data.map((d) => ({
        time: d.time as UTCTimestamp,
        value: d.value,
      })));
  
      lines[key] = series;
    });
  }, [
    overlayData.mean_rev_50dma,
    overlayData.mean_rev_200dma,
    overlayData.mean_rev_3yma,
  ]);
  
  useEffect(() => {
    const chart = rsiChartInstance.current;
    if (!chart) return;
  
    // Clean up old line if it exists
    if (rsiLineRef.current) {
      chart.removeSeries(rsiLineRef.current);
      rsiLineRef.current = null;
    }
  
    const lineOptions: DeepPartial<LineStyleOptions & SeriesOptionsCommon> = {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      color: "#f44336",
    };
  
    if (overlayData.rsi) {
      const series = chart.addSeries(LineSeries, lineOptions);
      series.setData(
        overlayData.rsi.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        }))
      );
      rsiLineRef.current = series;
    }
  }, [overlayData.rsi]);
  
  

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

      <div className="indicator-panel d-flex flex-column gap-2 mt-3">
        <label><input type="checkbox" checked={show3YMA} onChange={() => setShow3YMA(v => !v)} /> 3Y MA</label>
        <label><input type="checkbox" checked={show50DMA} onChange={() => setShow50DMA(v => !v)} /> 50DMA</label>
        <label><input type="checkbox" checked={showMACE} onChange={() => setShowMACE(v => !v)} /> MACE</label>
      </div>



      <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />
      <button
        onClick={() => {
          const chart = meanRevChartInstance.current;
        
          if (meanRevLimitLines.length > 0) {
            // Clear lines if already present
            meanRevLimitSeries.current.forEach((s) => chart?.removeSeries(s));
            meanRevLimitSeries.current = [];
            setMeanRevLimitLines([]);
            console.log("🧹 Cleared limit lines.");
          } else {
            setLimitDrawingMode(true);
            limitDrawingModeRef.current = true;
            console.log("🖱️ Activated limit drawing mode.");
          }
        }}
        
        className={`tool-button ${limitDrawingMode || meanRevLimitLines.length > 0 ? "active" : ""}`}
        title="Symmetric Bound Lines"
      >
        <ArrowUpDown size={16} />
      </button>

      <div ref={meanRevChartRef} style={{ width: "100%", height: "200px", marginTop: "1rem" }} />
      <div ref={rsiChartRef} style={{ width: "100%", height: "150px", marginTop: "1rem" }} />

    </div>
  );
};

export default StockChart;