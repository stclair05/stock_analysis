import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";

/* ============================
   Tuning knobs
============================ */
const MOVE_SIZE_WEIGHT = 0.5;
const COMPRESS_MV = true;
const CHANGE_CLAMP = 6;
const NEGATIVE_BIAS_WEIGHT = -0.25;

const SECTOR_HEADER_FRACTION = 0.1;
const SECTOR_HEADER_MIN_UNITS = 120;

/* ============================
   Sector label shortening
============================ */
const SECTOR_ABBREVIATIONS: Record<string, string> = {
  "Aerospace & Defense": "AERO/DEF",
  "Communication Services": "COMMS",
  "Consumer Cyclical": "CONS CYC",
  "Consumer Defensive": "CONS DEF",
  "Real Estate": "REAL EST",
  "Basic Materials": "BASIC MAT",
  "Precious Metals": "PREC MET",
  "Financial Services": "FIN",
  Financials: "FIN",
  Technology: "TECH",
  Healthcare: "HEALTH",
};

type Holding = {
  ticker: string;
  market_value?: number;
  sector?: string;
  daily_change_percent?: number | null;
  current_price?: number;
  invested_capital?: number;
  daily_change?: number | null;
  category?: string;
  static_asset?: boolean;
};

type MomentumMaps = {
  portfolio_momentum_weekly: Record<string, number>;
  portfolio_momentum_monthly: Record<string, number>;
};

type TreemapNode = {
  name: string;
  size?: number;
  changePercent?: number | null;
  nodeType?: "sectorHeader" | "ticker";
  sectorName?: string;
  sectorLabel?: string;
  portfolioMomentum5d?: number | null;
  portfolioMomentum21d?: number | null;
  children?: TreemapNode[];
};

type HeatmapMode =
  | "dailyChange"
  | "portfolioMomentum5d"
  | "portfolioMomentum21d";

/* ============================
   Helpers
============================ */
const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

const formatPct = (v?: number | null) =>
  v === null || v === undefined
    ? "N/A"
    : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const formatMomentum = (v?: number | null) =>
  v === null || v === undefined ? "N/A" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

const truncate = (s: string, max = 18) => {
  const cleaned = (s ?? "").trim();
  if (!cleaned) return "OTHER";
  if (cleaned.length <= max) return cleaned.toUpperCase();
  return `${cleaned.slice(0, max - 1)}…`.toUpperCase();
};

const sectorLabelForBox = (fullSector: string, width: number) => {
  const trimmed = (fullSector ?? "Other").trim();
  const base = SECTOR_ABBREVIATIONS[trimmed] ?? trimmed;
  if (width < 60) return truncate(base, 4);
  if (width < 100) return truncate(base, 8);
  return truncate(base, 20);
};

/**
 * Momentum Color Logic
 * Based on user-provided style requirements
 */
const getMomentumStyle = (score: number | null) => {
  if (score === null) return { background: "#f1f3f5", color: "#495057" };
  if (score >= 2) return { background: "#d1fae5", color: "#065f46" }; // strong positive
  if (score >= 1) return { background: "#e0f2fe", color: "#075985" }; // positive
  if (score <= -2) return { background: "#fee2e2", color: "#991b1b" }; // very weak
  if (score <= -1) return { background: "#fff4e6", color: "#9a3412" }; // weak
  return { background: "#f1f3f5", color: "#495057" }; // neutral
};

/* ============================
   Heatmap Colors (Ticker background)
============================ */
const COLOR_STOPS = [
  { percent: -6, color: "#7a0000" },
  { percent: -3, color: "#b00000" },
  { percent: -1, color: "#d84343" },
  { percent: 0, color: "#9ca3af" },
  { percent: 1, color: "#4ade80" },
  { percent: 3, color: "#22c55e" },
  { percent: 6, color: "#15803d" },
];

const MISSING_CHANGE_COLOR = "#cbd5e1";

const MOMENTUM_COLOR_STOPS = [
  { score: -3, color: "#7a0000" },
  { score: -1.5, color: "#b00000" },
  { score: -0.5, color: "#d84343" },
  { score: 0, color: "#9ca3af" },
  { score: 0.5, color: "#4ade80" },
  { score: 1.5, color: "#22c55e" },
  { score: 3, color: "#15803d" },
];

