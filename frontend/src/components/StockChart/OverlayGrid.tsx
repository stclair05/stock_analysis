import { useEffect, useRef } from "react";
import {
  createChart,
  IChartApi,
  LineSeries,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";

type OverlayData = {
  [key: string]: { time: number; value: number }[];
};

interface OverlayGridProps {
  overlayData: OverlayData;
}

const chartConfigs = [
  {
    label: "3Y MA",
    keys: ["three_year_ma"],
    colors: ["#18b85a"], // Green (3Y MA)
    names: ["3Y MA"],
  },
  {
    label: "200DMA + Ichimoku + Supertrend",
    keys: [
      "dma_200",
      "ichimoku_span_a",
      "ichimoku_span_b",
      "supertrend_buy",
      "supertrend_sell",
    ],
    colors: ["#009688", "#9c27b0", "#03a9f4", "#4caf50", "#f44336"],
    names: [
      "200DMA",
      "Ichimoku Span A",
      "Ichimoku Span B",
      "Supertrend Buy",
      "Supertrend Sell",
    ],
  },
  {
    label: "MACE (4W/13W/26W) + 40W MA",
    keys: ["mace_4w", "mace_13w", "mace_26w", "forty_week_ma"],
    colors: [
      "#000000", // Black (MACE 4W)
      "#ffe600", // Yellow (MACE 13W)
      "#f23645", // Red (MACE 26W)
      "#1e88e5", // Blue (40W MA)
    ],
    names: ["MACE 4W", "MACE 13W", "MACE 26W", "40W MA"],
  },
  {
    label: "50DMA + 150DMA",
    keys: ["dma_50", "dma_150"],
    colors: [
      "#1e88e5", // Blue (50DMA)
      "#ff9800", // Orange (150DMA)
    ],
    names: ["50DMA", "150DMA"],
  },
];

export default function OverlayGrid({ overlayData }: OverlayGridProps) {
  const chartRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chartInstances = useRef<(IChartApi | null)[]>([]);

  useEffect(() => {
    chartRefs.current.forEach((container, i) => {
      if (!container) return;

      const chart = createChart(container, {
        height: 250,
        width: container.clientWidth,
        layout: {
          background: { color: "#ffffff" },
          textColor: "#000000",
        },
        grid: {
          vertLines: { color: "#eee" },
          horzLines: { color: "#eee" },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: 0,
        },
      });

      chartInstances.current[i] = chart;

      // 🟤 Add price line FIRST so it's underneath
      const priceData = overlayData["price_line"];
      if (priceData) {
        const priceSeries = chart.addSeries(LineSeries, {
          color: "#000000",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          lineStyle: 0, // 0 = solid, 1 = dotted, 2 = dashed
        });

        priceSeries.setData(
          priceData.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
          }))
        );
      }

      // 🟢 Add overlays after (on top)
      const { keys, colors } = chartConfigs[i];

      keys.forEach((key, j) => {
        const series = chart.addSeries(LineSeries, {
          color: colors[j],
          lineWidth: 2,
          lastValueVisible: true,
          priceLineVisible: false,
        });

        const data = overlayData[key];
        if (data) {
          series.setData(
            data.map((d) => ({
              time: d.time as UTCTimestamp,
              value: d.value,
            }))
          );
        }
      });
    });

    // X-axis sync among the 4 charts
    chartInstances.current.forEach((chart, i) => {
      chart?.timeScale().subscribeVisibleTimeRangeChange((range) => {
        chartInstances.current.forEach((target, j) => {
          if (i !== j && range && target) {
            target.timeScale().setVisibleRange(range);
          }
        });
      });
    });

    return () => {
      chartInstances.current.forEach((chart) => chart?.remove());
      chartInstances.current = [];
    };
  }, [overlayData]);

  return (
    <div className="mt-4">
      <h6 className="text-muted mb-2 fw-bold">📊 Overlay Comparison</h6>
      <div className="row">
        {chartConfigs.map((item, index) => (
          <div className="col-md-6 mb-3" key={item.label}>
            <div className="text-muted small fw-semibold mb-1">
              {item.label}
            </div>
            <div
              ref={(el) => {
                chartRefs.current[index] = el;
              }}
              style={{ width: "100%", height: "250px" }}
            />
            {/* ⬇️ Legend UI */}
            <div className="d-flex flex-wrap mt-1">
              {item.keys.map((key, i) => (
                <div key={key} className="me-3 d-flex align-items-center small">
                  <span
                    style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      backgroundColor: item.colors[i],
                      marginRight: "6px",
                      borderRadius: "2px",
                    }}
                  />
                  <span>{item.names[i]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
