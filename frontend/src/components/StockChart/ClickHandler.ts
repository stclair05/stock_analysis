import { useEffect, Dispatch, SetStateAction } from "react";
import { UTCTimestamp, LineSeries } from "lightweight-charts";
import { DrawingLine, DrawingHorizontal, DrawingSixPoint } from "./types";

type Point = { time: UTCTimestamp; value: number };
export type Drawing = DrawingLine | DrawingHorizontal | DrawingSixPoint;

export function useClickHandler(
  chartRef: React.MutableRefObject<any>,
  candleSeriesRef: React.MutableRefObject<any>,
  chartContainerRef: React.MutableRefObject<HTMLDivElement | null>,
  drawingModeRef: React.MutableRefObject<"trendline" | "horizontal" | "sixpoint" | "move-endpoint" | null>,
  lineBufferRef: React.MutableRefObject<Point[]>,
  setDrawings: React.Dispatch<React.SetStateAction<any[]>>,
  setHoverPoint: React.Dispatch<React.SetStateAction<Point | null>>,
  hoverPoint: Point | null, 
  previewSeriesRef: React.MutableRefObject<any>,
  sixPointDotPreviewRef: React.MutableRefObject<any>,
  sixPointPreviewRef: React.MutableRefObject<any>,
  sixPointHoverLineRef: React.MutableRefObject<any>,
  drawings: Drawing[],
  selectedDrawingIndex: number | null,
  setSelectedDrawingIndex: Dispatch<SetStateAction<number | null>>,
  draggedEndpoint: "start" | "end" | null,
  setDraggedEndpoint: Dispatch<SetStateAction<"start" | "end" | null>>
) {
  // --- MAIN CHART CLICK HANDLER ---
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;

    const handleClick = (param: any) => {
      // (1) If moving endpoint
      if (
        drawingModeRef.current === "move-endpoint" &&
        selectedDrawingIndex != null &&
        draggedEndpoint
      ) {
        setDrawings(prev => {
          const updated = [...prev];
          if (updated[selectedDrawingIndex]?.type !== "line") return updated;
          const line = { ...updated[selectedDrawingIndex] };
          const points = [...line.points];
          if (draggedEndpoint === "start" && hoverPoint) points[0] = hoverPoint;
          if (draggedEndpoint === "end" && hoverPoint) points[1] = hoverPoint;
          line.points = points;
          updated[selectedDrawingIndex] = line;
          return updated;
        });
        drawingModeRef.current = null;
        setSelectedDrawingIndex(null);
        setDraggedEndpoint(null);
        setHoverPoint(null);
        return;
      }

      if (!param.time || !param.point) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;
      const time = param.time as UTCTimestamp;
      const point = { time, value: price };

      // (2) If NOT in drawing mode, check if user is clicking near an endpoint to start move
      if (!drawingModeRef.current) {
        for (let i = 0; i < drawings.length; i++) {
          const drawing = drawings[i];
          if (drawing.type !== "line") continue;
          const [start, end] = drawing.points;
          const dist = (a: Point, b: Point) =>
            Math.sqrt((a.time - b.time) ** 2 + (a.value - b.value) ** 2);
          const mousePoint = { time, value: price };
          const THRESHOLD = 5;
          if (dist(mousePoint, start) < THRESHOLD) {
            setSelectedDrawingIndex(i);
            setDraggedEndpoint("start");
            setHoverPoint(start);
            drawingModeRef.current = "move-endpoint";
            return;
          } else if (dist(mousePoint, end) < THRESHOLD) {
            setSelectedDrawingIndex(i);
            setDraggedEndpoint("end");
            setHoverPoint(end);
            drawingModeRef.current = "move-endpoint";
            return;
          }
        }
      }

      // === Trendline, Horizontal, Sixpoint logic unchanged ===
      if (drawingModeRef.current === "trendline") {
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
            chart.removeSeries(previewSeriesRef.current);
            previewSeriesRef.current = null;
          }
          drawingModeRef.current = null;
        }
        return;
      }
      if (drawingModeRef.current === "horizontal") {
        const horizontalLine: DrawingHorizontal = {
          type: "horizontal",
          price,
          time,
        };
        setDrawings((prev) => [...prev, horizontalLine]);
        drawingModeRef.current = null;
        return;
      }
      if (drawingModeRef.current === "sixpoint") {
        if (
          lineBufferRef.current.length >= 6 ||
          lineBufferRef.current.some((p) => p.time === time)
        ) {
          return;
        }
        lineBufferRef.current.push(point);
        const sortedPoints = [...lineBufferRef.current].sort((a, b) => a.time - b.time);

        if (!sixPointDotPreviewRef.current) {
          sixPointDotPreviewRef.current = chart.addSeries(LineSeries, {
            color: '#1f77b4',
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

        if (!sixPointPreviewRef.current) {
          sixPointPreviewRef.current = chart.addSeries(LineSeries, {
            color: "#444",
            lineWidth: 1,
            lineStyle: 1,
          });
        }
        sixPointPreviewRef.current.setData(sortedPoints);

        if (lineBufferRef.current.length === 6) {
          const newSixPoint: DrawingSixPoint = {
            type: "sixpoint",
            points: [...sortedPoints],
          };
          setDrawings((prev) => [...prev, newSixPoint]);
          lineBufferRef.current = [];
          if (sixPointDotPreviewRef.current) {
            chart.removeSeries(sixPointDotPreviewRef.current);
            sixPointDotPreviewRef.current = null;
          }
          if (sixPointPreviewRef.current) {
            chart.removeSeries(sixPointPreviewRef.current);
            sixPointPreviewRef.current = null;
          }
          if (sixPointHoverLineRef.current) {
            chart.removeSeries(sixPointHoverLineRef.current);
            sixPointHoverLineRef.current = null;
          }
        }
        return;
      }
    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [chartRef.current, candleSeriesRef.current, drawingModeRef.current, drawings, hoverPoint]);

  // --- MOUSE MOVE FOR PREVIEWING ENDPOINT MOVE ---
  useEffect(() => {
    // Only preview during move-endpoint mode
    if (
      drawingModeRef.current !== "move-endpoint" ||
      selectedDrawingIndex == null ||
      !draggedEndpoint
    ) {
      return;
    }

    const container = chartContainerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      if (!chart || !candleSeries || !container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = chart.timeScale().coordinateToTime(x);
      const price = candleSeries.coordinateToPrice(y);

      if (time == null || price == null) return;
      setHoverPoint({ time, value: price });
    };

    container.addEventListener("mousemove", handleMouseMove);
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
    };
  }, [
    drawingModeRef.current,
    selectedDrawingIndex,
    draggedEndpoint,
    chartRef.current,
    candleSeriesRef.current,
  ]);
}
