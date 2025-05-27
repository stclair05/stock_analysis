import { useEffect, Dispatch, SetStateAction } from "react";
import { UTCTimestamp, LineSeries } from "lightweight-charts";
import { DrawingLine, DrawingHorizontal, DrawingSixPoint } from "./types";

type Point = { time: UTCTimestamp; value: number };
export type Drawing = DrawingLine | DrawingHorizontal | DrawingSixPoint;

export function useClickHandler(
  chartRef: React.MutableRefObject<any>,
  candleSeriesRef: React.MutableRefObject<any>,
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
      if (!param.time || !param.point || !drawingModeRef.current) return;

      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;

      const time = param.time as UTCTimestamp;
      const point = { time, value: price };

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
        }
      }

      else if (drawingModeRef.current === "horizontal") {
        const horizontalLine: DrawingHorizontal = {
          type: "horizontal",
          price,
          time,
        };
        setDrawings((prev) => [...prev, horizontalLine]);
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
      }

      // Only run if not currently drawing
      if (!drawingModeRef.current) {
        // Loop through all lines
        for (let i = 0; i < drawings.length; i++) {
          const drawing = drawings[i];
          if (drawing.type !== "line") continue;
          const [start, end] = drawing.points; 
          // Get mouse click's time/price
          const price = candleSeries.coordinateToPrice(param.point.y);
          const time = param.time as UTCTimestamp;

          // Check if near endpoints (tweak threshold as needed)
          const dist = (a: { time: any; value: any; }, b: { time: number; value: number; }) => Math.sqrt((a.time - b.time) ** 2 + (a.value - b.value) ** 2);
          const mousePoint = { time, value: price };
          const THRESHOLD = 5; // try ~0.5 units, may need to adjust

          if (dist(mousePoint, start) < THRESHOLD) {
            setSelectedDrawingIndex(i);
            setDraggedEndpoint("start");
            setIsDragging(true);
            return;
          } else if (dist(mousePoint, end) < THRESHOLD) {
            setSelectedDrawingIndex(i);
            setDraggedEndpoint("end");
            setIsDragging(true);
            return;
          }
        }
      }

    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [chartRef.current, candleSeriesRef.current, drawingModeRef.current]);

  // === DRAG ENDPOINT LOGIC START ===
  useEffect(() => {
    if (!isDragging || selectedDrawingIndex == null || !draggedEndpoint) return;
    console.log("Dragging mode active: line", selectedDrawingIndex, draggedEndpoint);
    
    const handleMouseMove = (e: MouseEvent) => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      if (!chart || !candleSeries) return;

      const rect = chart._container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Convert pixel to time/price
      const time = chart.timeScale().coordinateToTime(x);
      const price = candleSeries.coordinateToPrice(y);

      if (time == null || price == null) return;

      setDrawings((prevDrawings: any[]) => {
        const updated = [...prevDrawings];
        if (updated[selectedDrawingIndex]?.type !== "line") return updated;

        // Shallow copy of line
        const line = { ...updated[selectedDrawingIndex] };
        const points = [...line.points];

        if (draggedEndpoint === "start") {
          points[0] = { time, value: price };
        } else if (draggedEndpoint === "end") {
          points[1] = { time, value: price };
        }
        line.points = points;
        updated[selectedDrawingIndex] = line;
        return updated;
      });
    };

    const handleMouseUp = () => {
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
}
