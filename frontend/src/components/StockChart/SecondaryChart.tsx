import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";


interface SecondaryChartProps {
  primarySymbol: string;
  comparisonSymbol: string;
  timeframe: "daily" | "weekly" | "monthly";
  chartRef?: React.MutableRefObject<IChartApi | null>;
  seriesRef?: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
}

const SecondaryChart = ({
  primarySymbol,
  comparisonSymbol,
  timeframe,
  chartRef: externalChartRef,
  seriesRef: externalSeriesRef,
}: SecondaryChartProps) => {

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartRef.current || chartRef.current.clientWidth === 0) return;

    // Clear previous chart if any
    chartRef.current.innerHTML = "";

    const chart = createChart(chartRef.current, {
      height: 400,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#000000",
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      grid: {
        vertLines: { color: "#eee" },
        horzLines: { color: "#eee" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#42a5f5",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#42a5f5",
      wickDownColor: "#ef5350",
    });

    chartInstanceRef.current = chart;
    candleSeriesRef.current = series;
    externalChartRef && (externalChartRef.current = chart);
    externalSeriesRef && (externalSeriesRef.current = series);


    return () => {
      chart.remove();
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [primarySymbol, comparisonSymbol, timeframe]);

    // Fetch ratio chart data and update chart
    useEffect(() => {
        if (!primarySymbol || !comparisonSymbol) return;
        if (!candleSeriesRef.current) return;

        // Use 1d for daily, 1wk for weekly, 1mo for monthly
        let tf = "1d";
        if (timeframe === "weekly") tf = "1wk";
        else if (timeframe === "monthly") tf = "1mo";

        fetch(`http://localhost:8000/compare_ratio?symbol1=${primarySymbol}&symbol2=${comparisonSymbol}&timeframe=${tf}`)
        .then((res) => res.json())
        .then((data) => {
            if (data.history) {
            candleSeriesRef.current?.setData(data.history.map((bar: any) => ({
                time: bar.time,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                // volume: bar.volume, // (optional, only if your chart uses it)
            })));
            chartInstanceRef.current?.timeScale().fitContent();
            }
        });
    }, [primarySymbol, comparisonSymbol, timeframe]);

  return (
    <div
      ref={chartRef}
      style={{ width: "100%", height: "400px", border: "1px solid #ddd", borderRadius: "6px" }}
    />
  );
};

export default SecondaryChart;
