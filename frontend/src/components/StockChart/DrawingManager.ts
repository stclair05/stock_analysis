import { useRef, useState } from "react";
import { UTCTimestamp, ISeriesApi } from "lightweight-charts";
import { Drawing } from "./types";

export function useDrawingManager(
  chartRef: React.MutableRefObject<any>,
  previewSeriesRef: React.MutableRefObject<ISeriesApi<"Line"> | null>,
  sixPointPreviewRef: React.MutableRefObject<ISeriesApi<"Line"> | null>,
  sixPointHoverLineRef: React.MutableRefObject<ISeriesApi<"Line"> | null>,
  dotLabelSeriesRef: React.MutableRefObject<Map<number, ISeriesApi<"Line">[]>>,
  drawnSeriesRef: React.MutableRefObject<Map<number, ISeriesApi<"Line">>>,
) {
  const drawingModeRef = useRef<"trendline" | "horizontal" | "sixpoint" | "copy-trendline" | null>(null);
  const lineBufferRef = useRef<{ time: UTCTimestamp; value: number }[]>([]);

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [hoverPoint, setHoverPoint] = useState<{ time: UTCTimestamp; value: number } | null>(null);
  const [, forceRerender] = useState(false);

  const clearDrawings = () => {
    const chart = chartRef.current;
    if (!chart) return;

    drawnSeriesRef.current.forEach((series) => chart.removeSeries(series));

    dotLabelSeriesRef.current.forEach((arr) => {
      arr.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch {}
      });
    });

    drawnSeriesRef.current.clear();
    dotLabelSeriesRef.current.clear();
    setDrawings([]);
    lineBufferRef.current = [];

    if (previewSeriesRef.current) {
      chart.removeSeries(previewSeriesRef.current);
      previewSeriesRef.current = null;
    }

    if (sixPointPreviewRef.current) {
      chart.removeSeries(sixPointPreviewRef.current);
      sixPointPreviewRef.current = null;
    }

    if (sixPointHoverLineRef.current) {
      chart.removeSeries(sixPointHoverLineRef.current);
      sixPointHoverLineRef.current = null;
    }
  };

  const toggleMode = (mode: "trendline" | "horizontal" | "sixpoint") => {
    drawingModeRef.current = drawingModeRef.current === mode ? null : mode;
    lineBufferRef.current = [];
    setHoverPoint(null);
    forceRerender((v) => !v);
  };

  const resetChart = () => {
    clearDrawings();
    lineBufferRef.current = [];
    drawingModeRef.current = null;
    setHoverPoint(null);
    forceRerender((v) => !v);
  };

  return {
    drawingModeRef,
    lineBufferRef,
    drawings,
    setDrawings,
    hoverPoint,
    setHoverPoint,
    toggleMode,
    resetChart,
    clearDrawings,
  };
}
