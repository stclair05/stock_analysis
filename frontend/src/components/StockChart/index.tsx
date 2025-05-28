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
  HistogramSeries,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { Ruler, Minus, RotateCcw, ArrowUpDown, PlusCircle, X } from "lucide-react";

import {
  StockChartProps,
  Point
} from "./types";

import { useWebSocketData } from "./useWebSocketData";

import { useDrawingManager } from "./DrawingManager";

import { usePreviewManager } from "./PreviewManager";

import { useDrawingRenderer } from "./DrawingRenderer";

import { useClickHandler } from "./ClickHandler";

import OverlayGrid from "./OverlayGrid";

import SecondaryChart from "./SecondaryChart";

import S3Gallery from "../S3Gallery";



const StockChart = ({ stockSymbol }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sixPointPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const dotLabelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(new Map());
  const sixPointDotPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sixPointHoverLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("weekly");

  // Drawings 
  const [selectedDrawingIndex, setSelectedDrawingIndex] = useState<number | null>(null);
  const [draggedEndpoint, setDraggedEndpoint] = useState<'start' | 'end' | null>(null);
  const moveEndpointFixedRef = useRef<Point | null>(null);

  const drawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const previewSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [draggedWholeLine, setDraggedWholeLine] = useState<boolean>(false);
  const dragStartOffsetRef = useRef<{timeOffset: number, valueOffset: number} | null>(null);


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

  // Volatility Chart
  const volChartRef = useRef<HTMLDivElement>(null);
  const volChartInstance = useRef<IChartApi | null>(null);
  const volLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Secondary (Comparison) Chart 
  const [secondarySymbol, setSecondarySymbol] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const secondaryChartRef = useRef<IChartApi | null>(null);
  const secondarySeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Price targets displayed above the graph
  const [show50dmaTarget, setShow50dmaTarget] = useState(false);
  const [showFibTarget, setShowFibTarget] = useState(false);
  const [priceTargets, setPriceTargets] = useState<{
    reversion_target?: number;
    deviation_pct?: number;
    fib_1_618?: number;
    fib_direction?: "up" | "down";
  }>({});

  const [overlayData, setOverlayData] = useState<{
    three_year_ma?: { time: number; value: number }[];
    dma_50?: { time: number; value: number }[];
    mace?: { time: number; value: number }[];
    mean_rev_50dma?: { time: number; value: number }[];
    mean_rev_200dma?: { time: number; value: number }[];
    mean_rev_3yma?: { time: number; value: number }[];
    rsi?: { time: number; value: number }[];
    rsi_ma_14?: { time: number; value: number }[];
    volatility?: { time: number; value: number }[];
    bb_middle?: { time: number; value: number }[];
    bb_upper?: { time: number; value: number }[];
    bb_lower?: { time: number; value: number }[];
  }>({});
  
  // Checkboxes to add for overlay 
  const [showBollingerBand, setShowBollingerBand] = useState(false);

  
  // Natural_Gas_stocks
  const NATURAL_GAS_STOCKS = ["AR", "RRC", "BIR.TO", "YGR.TO", "VET", "PR", "ROKRF", "STO.AX",];

  // Oil stocks 
  const OIL_STOCKS = ["COP", "CRGY", "OVV", "IPOOF", "SM", "SGY", "APA", "CIVI", "PBR", "MTDR", 
    "TALO", "DVN", "OXY", "VTLE", "BTE", "FANG", "XOM", "MPC", "VLO", "DK", "DINO", "CVI",
    "EQNR", "TXP", "BNE", 
  ]

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

  const drawingsRef = useRef(drawings);

  usePreviewManager(
    chartRef,
    drawingModeRef,
    lineBufferRef,
    hoverPoint,
    previewSeriesRef,
    sixPointHoverLineRef,
    moveEndpointFixedRef 
  );

  useDrawingRenderer(chartRef, drawings, drawnSeriesRef, dotLabelSeriesRef);

  useClickHandler(
    chartRef,
    candleSeriesRef,
    chartContainerRef,
    drawingModeRef,
    lineBufferRef,
    setDrawings,
    setHoverPoint,
    hoverPoint,
    previewSeriesRef,
    sixPointDotPreviewRef,
    sixPointPreviewRef,
    sixPointHoverLineRef,
    drawings,
    selectedDrawingIndex,
    setSelectedDrawingIndex,
    draggedEndpoint,      
    setDraggedEndpoint,      
    moveEndpointFixedRef 
  );

  const resetMeanRevLimits = () => {
    const chart = meanRevChartInstance.current;
    if (chart && meanRevLimitSeries.current.length > 0) {
      meanRevLimitSeries.current.forEach((series) => chart.removeSeries(series));
    }

    meanRevLimitSeries.current = [];
    setMeanRevLimitLines([]);
    limitDrawingModeRef.current = false;
    setLimitDrawingMode(false);
  };

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

  function syncCrosshair(
      sourceChart: IChartApi,
      sourceSeries: ISeriesApi<"Line"> | ISeriesApi<"Candlestick">,
      time: UTCTimestamp
    ) {
      const allCharts: [IChartApi | null, ISeriesApi<any> | null][] = [
        [chartRef.current, candleSeriesRef.current],
        [meanRevChartInstance.current, meanRevLineRef.current],
        [rsiChartInstance.current, rsiLineRef.current],
        [volChartInstance.current, volLineRef.current],
      ];
    
      for (const [chart, series] of allCharts) {
        if (!chart || !series || chart === sourceChart) continue;
        const snapped = findClosestTime(series, time);
        if (snapped != null) {
          chart.setCrosshairPosition(0, snapped, series);
        }
      }
  }

  function drawInitialMeanRevLimits(lower: number, upper: number) {
    const chart = meanRevChartInstance.current;
    if (!chart) return;

    const baseTime = Math.floor(Date.now() / 1000) as UTCTimestamp;
    const earliestTime = (baseTime - 5 * 365 * 86400) as UTCTimestamp;
    const latestTime = (baseTime + 5 * 365 * 86400) as UTCTimestamp;

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
    });

    setMeanRevLimitLines([upper, lower]);
  }

  // Utility: Min distance from point to line segment (p1, p2)
  function pointToSegmentDistance(point: Point, p1: Point, p2: Point) {
    const x = point.time, y = point.value;
    const x1 = p1.time, y1 = p1.value;
    const x2 = p2.time, y2 = p2.value;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }


  function handleDeleteDrawing() {
    if (selectedDrawingIndex === null) return;

    // Remove from drawings array (immutable update)
    setDrawings((prev) => prev.filter((_, idx) => idx !== selectedDrawingIndex));

    // Remove the rendered series from the chart
    const series = drawnSeriesRef.current.get(selectedDrawingIndex);
    if (series) {
      chartRef.current?.removeSeries(series);
      drawnSeriesRef.current.delete(selectedDrawingIndex);
    }

    // Also remove any dot labels, if used (6-point, etc)
    dotLabelSeriesRef.current.delete(selectedDrawingIndex);

    // Deselect
    setSelectedDrawingIndex(null);
  }


  /*
    CREATE CHARTS
  */
  useEffect(() => {
    // 🧹 Reset drawing state to prevent bugs on ticker switch
    drawingModeRef.current = null;
    lineBufferRef.current = [];
    setDrawings([]);
    drawnSeriesRef.current.clear();
    dotLabelSeriesRef.current.clear();
    setShow50dmaTarget(false);
    setShowFibTarget(false);
    setSecondarySymbol(null);

    // 🧹 Reset mean reversion bounds
    resetMeanRevLimits();

    // --- Preload mean reversion band lines from backend ---
    const fetchInitialTargets = async () => {
      try {
        const res = await fetch(`http://localhost:8000/price_targets/${stockSymbol}`);
        const json = await res.json();

        // Defensive checks
        const mean_rev_targets = json.price_targets?.mean_reversion ?? {};
        const fib_targets = json.price_targets?.fibonacci ?? {};

        if (
          typeof mean_rev_targets.deviation_band_pct_lower === "number" &&
          typeof mean_rev_targets.deviation_band_pct_upper === "number"
        ) {
          const lower = mean_rev_targets.deviation_band_pct_lower;
          const upper = mean_rev_targets.deviation_band_pct_upper;
          drawInitialMeanRevLimits(lower, upper);
        }

        setPriceTargets({
          reversion_target: mean_rev_targets.reversion_projected_target_price,
          deviation_pct: mean_rev_targets.deviation_band_pct_upper,
          fib_1_618: fib_targets["fib_1.618_up"] ?? fib_targets["fib_1.618_down"],
          fib_direction: fib_targets["fib_1.618_up"] ? "up" : fib_targets["fib_1.618_down"] ? "down" : undefined,
        });
      } catch (err) {
        setPriceTargets({}); // Always reset on failure
        console.error("❌ Failed to fetch price targets", err);
      }
    };

    fetchInitialTargets();


    if (!stockSymbol || !chartContainerRef.current || !meanRevChartRef.current || !rsiChartRef.current || !volChartRef.current) return;

    chartContainerRef.current.innerHTML = "";
    meanRevChartRef.current.innerHTML = "";
    rsiChartRef.current.innerHTML = "";
    volChartRef.current.innerHTML = "";



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
        rightOffset: 2,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: {
      pressedMouseMove: true,     // ADDED for drag to scroll anywhere
      mouseWheel: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      axisDoubleClickReset: true,
      mouseWheel: true,
      pinch: true,
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

    const rsiLine = rsiChart.addSeries(LineSeries, {
      color: "#f44336",
      lineWidth: 1,
    });
    rsiLine.setData([
      { time: Date.now() / 1000 as UTCTimestamp, value: 50 }, // Mid-band dummy
    ]);
    rsiLineRef.current = rsiLine;   


    

    // Volatility Chart 
    const volChart = createChart(volChartRef.current, {
      width: volChartRef.current.clientWidth,
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

    volChartInstance.current = volChart;
    
    const volLine = volChart.addSeries(LineSeries, {
      color: "#795548", // brown-ish for volatility
      lineWidth: 1,
    });
    volLine.setData([{ time: Date.now() / 1000 as UTCTimestamp, value: 0 }]);
    volLineRef.current = volLine;
    

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
      safeSetVisibleRange(volChartInstance.current, range);
    });

    meanRevChartInstance.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(rsiChartInstance.current, range);
      safeSetVisibleRange(volChartInstance.current, range);
    });

    rsiChartInstance.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(meanRevChartInstance.current, range);
      safeSetVisibleRange(volChartInstance.current, range);
    });

    volChartInstance.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(meanRevChartInstance.current, range);
      safeSetVisibleRange(rsiChartInstance.current, range);
    });



  
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect) {
          chart.resize(entry.contentRect.width, 400);
          meanChart.resize(entry.contentRect.width, 200);
          rsiChart.resize(entry.contentRect.width, 150);     
          volChart.resize(entry.contentRect.width, 150);
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

    chart.timeScale().fitContent();
    
    // deletion of trendline
    chart.subscribeClick((param) => {
      console.log("✅ Chart click event triggered:", param);

      if (!param.point || !param.time) {
        console.log("❌ No point or time on click event");
        return;
      }

      const time = param.time as UTCTimestamp;
      const price = candleSeries.coordinateToPrice(param.point.y);

      if (price == null) {
        console.log("❌ Could not convert point.y to price", param.point.y);
        return;
      }

      console.log("🕰️ Click at time:", time, "price:", price);

      // Debug: Show all drawings
      const currentDrawings = drawingsRef.current;
      console.log("Current drawings:", currentDrawings);

      let foundIndex: number | null = null;
      currentDrawings.forEach((drawing, idx) => {
        if (drawing.type === "line" && drawing.points.length === 2) {
          const clickPoint = { time, value: price };
          const dist = pointToSegmentDistance(clickPoint, drawing.points[0], drawing.points[1]);
          console.log(`[${idx}] Line drawing, dist to click:`, dist);
          // Try with a larger threshold temporarily for debug!
          if (dist < 1) {
            console.log(`🎯 Found close line at index ${idx}, selecting`);
            foundIndex = idx;
          }
        }
      });

      if (foundIndex !== null) {
        setSelectedDrawingIndex(foundIndex);
        console.log("✅ setSelectedDrawingIndex:", foundIndex);
      } else {
        setSelectedDrawingIndex(null);
        console.log("No drawing selected.");
      }
    });


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
      const volChart = volChartInstance.current;
      const volSeries = volLineRef.current;

      const secondaryChart = secondaryChartRef.current;
      const secondarySeries = secondarySeriesRef.current;

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

      if (volChart && volSeries) {
        const snappedTime = findClosestTime(volSeries, time);
        if (snappedTime) {
          volChart.setCrosshairPosition(0, snappedTime, volSeries);
        }
      }

      if (secondaryChart && secondarySeries) {
        const snappedTime = findClosestTime(secondarySeries, time);
        if (snappedTime) {
          secondaryChart.setCrosshairPosition(0, snappedTime, secondarySeries);
        }
      }
      
      
    });
    
    // SYNC CROSS HAIRS 
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
      const time = param.time as UTCTimestamp;
      if (candleSeriesRef.current) {
        syncCrosshair(chart, candleSeriesRef.current, time);
      }
    });
    
    meanChart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
      const time = param.time as UTCTimestamp;
      if (meanRevLineRef.current) {
        syncCrosshair(meanChart, meanRevLineRef.current, time);
      }
    });
    
    rsiChart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
      const time = param.time as UTCTimestamp;
      if (rsiLineRef.current) {
        syncCrosshair(rsiChart, rsiLineRef.current, time);
      }
    });
    
    volChart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
      const time = param.time as UTCTimestamp;
      if (volLineRef.current) {
        syncCrosshair(volChart, volLineRef.current, time);
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
      volChart.remove();
      resizeObserver.disconnect();

      // Reset the refs
      chartRef.current = null;
      meanRevChartInstance.current = null;
      rsiChartInstance.current = null;
      rsiLineRef.current = null;
      volChartInstance.current = null;
      volLineRef.current = null;
      meanRevLineRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [stockSymbol]);

  useWebSocketData(stockSymbol, candleSeriesRef, timeframe);
  /*
    DRAWINGS
  */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    drawingsRef.current = drawings;
  }, [drawings, selectedDrawingIndex, draggedWholeLine]);

  /*
    CALLING BACKEND FOR OVERLAY DATA 
  */
  useEffect(() => {
    const fetchOverlayData = async () => {
      try {
        const res = await fetch(`http://localhost:8000/overlay_data/${stockSymbol}?timeframe=${timeframe}`);
        const data = await res.json();
        setOverlayData(data);
      } catch (err) {
        console.error("Failed to fetch overlay data", err);
      }
    };
  
    fetchOverlayData();
  }, [stockSymbol, timeframe]);

  /*
    CHECKBOX AND OVERLAY'S USEEFFECT 
  */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !showBollingerBand) return;

    const colors = {
      bb_middle: "#2962FF",  // blue
      bb_upper: "#F23645",   // red
      bb_lower: "#089981",   // green
    };

    const refs: Record<string, ISeriesApi<"Line">> = {};

    (["bb_middle", "bb_upper", "bb_lower"] as const).forEach((key) => {
      const data = overlayData[key];
      if (!data) return;

      const series = chart.addSeries(LineSeries, {
        color: colors[key],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      series.setData(data.map((d) => ({
        time: d.time as UTCTimestamp,
        value: d.value,
      })));

      refs[key] = series;
    });

    return () => {
      Object.values(refs).forEach(series => {
        if (series) chart.removeSeries(series);
      });

    };
  }, [showBollingerBand, overlayData.bb_middle, overlayData.bb_upper, overlayData.bb_lower]);



  /*
    MEAN REV CHART'S USEEFFECT 
  */
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
  
    (["mean_rev_50dma", "mean_rev_200dma", "mean_rev_3yma"] as const).forEach((key, idx) => {
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
    
      if (idx === 0) {
        meanRevLineRef.current = series; // ✅ use the first one for syncing
      }
    });
    
  }, [
    overlayData.mean_rev_50dma,
    overlayData.mean_rev_200dma,
    overlayData.mean_rev_3yma,
  ]);
  
  /*
    RSI CHART'S USEEFFECT 
  */
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
      color: "#7E57C2",
    };
  
     // --- RSI Line ---
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

    // --- MA14 Overlay ---
    if (overlayData.rsi_ma_14) {
      const ma14Series = chart.addSeries(LineSeries, {
        color: "#009688",  // teal
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      ma14Series.setData(
        overlayData.rsi_ma_14.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        }))
      );
    }
    
  }, [overlayData.rsi]);

  /*
    VOLATILITY CHART'S USEEFFECT 
  */
  useEffect(() => {
    const chart = volChartInstance.current;
    if (!chart) return;

    if (volLineRef.current) {
      chart.removeSeries(volLineRef.current);
      volLineRef.current = null;
    }

    if (!overlayData.volatility) return;

    // Line overlay for BBWP (percentile line)
    const bbwpLine = chart.addSeries(LineSeries, {
      color: "#8d6e63", // brown
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    bbwpLine.setData(
      overlayData.volatility.map((d) => ({
        time: d.time as UTCTimestamp,
        value: d.value,
      }))
    );
    volLineRef.current = bbwpLine;

    // Vertical bars
    const histogramSeries = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      color: "#aaa",
      base: 0,
    });

    const histogramData = overlayData.volatility.map((point) => {
      const { time, value } = point;
      return {
        time: time as UTCTimestamp,
        value: 100,
        color: value >= 90 ? "#f44336" : value <= 10 ? "#2196f3" : "rgba(0,0,0,0)", // red, blue, or invisible
      };
    });

    histogramSeries.setData(histogramData);

  }, [overlayData.volatility]);
  
  /*
    MOUSE DOWN USEEFFECT 
  */
  useEffect(() => {
    const chartDiv = chartContainerRef.current;
    if (!chartDiv) return;

    function handleMouseDown(e: MouseEvent) {
      if (selectedDrawingIndex === null || !chartDiv) return;
      // Only start dragging if not clicking on endpoint!
      if (draggedEndpoint) return;

      // Calculate the click's time/price on chart
      const boundingRect = chartDiv.getBoundingClientRect();
      const x = e.clientX - boundingRect.left;
      const y = e.clientY - boundingRect.top;
      if (!chartRef.current || !candleSeriesRef.current) return;
      const time = chartRef.current.timeScale().coordinateToTime(x);
      const price = candleSeriesRef.current.coordinateToPrice(y);
      if (typeof time !== "number" || typeof price !== "number") return;

      // Get selected drawing
      const drawing = drawingsRef.current[selectedDrawingIndex];
      if (!drawing || drawing.type !== "line" || drawing.points.length !== 2) return;

      // Compute offset between mouse and first point
      dragStartOffsetRef.current = {
        timeOffset: time - drawing.points[0].time,
        valueOffset: price - drawing.points[0].value,
      };

      setDraggedWholeLine(true);
      e.preventDefault();
    }

    chartDiv.addEventListener("mousedown", handleMouseDown);

    return () => chartDiv.removeEventListener("mousedown", handleMouseDown);
  }, [selectedDrawingIndex, draggedEndpoint]);
  /*
    MOUSE UP USEEFFECT 
  */
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!draggedWholeLine || selectedDrawingIndex === null) return;
      if (!chartRef.current || !candleSeriesRef.current) return;

      const chartDiv = chartContainerRef.current;
      if (!chartDiv) return;

      const boundingRect = chartDiv.getBoundingClientRect();
      const x = e.clientX - boundingRect.left;
      const y = e.clientY - boundingRect.top;
      const time = chartRef.current.timeScale().coordinateToTime(x);
      const price = candleSeriesRef.current.coordinateToPrice(y);
      if (typeof time !== "number" || typeof price !== "number") return;

      const drawing = drawingsRef.current[selectedDrawingIndex];
      if (!drawing || drawing.type !== "line" || drawing.points.length !== 2) return;

      // Compute delta from original offset
      const offset = dragStartOffsetRef.current;
      if (!offset) return;
      const timeDelta = time - drawing.points[0].time - offset.timeOffset;
      const valueDelta = price - drawing.points[0].value - offset.valueOffset;

      // Move both points by the delta
      const newPoints = drawing.points.map(pt => ({
        time: pt.time + timeDelta as UTCTimestamp,
        value: pt.value + valueDelta,
      }));

      // Update drawing
      setDrawings(prev =>
        prev.map((d, idx) =>
          idx === selectedDrawingIndex ? { ...d, points: newPoints } : d
        )
      );
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [draggedWholeLine, selectedDrawingIndex]);
  /*
    On Mouse Up, End the Move USEEFFECT
  */
  useEffect(() => {
    function handleMouseUp() {
      if (draggedWholeLine) {
        setDraggedWholeLine(false);
        dragStartOffsetRef.current = null;
      }
    }
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [draggedWholeLine]);

  return (
    <div className="position-relative bg-white p-3 shadow-sm rounded border">

      <h5 className="fw-bold mb-3 text-dark">📈 {timeframe.toUpperCase()} Candlestick Chart</h5>

        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          {/* Left side: drawing tools */}
          <div className="toolbar d-flex gap-2">
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
              1→5
            </button>
            {selectedDrawingIndex !== null && (
              <button
                className="btn btn-sm btn-danger"
                onClick={handleDeleteDrawing}
                title="Delete Selected Drawing"
              >
                🗑️ Delete
              </button>
            )}

            <button
              onClick={resetChart}
              className="tool-button"
              title="Reload Chart"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          {/* === Middle: Price Target Buttons === */}
          {(typeof priceTargets.reversion_target === "number" || typeof priceTargets.fib_1_618 === "number") && (
            <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
              <div className="fw-bold text-muted"> Price Targets:</div>

              {priceTargets.reversion_target && (
                <div className="position-relative">
                  <button
                    className="btn btn-sm btn-outline-dark"
                    onClick={() => setShow50dmaTarget((v) => !v)}
                  >
                    50DMA Target
                  </button>
                  {show50dmaTarget && (
                    <div className="position-absolute bg-white border shadow-sm p-2 rounded small mt-1" style={{ zIndex: 10 }}>
                      <div><strong>${priceTargets.reversion_target}</strong></div>
                      <div className="text-muted">({priceTargets.deviation_pct}% above 50DMA)</div>
                    </div>
                  )}
                </div>
              )}

              {priceTargets.fib_1_618 && (
                <div className="position-relative">
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setShowFibTarget((v) => !v)}
                  >
                    Fib 1.618x
                  </button>
                  {showFibTarget && (
                    <div className="position-absolute bg-white border shadow-sm p-2 rounded small mt-1" style={{ zIndex: 10 }}>
                      <div><strong>${priceTargets.fib_1_618}</strong></div>
                      <div className="text-muted">
                        ({priceTargets.fib_direction === "up" ? "↑" : "↓"} 1.618 extension)
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Right side: timeframe toggle */}
          <div className="btn-group">
            {["daily", "weekly", "monthly"].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf as "daily" | "weekly" | "monthly")}
                className={`btn btn-sm ${timeframe === tf ? "btn-primary" : "btn-outline-secondary"}`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

      
        <div className="indicator-panel d-flex flex-column gap-2 mt-3">
          <label><input type="checkbox" checked={showBollingerBand} onChange={() => setShowBollingerBand(v => !v)} /> Bollinger Band</label>
        </div>

        {/* === Main Chart === */}
        <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />

        {/* === Add Secondary Chart Button === */}
        <div style={{ position: "relative", width: "100%", minHeight: "10px" }}>
          <div style={{ position: "absolute", bottom: "0", right: "0" }}>
            {secondarySymbol === null ? (
              <>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setShowDropdown((prev) => !prev)}
                  title="Add Comparison Chart"
                  style={{ padding: "4px 6px", lineHeight: 1 }}
                >
                  <PlusCircle size={16} />
                </button>


                {showDropdown && (
                  <div className="dropdown-menu show p-2 mt-2" style={{ minWidth: "200px" }}>
                    <div className="mb-2 fw-bold">Popular</div>
                    {["GOLD", "SILVER", "USOIL", "BTC"].map((s) => (
                      <div
                        key={s}
                        onClick={() => {
                          setSecondarySymbol(s);
                          setShowDropdown(false);
                        }}
                        className="dropdown-item cursor-pointer"
                      >
                        {s}
                      </div>
                    ))}
                    <hr />
                    <input
                      className="form-control"
                      placeholder="Search ticker..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = (e.target as HTMLInputElement).value.toUpperCase().trim();
                          if (val) {
                            setSecondarySymbol(val);
                            setShowDropdown(false);
                          }
                        }
                      }}
                    />
                  </div>
                )}
              </>
            ) : (
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={() => setSecondarySymbol(null)}
                title="Remove Comparison Chart"
                style={{ padding: "4px 6px", lineHeight: 1 }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {secondarySymbol && (
          <div className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <div className="fw-bold text-muted">{stockSymbol} / {secondarySymbol} Ratio</div>
            </div>
            <SecondaryChart
              primarySymbol={stockSymbol}
              comparisonSymbol={secondarySymbol}
              chartRef={secondaryChartRef}
              seriesRef={secondarySeriesRef}
            />

          </div>
        )}    


        {/* === Mean Reversion Chart === */}
        <div className="mt-4">
          <div className="d-flex align-items-center gap-2 mb-1">
            <div className="fw-bold text-muted">📊 50 Day Mean Reversion</div>
            <button
              onClick={() => {
                const chart = meanRevChartInstance.current;

                if (meanRevLimitLines.length > 0) {
                  // 🧹 Reset mean reversion bounds
                  resetMeanRevLimits();
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
          </div>
        <div ref={meanRevChartRef} style={{ width: "100%", height: "200px" }} />
        </div>

            

        {/* === RSI Chart === */}
        <div className="mt-4">
          <div className="fw-bold text-muted mb-1">📉 RSI Indicator</div>
          <div ref={rsiChartRef} style={{ width: "100%", height: "150px" }} />
          {/* 🏷️ RSI Chart Legend */}
            <div className="d-flex flex-wrap mt-1">
              {[
                { color: "#7E57C2", label: "RSI (14-day)" },
                { color: "#009688", label: "14-Day Moving Average (Price)" },
              ].map(({ color, label }) => (
                <div key={label} className="me-3 d-flex align-items-center small">
                  <span
                    style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      backgroundColor: color,
                      marginRight: "6px",
                      borderRadius: "2px",
                    }}
                  />
                  <span>{label}</span>
                </div>
              ))}
            </div>
        </div>

        {/* === Volatility Chart === */}
        <div className="mt-4">
          <div className="fw-bold text-muted mb-1">📈 Volatility (BBWP)</div>
          <div ref={volChartRef} style={{ width: "100%", height: "150px" }} />
        </div>
              
        {/* === Overlay Grid === */}
        {overlayData && <OverlayGrid overlayData={overlayData} />}

        {/* === Models (Pictures) === */}
        {NATURAL_GAS_STOCKS.includes(stockSymbol?.toUpperCase() ?? "") && (
          <>
            {/* === Natural Gas Model Header === */}
            <h2 className="fw-bold my-4 text-center" style={{ fontSize: "2rem", letterSpacing: "1px" }}>
              Natural Gas Model
            </h2>
            {/* === Pictures === */}
            <S3Gallery folder="natgas"/>
          </>
        )}
        {OIL_STOCKS.includes(stockSymbol?.toUpperCase() ?? "") && (
          <>
            {/* === Oil Model Header === */}
            <h2 className="fw-bold my-4 text-center" style={{ fontSize: "2rem", letterSpacing: "1px" }}>
              Oil Model
            </h2>
            {/* === Pictures === */}
            <S3Gallery folder="oil"/>
          </>
        )}

    </div>
  );
};

export default StockChart;