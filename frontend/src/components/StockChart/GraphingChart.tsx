import {
  createChart,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  CrosshairMode,
  createSeriesMarkers,
  SeriesMarker,
  ISeriesMarkersPluginApi,
  LineSeries,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { useMainChartData } from "./useMainChartData";
import { Ruler, Minus, RotateCcw, Eye, EyeOff, X } from "lucide-react";
import { useDrawingManager } from "./DrawingManager";
import { usePreviewManager } from "./PreviewManager";
import { useDrawingRenderer } from "./DrawingRenderer";
import { useClickHandler } from "./ClickHandler";
import {
  Point,
  CopyTrendlineBuffer,
  SignalSummary,
  Timeframe,
  SignalSide,
  GraphingChartProps,
} from "./types";

const GraphingChart = ({ stockSymbol, onClose }: GraphingChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">(
    "weekly"
  );

  // Drawing tool states and refs
  const [selectedDrawingIndex, setSelectedDrawingIndex] = useState<
    number | null
  >(null);
  const [draggedEndpoint, setDraggedEndpoint] = useState<
    "start" | "end" | null
  >(null);
  const moveEndpointFixedRef = useRef<Point | null>(null);

  const drawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const previewSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const dotLabelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(
    new Map()
  );
  const sixPointPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sixPointDotPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sixPointHoverLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Strategy signals
  const strategyMarkersPluginRef =
    useRef<ISeriesMarkersPluginApi<number> | null>(null);
  const [strategyMarkers, setStrategyMarkers] = useState<
    SeriesMarker<number>[]
  >([]);
  const [selectedStrategy, setSelectedStrategy] = useState<
    null | "trendinvestorpro" | "stclair" | "northstar"
  >(null);

  const [signalSummary, setSignalSummary] = useState<SignalSummary>({
    trendinvestorpro: { daily: "", weekly: "", monthly: "" },
    stclair: { daily: "", weekly: "", monthly: "" },
    northstar: { daily: "", weekly: "", monthly: "" },
  });

  const [showSummary, setShowSummary] = useState(false);

  const copyBufferRef = useRef<CopyTrendlineBuffer | null>(null);

  // Overlay lines for the different trading signals
  const signalMASeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const [signalMAData, setSignalMAData] = useState<any>(null);
  const [showOverlayLines, setShowOverlayLines] = useState(false);

  // Trendlines
  const [trendLines, setTrendLines] = useState<any[]>([]);
  const trendLineSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const [showTrendLines, setShowTrendLines] = useState(false);

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
    chartInstanceRef,
    previewSeriesRef,
    sixPointPreviewRef,
    sixPointHoverLineRef,
    dotLabelSeriesRef,
    drawnSeriesRef
  );
  const drawingsRef = useRef(drawings);

  usePreviewManager(
    chartInstanceRef,
    drawingModeRef,
    lineBufferRef,
    hoverPoint,
    previewSeriesRef,
    sixPointHoverLineRef,
    moveEndpointFixedRef,
    copyBufferRef
  );

  useDrawingRenderer(
    chartInstanceRef,
    drawings,
    drawnSeriesRef,
    dotLabelSeriesRef
  );

  useClickHandler(
    chartInstanceRef,
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

  // --- Delete Drawing Handler ---
  function handleDeleteDrawing() {
    if (selectedDrawingIndex === null) return;

    setDrawings((prev) =>
      prev.filter((_, idx) => idx !== selectedDrawingIndex)
    );

    // Remove the rendered series from the chart
    const series = drawnSeriesRef.current.get(selectedDrawingIndex);
    if (series) {
      chartInstanceRef.current?.removeSeries(series);
      drawnSeriesRef.current.delete(selectedDrawingIndex);
    }

    // Remove any dot labels, if used (6-point, etc)
    dotLabelSeriesRef.current.delete(selectedDrawingIndex);

    setSelectedDrawingIndex(null);
  }

  // --- Copy Drawing Handler ---
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
    setHoverPoint((prev) => prev ?? p1);
  }

  // Helper: distance from point to segment
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
  // Fetch the latest signals
  async function fetchLatestSignal(
    stockSymbol: string,
    strategy: string,
    timeframe: Timeframe
  ) {
    const res = await fetch(
      `http://localhost:8000/api/signals_${timeframe}/${stockSymbol}?strategy=${strategy}`
    );
    const data = await res.json();
    if (!Array.isArray(data.markers) || data.markers.length === 0) return "";
    // Use the last marker as the latest signal (adjust if your backend sorts differently)
    const last = data.markers[data.markers.length - 1];
    if (!last || !last.side) return "";
    return last.side.toUpperCase() === "BUY" ? "BUY" : "SELL";
  }

  // Remder which signal is unavailable
  const isUnavailable = (
    strategy: "trendinvestorpro" | "stclair" | "northstar",
    tf: "daily" | "weekly" | "monthly"
  ) => {
    if (
      strategy === "trendinvestorpro" &&
      (tf === "weekly" || tf === "monthly")
    )
      return true;
    if (strategy === "stclair" && (tf === "daily" || tf === "monthly"))
      return true;
    return false;
  };

  /**
   * Main useEffect
   */
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Remove old chart if present
    chartContainerRef.current.innerHTML = "";

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 900,
      height: 600,
      layout: { background: { color: "#fff" }, textColor: "#222" },
      grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
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

    // Add candlestick series
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    chartInstanceRef.current = chart;
    candleSeriesRef.current = series;

    // Initialize the strategy markers plugin
    strategyMarkersPluginRef.current = createSeriesMarkers(series, []);

    // Resize observer for responsive width
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect) {
          chart.resize(entry.contentRect.width, 600);
        }
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    // Preview
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;
      const time = param.time as UTCTimestamp;

      // Only set hoverPoint if in drawing mode!
      if (drawingModeRef.current) {
        setHoverPoint((prev) => {
          if (!prev || prev.time !== time || prev.value !== price) {
            return { time, value: price };
          }
          return prev;
        });
      }
    });

    // Allow selecting an existing trendline by clicking near its body
    chart.subscribeClick((param) => {
      if (!param.point || !param.time) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;
      const time = param.time as UTCTimestamp;
      const clickPoint = { time, value: price };

      // Use your latest drawings
      const currentDrawings = drawingsRef.current;

      let foundIndex: number | null = null;
      currentDrawings.forEach((drawing, idx) => {
        if (drawing.type === "line" && drawing.points.length === 2) {
          const dist = pointToSegmentDistance(
            clickPoint,
            drawing.points[0],
            drawing.points[1]
          );
          if (dist < 1) {
            // Increase threshold if needed!
            foundIndex = idx;
          }
        }
      });

      if (foundIndex !== null) {
        setSelectedDrawingIndex(foundIndex);
      } else {
        setSelectedDrawingIndex(null);
      }
    });

    // Cleanup
    return () => {
      chart.remove();
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
      resizeObserver.disconnect();
    };
  }, [stockSymbol, timeframe]);

  /**
   * Drawings
   */
  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings, selectedDrawingIndex]);

  /**
   * Strategy Markers
   */
  useEffect(() => {
    // Clear existing markers
    if (strategyMarkersPluginRef.current) {
      strategyMarkersPluginRef.current.setMarkers([]);
    }

    if (!selectedStrategy) {
      setStrategyMarkers([]);
      return;
    }

    const fetchSignals = async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/signals_${timeframe}/${stockSymbol}?strategy=${selectedStrategy}`
        );
        const data = await res.json();
        if (!Array.isArray(data.markers)) return;
        const markers: SeriesMarker<number>[] = data.markers.map((m: any) => ({
          time: m.time,
          price: m.price,
          position: m.side === "buy" ? "belowBar" : "aboveBar",
          color: m.side === "buy" ? "#009944" : "#e91e63",
          shape: m.side === "buy" ? "arrowUp" : "arrowDown",
          text: m.label || (m.side === "buy" ? "BUY" : "SELL"),
        }));
        setStrategyMarkers(markers);
        if (candleSeriesRef.current) {
          strategyMarkersPluginRef.current.setMarkers(markers);
        }
      } catch (e) {
        setStrategyMarkers([]);
      }
    };
    fetchSignals();
  }, [stockSymbol, timeframe, selectedStrategy]);

  /**
   * Fetching latest signals
   */
  useEffect(() => {
    let cancelled = false;
    async function fetchAllSignals() {
      const strategies = ["trendinvestorpro", "stclair", "northstar"] as const;
      const timeframes = ["daily", "weekly", "monthly"] as const;
      const summary: SignalSummary = {
        trendinvestorpro: { daily: "", weekly: "", monthly: "" },
        stclair: { daily: "", weekly: "", monthly: "" },
        northstar: { daily: "", weekly: "", monthly: "" },
      };

      await Promise.all(
        strategies.flatMap((strategy) =>
          timeframes.map(async (timeframe) => {
            const signal = await fetchLatestSignal(
              stockSymbol,
              strategy,
              timeframe
            );
            summary[strategy][timeframe] = signal;
          })
        )
      );
      if (!cancelled) setSignalSummary(summary);
    }
    fetchAllSignals();
    return () => {
      cancelled = true;
    };
  }, [stockSymbol]);

  useMainChartData(
    stockSymbol,
    candleSeriesRef,
    timeframe,
    chartInstanceRef,
    (loadedCandles) => {
      // ... existing logic
      const mainSeriesData = loadedCandles;
      if (!chartInstanceRef.current || !mainSeriesData.length) return;

      const lastTime = mainSeriesData[mainSeriesData.length - 1].time;
      const FUTURE_WEEKS = 26; // show 6 months extra
      const SECONDS_IN_WEEK = 7 * 24 * 60 * 60;
      const futureLimit = lastTime + FUTURE_WEEKS * SECONDS_IN_WEEK;

      // Extend the visible range
      chartInstanceRef.current.timeScale().setVisibleRange({
        from: mainSeriesData[0].time as UTCTimestamp,
        to: futureLimit as UTCTimestamp,
      });
    }
  );

  /**
   * Plotting overlays
   */
  useEffect(() => {
    // Remove previous signal MAs from chart
    if (signalMASeriesRef.current.length > 0 && chartInstanceRef.current) {
      signalMASeriesRef.current = signalMASeriesRef.current.filter(Boolean);
      signalMASeriesRef.current.forEach((series) => {
        if (
          chartInstanceRef.current &&
          series &&
          typeof series.setData === "function"
        ) {
          try {
            chartInstanceRef.current.removeSeries(series);
          } catch (e) {
            // Optional: log or ignore if the series is already removed/destroyed
            console.warn("Series remove error", e);
          }
        }
      });
      signalMASeriesRef.current = [];
    }

    // Do nothing if overlays should not be shown
    if (!selectedStrategy || !showOverlayLines) return;

    // Fetch signal lines from backend
    async function fetchSignalLines() {
      try {
        const res = await fetch(
          `http://localhost:8000/signal_lines/${stockSymbol}?timeframe=${timeframe}`
        );
        const data = await res.json();
        setSignalMAData(data);

        if (!chartInstanceRef.current) return;

        // Decide which lines to plot
        let maConfigs: { key: string; color: string; label: string }[] = [];
        if (selectedStrategy === "trendinvestorpro") {
          maConfigs = [
            { key: "dma_200", color: "#2e93fa", label: "200DMA" },
            { key: "ma_5d", color: "#ff9800", label: "5DMA" },
          ];
        } else if (selectedStrategy === "stclair") {
          maConfigs = [
            { key: "dma_200", color: "#2e93fa", label: "200DMA" },
            { key: "ma_20d", color: "#ff9800", label: "20DMA" },
          ];
        } else if (selectedStrategy === "northstar") {
          maConfigs = [
            { key: "ma_12", color: "#00c853", label: "12MA" },
            { key: "ma_36", color: "#d500f9", label: "36MA" },
          ];
        }

        // Add each MA as a line series
        maConfigs.forEach((cfg) => {
          if (
            data &&
            data[cfg.key] &&
            Array.isArray(data[cfg.key]) &&
            data[cfg.key].length > 0
          ) {
            const series = chartInstanceRef.current!.addSeries(LineSeries, {
              color: cfg.color,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: false,
              title: cfg.label,
            });
            series.setData(data[cfg.key]);
            if (series && typeof series.setData === "function") {
              signalMASeriesRef.current.push(series);
            }
          }
        });
      } catch (e) {
        setSignalMAData(null);
        console.error(e);
      }
    }
    fetchSignalLines();

    // Cleanup function: remove on strategy change/unmount
    return () => {
      if (signalMASeriesRef.current.length > 0 && chartInstanceRef.current) {
        // Remove undefined/null and duplicates
        const uniqueSeries = [
          ...new Set(signalMASeriesRef.current.filter(Boolean)),
        ];
        uniqueSeries.forEach((series) => {
          if (
            chartInstanceRef.current &&
            series &&
            typeof series.setData === "function"
          ) {
            try {
              chartInstanceRef.current.removeSeries(series);
            } catch (e) {
              console.warn("Series remove error", e);
            }
          }
        });
        signalMASeriesRef.current = [];
      }
    };
  }, [selectedStrategy, stockSymbol, timeframe, showOverlayLines]);

  /**
   * Fetching Trendlines and projection lines from backend
   */
  useEffect(() => {
    async function fetchTrendlines() {
      try {
        const res = await fetch(
          `http://localhost:8000/api/projection_arrows/${stockSymbol}?timeframe=${timeframe}`
        );
        const data = await res.json();
        setTrendLines(data.trendlines || []); // Only use trendlines!
      } catch (err) {
        setTrendLines([]);
      }
    }
    fetchTrendlines();
  }, [stockSymbol, timeframe]);

  /**
   * Plotting trendlines
   */
  useEffect(() => {
    if (!chartInstanceRef.current) return;

    // Remove any previously rendered trendlines
    trendLineSeriesRef.current.forEach((series) => {
      chartInstanceRef.current?.removeSeries(series);
    });
    trendLineSeriesRef.current = [];

    // Only add trendlines if toggled on
    if (showTrendLines) {
      trendLines.forEach((line) => {
        const series = chartInstanceRef.current!.addSeries(LineSeries, {
          color: "#2e93fa",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData([
          { time: line.start[0], value: line.start[1] },
          { time: line.end[0], value: line.end[1] },
        ]);
        trendLineSeriesRef.current.push(series);
      });
    }
  }, [trendLines, showTrendLines]);

  return (
    <div className="graphing-chart-popup">
      {/* Close Button Row */}
      <div
        className="d-flex justify-content-end"
        style={{ padding: "8px 16px 0 16px" }}
      >
        <button
          className="btn"
          style={{
            border: "none",
            background: "transparent",
            padding: 4,
            borderRadius: 7,
            marginTop: 2,
            cursor: "pointer",
          }}
          onClick={onClose}
          title="Close"
        >
          <X size={20} color="#e91e63" />
        </button>
      </div>

      {/* Main Controls Row */}
      <div
        className="d-flex align-items-center justify-content-between mb-2"
        style={{
          gap: 12,
          padding: "10px 32px 6px 32px",
          borderBottom: "1.5px solid #e5e7eb",
          background: "#fafbfc",
          borderRadius: "0 0 16px 16px",
          minHeight: 56,
        }}
      >
        {/* Toolbar */}
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={() => toggleMode("trendline")}
            className={`tool-button ${
              drawingModeRef.current === "trendline" ? "active" : ""
            }`}
            title="Trendline"
          >
            <Ruler size={24} />
          </button>
          <button
            onClick={() => toggleMode("horizontal")}
            className={`tool-button ${
              drawingModeRef.current === "horizontal" ? "active" : ""
            }`}
            title="Horizontal Line"
          >
            <Minus size={24} />
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
          <button
            onClick={resetChart}
            className="tool-button"
            title="Reload Chart"
          >
            <RotateCcw size={24} />
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
        </div>

        {/* Period Toggle */}
        <div className="btn-group d-flex align-items-center justify-content-center gap-2">
          {["daily", "weekly", "monthly"].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf as "daily" | "weekly" | "monthly")}
              className={`btn btn-sm ${
                timeframe === tf ? "btn-primary" : "btn-outline-secondary"
              }`}
              style={{ fontSize: "1.2rem", minWidth: "100px" }}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Checkboxes for signals with labels */}
        <div className="d-flex align-items-end gap-3">
          {/* TrendInvestorPro: D: BUY/SELL */}
          <div className="d-flex flex-column align-items-center">
            <label
              className="d-flex align-items-center gap-1"
              style={{ fontWeight: 500 }}
            >
              <input
                type="checkbox"
                checked={selectedStrategy === "trendinvestorpro"}
                onChange={() =>
                  setSelectedStrategy(
                    selectedStrategy === "trendinvestorpro"
                      ? null
                      : "trendinvestorpro"
                  )
                }
                style={{ marginRight: 4 }}
              />
              TrendInvestorPro
            </label>
          </div>
          {/* StClair: W: BUY/SELL */}
          <div className="d-flex flex-column align-items-center">
            <label
              className="d-flex align-items-center gap-1"
              style={{ fontWeight: 500 }}
            >
              <input
                type="checkbox"
                checked={selectedStrategy === "stclair"}
                onChange={() =>
                  setSelectedStrategy(
                    selectedStrategy === "stclair" ? null : "stclair"
                  )
                }
                style={{ marginRight: 4 }}
              />
              StClair
            </label>
          </div>
          {/* Northstar: D: | W: | M: */}
          <div
            className="d-flex flex-column align-items-center"
            style={{ marginLeft: "2.2rem" }}
          >
            <label
              className="d-flex align-items-center gap-1"
              style={{ fontWeight: 500 }}
            >
              <input
                type="checkbox"
                checked={selectedStrategy === "northstar"}
                onChange={() =>
                  setSelectedStrategy(
                    selectedStrategy === "northstar" ? null : "northstar"
                  )
                }
                style={{ marginRight: 4 }}
              />
              NorthStar
            </label>
          </div>
        </div>

        {/* Latest current signal */}
        {selectedStrategy && (
          <span
            style={{
              fontWeight: 900,
              fontSize: "1.5rem",
              color: isUnavailable(selectedStrategy, timeframe)
                ? "#232323"
                : signalSummary[selectedStrategy][timeframe] === "BUY"
                ? "#009944"
                : signalSummary[selectedStrategy][timeframe] === "SELL"
                ? "#e91e63"
                : "#aaa",
              opacity: isUnavailable(selectedStrategy, timeframe) ? 0.5 : 1,
              minWidth: 64,
              marginLeft: 12,
              letterSpacing: 1.2,
            }}
          >
            {isUnavailable(selectedStrategy, timeframe)
              ? "—"
              : signalSummary[selectedStrategy][timeframe] || "-"}
          </span>
        )}

        <button
          className="btn btn-sm"
          style={{
            border: "none",
            background: "transparent",
            marginLeft: 5,
            padding: 3,
            outline: "none",
            boxShadow: "none",
            cursor: "pointer",
          }}
          onClick={() => setShowSummary((v) => !v)}
          title={showSummary ? "Hide Summary" : "Show Summary"}
        >
          {showSummary ? (
            <EyeOff size={19} color="#2563eb" />
          ) : (
            <Eye size={19} color="#2563eb" />
          )}
        </button>
      </div>

      {/* Main chart area */}
      <div
        ref={chartContainerRef}
        style={{
          width: "100%",
          height: "100%",
          border: "1.5px solid #ddd",
          borderRadius: "12px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.09)",
          background: "#fff",
        }}
      />

      {/* Checkboxes below the chart*/}
      <div
        className="mt-3 d-flex align-items-center gap-3"
        style={{ fontSize: "1.1rem" }}
      >
        <input
          type="checkbox"
          id="show-overlaylines-checkbox"
          checked={showOverlayLines}
          onChange={() => setShowOverlayLines((v) => !v)}
          style={{ marginLeft: 24, marginRight: 8 }}
        />
        <label
          htmlFor="show-overlaylines-checkbox"
          style={{ cursor: "pointer" }}
        >
          Show Overlay Lines
        </label>
        <input
          type="checkbox"
          id="show-trendlines-checkbox"
          checked={showTrendLines}
          onChange={() => setShowTrendLines((v) => !v)}
          style={{ marginRight: 8 }}
        />
        <label htmlFor="show-trendlines-checkbox" style={{ cursor: "pointer" }}>
          Show Trendlines
        </label>
      </div>

      {/* Summary of signals*/}
      {showSummary && (
        <div
          style={{
            width: "100%",
            margin: "28px auto 10px auto",
            maxWidth: 570,
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 2px 14px rgba(36,64,138,0.09)",
              overflow: "hidden",
              fontSize: "1.08rem",
            }}
          >
            <thead>
              <tr style={{ background: "#f4f6f8" }}>
                <th
                  style={{
                    padding: "12px 10px",
                    fontWeight: 700,
                    borderBottom: "2px solid #e5e7eb",
                  }}
                >
                  Strategy
                </th>
                <th
                  style={{
                    padding: "12px 10px",
                    fontWeight: 700,
                    borderBottom: "2px solid #e5e7eb",
                  }}
                >
                  Daily
                </th>
                <th
                  style={{
                    padding: "12px 10px",
                    fontWeight: 700,
                    borderBottom: "2px solid #e5e7eb",
                  }}
                >
                  Weekly
                </th>
                <th
                  style={{
                    padding: "12px 10px",
                    fontWeight: 700,
                    borderBottom: "2px solid #e5e7eb",
                  }}
                >
                  Monthly
                </th>
              </tr>
            </thead>
            <tbody>
              {(["trendinvestorpro", "stclair", "northstar"] as const).map(
                (strat, i) => (
                  <tr
                    key={strat}
                    style={{
                      background: i % 2 === 1 ? "#fafbfc" : "#fff",
                      borderBottom: "1.5px solid #f0f2f4",
                    }}
                  >
                    <td
                      style={{
                        fontWeight: 600,
                        padding: "10px 10px",
                        textTransform: "capitalize",
                      }}
                    >
                      {strat}
                    </td>
                    {(["daily", "weekly", "monthly"] as const).map((tf) => {
                      const unavailable = isUnavailable(strat, tf);
                      let content;
                      let color = "#bdbdbd";
                      if (unavailable) {
                        content = "—";
                        color = "#232323";
                      } else if (signalSummary[strat][tf] === "BUY") {
                        content = "BUY";
                        color = "#009944";
                      } else if (signalSummary[strat][tf] === "SELL") {
                        content = "SELL";
                        color = "#e91e63";
                      }
                      return (
                        <td
                          key={tf}
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            padding: "10px 0",
                            color,
                            opacity: unavailable ? 0.7 : 1,
                          }}
                        >
                          <span>{content ?? "-"}</span>
                        </td>
                      );
                    })}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GraphingChart;
