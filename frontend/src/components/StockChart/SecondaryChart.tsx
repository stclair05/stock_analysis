import {
  createChart,
  CrosshairMode,
  LineSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  PriceScaleMode,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

interface SecondaryChartProps {
  comparisonSymbol: string;
  chartRef?: React.MutableRefObject<IChartApi | null>;
}

const SecondaryChart = ({
  comparisonSymbol,
  chartRef: externalChartRef,
}: SecondaryChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!containerRef.current || containerRef.current.clientWidth === 0) return;

    containerRef.current.innerHTML = "";

    const chart = createChart(containerRef.current, {
      height: 200,
      layout: { background: { color: "#ffffff" }, textColor: "#000000" },
      crosshair: { mode: CrosshairMode.Normal },
      grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const priceSeries = chart.addSeries(LineSeries, {
      color: "#2962FF",
      lineWidth: 2,
    });
    const maSeries = chart.addSeries(LineSeries, {
      color: "#9C27B0",
      lineWidth: 1,
    });

    chartRef.current = chart;
    priceSeriesRef.current = priceSeries;
    maSeriesRef.current = maSeries;
    externalChartRef && (externalChartRef.current = chart);
    chart
      .priceScale("right")
      .applyOptions({ mode: PriceScaleMode.Logarithmic });

    return () => {
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      maSeriesRef.current = null;
    };
  }, [comparisonSymbol]);

  // Fetch ratio chart data and update chart
  useEffect(() => {
    async function fetchData() {
      if (!priceSeriesRef.current || !maSeriesRef.current) return;
      try {
        const resPrice = await fetch(
          `http://localhost:8000/api/chart_data_monthly/${comparisonSymbol}`
        );
        const priceData = await resPrice.json();
        if (priceData.history) {
          priceSeriesRef.current.setData(
            priceData.history.map((b: any) => ({
              time: b.time as UTCTimestamp,
              value: b.close,
            }))
          );
        }
        const resMa = await fetch(
          `http://localhost:8000/overlay_data/${comparisonSymbol}?timeframe=monthly`
        );
        const maData = await resMa.json();
        if (maData.ma_36) {
          maSeriesRef.current.setData(
            maData.ma_36.map((d: any) => ({
              time: d.time as UTCTimestamp,
              value: d.value,
            }))
          );
        }
        chartRef.current?.timeScale().fitContent();
      } catch (err) {
        console.error("Failed to fetch secondary chart data", err);
      }
    }

    fetchData();
  }, [comparisonSymbol]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "200px",
        border: "1px solid #ddd",
        borderRadius: "6px",
      }}
    />
  );
};

export default SecondaryChart;
