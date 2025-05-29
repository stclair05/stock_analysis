import {
  createChart,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  CrosshairMode,
  createSeriesMarkers,
  SeriesMarker,
  ISeriesMarkersPluginApi
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { useMainChartData } from "./useMainChartData";
import { Ruler, Minus, RotateCcw } from "lucide-react";
import { useDrawingManager } from "./DrawingManager";
import { usePreviewManager } from "./PreviewManager";
import { useDrawingRenderer } from "./DrawingRenderer";
import { useClickHandler } from "./ClickHandler";
import { Point, CopyTrendlineBuffer, Candle } from "./types";


interface GraphingChartProps {
  stockSymbol: string;
  onClose: () => void; // To close the popup
}

const GraphingChart = ({ stockSymbol, onClose }: GraphingChartProps) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartInstanceRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("weekly");


    // Drawing tool states and refs
    const [selectedDrawingIndex, setSelectedDrawingIndex] = useState<number | null>(null);
    const [draggedEndpoint, setDraggedEndpoint] = useState<'start' | 'end' | null>(null);
    const moveEndpointFixedRef = useRef<Point | null>(null);

    const drawnSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
    const previewSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

    const dotLabelSeriesRef = useRef<Map<number, ISeriesApi<"Line">[]>>(new Map());
    const sixPointPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
    const sixPointDotPreviewRef = useRef<ISeriesApi<"Line"> | null>(null);
    const sixPointHoverLineRef = useRef<ISeriesApi<"Line"> | null>(null);

    // Strategy signals 
    // Track markers for strategy signals (TrendInvestorPro etc)
    const strategyMarkersPluginRef = useRef<ISeriesMarkersPluginApi<number> | null>(null);
    const [strategyMarkers, setStrategyMarkers] = useState<SeriesMarker<number>[]>([]);
    const [showTrendInvestorPro, setShowTrendInvestorPro] = useState(false); // for checkbox/toggle
    const [showStClair, setShowStClair] = useState(false);
    const [showNorthStar, setShowNorthStar] = useState(false);



    
    const copyBufferRef = useRef<CopyTrendlineBuffer | null>(null);

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

    useDrawingRenderer(chartInstanceRef, drawings, drawnSeriesRef, dotLabelSeriesRef);

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

    setDrawings((prev) => prev.filter((_, idx) => idx !== selectedDrawingIndex));

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
            handleScroll: { pressedMouseMove: true, mouseWheel: true, horzTouchDrag: true, vertTouchDrag: false },
            handleScale: { axisPressedMouseMove: true, axisDoubleClickReset: true, mouseWheel: true, pinch: true },
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
        const resizeObserver = new ResizeObserver(entries => {
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
            const dist = pointToSegmentDistance(clickPoint, drawing.points[0], drawing.points[1]);
            if (dist < 1) { // Increase threshold if needed!
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
        // Determine which strategy (if any) is selected
        let strategy: string | null = null;
        if (showTrendInvestorPro) strategy = "trendinvestorpro";
        if (showStClair) strategy = "stclair";
        if (showNorthStar) strategy = "northstar";


         // Clear existing markers
        if (strategyMarkersPluginRef.current) {
            strategyMarkersPluginRef.current.setMarkers([]);
        }

        // If no strategy is selected, also clear state markers and exit
        if (!strategy) {
            setStrategyMarkers([]);
            return;
        }

        const fetchSignals = async () => {
            try {
                const res = await fetch(
                    `http://localhost:8000/api/signals_${timeframe}/${stockSymbol}?strategy=${strategy}`
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
    }, [stockSymbol, timeframe, showTrendInvestorPro, showStClair, showNorthStar]);




    useMainChartData(
        stockSymbol,
        candleSeriesRef,
        timeframe,
        chartInstanceRef,
        (loadedCandles) => {
            console.log("Candles loaded into series:", loadedCandles.length);
            if (!candleSeriesRef.current || !loadedCandles.length) return;

            const firstCandle = loadedCandles[0];
            const lastCandle = loadedCandles[loadedCandles.length - 1];

            /*
            const markers: SeriesMarker<number>[] = [
             {
                time: firstCandle.time,
                position: "belowBar",
                price: firstCandle.low, // required!
                color: "#009944",
                shape: "arrowUp",
                text: "BUY",
            },
            {
                time: lastCandle.time,
                position: "aboveBar",
                price: lastCandle.high, // required!
                color: "#e91e63",
                shape: "arrowDown",
                text: "SELL",
            },
            ];

            console.log("Final marker array:", markers);

            createSeriesMarkers(
                candleSeriesRef.current,
                markers as unknown as SeriesMarker<any>[]
            );
            */

        }
    );




    return (
        <div className="graphing-chart-popup">
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            {/* Toolbar */}
            <div className="toolbar d-flex gap-2">
                <button
                    onClick={() => toggleMode("trendline")}
                    className={`tool-button ${drawingModeRef.current === "trendline" ? "active" : ""}`}
                    title="Trendline"
                >
                    <Ruler size={24} />
                </button>
                <button
                    onClick={() => toggleMode("horizontal")}
                    className={`tool-button ${drawingModeRef.current === "horizontal" ? "active" : ""}`}
                    title="Horizontal Line"
                >
                    <Minus size={24} />
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
            <div className="btn-group">
            {["daily", "weekly", "monthly"].map((tf) => (
                <button
                key={tf}
                onClick={() => setTimeframe(tf as "daily" | "weekly" | "monthly")}
                className={`btn btn-sm ${timeframe === tf ? "btn-primary" : "btn-outline-secondary"}`}
                style={{ fontSize: "1.2rem", minWidth: "100px" }}
                >
                {tf.toUpperCase()}
                </button>
            ))}
            </div>

            {/* Checkboxes for signals */}
            <div className="d-flex align-items-center gap-3">
                <label className="d-flex align-items-center gap-1" style={{ fontWeight: 500 }}>
                    <input
                        type="checkbox"
                        checked={showTrendInvestorPro}
                        onChange={() => {
                            setShowTrendInvestorPro(v => {
                                if (!v) setShowStClair(false);
                                return !v;
                            });
                        }}
                        style={{ marginRight: 4 }}
                    />
                    TrendInvestorPro
                </label>
                <label className="d-flex align-items-center gap-1" style={{ fontWeight: 500 }}>
                    <input
                        type="checkbox"
                        checked={showStClair}
                        onChange={() => {
                            setShowStClair(v => {
                                if (!v) setShowTrendInvestorPro(false);
                                return !v;
                            });
                        }}
                        style={{ marginRight: 4 }}
                    />
                    StClair
                </label>
                <label className="d-flex align-items-center gap-1" style={{ fontWeight: 500 }}>
                    <input
                        type="checkbox"
                        checked={showNorthStar}
                        onChange={() => {
                            setShowNorthStar(v => {
                            if (!v) { setShowTrendInvestorPro(false); setShowStClair(false); }
                            return !v;
                            });
                        }}
                        style={{ marginRight: 4 }}
                    />
                    NorthStar
                </label>
            </div>


            <button className="btn btn-sm btn-danger ms-3" style={{ fontSize: "1.2rem" }} onClick={onClose}>
            Close
            </button>
        </div>
        {/* Main chart area */}
        <div
            ref={chartContainerRef}
            style={{
            width: "100%",
            height: "600px",
            border: "1.5px solid #ddd",
            borderRadius: "12px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.09)",
            background: "#fff",
            }}
        />
        </div>
    );
};

export default GraphingChart;
