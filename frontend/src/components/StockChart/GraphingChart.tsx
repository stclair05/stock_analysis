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
import "./graphing-chart.css"; // <-- Add your custom styles here

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
    null | "trendinvestorpro" | "stclair" | "northstar" | "stclairlongterm"
  >(null);

  const [signalSummary, setSignalSummary] = useState<SignalSummary>({
    trendinvestorpro: { daily: "", weekly: "", monthly: "" },
    stclair: { daily: "", weekly: "", monthly: "" },
    northstar: { daily: "", weekly: "", monthly: "" },
    stclairlongterm: { daily: "", weekly: "", monthly: "" },
  });
  const strategies = [
    "trendinvestorpro",
    "stclair",
    "northstar",
    "stclairlongterm",
  ] as const;
  const timeframes = ["daily", "weekly", "monthly"] as const;

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
    try {
      const res = await fetch(
        `http://localhost:8000/api/signals_${timeframe}/${stockSymbol}?strategy=${strategy}`
      );
      if (!res.ok) {
        // If 400, treat as unavailable
        if (res.status === 400) return "";
        return "";
      }
      const data = await res.json();
      if (!Array.isArray(data.markers) || data.markers.length === 0) return "";
      const last = data.markers[data.markers.length - 1];
      if (!last || !last.side) return "";
      return last.side.toUpperCase() === "BUY" ? "BUY" : "SELL";
    } catch (err) {
      return "";
    }
  }

  // Remder which signal is unavailable
  const isUnavailable = (
    strategy: (typeof strategies)[number],
    tf: "daily" | "weekly" | "monthly"
  ) => {
    if (
      strategy === "trendinvestorpro" &&
      (tf === "weekly" || tf === "monthly")
    )
      return true;
    if (strategy === "stclair" && (tf === "daily" || tf === "monthly"))
      return true;
    if (strategy === "stclairlongterm" && tf !== "weekly")
      // ONLY weekly supported
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

    // Build a blank SignalSummary object programmatically
    const makeEmptySignalSummary = (): SignalSummary => {
      const summary: any = {};
      strategies.forEach((s) => {
        summary[s] = { daily: "", weekly: "", monthly: "" };
      });
      return summary as SignalSummary;
    };

    async function fetchAllSignals() {
      const summary = makeEmptySignalSummary();

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
    <div className="graphing-chart-popup-modern">
      {/* Close Button Row */}
      <div className="close-row">
        <button className="close-btn" onClick={onClose} title="Close">
          <X size={20} />
        </button>
      </div>

      {/* Main Controls Row */}
      <div className="controls-row">
        {/* Toolbar */}
        <div className="toolbar">
          <button
            className={`tool-btn${
              drawingModeRef.current === "trendline" ? " active" : ""
            }`}
            title="Trendline"
            onClick={() => toggleMode("trendline")}
          >
            <Ruler size={20} />
          </button>
          <button
            className={`tool-btn${
              drawingModeRef.current === "horizontal" ? " active" : ""
            }`}
            title="Horizontal Line"
            onClick={() => toggleMode("horizontal")}
          >
            <Minus size={20} />
          </button>
          <button
            className={`tool-btn${
              drawingModeRef.current === "sixpoint" ? " active" : ""
            }`}
            title="6 Point Tool"
            onClick={() => toggleMode("sixpoint")}
          >
            1→5
          </button>
          <button
            className="tool-btn"
            title="Reload Chart"
            onClick={resetChart}
          >
            <RotateCcw size={20} />
          </button>
          {selectedDrawingIndex !== null && (
            <button
              className="ghost-btn danger"
              onClick={handleDeleteDrawing}
              title="Delete Selected Drawing"
            >
              <span role="img" aria-label="delete">
                🗑️
              </span>
            </button>
          )}
          {selectedDrawingIndex !== null &&
            drawings[selectedDrawingIndex]?.type === "line" && (
              <button
                className="ghost-btn info"
                onClick={handleCopyDrawing}
                title="Copy Selected Trendline"
              >
                <span role="img" aria-label="copy">
                  📋
                </span>
              </button>
            )}
        </div>

        {/* Period Toggle */}
        <div className="period-toggle">
          {["daily", "weekly", "monthly"].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf as "daily" | "weekly" | "monthly")}
              className={`period-btn${timeframe === tf ? " active" : ""}`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Checkboxes for signals */}
        <div className="signal-toggles">
          {strategies.map((name) => (
            <label className="signal-label" key={name}>
              <input
                type="checkbox"
                checked={selectedStrategy === name}
                onChange={() =>
                  setSelectedStrategy(selectedStrategy === name ? null : name)
                }
              />
              <span>
                {name
                  .replace(/^\w/, (c) => c.toUpperCase())
                  .replace("longterm", " LongTerm")}
              </span>
            </label>
          ))}
        </div>

        {/* Latest current signal */}
        {selectedStrategy && (
          <span
            className={
              "main-signal" +
              (isUnavailable(selectedStrategy, timeframe)
                ? " unavailable"
                : "") +
              (signalSummary[selectedStrategy][timeframe] === "BUY"
                ? " buy"
                : "") +
              (signalSummary[selectedStrategy][timeframe] === "SELL"
                ? " sell"
                : "")
            }
          >
            {isUnavailable(selectedStrategy, timeframe)
              ? "—"
              : signalSummary[selectedStrategy][timeframe] || "-"}
          </span>
        )}

        <button
          className="eye-btn"
          onClick={() => setShowSummary((v) => !v)}
          title={showSummary ? "Hide Summary" : "Show Summary"}
        >
          {showSummary ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>

      {/* Main chart area */}
      <div ref={chartContainerRef} className="chart-area" />

      {/* Toggles below the chart */}
      <div className="toggles-row">
        <label>
          <input
            type="checkbox"
            checked={showOverlayLines}
            onChange={() => setShowOverlayLines((v) => !v)}
          />
          <span>Show Overlay Lines</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={showTrendLines}
            onChange={() => setShowTrendLines((v) => !v)}
          />
          <span>Show Trendlines</span>
        </label>
      </div>

      {/* Summary of signals */}
      {showSummary && (
        <div className="signal-summary-table-wrap">
          <table className="signal-summary-table">
            <thead>
              <tr>
                <th>Strategy</th>
                {timeframes.map((tf) => (
                  <th key={tf}>{tf.charAt(0).toUpperCase() + tf.slice(1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strategies.map((strat) => (
                <tr key={strat}>
                  <td>
                    {strat.charAt(0).toUpperCase() +
                      strat.slice(1).replace("longterm", " LongTerm")}
                  </td>
                  {timeframes.map((tf) => {
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
                          color,
                          opacity: unavailable ? 0.7 : 1,
                          textAlign: "center",
                          fontWeight: 700,
                        }}
                      >
                        <span>{content ?? "-"}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GraphingChart;
