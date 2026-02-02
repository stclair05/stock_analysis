import { FormEvent, useEffect, useMemo, useState } from "react";
import "./MomentumPage.css";

type SmaMomentumResponse = {
  distance_12d: Record<string, number>;
  distance_36d: Record<string, number>;
};

type SmaPoint = {
  symbol: string;
  dma12?: number;
  dma36?: number;
};

const FALLBACK: SmaMomentumResponse = {
  distance_12d: {},
  distance_36d: {},
};

type MomentumGridProps = {
  data: SmaMomentumResponse;
  loading: boolean;
  error: string | null;
  mode: "portfolio" | "custom";
  zoomScale: number;
  timeframe: "daily" | "weekly";
  customSymbols: string[];
  sectorMap: Record<string, string>;
  selectedSectors: string[];
};

function SmaMomentumGrid({
  data,
  loading,
  error,
  mode,
  zoomScale,
  timeframe,
  customSymbols,
  sectorMap,
  selectedSectors,
}: MomentumGridProps) {
  const [isGridVisible, setIsGridVisible] = useState(true);
  const smaLabel = timeframe === "weekly" ? "WMA" : "DMA";
  const points: SmaPoint[] = useMemo(() => {
    const symbols = new Set<string>([
      ...Object.keys(data.distance_12d || {}),
      ...Object.keys(data.distance_36d || {}),
    ]);

    return Array.from(symbols)
      .sort()
      .map((symbol) => ({
        symbol,
        dma12: data.distance_12d?.[symbol],
        dma36: data.distance_36d?.[symbol],
      }));
  }, [data.distance_12d, data.distance_36d]);

  const visiblePoints = useMemo(() => {
    if (mode !== "portfolio") return points;
    const allowed = new Set(selectedSectors);
    return points.filter((point) =>
      allowed.has(sectorMap[point.symbol] ?? "Uncategorized"),
    );
  }, [mode, points, sectorMap, selectedSectors]);

  const extremes = useMemo(() => {
    const scored = visiblePoints.map((p) => ({
      symbol: p.symbol,
      score: (p.dma12 ?? 0) + (p.dma36 ?? 0),
    }));

    const positive = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((s) => s.symbol);

    const negative = scored
      .filter((s) => s.score < 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 4)
      .map((s) => s.symbol);

    return {
      positive: new Set(positive),
      negative: new Set(negative),
    };
  }, [visiblePoints]);

  const range = useMemo(() => {
    const allValues = visiblePoints
      .flatMap((p) => [p.dma12, p.dma36])
      .filter((value): value is number => typeof value === "number");
    const maxAbs = allValues.length
      ? Math.max(...allValues.map((value) => Math.abs(value)))
      : 0;
    return Math.max(maxAbs, 0.5);
  }, [visiblePoints]);

  const visibleRange = useMemo(
    () => Math.max(range / zoomScale, 0.5),
    [range, zoomScale],
  );

  const toPosition = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 50;
    const clamped = Math.max(Math.min(value, visibleRange), -visibleRange);
    return 50 + (clamped / visibleRange) * 45;
  };

  const jitterPercent = (symbol: string, axis: "x" | "y") => {
    const codeSum = symbol
      .split("")
      .reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
    const axisSeed = axis === "x" ? 17 : 31;
    const normalized = Math.sin(codeSum * axisSeed) * 0.6;
    return normalized;
  };

  const ticks = useMemo(() => {
    const step = Math.max(0.5, Math.round((visibleRange / 3) * 2) / 2);
    const values: number[] = [];
    for (
      let v = -Math.ceil(visibleRange);
      v <= Math.ceil(visibleRange);
      v += step
    ) {
      if (Math.abs(v) < 0.01) continue;
      values.push(parseFloat(v.toFixed(1)));
    }
    return values;
  }, [visibleRange]);

  const formatPercent = (value?: number) =>
    typeof value === "number" ? `${value.toFixed(2)}%` : "-";

  const hasSymbols =
    mode === "portfolio" ? visiblePoints.length > 0 : customSymbols.length > 0;

  return (
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="card-title mb-0">
            12{smaLabel} / 36{smaLabel} distance grid
          </h5>
          <button
            type="button"
            className="btn btn-outline-secondary p-0 d-inline-flex align-items-center justify-content-center"
            style={{ width: "26px", height: "26px", lineHeight: 1 }}
            onClick={() => setIsGridVisible((visible) => !visible)}
            aria-label="Toggle SMA momentum grid"
          >
            <span aria-hidden="true">{isGridVisible ? "−" : "+"}</span>
          </button>
        </div>

        {error && <div className="alert alert-warning">{error}</div>}

        {isGridVisible ? (
          <>
            <div className="momentum-grid mb-3" aria-live="polite">
              <div className="momentum-grid-signal signal-close-buy">
                Close to BUY
              </div>
              <div className="momentum-grid-signal signal-buy">BUY</div>
              <div className="momentum-grid-signal signal-negative-developing">
                Negative developing
              </div>
              <div className="momentum-grid-signal signal-sell">SELL</div>
              <div className="momentum-grid-signal signal-negative-trend">
                Negative trend
              </div>
              <div className="momentum-grid-signal signal-positive-developing">
                Positive developing
              </div>
              <div className="momentum-quadrant-label positive-developing">
                <span className="momentum-quadrant-title">
                  Above 12{smaLabel}, Below 36{smaLabel}
                </span>
              </div>
              <div className="momentum-quadrant-label positive-trend">
                <span className="momentum-quadrant-title">
                  Above 12{smaLabel} &amp; 36{smaLabel}
                </span>
              </div>
              <div className="momentum-quadrant-label negative-trend">
                <span className="momentum-quadrant-title">
                  Below 12{smaLabel} &amp; 36{smaLabel}
                </span>
              </div>
              <div className="momentum-quadrant-label negative-developing">
                <span className="momentum-quadrant-title">
                  Below 12{smaLabel}, Above 36{smaLabel}
                </span>
              </div>

              <div
                className="momentum-axis momentum-axis--x"
                style={{ top: "50%" }}
                aria-hidden
              />
              <div
                className="momentum-axis momentum-axis--y"
                style={{ left: "50%" }}
                aria-hidden
              />
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                <line
                  x1={`${toPosition(-visibleRange)}`}
                  y1={`${100 - toPosition(-visibleRange)}`}
                  x2={`${toPosition(visibleRange)}`}
                  y2={`${100 - toPosition(visibleRange)}`}
                  stroke="rgba(15, 23, 42, 0.2)"
                  strokeWidth="0.2"
                />
                <line
                  x1={`${toPosition(-visibleRange)}`}
                  y1={`${100 - toPosition(visibleRange)}`}
                  x2={`${toPosition(visibleRange)}`}
                  y2={`${100 - toPosition(-visibleRange)}`}
                  stroke="rgba(15, 23, 42, 0.2)"
                  strokeWidth="0.2"
                />
              </svg>

              <div className="momentum-axis-label momentum-axis-label--x">
                Distance from 12{smaLabel} (%)
              </div>
              <div className="momentum-axis-label momentum-axis-label--y">
                Distance from 36{smaLabel} (%)
              </div>

              {ticks.map((tick) => (
                <div
                  key={`x-${tick}`}
                  className="momentum-tick"
                  style={{ left: `${toPosition(tick)}%`, top: "52%" }}
                >
                  <div className="momentum-tick-line momentum-tick-line--x" />
                  <div style={{ transform: "translate(-50%, 6px)" }}>
                    {tick}
                  </div>
                </div>
              ))}
              {ticks.map((tick) => (
                <div
                  key={`y-${tick}`}
                  className="momentum-tick"
                  style={{ top: `${100 - toPosition(tick)}%`, left: "48%" }}
                >
                  <div className="momentum-tick-line momentum-tick-line--y" />
                  <div style={{ transform: "translate(-26px, -50%)" }}>
                    {tick}
                  </div>
                </div>
              ))}

              {visiblePoints.map((point) => {
                const isPositiveExtreme = extremes.positive.has(point.symbol);
                const isNegativeExtreme = extremes.negative.has(point.symbol);
                const quadrantClass =
                  typeof point.dma12 === "number" &&
                  typeof point.dma36 === "number"
                    ? point.dma36 >= 0 && point.dma12 >= 0
                      ? " momentum-point--positive-trend"
                      : point.dma36 < 0 && point.dma12 >= 0
                        ? " momentum-point--positive-developing"
                        : point.dma36 < 0 && point.dma12 < 0
                          ? " momentum-point--negative-trend"
                          : " momentum-point--negative-developing"
                    : "";

                return (
                  <div
                    key={point.symbol}
                    className={`momentum-point${
                      isPositiveExtreme
                        ? " momentum-point--positive-extreme"
                        : ""
                    }${
                      isNegativeExtreme
                        ? " momentum-point--negative-extreme"
                        : ""
                    }${quadrantClass}`}
                    style={{
                      left: `${
                        toPosition(point.dma36) +
                        jitterPercent(point.symbol, "x")
                      }%`,
                      top: `${
                        100 -
                        toPosition(point.dma12) +
                        jitterPercent(point.symbol, "y")
                      }%`,
                    }}
                    title={`${point.symbol}: 12${smaLabel} ${formatPercent(
                      point.dma12,
                    )}, 36${smaLabel} ${formatPercent(point.dma36)}`}
                  >
                    <span className="momentum-point__label">
                      {point.symbol}
                    </span>
                  </div>
                );
              })}
            </div>

            {loading && (
              <div className="text-muted">Loading SMA distances…</div>
            )}
            {!loading && visiblePoints.length === 0 && (
              <div className="text-muted">
                {hasSymbols
                  ? "No SMA distance data available for these symbols."
                  : "Enter symbols above to plot a custom grid."}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted small">SMA grid hidden.</div>
        )}
      </div>
    </div>
  );
}

export default function SmaMomentumPage() {
  const [portfolioData, setPortfolioData] =
    useState<SmaMomentumResponse>(FALLBACK);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
  const [sectors, setSectors] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [isSectorPanelOpen, setIsSectorPanelOpen] = useState(false);

  const [mode, setMode] = useState<"portfolio" | "custom">("portfolio");
  const [customInput, setCustomInput] = useState("");
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [customData, setCustomData] = useState<SmaMomentumResponse>(FALLBACK);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1.25);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly">("daily");

  const fetchPortfolioDistances = () => {
    setPortfolioLoading(true);
    const params = new URLSearchParams({
      list_type: "portfolio",
      timeframe,
    });
    fetch(`http://localhost:8000/sma_momentum?${params.toString()}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load SMA momentum data");
        }
        return res.json();
      })
      .then((json) => {
        setPortfolioData({
          distance_12d: json.distance_12d || {},
          distance_36d: json.distance_36d || {},
        });
        setPortfolioError(null);
      })
      .catch((err) => {
        console.error(err);
        setPortfolioData(FALLBACK);
        setPortfolioError("Unable to fetch SMA distances. Showing empty view.");
      })
      .finally(() => setPortfolioLoading(false));
  };

  useEffect(() => {
    fetchPortfolioDistances();
  }, [timeframe]);

  useEffect(() => {
    const fetchPortfolioSectors = async () => {
      try {
        const res = await fetch("http://localhost:8000/portfolio_tickers");
        if (!res.ok) {
          throw new Error("Failed to load portfolio sectors");
        }
        const json: { ticker?: string; sector?: string }[] = await res.json();
        const map: Record<string, string> = {};
        json.forEach((entry) => {
          if (!entry?.ticker) return;
          const sector = entry?.sector?.trim() || "Uncategorized";
          map[entry.ticker.toUpperCase()] = sector;
        });
        const uniqueSectors = Array.from(new Set(Object.values(map))).sort(
          (a, b) => a.localeCompare(b),
        );
        setSectorMap(map);
        setSectors(uniqueSectors);
        setSelectedSectors((prev) =>
          prev.length > 0
            ? prev.filter((sector) => uniqueSectors.includes(sector))
            : uniqueSectors,
        );
      } catch (err) {
        console.error(err);
        setSectorMap({});
        setSectors([]);
        setSelectedSectors([]);
      }
    };

    fetchPortfolioSectors();
  }, []);

  const fetchCustomDistances = (symbols: string[]) => {
    setCustomLoading(true);
    fetch("http://localhost:8000/custom_sma_momentum", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbols, timeframe }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch custom SMA momentum");
        }
        return res.json();
      })
      .then((json) => {
        setCustomData({
          distance_12d: json.distance_12d || {},
          distance_36d: json.distance_36d || {},
        });
        setCustomError(null);
      })
      .catch((err) => {
        console.error(err);
        setCustomData(FALLBACK);
        setCustomError(
          "Unable to fetch SMA distances for that list. Try different symbols.",
        );
      })
      .finally(() => setCustomLoading(false));
  };

  const onSubmitCustom = (event: FormEvent) => {
    event.preventDefault();
    const parsedSymbols = customInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const uniqueSymbols = Array.from(new Set(parsedSymbols));

    if (uniqueSymbols.length === 0) {
      setCustomError("Enter at least one ticker symbol.");
      return;
    }

    setCustomError(null);
    setMode("custom");
    setCustomSymbols(uniqueSymbols);
    fetchCustomDistances(uniqueSymbols);
  };

  useEffect(() => {
    if (mode === "custom" && customSymbols.length > 0) {
      fetchCustomDistances(customSymbols);
    }
  }, [customSymbols, mode, timeframe]);

  const timeframeLabel = timeframe === "weekly" ? "weekly" : "daily";
  const periodLabel = timeframe === "weekly" ? "12-week" : "12-day";
  const longPeriodLabel = timeframe === "weekly" ? "36-week" : "36-day";
  const subtitle =
    mode === "portfolio"
      ? `Plot of portfolio stocks by percent distance from the ${longPeriodLabel} SMA (x-axis) and ${periodLabel} SMA (y-axis), using ${timeframeLabel} data.`
      : `Plot of your custom stock list by percent distance from the ${longPeriodLabel} SMA (x-axis) and ${periodLabel} SMA (y-axis), using ${timeframeLabel} data.`;

  const allSectorsSelected =
    sectors.length > 0 && selectedSectors.length === sectors.length;

  const toggleAllSectors = () => {
    setSelectedSectors(allSectorsSelected ? [] : sectors);
  };

  const toggleSector = (sector: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sector)
        ? prev.filter((item) => item !== sector)
        : [...prev, sector],
    );
  };

  return (
    <div className="container-fluid momentum-page py-4">
      <div className="momentum-layout">
        <div className="momentum-layout__main">
          <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
            <h1 className="fw-bold mb-0">SMA Momentum</h1>
            <div
              className="btn-group"
              role="group"
              aria-label="SMA momentum view selector"
            >
              <button
                className={`btn btn-outline-primary ${
                  mode === "portfolio" ? "active" : ""
                }`}
                type="button"
                onClick={() => setMode("portfolio")}
              >
                Portfolio grid
              </button>
              <button
                className={`btn btn-outline-primary ${
                  mode === "custom" ? "active" : ""
                }`}
                type="button"
                onClick={() => setMode("custom")}
              >
                Custom list
              </button>
            </div>
            <div className="d-flex align-items-center gap-2 ms-auto">
              <div
                className="btn-group"
                role="group"
                aria-label="SMA momentum timeframe"
              >
                <button
                  className={`btn btn-outline-secondary btn-sm ${
                    timeframe === "daily" ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => setTimeframe("daily")}
                >
                  Daily
                </button>
                <button
                  className={`btn btn-outline-secondary btn-sm ${
                    timeframe === "weekly" ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => setTimeframe("weekly")}
                >
                  Weekly
                </button>
              </div>
              <label
                htmlFor="smaMomentumZoom"
                className="form-label mb-0 small text-muted"
              >
                Zoom
              </label>
              <select
                id="smaMomentumZoom"
                className="form-select form-select-sm w-auto"
                value={zoomScale}
                onChange={(event) => setZoomScale(Number(event.target.value))}
              >
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </div>
            <button
              type="button"
              className="btn btn-outline-secondary momentum-sector-toggle"
              onClick={() => setIsSectorPanelOpen((open) => !open)}
              aria-expanded={isSectorPanelOpen}
              aria-controls="sma-sector-panel"
            >
              <span aria-hidden="true">{isSectorPanelOpen ? "−" : "+"}</span>
            </button>
          </div>

          <p className="text-muted mb-4">{subtitle}</p>

          <div className="card shadow-sm border-0 mb-4">
            <div className="card-body">
              <h5 className="card-title mb-3">Plot a custom symbol grid</h5>
              <form className="row g-3" onSubmit={onSubmitCustom}>
                <div className="col-md-8">
                  <label htmlFor="smaCustomSymbols" className="form-label">
                    Enter ticker symbols (comma or space separated)
                  </label>
                  <input
                    id="smaCustomSymbols"
                    className="form-control"
                    placeholder="e.g. AAPL, MU, PTON"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    aria-describedby="smaCustomSymbolsHelp"
                  />
                </div>
                <div className="col-md-4 d-flex align-items-end">
                  <button
                    type="submit"
                    className="btn btn-primary w-100"
                    disabled={customLoading}
                  >
                    {customLoading ? "Loading…" : "Plot custom grid"}
                  </button>
                </div>
              </form>
              <div id="smaCustomSymbolsHelp" className="form-text">
                Enter any tickers to see how they sit versus their {periodLabel}{" "}
                and {longPeriodLabel} simple moving averages.
              </div>
              {customError && (
                <div className="text-danger small mt-2">{customError}</div>
              )}
              {customSymbols.length > 0 && (
                <div className="text-muted small mt-2">
                  Showing custom list: {customSymbols.join(", ")}
                </div>
              )}
            </div>
          </div>

          <SmaMomentumGrid
            data={mode === "portfolio" ? portfolioData : customData}
            loading={mode === "portfolio" ? portfolioLoading : customLoading}
            error={mode === "portfolio" ? portfolioError : customError}
            mode={mode}
            zoomScale={zoomScale}
            timeframe={timeframe}
            customSymbols={customSymbols}
            sectorMap={sectorMap}
            selectedSectors={selectedSectors}
          />
        </div>
        {isSectorPanelOpen && (
          <aside id="sma-sector-panel" className="momentum-sector-panel">
            <div className="card shadow-sm border-0">
              <div className="card-body">
                <div className="momentum-sector-panel__header">
                  <h5 className="card-title mb-0">Sector filters</h5>
                  <button
                    type="button"
                    className="btn btn-outline-secondary momentum-sector-toggle"
                    onClick={() => setIsSectorPanelOpen(false)}
                    aria-label="Close sector filters"
                  >
                    <span aria-hidden="true">−</span>
                  </button>
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="sma-sector-all"
                    checked={allSectorsSelected}
                    onChange={toggleAllSectors}
                    disabled={mode !== "portfolio" || sectors.length === 0}
                  />
                  <label className="form-check-label" htmlFor="sma-sector-all">
                    All sectors
                  </label>
                </div>
                <div className="momentum-sector-list">
                  {sectors.length === 0 && (
                    <div className="text-muted small">
                      No sector data loaded yet.
                    </div>
                  )}
                  {sectors.map((sector) => (
                    <div className="form-check" key={sector}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`sma-sector-${sector}`}
                        checked={selectedSectors.includes(sector)}
                        onChange={() => toggleSector(sector)}
                        disabled={mode !== "portfolio"}
                      />
                      <label
                        className="form-check-label"
                        htmlFor={`sma-sector-${sector}`}
                      >
                        {sector}
                      </label>
                    </div>
                  ))}
                </div>
                <div className="text-muted small mt-3">
                  {mode === "portfolio"
                    ? `Showing ${selectedSectors.length || 0} of ${
                        sectors.length
                      } sectors.`
                    : "Sector filters apply only to portfolio view."}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