const hexToRgb = (hex: string) => {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

const interpolateColor = (a: string, b: string, t: number) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(A.r + (B.r - A.r) * t)}, ${Math.round(
    A.g + (B.g - A.g) * t
  )}, ${Math.round(A.b + (B.b - A.b) * t)})`;
};

const getColorForChange = (change?: number | null) => {
  if (change === null || change === undefined) return MISSING_CHANGE_COLOR;
  const v = clamp(change, -CHANGE_CLAMP, CHANGE_CLAMP);
  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (const stop of COLOR_STOPS) {
    if (stop.percent <= v) lower = stop;
    if (stop.percent >= v) {
      upper = stop;
      break;
    }
  }
  if (lower.percent === upper.percent) return lower.color;
  return interpolateColor(
    lower.color,
    upper.color,
    (v - lower.percent) / (upper.percent - lower.percent)
  );
};

const getColorForMomentum = (score?: number | null) => {
  if (score === null || score === undefined) return MISSING_CHANGE_COLOR;
  const v = clamp(score, -3, 3);
  let lower = MOMENTUM_COLOR_STOPS[0];
  let upper = MOMENTUM_COLOR_STOPS[MOMENTUM_COLOR_STOPS.length - 1];

  for (const stop of MOMENTUM_COLOR_STOPS) {
    if (stop.score <= v) lower = stop;
    if (stop.score >= v) {
      upper = stop;
      break;
    }
  }

  if (lower.score === upper.score) return lower.color;

  return interpolateColor(
    lower.color,
    upper.color,
    (v - lower.score) / (upper.score - lower.score)
  );
};

/* ============================
   Custom Treemap Content
============================ */
const CustomContent = (props: any & { heatmapMode: HeatmapMode }) => {
  const { x, y, width, height, name, onZoom, isZoomed, heatmapMode } = props;
  const node = (props?.payload ?? props) as TreemapNode;

  if (width <= 1 || height <= 1) return null;

  const pad = clamp(Math.min(width, height) * 0.05, 4, 10);
  const innerX = x + pad;
  const innerY = y + pad;

  /* -------- Sector Header -------- */
  if (node.nodeType === "sectorHeader") {
    const font = clamp(Math.sqrt(width * height) / 12, 11, 22);
    const label = isZoomed
      ? "← BACK TO ALL SECTORS"
      : sectorLabelForBox(node.sectorName ?? "Other", width);
    const changeFont = clamp(font * 0.8, 10, 18);
    const changeText =
      node.changePercent === null || node.changePercent === undefined
        ? null
        : formatPct(node.changePercent);
    const changeColor = (node.changePercent ?? 0) >= 0 ? "#bef264" : "#fca5a5";

    return (
      <g onClick={() => onZoom(node.sectorName)} style={{ cursor: "pointer" }}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="#1e293b"
          stroke="#0f172a"
          strokeWidth={1}
        />
        <text
          x={x + width / 2}
          y={y + height / 2}
          fill="#f8fafc"
          fontSize={font}
          fontWeight={800}
          textAnchor="middle"
          pointerEvents="none"
        >
          {label}
        </text>
        {changeText && (
          <text
            x={x + width / 2}
            y={y + height / 2 + font}
            fill={changeColor}
            fontSize={changeFont}
            fontWeight={800}
            textAnchor="middle"
            pointerEvents="none"
          >
            {changeText}
          </text>
        )}
      </g>
    );
  }

  /* -------- Ticker Tile -------- */
  const metricValue =
    (heatmapMode === "dailyChange"
      ? node.changePercent
      : heatmapMode === "portfolioMomentum5d"
      ? node.portfolioMomentum5d
      : node.portfolioMomentum21d) ?? null;

  const metricLabel =
    heatmapMode === "dailyChange"
      ? "Change"
      : heatmapMode === "portfolioMomentum5d"
      ? "Port 5d"
      : "Port 21d";

  const bg =
    heatmapMode === "dailyChange"
      ? getColorForChange(metricValue)
      : getColorForMomentum(metricValue);
  const tickerFont = clamp(Math.sqrt(width * height) / 8, 12, 32);
  const smallFont = clamp(tickerFont * 0.65, 10, 16);
  const lineGap = clamp(smallFont * 0.4, 4, 8);

  const tickerY = innerY + tickerFont;
  const pctY = tickerY + smallFont + lineGap;
  const portMtmY = pctY + smallFont + lineGap + 4;
  const portMtm21Y = portMtmY + smallFont + lineGap + 8;

  const drawMomentumPill = (
    label: string,
    value: number | null,
    textY: number
  ) => {
    if (value === null) return null;
    const style = getMomentumStyle(value);
    const text = `${label}: ${formatMomentum(value)}`;

    // Width based on text length
    const pillWidth = text.length * (smallFont * 0.62) + 14;
    const pillHeight = smallFont + 8;

    return (
      <g>
        <rect
          x={innerX}
          y={textY - smallFont}
          rx={4}
          ry={4}
          width={pillWidth}
          height={pillHeight}
          fill={style.background}
          style={{ filter: "drop-shadow(0px 1px 1px rgba(0,0,0,0.15))" }}
        />
        <text
          x={innerX + 7}
          y={textY}
          fill={style.color}
          fontSize={smallFont}
          fontWeight={700}
          pointerEvents="none"
        >
          {text}
        </text>
      </g>
    );
  };

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={bg}
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={1}
      />

      {/* Symbol */}
      {height > 20 && width > 25 && (
        <text
          x={innerX}
          y={tickerY}
          fill="#ffffff"
          fontSize={tickerFont}
          fontWeight={900}
          style={{
            paintOrder: "stroke",
            stroke: "rgba(0,0,0,0.3)",
            strokeWidth: 1.5,
          }}
          pointerEvents="none"
        >
          {name}
        </text>
      )}

      {/* Percentage */}
      {height > 40 && metricValue !== null && (
        <text
          x={innerX}
          y={pctY}
          fill="#ffffff"
          fontSize={smallFont}
          fontWeight={600}
          pointerEvents="none"
        >
          {metricLabel}:{" "}
          {heatmapMode === "dailyChange"
            ? formatPct(metricValue)
            : formatMomentum(metricValue)}
        </text>
      )}

      {/* Momentum logic - Only if Zoomed */}
      {isZoomed && height > 80 && (
        <>
          {drawMomentumPill(
            "PORT 5d",
            node.portfolioMomentum5d ?? null,
            portMtmY
          )}
          {drawMomentumPill(
            "PORT 21d",
            node.portfolioMomentum21d ?? null,
            portMtm21Y
          )}
        </>
      )}
    </g>
  );
};

/* ============================
   Daily Performance Component
============================ */
const DailyTab = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomedSector, setZoomedSector] = useState<string | null>(null);
  const [momentumMaps, setMomentumMaps] = useState<MomentumMaps>({
    portfolio_momentum_weekly: {},
    portfolio_momentum_monthly: {},
  });
  const [forexRates, setForexRates] = useState<Record<string, number>>({});
  const [momentumLoading, setMomentumLoading] = useState(false);
  const [momentumError, setMomentumError] = useState<string | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("dailyChange");

  const getCurrencyForTicker = (ticker: string): string => {
    if (ticker.endsWith(".AX")) return "AUD";
    if (ticker.endsWith(".TO")) return "CAD";
    if (ticker.endsWith(".HK")) return "HKD";
    if (ticker.endsWith(".AS")) return "EUR";
    if (ticker.endsWith(".L")) return "GBP";
    return "USD";
  };

  const getUsdToCurrencyRate = (currency: string): number => {
    if (currency === "USD") return 1;
    const pair1 = `USD${currency}`;
    const pair2 = `${currency}USD`;
    if (forexRates[pair1]) return forexRates[pair1];
    if (forexRates[pair2]) return 1 / forexRates[pair2];
    return 1;
  };

  useEffect(() => {
    let isActive = true;
    const loadData = async () => {
      try {
        const hRes = await fetch("http://localhost:8000/portfolio_live_data");
        const hJson = hRes.ok ? await hRes.json() : [];

        if (isActive) {
          setHoldings(hJson);
        }
      } catch {
        if (isActive) setError("Unable to load daily data.");
      } finally {
        if (isActive) setLoading(false);
      }
    };
    loadData();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const fetchFx = async () => {
      try {
        const res = await fetch("http://localhost:8000/forex_rates");
        const data = await res.json();
        const fx: Record<string, number> = {};
        if (Array.isArray(data)) {
          data.forEach((d: any) => {
            const symbol = d.ticker || d.symbol;
            const price = parseFloat(d.price);
            if (symbol && !isNaN(price)) fx[symbol] = price;
          });
        }
        setForexRates(fx);
      } catch {
        setForexRates({});
      }
    };
    fetchFx();
  }, []);

  const fetchMomentum = async () => {
    setMomentumLoading(true);
    setMomentumError(null);
    try {
      const res = await fetch(
        "http://localhost:8000/portfolio_status?scope=momentum"
      );
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setMomentumMaps({
        portfolio_momentum_weekly: data?.portfolio_momentum_weekly ?? {},
        portfolio_momentum_monthly: data?.portfolio_momentum_monthly ?? {},
      });
    } catch {
      setMomentumError("Momentum scores are unavailable right now.");
    } finally {
      setMomentumLoading(false);
    }
  };

  const normalizedHoldings = useMemo(
    () =>
      holdings.map((h) => {
        const currency = getCurrencyForTicker(h.ticker);
        const rate = getUsdToCurrencyRate(currency);
        const convert = (val?: number | null) =>
          typeof val === "number" && rate ? val / rate : val ?? undefined;
        return {
          ...h,
          current_price: convert(h.current_price),
          market_value: convert(h.market_value),
          invested_capital: convert(h.invested_capital),
          daily_change: convert(h.daily_change),
        } as Holding;
      }),
    [holdings, forexRates]
  );

  const hasMomentum = useMemo(() => {
    const weeklyCount = Object.keys(
      momentumMaps.portfolio_momentum_weekly || {}
    ).length;
    const monthlyCount = Object.keys(
      momentumMaps.portfolio_momentum_monthly || {}
    ).length;
    return weeklyCount + monthlyCount > 0;
  }, [momentumMaps]);

  const equityHoldings = useMemo(
    () =>
      normalizedHoldings.filter(
        (h) =>
          (h.category?.toLowerCase() === "equities" || !h.category) &&
          !h.static_asset
      ),
    [normalizedHoldings]
  );

  const handleZoom = (sectorName?: string) => {
    setZoomedSector(zoomedSector === sectorName ? null : sectorName ?? null);
  };

  const treemapData = useMemo(() => {
    const sectors: Record<string, any> = {};

    for (const h of equityHoldings) {
      const sector = (h.sector || "Other").trim();
      const mv = Math.max(h.market_value ?? 0, 0);
      if (mv <= 0) continue;

      const c = h.daily_change_percent ?? null;
      const mvComp = COMPRESS_MV ? Math.sqrt(mv) : mv;
      const signedMove = c === null ? 0 : clamp(c / CHANGE_CLAMP, -1, 1);
      const absMove = Math.abs(signedMove);
      const directionBias = signedMove * NEGATIVE_BIAS_WEIGHT;
      const tileSize =
        mvComp * Math.max(0.35, 1 + absMove * MOVE_SIZE_WEIGHT + directionBias);

      if (!sectors[sector])
        sectors[sector] = {
          totalSize: 0,
          totalMv: 0,
          changeValue: 0,
          changeMv: 0,
          children: [],
        };

      sectors[sector].totalSize += tileSize;
      sectors[sector].totalMv += mv;
      if (c !== null) {
        sectors[sector].changeValue += mv * c;
        sectors[sector].changeMv += mv;
      }

      sectors[sector].children.push({
        name: h.ticker,
        size: tileSize,
        changePercent: c,
        nodeType: "ticker",
        portfolioMomentum5d:
          momentumMaps.portfolio_momentum_weekly[h.ticker] ?? null,
        portfolioMomentum21d:
          momentumMaps.portfolio_momentum_monthly[h.ticker] ?? null,
      });
    }

    if (zoomedSector && sectors[zoomedSector]) {
      const s = sectors[zoomedSector];
      const sectorChange = s.changeMv > 0 ? s.changeValue / s.changeMv : null;
      return [
        {
          name: zoomedSector,
          size: s.totalSize,
          children: [
            {
              name: "HEADER",
              size: s.totalSize * 0.08,
              nodeType: "sectorHeader",
              sectorName: zoomedSector,
              changePercent: sectorChange,
            },
            ...s.children,
          ],
        },
      ];
    }

    return Object.entries(sectors)
      .map(([name, s]) => {
        const sectorChange = s.changeMv > 0 ? s.changeValue / s.changeMv : null;
        const headerSize = Math.max(
          s.totalSize * SECTOR_HEADER_FRACTION,
          SECTOR_HEADER_MIN_UNITS
        );
        return {
          name,
          size: s.totalSize + headerSize,
          children: [
            {
              name: "HEADER",
              size: headerSize,
              nodeType: "sectorHeader",
              sectorName: name,
              changePercent: sectorChange,
            },
            ...s.children,
          ],
        };
      })
      .sort((a, b) => b.size - a.size);
  }, [equityHoldings, momentumMaps, zoomedSector]);

  if (loading) return <div className="p-4">Loading performance…</div>;
  if (error) return <div className="p-4 text-danger">{error}</div>;

  return (
    <div className="p-3 p-md-4 bg-white rounded shadow-sm border h-100">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="fw-bold mb-0">
            Performance Heatmap {zoomedSector && ` - ${zoomedSector}`}
          </h4>
          <p className="text-muted small mb-0">
            {zoomedSector
              ? "Portfolio momentum details are now visible for this sector."
              : "Select a sector to view portfolio momentum score details."}
          </p>
          {momentumError && (
            <div className="text-danger small mt-1">{momentumError}</div>
          )}
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn ${
                heatmapMode === "dailyChange"
                  ? "btn-primary"
                  : "btn-outline-primary"
              }`}
              onClick={() => setHeatmapMode("dailyChange")}
            >
              Daily change
            </button>
            <button
              type="button"
              className={`btn ${
                heatmapMode === "portfolioMomentum5d"
                  ? "btn-primary"
                  : "btn-outline-primary"
              }`}
              onClick={() => setHeatmapMode("portfolioMomentum5d")}
            >
              Portfolio 5d
            </button>
            <button
              type="button"
              className={`btn ${
                heatmapMode === "portfolioMomentum21d"
                  ? "btn-primary"
                  : "btn-outline-primary"
              }`}
              onClick={() => setHeatmapMode("portfolioMomentum21d")}
            >
              Portfolio 21d
            </button>
          </div>
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={momentumLoading || hasMomentum}
            onClick={fetchMomentum}
          >
            {momentumLoading
              ? "Loading momentum…"
              : hasMomentum
              ? "Momentum loaded"
              : "Load momentum scores"}
          </button>
        </div>
      </div>

      <div style={{ width: "100%", height: "70vh", minHeight: 650 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            content={
              <CustomContent
                onZoom={handleZoom}
                isZoomed={!!zoomedSector}
                heatmapMode={heatmapMode}
              />
            }
            isAnimationActive
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const node = payload[0].payload;
                if (node.nodeType === "sectorHeader") return null;

                const colorValue =
                  heatmapMode === "dailyChange"
                    ? node.changePercent
                    : heatmapMode === "portfolioMomentum5d"
                    ? node.portfolioMomentum5d
                    : node.portfolioMomentum21d;

                const colorLabel =
                  heatmapMode === "dailyChange"
                    ? "Change"
                    : heatmapMode === "portfolioMomentum5d"
                    ? "Portfolio momentum (5d)"
                    : "Portfolio momentum (21d)";

                const colorFormatter =
                  heatmapMode === "dailyChange" ? formatPct : formatMomentum;

                const colorClass =
                  heatmapMode === "dailyChange" &&
                  typeof colorValue === "number"
                    ? colorValue >= 0
                      ? "text-success fw-bold"
                      : "text-danger fw-bold"
                    : "fw-bold";

                return (
                  <div className="bg-white p-3 rounded shadow border small">
                    <div className="fw-bold border-bottom pb-1 mb-2">
                      {node.name}
                    </div>
                    <div className="d-flex justify-content-between gap-4">
                      <span>{colorLabel}:</span>
                      <span className={colorClass}>
                        {colorFormatter(colorValue)}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between gap-4 mt-2">
                      <span>Portfolio momentum (5d):</span>
                      <span className="fw-bold">
                        {formatMomentum(node.portfolioMomentum5d)}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between gap-4 mt-1">
                      <span>Portfolio momentum (21d):</span>
                      <span className="fw-bold">
                        {formatMomentum(node.portfolioMomentum21d)}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DailyTab;
