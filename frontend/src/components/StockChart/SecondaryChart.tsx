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
  baseSymbol: string;
  comparisonSymbol: string;
  chartRef?: React.MutableRefObject<IChartApi | null>;
}

const SecondaryChart = ({
  baseSymbol,
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
        const res = await fetch(
          `http://localhost:8000/compare_ratio?symbol1=${baseSymbol}&symbol2=${comparisonSymbol}&timeframe=monthly`
        );

        const data = await res.json();

        // Support legacy structure where only `history` is returned
        const ratioData = data.ratio
          ? data.ratio
          : (data.history || []).map((p: any) => ({
              time: p.time,
              value: p.close,
            }));

        if (ratioData.length > 0) {
          priceSeriesRef.current.setData(
            ratioData.map((point: any) => ({
              time: point.time as UTCTimestamp,
              value: point.value,
            }))
          );
        }

        const maData = data.ratio_ma_36
          ? data.ratio_ma_36
          : (() => {
              // compute MA if not provided
              const values = ratioData.map((d: any) => d.value);
              const times = ratioData.map((d: any) => d.time);
              const result: { time: number; value: number }[] = [];
              const window = 36;
              for (let i = 0; i < values.length; i++) {
                if (i + 1 < window) continue;
                const slice = values.slice(i + 1 - window, i + 1);
                const sum = slice.reduce((a: number, b: number) => a + b, 0);
                result.push({
                  time: times[i],
                  value: sum / window,
                });
              }
              return result;
            })();

        if (maData.length > 0) {
          maSeriesRef.current.setData(
            maData.map((point: any) => ({
              time: point.time as UTCTimestamp,
              value: point.value,
            }))
          );
        }

        chartRef.current?.timeScale().fitContent();
      } catch (err) {
        console.error("❌ Failed to fetch ratio chart data", err);
      }
    }

    fetchData();
  }, [baseSymbol, comparisonSymbol]);

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
