import { useEffect } from "react";
import { ISeriesApi, LineSeries, UTCTimestamp } from "lightweight-charts";

type Point = { time: UTCTimestamp; value: number };

export function usePreviewManager(
  chartRef: React.MutableRefObject<any>,
  drawingModeRef: React.MutableRefObject<"trendline" | "horizontal" | "sixpoint" | null>,
  lineBufferRef: React.MutableRefObject<Point[]>,
  hoverPoint: Point | null,
  previewSeriesRef: React.MutableRefObject<ISeriesApi<"Line"> | null>,
  sixPointHoverLineRef: React.MutableRefObject<ISeriesApi<"Line"> | null>
) {
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (
      drawingModeRef.current === "trendline" &&
      lineBufferRef.current.length === 1 &&
      hoverPoint
    ) {
      const [p1, p2] = [lineBufferRef.current[0], hoverPoint];
      if (p1.time === p2.time) return;

      const previewData = [p1, p2].sort((a, b) => a.time - b.time);

      if (!previewSeriesRef.current) {
        previewSeriesRef.current = chart.addSeries(LineSeries, {
          color: "#708090",
          lineWidth: 1,
          lineStyle: 1,
        });
      }
      previewSeriesRef.current.setData(previewData);
    } else if (
      drawingModeRef.current === "sixpoint" &&
      lineBufferRef.current.length >= 1 &&
      hoverPoint
    ) {
      const lastPoint = lineBufferRef.current[lineBufferRef.current.length - 1];
      if (lastPoint?.time === hoverPoint.time) return;

      const previewLine = [...lineBufferRef.current];
      if (hoverPoint.time !== lastPoint.time) {
        previewLine.push(hoverPoint);
      }

      previewLine.sort((a, b) => a.time - b.time);

      if (!sixPointHoverLineRef.current) {
        sixPointHoverLineRef.current = chart.addSeries(LineSeries, {
          color: "#708090",
          lineWidth: 1,
          lineStyle: 1,
        });
      }

      sixPointHoverLineRef.current.setData(previewLine);
    } else {
      if (previewSeriesRef.current) {
        chart.removeSeries(previewSeriesRef.current);
        previewSeriesRef.current = null;
      }
    }
  }, [hoverPoint]);
}
