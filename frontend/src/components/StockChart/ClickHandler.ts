import { useEffect } from "react";
import { UTCTimestamp, LineSeries } from "lightweight-charts";
import { DrawingLine, DrawingHorizontal, DrawingSixPoint } from "./types";

type Point = { time: UTCTimestamp; value: number };

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
  sixPointHoverLineRef: React.MutableRefObject<any>
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
    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [chartRef.current, candleSeriesRef.current, drawingModeRef.current]);
}
