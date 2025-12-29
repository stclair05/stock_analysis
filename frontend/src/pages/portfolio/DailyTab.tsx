import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";

/* ============================
   Tuning knobs
============================ */
const MOVE_SIZE_WEIGHT = 0.35;
const COMPRESS_MV = true;
const CHANGE_CLAMP = 6;

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
  market_value: number;
  sector?: string;
  daily_change_percent?: number | null;
  category?: string;
  static_asset?: boolean;
};

type MomentumMaps = {
  momentum_weekly: Record<string, number>;
  portfolio_momentum_weekly: Record<string, number>;
};

type TreemapNode = {
  name: string;
  size?: number;
  changePercent?: number | null;
  nodeType?: "sectorHeader" | "ticker";
  sectorName?: string;
  sectorLabel?: string;
  sectorMomentum?: number | null;
  portfolioMomentum?: number | null;
  children?: TreemapNode[];
};

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

/* ============================
   Custom Treemap Content
============================ */
const CustomContent = (props: any) => {
  const { x, y, width, height, name, onZoom, isZoomed } = props;
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
          y={y + height / 2 + font / 3}
          fill="#f8fafc"
          fontSize={font}
          fontWeight={800}
          textAnchor="middle"
          pointerEvents="none"
        >
          {label}
        </text>
      </g>
    );
  }

  /* -------- Ticker Tile -------- */
  const bg = getColorForChange(node.changePercent);
  const tickerFont = clamp(Math.sqrt(width * height) / 8, 12, 32);
  const smallFont = clamp(tickerFont * 0.65, 10, 16);
  const lineGap = clamp(smallFont * 0.4, 4, 8);

  const tickerY = innerY + tickerFont;
  const pctY = tickerY + smallFont + lineGap;
  const portMtmY = pctY + smallFont + lineGap + 4;
  const sectMtmY = portMtmY + smallFont + lineGap;

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
      {height > 40 && node.changePercent !== null && (
        <text
          x={innerX}
          y={pctY}
          fill="#ffffff"
          fontSize={smallFont}
          fontWeight={600}
          pointerEvents="none"
        >
          {formatPct(node.changePercent)}
        </text>
      )}

      {/* Momentum logic - Only if Zoomed */}
      {isZoomed && height > 80 && (
        <>
          {drawMomentumPill("PORT", node.portfolioMomentum ?? null, portMtmY)}
          {drawMomentumPill("SECT", node.sectorMomentum ?? null, sectMtmY)}
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
    momentum_weekly: {},
    portfolio_momentum_weekly: {},
  });

  useEffect(() => {
    let isActive = true;
    const loadData = async () => {
      try {
        const [hRes, sRes] = await Promise.all([
          fetch("http://localhost:8000/portfolio_live_data"),
          fetch("http://localhost:8000/portfolio_status"),
        ]);
        const hJson = hRes.ok ? await hRes.json() : [];
        const mJson = sRes.ok ? await sRes.json() : null;

        if (isActive) {
          setHoldings(hJson);
          if (mJson) {
            setMomentumMaps({
              momentum_weekly: mJson.momentum_weekly ?? {},
              portfolio_momentum_weekly: mJson.portfolio_momentum_weekly ?? {},
            });
          }
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

  const equityHoldings = useMemo(
    () =>
      holdings.filter(
        (h) =>
          (h.category?.toLowerCase() === "equities" || !h.category) &&
          !h.static_asset
      ),
    [holdings]
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
      const absMove = c === null ? 0 : clamp(Math.abs(c) / CHANGE_CLAMP, 0, 1);
      const tileSize = mvComp * (1 + absMove * MOVE_SIZE_WEIGHT);

      if (!sectors[sector])
        sectors[sector] = {
          totalSize: 0,
          totalMv: 0,
          children: [],
        };

      sectors[sector].totalSize += tileSize;
      sectors[sector].totalMv += mv;

      sectors[sector].children.push({
        name: h.ticker,
        size: tileSize,
        changePercent: c,
        nodeType: "ticker",
        sectorMomentum: momentumMaps.momentum_weekly[h.ticker] ?? null,
        portfolioMomentum:
          momentumMaps.portfolio_momentum_weekly[h.ticker] ?? null,
      });
    }

    if (zoomedSector && sectors[zoomedSector]) {
      const s = sectors[zoomedSector];
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
            },
            ...s.children,
          ],
        },
      ];
    }

    return Object.entries(sectors)
      .map(([name, s]) => {
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
              ? "Momentum details are now visible for this sector."
              : "Select a sector to view momentum score details."}
          </p>
        </div>
      </div>

      <div style={{ width: "100%", height: "70vh", minHeight: 650 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            content={
              <CustomContent onZoom={handleZoom} isZoomed={!!zoomedSector} />
            }
            isAnimationActive
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const node = payload[0].payload;
                if (node.nodeType === "sectorHeader") return null;
                return (
                  <div className="bg-white p-3 rounded shadow border small">
                    <div className="fw-bold border-bottom pb-1 mb-2">
                      {node.name}
                    </div>
                    <div className="d-flex justify-content-between gap-4">
                      <span>Change:</span>
                      <span
                        className={
                          node.changePercent >= 0
                            ? "text-success fw-bold"
                            : "text-danger fw-bold"
                        }
                      >
                        {formatPct(node.changePercent)}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between gap-4 mt-2">
                      <span>Port Momentum:</span>
                      <span className="fw-bold">
                        {formatMomentum(node.portfolioMomentum)}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between gap-4">
                      <span>Sect Momentum:</span>
                      <span className="fw-bold">
                        {formatMomentum(node.sectorMomentum)}
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
