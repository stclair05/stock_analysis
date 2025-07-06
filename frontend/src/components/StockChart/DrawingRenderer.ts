import { useEffect } from "react";
import {
  ISeriesApi,
  IChartApi,
  LineSeries,
  UTCTimestamp,
} from "lightweight-charts";
import { Drawing } from "./types";

export function useDrawingRenderer(
  chartRef: React.MutableRefObject<IChartApi | null>,
  drawings: Drawing[],
  drawnSeriesRef: React.MutableRefObject<Map<number, ISeriesApi<"Line">>>,
  dotLabelSeriesRef: React.MutableRefObject<Map<number, ISeriesApi<"Line">[]>>
) {
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    drawings.forEach((drawing, i) => {
      if (drawing.type === "line") {
        let series = drawnSeriesRef.current.get(i);

        // Create if doesn't exist
        if (!series) {
          series = chart.addSeries(LineSeries, {
            color: "#ff0000",
            lineWidth: 2,
          });
          drawnSeriesRef.current.set(i, series);
        }
        // Always update data!
        series.setData(drawing.points);
      } else if (drawing.type === "horizontal") {
        const t = drawing.time;
        const lineStart = (t - 86400 * 365 * 10) as UTCTimestamp;
        const lineEnd = (t + 86400 * 365 * 10) as UTCTimestamp;

        const series = chart.addSeries(LineSeries, {
          color: "#03A9F4",
          lineWidth: 1,
        });
        series.setData([
          { time: lineStart, value: drawing.price },
          { time: lineEnd, value: drawing.price },
        ]);
        drawnSeriesRef.current.set(i, series);
      } else if (drawing.type === "sixpoint") {
        if (drawing.points.length !== 6) return;

        const sortedPoints = [...drawing.points].sort(
          (a, b) => a.time - b.time
        );

        const series = chart.addSeries(LineSeries, {
          color: "#2a2a2a",
          lineWidth: 2,
        });
        series.setData(sortedPoints);
        series.applyOptions({
          priceLineVisible: false,
          lastValueVisible: false,
        });
        drawnSeriesRef.current.set(i, series);

        const pointLabels = ["A", "B", "C", "D", "E", "X"];
        const dotColor = "#1f77b4";
        const dotLabels: ISeriesApi<"Line">[] = [];

        sortedPoints.forEach((pt, idx) => {
          const dotSeries = chart.addSeries(LineSeries, {
            color: dotColor,
            lineWidth: 1,
            pointMarkersVisible: true,
            pointMarkersRadius: 4,
          });
          dotSeries.setData([{ time: pt.time, value: pt.value }]);
          dotSeries.applyOptions({
            priceLineVisible: false,
            lastValueVisible: true,
            title: pointLabels[idx],
          });
          dotLabels.push(dotSeries);
        });

        dotLabelSeriesRef.current.set(i, dotLabels);
      }
    });
  }, [drawings]);
}
