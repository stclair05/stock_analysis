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
    label: "3Y MA + Price",
    keys: ["three_year_ma"],
    colors: ["#3f51b5"],
    names: ["3Y MA"],
  },
  {
    label: "200DMA + Ichimoku + Supertrend + Price",
    keys: ["dma_200", "ichimoku_span_a", "ichimoku_span_b", "supertrend_buy", "supertrend_sell"],
    colors: ["#009688", "#9c27b0", "#03a9f4", "#4caf50", "#f44336"],
    names: ["200DMA", "Ichimoku Span A", "Ichimoku Span B", "Supertrend Buy", "Supertrend Sell"],
  },
  {
    label: "MACE + 40W MA + Price",
    keys: ["mace", "forty_week_ma"],
    colors: ["#e91e63", "#795548"],
    names: ["MACE", "40W MA"],
  },
  {
    label: "50DMA + 150DMA + Price",
    keys: ["dma_50", "dma_150"],
    colors: ["#ff9800", "#607d8b"],
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
        height: 220,
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
            <div className="text-muted small fw-semibold mb-1">{item.label}</div>
                <div
                    ref={(el) => {
                    chartRefs.current[index] = el;
                    }}
                    style={{ width: "100%", height: "220px" }}
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
