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
  AreaSeries,
  PriceScaleMode,
  LineType,
} from "lightweight-charts";
import { JSX, useEffect, useRef, useState } from "react";
import { Ruler, Minus, RotateCcw, ArrowUpDown } from "lucide-react";
import { StockChartProps, Point, CopyTrendlineBuffer } from "./types";
import { useWebSocketData } from "./useWebSocketData";
import { useMainChartData } from "./useMainChartData";
import { useDrawingManager } from "./DrawingManager";
import { usePreviewManager } from "./PreviewManager";
import { useDrawingRenderer } from "./DrawingRenderer";
import { useClickHandler } from "./ClickHandler";
import OverlayGrid from "./OverlayGrid";
import SecondaryChart from "./SecondaryChart";
import S3Gallery from "../S3Gallery";
import GraphingChart from "./GraphingChart";

const StockChart = ({ stockSymbol, peersOverride }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sixPointPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const dotLabelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(
    new Map()
  );
  const sixPointDotPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sixPointHoverLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">(
    "weekly"
  );

  // Drawings
  const [selectedDrawingIndex, setSelectedDrawingIndex] = useState<
    number | null
  >(null);
  const [draggedEndpoint, setDraggedEndpoint] = useState<
    "start" | "end" | null
  >(null);
  const moveEndpointFixedRef = useRef<Point | null>(null);

  const drawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const previewSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // New Graphing Chart
  const [showGraphing, setShowGraphing] = useState(false);

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

  // Mansfield RS Chart
  const mansfieldChartRef = useRef<HTMLDivElement>(null);
  const mansfieldChartInstance = useRef<IChartApi | null>(null);
  const mansfieldLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Volatility Chart
  const volChartRef = useRef<HTMLDivElement>(null);
  const volChartInstance = useRef<IChartApi | null>(null);
  const volLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Momentum Chart (Oliver's Momentum)
  const momentumChartRef = useRef<HTMLDivElement>(null);
  const momentumChartInstance = useRef<IChartApi | null>(null);
  const momentumPriceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const momentumSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Momentum chart drawings
  const [momentumSelectedDrawingIndex, setMomentumSelectedDrawingIndex] =
    useState<number | null>(null);
  const [momentumDraggedEndpoint, setMomentumDraggedEndpoint] = useState<
    "start" | "end" | null
  >(null);
  const momentumMoveEndpointFixedRef = useRef<Point | null>(null);

  const momentumDrawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(
    new Map()
  );
  const momentumPreviewSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const momentumDotLabelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(
    new Map()
  );
  const momentumSixPointPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const momentumSixPointDotPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const momentumSixPointHoverLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const momentumCopyBufferRef = useRef<CopyTrendlineBuffer | null>(null);

  // Peer comparison charts
  const [peerSymbols, setPeerSymbols] = useState<string[]>([]);
  // Ratio chart refs for crosshair sync
  const ratioChartRefs = useRef<(IChartApi | null)[]>([]);
  const ratioSeriesRefs = useRef<(ISeriesApi<"Line"> | null)[]>([]);
  const ratioRangeUnsubs = useRef<(() => void)[]>([]);

  // Price targets displayed above the graph
  const [show50dmaTarget, setShow50dmaTarget] = useState(false);
  const [showFibTarget, setShowFibTarget] = useState(false);
  const [priceTargets, setPriceTargets] = useState<{
    reversion_target?: number;
    deviation_pct?: number;
    fib_1_618?: number;
    fib_direction?: "up" | "down";
  }>({});

  const [divergence, setDivergence] = useState<{
    daily?: string;
    weekly?: string;
    monthly?: string;
  }>({});

  const [overlayData, setOverlayData] = useState<{
    three_year_ma?: { time: number; value: number }[];
    dma_50?: { time: number; value: number }[];
    mace?: { time: number; value: number }[];
    mean_rev_50dma?: { time: number; value: number }[];
    rsi?: { time: number; value: number }[];
    rsi_ma_14?: { time: number; value: number }[];
    rsi_upper_band?: { time: number; value: number }[];
    rsi_middle_band?: { time: number; value: number }[];
    rsi_lower_band?: { time: number; value: number }[];
    volatility?: { time: number; value: number }[];
    volatility_ma_5?: { time: number; value: number }[];
    bb_middle?: { time: number; value: number }[];
    bb_upper?: { time: number; value: number }[];
    bb_lower?: { time: number; value: number }[];
    price_line?: { time: number; value: number }[];
    momentum_90?: { time: number; value: number }[];
    mansfield_rs?: { time: number; value: number }[];
  }>({});

  const [momentumData, setMomentumData] = useState<
    {
      time: number;
      value: number;
    }[]
  >([]);

  // Checkboxes to add for overlay
  const [showBollingerBand, setShowBollingerBand] = useState(false);

  // Natural_Gas_stocks
  const NATURAL_GAS_STOCKS = [
    "AR",
    "RRC",
    "BIR.TO",
    "YGR.TO",
    "VET",
    "PR",
    "ROKRF",
    "STO.AX",
  ];

  // Oil stocks
  const OIL_STOCKS = [
    "COP",
    "CRGY",
    "OVV",
    "IPOOF",
    "SM",
    "SGY",
    "APA",
    "CIVI",
    "PBR",
    "MTDR",
    "TALO",
    "DVN",
    "OXY",
    "VTLE",
    "BTE",
    "FANG",
    "XOM",
    "MPC",
    "VLO",
    "DK",
    "DINO",
    "CVI",
    "EQNR",
    "TXP",
    "BNE",
  ];

  // Healthcare stocks
  const HEALTHCARE_STOCKS = ["ARKG", "LLY", "NVO", "MRNA"];

  // Copper stocks
  const COPPER_STOCKS = ["FCX", "SCCO", "HBM", "COPX", "CPER"];

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
  const copyBufferRef = useRef<CopyTrendlineBuffer | null>(null);

  usePreviewManager(
    chartRef,
    drawingModeRef,
    lineBufferRef,
    hoverPoint,
    previewSeriesRef,
    sixPointHoverLineRef,
    moveEndpointFixedRef,
    copyBufferRef
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
    moveEndpointFixedRef,
    copyBufferRef
  );

  const {
    drawingModeRef: momentumDrawingModeRef,
    lineBufferRef: momentumLineBufferRef,
    drawings: momentumDrawings,
    setDrawings: setMomentumDrawings,
    hoverPoint: momentumHoverPoint,
    setHoverPoint: setMomentumHoverPoint,
    toggleMode: momentumToggleMode,
    resetChart: momentumResetChart,
    clearDrawings: momentumClearDrawings,
  } = useDrawingManager(
    momentumChartInstance,
    momentumPreviewSeriesRef,
    momentumSixPointPreviewRef,
    momentumSixPointHoverLineRef,
    momentumDotLabelSeriesRef,
    momentumDrawnSeriesRef
  );
  const momentumDrawingsRef = useRef(momentumDrawings);

  usePreviewManager(
    momentumChartInstance,
    momentumDrawingModeRef,
    momentumLineBufferRef,
    momentumHoverPoint,
    momentumPreviewSeriesRef,
    momentumSixPointHoverLineRef,
    momentumMoveEndpointFixedRef,
    momentumCopyBufferRef
  );

  useDrawingRenderer(
    momentumChartInstance,
    momentumDrawings,
    momentumDrawnSeriesRef,
    momentumDotLabelSeriesRef
  );

  useClickHandler(
    momentumChartInstance,
    momentumPriceSeriesRef,
    momentumChartRef,
    momentumDrawingModeRef,
    momentumLineBufferRef,
    setMomentumDrawings,
    setMomentumHoverPoint,
    momentumHoverPoint,
    momentumPreviewSeriesRef,
    momentumSixPointDotPreviewRef,
    momentumSixPointPreviewRef,
    momentumSixPointHoverLineRef,
    momentumDrawings,
    momentumSelectedDrawingIndex,
    setMomentumSelectedDrawingIndex,
    momentumDraggedEndpoint,
    setMomentumDraggedEndpoint,
    momentumMoveEndpointFixedRef,
    momentumCopyBufferRef
  );

  const resetMeanRevLimits = () => {
    const chart = meanRevChartInstance.current;
    if (chart) {
      meanRevLimitSeries.current.forEach((series) => {
        if (series) {
          try {
            chart.removeSeries(series);
          } catch (err) {
            // Optional: log if you want to catch rare Lightweight Charts errors
          }
        }
      });
    }
    meanRevLimitSeries.current = [];
    setMeanRevLimitLines([]);
    limitDrawingModeRef.current = false;
    setLimitDrawingMode(false);
  };

  function findClosestTime(
    series: ISeriesApi<any>,
    time: UTCTimestamp
  ): UTCTimestamp | null {
    const data = series?.data?.() ?? []; // If you're storing data elsewhere, replace this
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
      [mansfieldChartInstance.current, mansfieldLineRef.current],
      [volChartInstance.current, volLineRef.current],
      [momentumChartInstance.current, momentumPriceSeriesRef.current],
    ];

    for (const [chart, series] of allCharts) {
      if (!chart || !series || chart === sourceChart) continue;
      const snapped = findClosestTime(series, time);
      if (snapped != null) {
        chart.setCrosshairPosition(0, snapped, series);
      }
    }
  }

  function syncRatioCrosshair(sourceIndex: number, time: UTCTimestamp) {
    ratioChartRefs.current.forEach((chart, idx) => {
      const series = ratioSeriesRefs.current[idx];
      if (!chart || !series || idx === sourceIndex) return;
      const snapped = findClosestTime(series, time);
      if (snapped != null) {
        chart.setCrosshairPosition(0, snapped, series);
      }
    });
  }

  function safeSetVisibleRange(chart: IChartApi | null, range: any) {
    if (!chart || !range || range.from == null || range.to == null) return;
    try {
      chart.timeScale().setVisibleRange(range);
    } catch (err) {
      if (!(err instanceof Error && err.message === "Value is null")) {
        console.warn("⛔ safeSetVisibleRange failed", err);
      }
    }
  }

  function registerRatioRangeSync(chart: IChartApi, index: number) {
    const handler = (range: any) => {
      ratioChartRefs.current.forEach((c, idx) => {
        if (c && idx !== index) safeSetVisibleRange(c, range);
      });
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handler);
    ratioRangeUnsubs.current[index] = () =>
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
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
    const x = point.time,
      y = point.value;
    const x1 = p1.time,
      y1 = p1.value;
    const x2 = p2.time,
      y2 = p2.value;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
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
    setDrawings((prev) =>
      prev.filter((_, idx) => idx !== selectedDrawingIndex)
    );

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

  function handleCopyDrawing() {
    if (selectedDrawingIndex == null) return;
    const drawing = drawings[selectedDrawingIndex];
    if (!drawing || drawing.type !== "line") return;
    const [p1, p2] = drawing.points;
    copyBufferRef.current = {
      dx: p2.time - p1.time,
      dy: p2.value - p1.value,
    };
    drawingModeRef.current = "copy-trendline";

    setHoverPoint((prev) => {
      console.log("[Copy] Previous hoverPoint:", prev);
      return prev ?? p1;
    });
    console.log(
      "[Copy] Set drawingMode to copy-trendline, buffer:",
      copyBufferRef.current
    );
  }

  function handleMomentumDeleteDrawing() {
    if (momentumSelectedDrawingIndex === null) return;

    setMomentumDrawings((prev) =>
      prev.filter((_, idx) => idx !== momentumSelectedDrawingIndex)
    );

    const series = momentumDrawnSeriesRef.current.get(
      momentumSelectedDrawingIndex
    );
    if (series) {
      momentumChartInstance.current?.removeSeries(series);
      momentumDrawnSeriesRef.current.delete(momentumSelectedDrawingIndex);
    }

    momentumDotLabelSeriesRef.current.delete(momentumSelectedDrawingIndex);

    setMomentumSelectedDrawingIndex(null);
  }

  function handleMomentumCopyDrawing() {
    if (momentumSelectedDrawingIndex == null) return;
    const drawing = momentumDrawings[momentumSelectedDrawingIndex];
    if (!drawing || drawing.type !== "line") return;
    const [p1, p2] = drawing.points;
    momentumCopyBufferRef.current = {
      dx: p2.time - p1.time,
      dy: p2.value - p1.value,
    };
    momentumDrawingModeRef.current = "copy-trendline";
    setMomentumHoverPoint((prev) => prev ?? p1);
  }
  /*
    CREATE CHARTS
  */
  useEffect(() => {
    // --- 1. Reset all drawing/UI/chart states ---
    drawingModeRef.current = null;
    lineBufferRef.current = [];
    setDrawings([]);
    drawnSeriesRef.current.clear();
    dotLabelSeriesRef.current.clear();
    momentumDrawingModeRef.current = null;
    momentumLineBufferRef.current = [];
    setMomentumDrawings([]);
    momentumDrawnSeriesRef.current.clear();
    momentumDotLabelSeriesRef.current.clear();
    setShow50dmaTarget(false);
    setShowFibTarget(false);
    resetMeanRevLimits();

    // --- 2. Fetch price targets from backend ---
    const fetchInitialTargets = async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/price_targets/${stockSymbol}`
        );
        const json = await res.json();
        const mean_rev_targets = json.price_targets?.mean_reversion ?? {};
        const fib_targets = json.price_targets?.fibonacci ?? {};
        if (
          typeof mean_rev_targets.deviation_band_pct_lower === "number" &&
          typeof mean_rev_targets.deviation_band_pct_upper === "number"
        ) {
          drawInitialMeanRevLimits(
            mean_rev_targets.deviation_band_pct_lower,
            mean_rev_targets.deviation_band_pct_upper
          );
        }
        setPriceTargets({
          reversion_target: mean_rev_targets.reversion_projected_target_price,
          deviation_pct: mean_rev_targets.deviation_band_pct_upper,
          fib_1_618:
            fib_targets["fib_1.618_up"] ?? fib_targets["fib_1.618_down"],
          fib_direction: fib_targets["fib_1.618_up"]
            ? "up"
            : fib_targets["fib_1.618_down"]
            ? "down"
            : undefined,
        });
      } catch (err) {
        setPriceTargets({});
        console.error("❌ Failed to fetch price targets", err);
      }
    };
    fetchInitialTargets();

    const fetchDivergence = async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/price_rsi_divergence/${stockSymbol}`
        );
        const data = await res.json();
        setDivergence(data);
      } catch {
        setDivergence({});
      }
    };
    fetchDivergence();

    // --- 3. Guard: abort if containers/refs missing ---
    if (
      !stockSymbol ||
      !chartContainerRef.current ||
      !meanRevChartRef.current ||
      !rsiChartRef.current ||
      !volChartRef.current ||
      !momentumChartRef.current
    )
      return;

    // --- 4. Clear all chart containers ---
    [
      chartContainerRef,
      meanRevChartRef,
      rsiChartRef,
      volChartRef,
      momentumChartRef,
    ].forEach((ref) => {
      if (ref.current) ref.current.innerHTML = "";
    });

    // --- 5. Helper: Create chart with shared options ---
    function initChart(
      ref: React.RefObject<HTMLDivElement | null>,
      width: number,
      height: number,
      bgColor?: string,
      gridColor?: string,
      textColor?: string
    ) {
      if (!ref.current) throw new Error("Chart container not mounted");
      return createChart(ref.current, {
        width,
        height,
        layout: {
          background: { color: bgColor ?? "#fff" },
          textColor: textColor ?? "#000",
        },
        grid: {
          vertLines: { color: gridColor ?? "#eee" },
          horzLines: { color: gridColor ?? "#eee" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: false },
        handleScroll: {
          pressedMouseMove: true,
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
    }

    // --- 6. Create all charts ---
    const chart = initChart(chartContainerRef, 0, 400);
    chartRef.current = chart;

    chart.timeScale().applyOptions({
      barSpacing: 8, // Adjust as desired
      minBarSpacing: 3,
      maxBarSpacing: 15,
    });

    const meanChart = initChart(
      meanRevChartRef,
      meanRevChartRef.current!.clientWidth,
      200
    );
    meanRevChartInstance.current = meanChart;
    const meanRevLineSeries = meanChart.addSeries(LineSeries, {
      color: "#000",
      lineWidth: 2,
    });
    meanRevLineSeries.setData([
      { time: (Date.now() / 1000) as UTCTimestamp, value: 0 },
    ]);
    meanRevLineRef.current = meanRevLineSeries;

    const rsiChart = initChart(
      rsiChartRef,
      rsiChartRef.current!.clientWidth,
      150,
      "#5e35b1", // purple background
      "#5e35b1", // purple grid lines (lighter for contrast)
      "#fff" // white text
    );

    rsiChartInstance.current = rsiChart;
    const rsiLine = rsiChart.addSeries(LineSeries, {
      color: "#f44336",
      lineWidth: 1,
    });
    rsiLine.setData([{ time: (Date.now() / 1000) as UTCTimestamp, value: 50 }]);
    rsiLineRef.current = rsiLine;

    const mansfieldChart = initChart(
      mansfieldChartRef,
      mansfieldChartRef.current!.clientWidth,
      150
    );
    mansfieldChartInstance.current = mansfieldChart;
    const mansfieldLine = mansfieldChart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineType: LineType.WithSteps,
    });
    mansfieldLine.setData([
      { time: (Date.now() / 1000) as UTCTimestamp, value: 0 },
    ]);
    mansfieldLineRef.current = mansfieldLine;

    const volChart = initChart(
      volChartRef,
      volChartRef.current!.clientWidth,
      150
    );
    volChartInstance.current = volChart;
    const volLine = volChart.addSeries(LineSeries, {
      color: "#795548",
      lineWidth: 1,
    });
    volLine.setData([{ time: (Date.now() / 1000) as UTCTimestamp, value: 0 }]);
    volLineRef.current = volLine;

    const momentumChart = initChart(
      momentumChartRef,
      momentumChartRef.current!.clientWidth,
      450
    );

    // Show left axis
    momentumChart.applyOptions({
      leftPriceScale: { visible: true },
      rightPriceScale: { visible: true }, // Optional
    });

    momentumChartInstance.current = momentumChart;

    // Price line (close) on right
    const momentumPriceLine = momentumChart.addSeries(LineSeries, {
      color: "#000080",
      lineWidth: 3,
      priceScaleId: "right", // 🟢 Important!
    });
    momentumPriceSeriesRef.current = momentumPriceLine;

    // Momentum on left
    const momentumLine = momentumChart.addSeries(LineSeries, {
      color: "#ff9800",
      lineWidth: 4,
      priceScaleId: "left", // 🟢 Important!
    });
    momentumSeriesRef.current = momentumLine;

    // --- 7. Resize Observer: keep all charts width-synced ---
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect) {
          const w = entry.contentRect.width;
          chart.resize(w, 400);
          meanChart.resize(w, 200);
          rsiChart.resize(w, 150);
          mansfieldChart.resize(w, 150);
          volChart.resize(w, 150);
          momentumChart.resize(w, 450);
        }
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    // --- 8. Add main candle series ---
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    candleSeriesRef.current = candleSeries;

    // --- 9. Visible range sync helper ---
    function safeSetVisibleRange(chart: IChartApi | null, range: any) {
      if (!chart || !range || range.from == null || range.to == null) return;
      try {
        chart.timeScale().setVisibleRange(range);
      } catch (err) {
        if (!(err instanceof Error && err.message === "Value is null"))
          console.warn("⛔ safeSetVisibleRange failed", err);
      }
    }
    function syncVisibleRangeToAll(sourceChart: IChartApi) {
      sourceChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        [
          chartRef.current,
          meanRevChartInstance.current,
          rsiChartInstance.current,
          mansfieldChartInstance.current,
          volChartInstance.current,
          momentumChartInstance.current,
        ].forEach((c) => c !== sourceChart && safeSetVisibleRange(c, range));
      });
    }
    [
      chart,
      meanChart,
      rsiChart,
      mansfieldChart,
      volChart,
      momentumChart,
    ].forEach(syncVisibleRangeToAll);

    // --- 10. Main chart crosshair handler: drawing/preview logic + sync ---
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;
      const time = param.time as UTCTimestamp;

      // ----- Drawing/preview mode logic -----
      if (drawingModeRef.current) {
        setHoverPoint((prev) => {
          if (!prev || prev.time !== time || prev.value !== price) {
            return { time, value: price };
          }
          return prev;
        });
      }

      // ----- Synchronize crosshairs to all other charts -----
      const meanChart = meanRevChartInstance.current;
      const meanSeries = meanRevLineRef.current;
      const rsiChart = rsiChartInstance.current;
      const rsiSeries = rsiLineRef.current;
      const volChart = volChartInstance.current;
      const volSeries = volLineRef.current;
      const momentumChartInst = momentumChartInstance.current;
      const momentumSeries = momentumPriceSeriesRef.current;

      if (meanChart && meanSeries) {
        const snappedTime = findClosestTime(meanSeries, time);
        if (snappedTime)
          meanChart.setCrosshairPosition(0, snappedTime, meanSeries);
      }
      if (rsiChart && rsiSeries) {
        const snappedTime = findClosestTime(rsiSeries, time);
        if (snappedTime)
          rsiChart.setCrosshairPosition(0, snappedTime, rsiSeries);
      }
      if (volChart && volSeries) {
        const snappedTime = findClosestTime(volSeries, time);
        if (snappedTime)
          volChart.setCrosshairPosition(0, snappedTime, volSeries);
      }
      if (momentumChartInst && momentumSeries) {
        const snappedTime = findClosestTime(momentumSeries, time);
        if (snappedTime)
          momentumChartInst.setCrosshairPosition(
            0,
            snappedTime,
            momentumSeries
          );
      }
    });

    // --- 11. DRY crosshairMove handler for other charts (just sync main chart) ---
    function handleCrosshairMove(param: any, chartRef: any, seriesRef: any) {
      if (!param.time || !param.point) return;
      const time = param.time as UTCTimestamp;
      if (seriesRef.current) syncCrosshair(chartRef, seriesRef.current, time);
    }
    meanChart.subscribeCrosshairMove((p) =>
      handleCrosshairMove(p, meanChart, meanRevLineRef)
    );
    rsiChart.subscribeCrosshairMove((p) =>
      handleCrosshairMove(p, rsiChart, rsiLineRef)
    );
    mansfieldChart.subscribeCrosshairMove((p) =>
      handleCrosshairMove(p, mansfieldChart, mansfieldLineRef)
    );
    volChart.subscribeCrosshairMove((p) =>
      handleCrosshairMove(p, volChart, volLineRef)
    );
    momentumChart.subscribeCrosshairMove((p) => {
      if (!p.time || !p.point) return;
      const series = momentumPriceSeriesRef.current;
      if (!series) return;
      const price = series.coordinateToPrice(p.point.y);
      if (price == null) return;
      const time = p.time as UTCTimestamp;

      // ----- Drawing/preview mode logic -----
      if (momentumDrawingModeRef.current) {
        setMomentumHoverPoint((prev) => {
          if (!prev || prev.time !== time || prev.value !== price) {
            return { time, value: price };
          }
          return prev;
        });
      }

      handleCrosshairMove(p, momentumChart, momentumPriceSeriesRef);
    });

    // --- 12. Chart click handlers ---
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
          const dist = pointToSegmentDistance(
            clickPoint,
            drawing.points[0],
            drawing.points[1]
          );
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

    // --- 13. Cleanup ---
    return () => {
      [
        chart,
        meanChart,
        rsiChart,
        mansfieldChart,
        volChart,
        momentumChart,
      ].forEach((c) => c.remove());
      resizeObserver.disconnect();
      chartRef.current = null;
      meanRevChartInstance.current = null;
      rsiChartInstance.current = null;
      rsiLineRef.current = null;
      mansfieldChartInstance.current = null;
      mansfieldLineRef.current = null;
      volChartInstance.current = null;
      volLineRef.current = null;
      momentumChartInstance.current = null;
      momentumPriceSeriesRef.current = null;
      momentumSeriesRef.current = null;
      meanRevLineRef.current = null;
      candleSeriesRef.current = null;
      momentumDrawnSeriesRef.current.clear();
      momentumDotLabelSeriesRef.current.clear();
      momentumPreviewSeriesRef.current = null;
      momentumSixPointPreviewRef.current = null;
      momentumSixPointDotPreviewRef.current = null;
      momentumSixPointHoverLineRef.current = null;
      ratioRangeUnsubs.current.forEach((fn) => fn());
      ratioRangeUnsubs.current = [];
      ratioChartRefs.current = [];
      ratioSeriesRefs.current = [];
    };
  }, [stockSymbol]);

  // useWebSocketData(stockSymbol, candleSeriesRef, timeframe);
  useMainChartData(stockSymbol, candleSeriesRef, timeframe, chartRef, () => {
    chartRef.current?.timeScale().fitContent();
  });

  /*
    DRAWINGS
  */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    drawingsRef.current = drawings;
  }, [drawings, selectedDrawingIndex]);

  useEffect(() => {
    const chart = momentumChartInstance.current;
    if (!chart) return;
    momentumDrawingsRef.current = momentumDrawings;
  }, [momentumDrawings, momentumSelectedDrawingIndex]);

  /*
    CALLING BACKEND FOR OVERLAY DATA 
  */
  useEffect(() => {
    const fetchOverlayData = async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/overlay_data/${stockSymbol}?timeframe=${timeframe}`
        );
        const data = await res.json();
        setOverlayData(data);
      } catch (err) {
        console.error("Failed to fetch overlay data", err);
      }
    };

    fetchOverlayData();
  }, [stockSymbol, timeframe]);

  /*
    FETCH PEERS FOR COMPARISON CHARTS
  */
  useEffect(() => {
    if (!stockSymbol) return;
    const normalizedPeers = (peersOverride || [])
      .filter((p): p is string => typeof p === "string" && p.trim())
      .map((p) => p.trim().toUpperCase());

    if (normalizedPeers.length > 0) {
      setPeerSymbols(normalizedPeers.slice(0, 3));
      return;
    }
    async function fetchPeers() {
      try {
        const res = await fetch(
          `http://localhost:8000/stock_peers/${stockSymbol}`
        );
        const data = await res.json();
        setPeerSymbols((data.peers || []).slice(0, 3));
      } catch (err) {
        console.error("Failed to fetch peers", err);
        setPeerSymbols([]);
      }
    }
    fetchPeers();
  }, [stockSymbol, peersOverride]);

  useEffect(() => {
    const allSymbols = peerSymbols.concat("XAUUSD", "SPX");
    ratioChartRefs.current = allSymbols.map(
      (_, i) => ratioChartRefs.current[i] || null
    );
    ratioSeriesRefs.current = allSymbols.map(
      (_, i) => ratioSeriesRefs.current[i] || null
    );
    return () => {
      ratioRangeUnsubs.current.forEach((fn) => fn());
      ratioRangeUnsubs.current = [];
    };
  }, [peerSymbols]);

  /*
    CHECKBOX AND OVERLAY'S USEEFFECT 
  */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !showBollingerBand) return;

    const colors = {
      bb_middle: "#2962FF", // blue
      bb_upper: "#F23645", // red
      bb_lower: "#089981", // green
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

      series.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        }))
      );

      refs[key] = series;
    });

    return () => {
      Object.values(refs).forEach((series) => {
        // Defensive: only remove if series is still a valid series object
        if (series && typeof series.applyOptions === "function") {
          try {
            chart.removeSeries(series);
          } catch (err) {
            // You may want to log, but can safely ignore
          }
        }
      });
    };
  }, [
    showBollingerBand,
    overlayData.bb_middle,
    overlayData.bb_upper,
    overlayData.bb_lower,
  ]);

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
      mean_rev_50dma: "#3f51b5", // indigo
    } as const;

    // Clear old series if any
    meanRevLineRef.current && chart.removeSeries(meanRevLineRef.current);
    meanRevLineRef.current = null;

    (["mean_rev_50dma"] as const).forEach((key, idx) => {
      const data = overlayData[key];
      if (!data) return;

      const series = chart.addSeries(LineSeries, {
        color: colors[key],
        ...lineOptions,
      });

      series.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        }))
      );

      if (idx === 0) {
        meanRevLineRef.current = series; // ✅ use the first one for syncing
      }
    });
  }, [overlayData.mean_rev_50dma]);

  /*
    RSI CHART'S USEEFFECT 
  */
  useEffect(() => {
    const chart = rsiChartInstance.current;
    if (!chart) return;

    // Track all series created in this effect for cleanup
    const createdSeries: ISeriesApi<"Line">[] = [];

    // --- RSI Line ---
    let mainRSISeries: ISeriesApi<"Line"> | null = null;
    if (overlayData.rsi) {
      mainRSISeries = chart.addSeries(LineSeries, {
        color: "#ffe600",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      mainRSISeries.setData(
        overlayData.rsi.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        }))
      );
      createdSeries.push(mainRSISeries);
      rsiLineRef.current = mainRSISeries;
    }

    // --- MA14 Overlay ---
    if (overlayData.rsi_ma_14) {
      const ma14Series = chart.addSeries(LineSeries, {
        color: "#ff1a6a", // teal
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma14Series.setData(
        overlayData.rsi_ma_14.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        }))
      );
      createdSeries.push(ma14Series);
    }

    // --- 70/50/30 Bands ---
    const bandColors = {
      rsi_upper_band: "#cccccc",
      rsi_middle_band: "#cccccc",
      rsi_lower_band: "#cccccc",
    };

    (["rsi_upper_band", "rsi_middle_band", "rsi_lower_band"] as const).forEach(
      (key) => {
        const data = overlayData[key];
        if (!data) return;

        const bandSeries = chart.addSeries(LineSeries, {
          color: bandColors[key],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          lineStyle: 2, // Dashed
          crosshairMarkerVisible: false,
        });
        bandSeries.setData(
          data.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
          }))
        );
        createdSeries.push(bandSeries);
      }
    );

    // --- Cleanup: Remove only the series we created ---
    return () => {
      createdSeries.forEach((series) => {
        try {
          chart.removeSeries(series);
        } catch {}
      });
    };
  }, [
    overlayData.rsi,
    overlayData.rsi_ma_14,
    overlayData.rsi_upper_band,
    overlayData.rsi_middle_band,
    overlayData.rsi_lower_band,
  ]);

  /*
    MANSFIELD RS CHART'S USEEFFECT
  */
  useEffect(() => {
    const chart = mansfieldChartInstance.current;
    if (!chart) return;

    const createdSeries: ISeriesApi<"Line">[] = [];

    if (overlayData.mansfield_rs) {
      const line = chart.addSeries(LineSeries, {
        color: "#000000",
        lineWidth: 1,
        lineType: LineType.WithSteps,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      line.setData(
        overlayData.mansfield_rs.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        }))
      );
      createdSeries.push(line);
      mansfieldLineRef.current = line;

      const zeroLine = chart.addSeries(LineSeries, {
        color: "#2196f3",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        lineStyle: 2,
        crosshairMarkerVisible: false,
      });
      zeroLine.setData(
        overlayData.mansfield_rs.map((d) => ({
          time: d.time as UTCTimestamp,
          value: 0,
        }))
      );
      createdSeries.push(zeroLine);
    }

    return () => {
      createdSeries.forEach((series) => {
        try {
          chart.removeSeries(series);
        } catch {}
      });
    };
  }, [overlayData.mansfield_rs]);

  /*
    VOLATILITY CHART'S USEEFFECT 
  */
  useEffect(() => {
    const chart = volChartInstance.current;
    if (!chart) return;

    // Track all series created in this effect for cleanup
    const createdSeries: ISeriesApi<any>[] = [];

    // --- Main BBWP line ---
    let bbwpLine: ISeriesApi<"Line"> | null = null;
    if (overlayData.volatility) {
      bbwpLine = chart.addSeries(LineSeries, {
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
      createdSeries.push(bbwpLine);

      // --- 🟢 This is the key fix! ---
      volLineRef.current = bbwpLine;
    }

    // --- MA5 line ---
    if (overlayData.volatility_ma_5) {
      const ma5Line = chart.addSeries(LineSeries, {
        color: "#ff9800", // orange
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma5Line.setData(
        overlayData.volatility_ma_5.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        }))
      );
      createdSeries.push(ma5Line);
    }

    // --- Histogram (vertical bars for percentile) ---
    if (overlayData.volatility) {
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
          color:
            value >= 90 ? "#f44336" : value <= 10 ? "#2196f3" : "rgba(0,0,0,0)", // red, blue, or invisible
        };
      });

      histogramSeries.setData(histogramData);
      createdSeries.push(histogramSeries);
    }

    // Cleanup all lines created by this effect
    return () => {
      createdSeries.forEach((series) => {
        try {
          chart.removeSeries(series);
        } catch {}
      });
      // Optionally: clear the ref to avoid dangling reference
      if (volLineRef.current && bbwpLine === volLineRef.current) {
        volLineRef.current = null;
      }
    };
  }, [overlayData.volatility, overlayData.volatility_ma_5]);

  /*
    MOMENTUM CHART'S USEEFFECT
  */
  useEffect(() => {
    const chart = momentumChartInstance.current;
    if (!chart) return;
    if (!overlayData.price_line) return;

    const priceSeries = momentumPriceSeriesRef.current;
    const momSeries = momentumSeriesRef.current;
    if (!priceSeries || !momSeries) return;

    const priceData = overlayData.price_line.map((d) => ({
      time: d.time as UTCTimestamp,
      value: d.value,
    }));
    priceSeries.setData(priceData);

    let mom: { time: number; value: number }[];
    if (overlayData.momentum_90) {
      mom = overlayData.momentum_90;
    } else {
      const window = 90;
      mom = [];
      for (let i = window - 1; i < overlayData.price_line.length; i++) {
        const slice = overlayData.price_line.slice(i + 1 - window, i + 1);
        const sum = slice.reduce((s, p) => s + p.value, 0);
        const ma = sum / window;
        const close = overlayData.price_line[i].value;
        mom.push({
          time: overlayData.price_line[i].time,
          value: close / ma - 1,
        });
      }
    }
    setMomentumData(mom);
    momSeries.setData(
      mom.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
    );
  }, [overlayData.price_line, overlayData.momentum_90]);

  return (
    <div className="position-relative bg-white p-3 shadow-sm rounded border">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-bold text-dark mb-0">
          📈 {timeframe.toUpperCase()} Candlestick Chart
        </h5>
        <button
          className="btn btn-sm btn-outline-primary d-flex align-items-center gap-2 fw-semibold px-3 py-2"
          style={{
            borderRadius: "6px",
            boxShadow: "0 2px 6px rgba(60,132,246,0.06)",
            letterSpacing: "0.03em",
          }}
          onClick={() => setShowGraphing(true)}
        >
          {/* You can use an icon here for extra style */}
          {/* <BarChart2 size={18} className="me-2" /> */}
          Signals
        </button>
      </div>

      {/* Popup rendering */}
      {showGraphing && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <GraphingChart
              stockSymbol={stockSymbol}
              onClose={() => setShowGraphing(false)}
            />
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        {/* Left side: drawing tools */}
        <div className="toolbar d-flex gap-2">
          <button
            onClick={() => toggleMode("trendline")}
            className={`tool-button ${
              drawingModeRef.current === "trendline" ? "active" : ""
            }`}
            title="Trendline"
          >
            <Ruler size={16} />
          </button>

          <button
            onClick={() => toggleMode("horizontal")}
            className={`tool-button ${
              drawingModeRef.current === "horizontal" ? "active" : ""
            }`}
            title="Horizontal Line"
          >
            <Minus size={16} />
          </button>

          <button
            onClick={() => toggleMode("sixpoint")}
            className={`tool-button ${
              drawingModeRef.current === "sixpoint" ? "active" : ""
            }`}
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

          {selectedDrawingIndex !== null &&
            drawings[selectedDrawingIndex]?.type === "line" && (
              <button
                className="btn btn-sm btn-info"
                onClick={handleCopyDrawing}
                title="Copy Selected Trendline"
              >
                📋 Copy
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

        {/* === Middle: RSI Divergence === */}
        {(() => {
          const parts = ["daily", "weekly", "monthly"].flatMap((tf) => {
            const val = (divergence as any)[tf];
            if (typeof val === "string" && val !== "No Divergence") {
              const isBull = val.toLowerCase().includes("bullish");
              return (
                <span
                  key={tf}
                  className={isBull ? "text-success" : "text-danger"}
                  style={{ marginLeft: 4, whiteSpace: "nowrap" }}
                >
                  {tf.charAt(0).toUpperCase() + tf.slice(1)}{" "}
                  {isBull ? "Bullish" : "Bearish"}
                </span>
              );
            }
            return [] as JSX.Element[];
          });
          if (parts.length === 0) return null;
          return (
            <div className="d-flex flex-wrap gap-1 mb-3 align-items-center">
              {parts.map((el, idx) => (
                <>
                  {idx > 0 && <span style={{ margin: "0 2px" }}>and </span>}
                  {el}
                </>
              ))}
            </div>
          );
        })()}

        {/* Right side: timeframe toggle */}
        <div className="btn-group">
          {["daily", "weekly", "monthly"].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf as "daily" | "weekly" | "monthly")}
              className={`btn btn-sm ${
                timeframe === tf ? "btn-primary" : "btn-outline-secondary"
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="indicator-panel d-flex flex-column gap-2 mt-3">
        <label>
          <input
            type="checkbox"
            checked={showBollingerBand}
            onChange={() => setShowBollingerBand((v) => !v)}
          />{" "}
          Bollinger Band
        </label>
      </div>

      {/* === Main Chart === */}
      <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />

      {/* === Peer Charts === */}
      {peerSymbols.concat("XAUUSD", "SPX").map((sym, idx) => (
        <div key={`${sym}-${idx}`} className="mt-4">
          <div className="fw-bold text-muted mb-1">
            {stockSymbol}/{sym} Ratio
          </div>
          <SecondaryChart
            baseSymbol={stockSymbol}
            comparisonSymbol={sym}
            onReady={(chart, series) => {
              ratioChartRefs.current[idx] = chart;
              ratioSeriesRefs.current[idx] = series;
              registerRatioRangeSync(chart, idx);
            }}
            onCrosshairMove={(time) => syncRatioCrosshair(idx, time)}
          />
        </div>
      ))}

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
            className={`tool-button ${
              limitDrawingMode || meanRevLimitLines.length > 0 ? "active" : ""
            }`}
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
            { color: "#ffe600", label: "RSI (14-day)" },
            { color: "#ff1a6a", label: "14-Day Moving Average" },
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

      {/* === Mansfield Relative Strength === */}
      <div className="mt-4">
        <div className="fw-bold text-muted mb-1">📊 Mansfield RS</div>
        <div
          ref={mansfieldChartRef}
          style={{ width: "100%", height: "150px" }}
        />
      </div>

      {/* === Volatility Chart === */}
      <div className="mt-4">
        <div className="fw-bold text-muted mb-1">📈 Volatility (BBWP)</div>
        <div ref={volChartRef} style={{ width: "100%", height: "150px" }} />
      </div>

      {/* === Oliver's Momentum === */}
      <div className="mt-4">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <div className="fw-bold text-muted">📉 Oliver's Momentum</div>
          <div className="toolbar d-flex gap-2">
            <button
              onClick={() => momentumToggleMode("trendline")}
              className={`tool-button ${
                momentumDrawingModeRef.current === "trendline" ? "active" : ""
              }`}
              title="Trendline"
            >
              <Ruler size={16} />
            </button>

            <button
              onClick={() => momentumToggleMode("horizontal")}
              className={`tool-button ${
                momentumDrawingModeRef.current === "horizontal" ? "active" : ""
              }`}
              title="Horizontal Line"
            >
              <Minus size={16} />
            </button>

            <button
              onClick={() => momentumToggleMode("sixpoint")}
              className={`tool-button ${
                momentumDrawingModeRef.current === "sixpoint" ? "active" : ""
              }`}
              title="6 Point Tool"
            >
              1→5
            </button>
            {momentumSelectedDrawingIndex !== null && (
              <button
                className="btn btn-sm btn-danger"
                onClick={handleMomentumDeleteDrawing}
                title="Delete Selected Drawing"
              >
                🗑️ Delete
              </button>
            )}

            {momentumSelectedDrawingIndex !== null &&
              momentumDrawings[momentumSelectedDrawingIndex]?.type ===
                "line" && (
                <button
                  className="btn btn-sm btn-info"
                  onClick={handleMomentumCopyDrawing}
                  title="Copy Selected Trendline"
                >
                  📋 Copy
                </button>
              )}

            <button
              onClick={momentumResetChart}
              className="tool-button"
              title="Reload Chart"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
        <div
          ref={momentumChartRef}
          style={{ width: "100%", height: "450px" }}
        />
        <div className="d-flex flex-wrap mt-1">
          {[
            { color: "#000080", label: "Close" },
            { color: "#ff9800", label: "Momentum" },
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

      {/* === Overlay Grid === */}
      {overlayData && <OverlayGrid overlayData={overlayData} />}

      {/* === Models (Pictures) === */}
      {NATURAL_GAS_STOCKS.includes(stockSymbol?.toUpperCase() ?? "") && (
        <>
          {/* === Natural Gas Model Header === */}
          <h2
            className="fw-bold my-4 text-center"
            style={{ fontSize: "2rem", letterSpacing: "1px" }}
          >
            Natural Gas Model
          </h2>
          {/* === Pictures === */}
          <S3Gallery folder="natgas" />
        </>
      )}
      {OIL_STOCKS.includes(stockSymbol?.toUpperCase() ?? "") && (
        <>
          {/* === Oil Model Header === */}
          <h2
            className="fw-bold my-4 text-center"
            style={{ fontSize: "2rem", letterSpacing: "1px" }}
          >
            Oil Model
          </h2>
          {/* === Pictures === */}
          <S3Gallery folder="oil" />
        </>
      )}

      {HEALTHCARE_STOCKS.includes(stockSymbol?.toUpperCase() ?? "") && (
        <>
          {/* === Oil Model Header === */}
          <h2
            className="fw-bold my-4 text-center"
            style={{ fontSize: "2rem", letterSpacing: "1px" }}
          >
            Healthcare Model
          </h2>
          {/* === Pictures === */}
          <S3Gallery folder="healthcare" />
        </>
      )}

      {COPPER_STOCKS.includes(stockSymbol?.toUpperCase() ?? "") && (
        <>
          {/* === Oil Model Header === */}
          <h2
            className="fw-bold my-4 text-center"
            style={{ fontSize: "2rem", letterSpacing: "1px" }}
          >
            Copper Model
          </h2>
          {/* === Pictures === */}
          <S3Gallery folder="copper" />
        </>
      )}
    </div>
  );
};

export default StockChart;
