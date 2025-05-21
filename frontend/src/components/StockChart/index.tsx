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
import { getTradingViewUrl } from "../../utils";

import {
  StockChartProps,
} from "./types";

import { useWebSocketData } from "./useWebSocketData";

import { useDrawingManager } from "./DrawingManager";

import { usePreviewManager } from "./PreviewManager";

import { useDrawingRenderer } from "./DrawingRenderer";

import { useClickHandler } from "./ClickHandler";

import OverlayGrid from "./OverlayGrid";

import SecondaryChart from "./SecondaryChart";



const StockChart = ({ stockSymbol }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sixPointPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const dotLabelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(new Map());
  const sixPointDotPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sixPointHoverLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("weekly");


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
    reversion_upper_target?: number;
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
        [secondaryChartRef.current, secondarySeriesRef.current],
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


  useEffect(() => {
    // 🧹 Reset drawing state to prevent bugs on ticker switch
    drawingModeRef.current = null;
    lineBufferRef.current = [];
    setDrawings([]);
    drawnSeriesRef.current.clear();
    dotLabelSeriesRef.current.clear();

    // 🧹 Reset mean reversion bounds
    resetMeanRevLimits();

    // --- Preload mean reversion band lines from backend ---
    const fetchInitialTargets = async () => {
      try {
        const res = await fetch(`http://localhost:8000/price_targets/${stockSymbol}`);
        const json = await res.json();
        const targets = json.price_targets;

        if (targets.deviation_band_pct_lower && targets.deviation_band_pct_upper) {
          const lower = targets.deviation_band_pct_lower;
          const upper = targets.deviation_band_pct_upper;
          drawInitialMeanRevLimits(lower, upper);
        }
        // Store price target info for floating buttons
        setPriceTargets({
          reversion_upper_target: targets.reversion_upper_target,
          deviation_pct: targets.typical_deviation_band_pct,
          fib_1_618: targets["fib_1.618_up"] || targets["fib_1.618_down"],
          fib_direction: targets["fib_1.618_up"] ? "up" : "down",
        });
      } catch (err) {
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
      safeSetVisibleRange(secondaryChartRef.current, range);

    });

    meanRevChartInstance.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(rsiChartInstance.current, range);
      safeSetVisibleRange(volChartInstance.current, range);
      safeSetVisibleRange(secondaryChartRef.current, range);

    });

    rsiChartInstance.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(meanRevChartInstance.current, range);
      safeSetVisibleRange(volChartInstance.current, range);
      safeSetVisibleRange(secondaryChartRef.current, range);

    });

    volChartInstance.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(meanRevChartInstance.current, range);
      safeSetVisibleRange(rsiChartInstance.current, range);
      safeSetVisibleRange(secondaryChartRef.current, range);

    });

    secondaryChartRef.current?.timeScale().subscribeVisibleTimeRangeChange((range) => {
      safeSetVisibleRange(chartRef.current, range);
      safeSetVisibleRange(meanRevChartInstance.current, range);
      safeSetVisibleRange(rsiChartInstance.current, range);
      safeSetVisibleRange(volChartInstance.current, range);
    });


  
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect) {
          chart.resize(entry.contentRect.width, 400);
          meanChart.resize(entry.contentRect.width, 200);
          rsiChart.resize(entry.contentRect.width, 150);     
          volChart.resize(entry.contentRect.width, 150);
          if (secondaryChartRef.current) {
            secondaryChartRef.current.resize(entry.contentRect.width, 400); // 🆕
          }
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
        color: "#FFD700", // navy blue
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

            <button
              onClick={resetChart}
              className="tool-button"
              title="Reload Chart"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          {/* === Middle: Price Target Buttons === */}
          {(priceTargets.reversion_upper_target || priceTargets.fib_1_618) && (
            <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
              <div className="fw-bold text-muted"> Price Targets:</div>

              {priceTargets.reversion_upper_target && (
                <div className="position-relative">
                  <button
                    className="btn btn-sm btn-outline-dark"
                    onClick={() => setShow50dmaTarget((v) => !v)}
                  >
                    50DMA Target
                  </button>
                  {show50dmaTarget && (
                    <div className="position-absolute bg-white border shadow-sm p-2 rounded small mt-1" style={{ zIndex: 10 }}>
                      <div><strong>${priceTargets.reversion_upper_target}</strong></div>
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
              <div className="fw-bold text-muted">📉 {secondarySymbol} Price Chart</div>
            </div>
            <SecondaryChart
              symbol={secondarySymbol}
              timeframe={timeframe}
              chartRef={secondaryChartRef}
              seriesRef={secondarySeriesRef}
              onCrosshairMove={(time) => {
                // Sync all other charts when crosshair moves on secondary
                if (secondarySeriesRef.current) {
                  syncCrosshair(secondaryChartRef.current!, secondarySeriesRef.current, time);
                }
                
              }}
              onVisibleRangeChange={(range) => {
                const safeSetVisibleRange = (chart: IChartApi | null, r: typeof range) => {
                  try {
                    chart?.timeScale()?.setVisibleRange(r);
                  } catch (err) {
                    console.warn("⛔ setVisibleRange failed", err);
                  }
                };

                safeSetVisibleRange(chartRef.current, range);
                safeSetVisibleRange(meanRevChartInstance.current, range);
                safeSetVisibleRange(rsiChartInstance.current, range);
                safeSetVisibleRange(volChartInstance.current, range);
              }}
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
              { color: "#FFD700", label: "14-Day Moving Average (Price)" },
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

      

    </div>
  );
};

export default StockChart;