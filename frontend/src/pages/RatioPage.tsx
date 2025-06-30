import { useState, useRef, useEffect } from "react";
import SecondaryChart from "../components/StockChart/SecondaryChart";
import { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

export default function RatioPage() {
  const [baseInput, setBaseInput] = useState("");
  const [baseSymbol, setBaseSymbol] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [baseFirst, setBaseFirst] = useState(false);

  const ratioChartRefs = useRef<(IChartApi | null)[]>([]);
  const ratioSeriesRefs = useRef<(ISeriesApi<"Line"> | null)[]>([]);
  const ratioRangeUnsubs = useRef<(() => void)[]>([]);
  const autoscaleProvider = useRef(() => {
    let min = Infinity;
    let max = -Infinity;
    ratioSeriesRefs.current.forEach((series) => {
      const data = (series as any)?.data?.() ?? [];
      data.forEach((p: any) => {
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
      });
    });
    if (min === Infinity || max === -Infinity) return null as any;
    return { priceRange: { minValue: min, maxValue: max } } as any;
  });

  useEffect(() => {
    ratioChartRefs.current = compareSymbols.map(
      (_, i) => ratioChartRefs.current[i] || null
    );
    ratioSeriesRefs.current = compareSymbols.map(
      (_, i) => ratioSeriesRefs.current[i] || null
    );
    // Charts may have changed; autoscale will compute using updated refs
    return () => {
      ratioRangeUnsubs.current.forEach((fn) => fn());
      ratioRangeUnsubs.current = [];
    };
  }, [compareSymbols]);

  function findClosestTime(
    series: ISeriesApi<any>,
    time: UTCTimestamp
  ): UTCTimestamp | null {
    const data = (series as any)?.data?.() ?? [];
    if (!data.length) return null;

    let closest = data[0].time;
    let minDiff = Math.abs(time - closest);
    for (let i = 1; i < data.length; i++) {
      const diff = Math.abs(data[i].time - time);
      if (diff < minDiff) {
        closest = data[i].time;
        minDiff = diff;
      }
    }
    return closest;
  }

  function syncRatioCrosshair(sourceIndex: number, time: UTCTimestamp) {
    ratioChartRefs.current.forEach((chart, idx) => {
      const series = ratioSeriesRefs.current[idx];
      if (!chart || !series || idx === sourceIndex) return;
      const snapped = findClosestTime(series, time);
      if (snapped != null) {
        chart.setCrosshairPosition(0, snapped, series);
      }
    });
  }

  function safeSetVisibleRange(chart: IChartApi | null, range: any) {
    if (!chart || !range || range.from == null || range.to == null) return;
    try {
      chart.timeScale().setVisibleRange(range);
    } catch (err) {
      if (!(err instanceof Error && err.message === "Value is null")) {
        console.warn("⛔ safeSetVisibleRange failed", err);
      }
    }
  }

  function registerRatioRangeSync(chart: IChartApi, index: number) {
    const handler = (range: any) => {
      ratioChartRefs.current.forEach((c, idx) => {
        if (c && idx !== index) safeSetVisibleRange(c, range);
      });
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handler);
    ratioRangeUnsubs.current[index] = () =>
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
  }

  const handleAddComparison = () => {
    const sym = compareInput.trim().toUpperCase();
    if (!sym || compareSymbols.includes(sym)) return;
    setCompareSymbols([...compareSymbols, sym]);
    setCompareInput("");
  };

  const handleBaseSet = () => {
    const sym = baseInput.trim().toUpperCase();
    if (!sym) return;
    setBaseSymbol(sym);
  };

  const removeComparison = (sym: string) => {
    setCompareSymbols(compareSymbols.filter((s) => s !== sym));
  };

  return (
    <div
      className="container mt-4"
      style={{ maxWidth: "1000px", margin: "0 auto" }}
    >
      <h1 className="fw-bold text-dark mb-4">Ratio Charts</h1>
      <div className="mb-3">
        <div className="input-group mb-2">
          <input
            type="text"
            className="form-control"
            placeholder="Base Ticker"
            value={baseInput}
            onChange={(e) => setBaseInput(e.target.value.toUpperCase())}
          />
          <button className="btn btn-primary" onClick={handleBaseSet}>
            Set Base
          </button>
        </div>
        <div className="form-check form-switch mb-2">
          <input
            className="form-check-input"
            type="checkbox"
            id="baseFirstSwitch"
            checked={baseFirst}
            onChange={() => setBaseFirst(!baseFirst)}
          />
          <label className="form-check-label" htmlFor="baseFirstSwitch">
            {baseFirst ? "Base / Compare" : "Compare / Base"}
          </label>
        </div>
        <div className="input-group">
          <input
            type="text"
            className="form-control"
            placeholder="Add Comparison Ticker"
            value={compareInput}
            onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
            onKeyPress={(e) => {
              if (e.key === "Enter") handleAddComparison();
            }}
          />
          <button className="btn btn-secondary" onClick={handleAddComparison}>
            Add
          </button>
        </div>
        {compareSymbols.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mt-2">
            {compareSymbols.map((sym) => (
              <span key={sym} className="badge bg-light text-dark border">
                {sym}
                <button
                  className="btn btn-sm btn-link text-danger ms-1 p-0"
                  onClick={() => removeComparison(sym)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      {baseSymbol &&
        compareSymbols.map((sym, idx) => {
          const first = baseFirst ? baseSymbol : sym;
          const second = baseFirst ? sym : baseSymbol;
          return (
            <div key={`${sym}-${idx}`} className="mt-4">
              <div className="fw-bold text-muted mb-1">
                {first}/{second} Ratio
              </div>
              <SecondaryChart
                baseSymbol={first}
                comparisonSymbol={second}
                onReady={(chart, series) => {
                  ratioChartRefs.current[idx] = chart;
                  ratioSeriesRefs.current[idx] = series;
                  registerRatioRangeSync(chart, idx);
                  (series as any).applyOptions?.({
                    autoscaleInfoProvider: autoscaleProvider.current,
                  });
                }}
                onCrosshairMove={(time) => syncRatioCrosshair(idx, time)}
              />
            </div>
          );
        })}
    </div>
  );
}
