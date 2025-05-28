import { useEffect, Dispatch, SetStateAction } from "react";
import { UTCTimestamp, LineSeries } from "lightweight-charts";
import { DrawingLine, DrawingHorizontal, DrawingSixPoint } from "./types";

type Point = { time: UTCTimestamp; value: number };
export type Drawing = DrawingLine | DrawingHorizontal | DrawingSixPoint;

export function useClickHandler(
  chartRef: React.MutableRefObject<any>,
  candleSeriesRef: React.MutableRefObject<any>,
  chartContainerRef: React.MutableRefObject<HTMLDivElement | null>,
  drawingModeRef: React.MutableRefObject<"trendline" | "horizontal" | "sixpoint" | null>,
  lineBufferRef: React.MutableRefObject<Point[]>,
  setDrawings: React.Dispatch<React.SetStateAction<any[]>>,
  setHoverPoint: React.Dispatch<React.SetStateAction<Point | null>>,
  previewSeriesRef: React.MutableRefObject<any>,
  sixPointDotPreviewRef: React.MutableRefObject<any>,
  sixPointPreviewRef: React.MutableRefObject<any>,
  sixPointHoverLineRef: React.MutableRefObject<any>,
  drawings: Drawing[],
  selectedDrawingIndex: number | null,
  setSelectedDrawingIndex: Dispatch<SetStateAction<number | null>>,
  draggedEndpoint: "start" | "end" | null,              // <--- NEW
  setDraggedEndpoint: Dispatch<SetStateAction<"start" | "end" | null>>,
  isDragging: boolean,                                  // <--- NEW
  setIsDragging: Dispatch<SetStateAction<boolean>>
) {
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;

    const handleClick = (param: any) => {

      console.log("[handleClick] param", param, "drawingModeRef", drawingModeRef.current);

      if (!param.time || !param.point) {
        console.log("[handleClick] Skipping: time/point/drawingMode missing");
        return;
      }
      if (!param.time || !param.point) return;

      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;

      const time = param.time as UTCTimestamp;
      const point = { time, value: price };

      if (drawingModeRef.current === "trendline") {
        if (lineBufferRef.current.length === 0) {
          console.log("[trendline] First point", point);
          lineBufferRef.current = [point];
        } else {
          console.log("[trendline] Second point", point, "Finalizing line");
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
          console.log("[trendline] Drawing mode set to null after drawing");
        }
        return;
      }

      else if (drawingModeRef.current === "horizontal") {
        const horizontalLine: DrawingHorizontal = {
          type: "horizontal",
          price,
          time,
        };
        setDrawings((prev) => [...prev, horizontalLine]);
        drawingModeRef.current = null;
        return;
      }

      else if (drawingModeRef.current === "sixpoint") {
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
  }, [chartRef.current, candleSeriesRef.current, drawingModeRef.current, drawings]);

  // === DRAG ENDPOINT LOGIC START ===
  useEffect(() => {
    if (!isDragging || selectedDrawingIndex == null || !draggedEndpoint) {
    if (!isDragging) console.log("[drag effect] Not dragging.");
    if (selectedDrawingIndex == null) console.log("[drag effect] No line selected.");
    if (!draggedEndpoint) console.log("[drag effect] No endpoint specified.");
    return;
  }
    console.log("[drag effect] DRAG START: idx", selectedDrawingIndex, "endpoint", draggedEndpoint);
    if (!isDragging || selectedDrawingIndex == null || !draggedEndpoint) return;
    console.log("Dragging mode active: line", selectedDrawingIndex, draggedEndpoint);

    const handleMouseMove = (e: MouseEvent) => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      const container = chartContainerRef.current;
      if (!chart || !candleSeries || !container) return;

      // === NEW: Prevent chart pan ===
      if (isDragging) { // i.e., if a line endpoint was hit
        e.preventDefault();
        e.stopPropagation();
      }

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Convert pixel to time/price
      const time = chart.timeScale().coordinateToTime(x);
      const price = candleSeries.coordinateToPrice(y);

      console.log("[mousemove] Mouse pixel", x, y, "ChartRef", chart, candleSeries);

      if (time == null || price == null) {
        console.log("[mousemove] time or price null: time=", time, "price=", price);
        return;
      }
      console.log("[mousemove] Setting new endpoint: time", time, "price", price);
      setDrawings((prevDrawings: any[]) => {
        const updated = [...prevDrawings];
        if (updated[selectedDrawingIndex]?.type !== "line") return updated;

        // Shallow copy of line
        const line = { ...updated[selectedDrawingIndex] };
        const points = [...line.points];

        if (draggedEndpoint === "start") {
          console.log("[mousemove] Moving START to", time, price);
          points[0] = { time, value: price };
        } else if (draggedEndpoint === "end") {
          console.log("[mousemove] Moving END to", time, price);
          points[1] = { time, value: price };
        }
        line.points = points;
        updated[selectedDrawingIndex] = line;
        return updated;
      });
    };

    const handleMouseUp = () => {
      console.log("[mouseup] Drag finished.");
      setIsDragging(false);
      setDraggedEndpoint(null);
      // Optionally clear selection here: setSelectedDrawingIndex(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, selectedDrawingIndex, draggedEndpoint]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const container = chartContainerRef.current;
    console.log("Container for mousedown:", container);

    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Only if not in drawing mode
      console.log("[mousedown] event", e);
      if (drawingModeRef.current) return;

      // === NEW: Prevent chart pan ===
      if (isDragging) { // i.e., if a line endpoint was hit
        e.preventDefault();
        e.stopPropagation();
      }

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const time = chart.timeScale().coordinateToTime(x);
      const price = candleSeries.coordinateToPrice(y);
      if (time == null || price == null) return;

      // Check if near a line endpoint
      for (let i = 0; i < drawings.length; i++) {
        const drawing = drawings[i];
        if (drawing.type !== "line") continue;
        const [start, end] = drawing.points;
        const dist = (a: Point, b: Point) => Math.sqrt((a.time - b.time) ** 2 + (a.value - b.value) ** 2);
        const mousePoint = { time, value: price };
        const THRESHOLD = 5;
        if (dist(mousePoint, start) < THRESHOLD) {
          setSelectedDrawingIndex(i);
          setDraggedEndpoint("start");
          setIsDragging(true);
          e.preventDefault();    
          e.stopPropagation();
          return;
        } else if (dist(mousePoint, end) < THRESHOLD) {
          console.log("[mousedown] End endpoint hit, starting drag, line idx:", i, end);
          setSelectedDrawingIndex(i);
          setDraggedEndpoint("end");
          setIsDragging(true);
          e.preventDefault(); 
          e.stopPropagation();
          return;
        }
      }
    };

    container.addEventListener("mousedown", handleMouseDown);
    return () => {
      container.removeEventListener("mousedown", handleMouseDown)
    };
  }, [chartRef.current, candleSeriesRef.current, drawingModeRef.current, drawings]);

}
