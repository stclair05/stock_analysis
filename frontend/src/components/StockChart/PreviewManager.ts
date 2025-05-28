import { useEffect } from "react";
import { ISeriesApi, LineSeries, UTCTimestamp } from "lightweight-charts";
import { CopyTrendlineBuffer } from "./types";

type Point = { time: UTCTimestamp; value: number };

export function usePreviewManager(
  chartRef: React.MutableRefObject<any>,
  drawingModeRef: React.MutableRefObject<"trendline" | "horizontal" | "sixpoint" | "move-endpoint" | "copy-trendline" |null>,
  lineBufferRef: React.MutableRefObject<Point[]>,
  hoverPoint: Point | null,
  previewSeriesRef: React.MutableRefObject<ISeriesApi<"Line"> | null>,
  sixPointHoverLineRef: React.MutableRefObject<ISeriesApi<"Line"> | null>,
  moveEndpointFixedRef: React.MutableRefObject<Point | null>,
  copyBufferRef: React.MutableRefObject<CopyTrendlineBuffer | null>
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
    } 

    else if (drawingModeRef.current === "copy-trendline" && copyBufferRef.current && hoverPoint) {
      const { dx, dy } = copyBufferRef.current;
      const start = { time: hoverPoint.time as UTCTimestamp, value: hoverPoint.value };
      const end = { time: (hoverPoint.time + dx) as UTCTimestamp, value: hoverPoint.value + dy };
      if (!previewSeriesRef.current) {
        previewSeriesRef.current = chart.addSeries(LineSeries, {
          color: "#708090",
          lineWidth: 1,
          lineStyle: 1,
        });
      }
      previewSeriesRef.current.setData([start, end]);
    }



    // ---- Move endpoint preview (NEW LOGIC)
    else if (
      drawingModeRef.current === "move-endpoint" &&
      moveEndpointFixedRef?.current &&
      hoverPoint
    ) {
      const [p1, p2] = [moveEndpointFixedRef.current, hoverPoint];
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
      return;
    }
    else if (
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
