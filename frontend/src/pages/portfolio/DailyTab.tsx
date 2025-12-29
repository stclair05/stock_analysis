import { useEffect, useMemo, useState } from "react";
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

type TreemapNode = {
  name: string;
  size?: number;
  changePercent?: number | null;
  nodeType?: "sectorHeader" | "ticker";
  sectorName?: string;
  sectorLabel?: string;
  children?: TreemapNode[];
};

type TooltipPayload = {
  name: string;
  payload: TreemapNode;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

const formatPct = (v?: number | null) =>
  v === null || v === undefined
    ? "N/A"
    : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const truncate = (s: string, max = 18) => {
  const cleaned = (s ?? "").trim();
  if (!cleaned) return "OTHER";
  if (cleaned.length <= max) return cleaned.toUpperCase();
  return `${cleaned.slice(0, max - 1)}…`.toUpperCase();
};

const sectorLabelForBox = (fullSector: string, width: number) => {
  const trimmed = (fullSector ?? "Other").trim();
  const base = SECTOR_ABBREVIATIONS[trimmed] ?? trimmed;
  if (width < 80) return truncate(base, 6); // More aggressive truncation
  if (width < 120) return truncate(base, 10);
  return truncate(base, 22);
};

/* ============================
   Colors
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
   Micro-Text Sizing Rules
============================ */
const computeTickerFont = (w: number, h: number) => {
  const base = Math.sqrt(w * h) / 8.2;
  return clamp(base, 8, 36);
};
const computePctFont = (tickerFont: number) => clamp(tickerFont * 0.72, 7, 24);

const canShowTwoLines = (w: number, h: number) => w > 32 && h > 20;
const canShowOneLine = (w: number, h: number) => w > 16 && h > 8;

/* ============================
   Custom Renderer with Zoom
============================ */
const CustomContent = (props: any) => {
  const { x, y, width, height, name, onZoom, isZoomed } = props;
  const node = (props?.payload ?? props) as TreemapNode;

  if (width <= 1 || height <= 1) return null;

  // Reduced padding to 1px for micro-tiles
  const pad = clamp(Math.min(width, height) * 0.1, 1, 12);
  const innerX = x + pad;
  const innerY = y + pad;

  if (node.nodeType === "sectorHeader") {
    const bg = "#111827";
    const font = clamp(Math.sqrt(width * height) / 12.5, 9, 22);
    const pctFont = clamp(font * 0.85, 8, 19);

    const showName = width > 18 && height > 8;
    const showPct = width > 40 && height > 22 && node.changePercent !== null;

    const label = isZoomed
      ? `← BACK TO ALL`
      : sectorLabelForBox(node.sectorName ?? "Other", width);

    return (
      <g onClick={() => onZoom(node.sectorName)} style={{ cursor: "pointer" }}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={bg}
          stroke="#ffffff"
          strokeWidth={2}
        />
        {showName && (
          <text
            x={innerX}
            y={innerY + font}
            fill="#f9fafb"
            fontSize={font}
            fontWeight={900}
            pointerEvents="none"
          >
            {label}
          </text>
        )}
        {showPct && !isZoomed && (
          <text
            x={innerX}
            y={innerY + font + pctFont + 2}
            fill="#e5e7eb"
            fontSize={pctFont}
            fontWeight={800}
            pointerEvents="none"
          >
            {formatPct(node.changePercent)}
          </text>
        )}
      </g>
    );
  }

  const bg = getColorForChange(node.changePercent);
  const show1 = canShowOneLine(width, height);
  const show2 = canShowTwoLines(width, height);
  const tickerFont = computeTickerFont(width, height);
  const pctFont = computePctFont(tickerFont);

  const tickerY = innerY + tickerFont;
  const pctY = innerY + tickerFont + pctFont + 2;

  const tickerFits = tickerY <= y + height;
  const canActuallyShowPct =
    show2 && node.changePercent !== null && pctY <= y + height;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={bg}
        stroke="#ffffff"
        strokeWidth={Math.min(width, height) < 18 ? 0.5 : 1}
      />
      {show1 && tickerFits && (
        <text
          x={innerX}
          y={tickerY}
          fill="#ffffff"
          fontSize={tickerFont}
          fontWeight={900}
          pointerEvents="none"
          style={{
            paintOrder: "stroke",
            stroke: "rgba(0,0,0,0.4)",
            strokeWidth: 1,
          }}
        >
          {name}
        </text>
      )}
      {canActuallyShowPct && (
        <text
          x={innerX}
          y={pctY}
          fill="#ffffff"
          fontSize={pctFont}
          fontWeight={800}
          pointerEvents="none"
        >
          {formatPct(node.changePercent)}
        </text>
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

  useEffect(() => {
    fetch("http://localhost:8000/portfolio_live_data")
      .then((r) => r.json())
      .then(setHoldings)
      .catch(() => setError("Unable to load daily performance."))
      .finally(() => setLoading(false));
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
    if (zoomedSector === sectorName) setZoomedSector(null);
    else if (sectorName) setZoomedSector(sectorName);
  };

  const treemapData = useMemo(() => {
    const sectors: Record<string, any> = {};

    for (const h of equityHoldings) {
      const sector = (h.sector || "Other").trim();
      const mv = Math.max(h.market_value ?? 0, 0);
      if (mv <= 0) continue;

      const c = h.daily_change_percent ?? null;
      const mvComp = COMPRESS_MV ? Math.sqrt(mv) : mv;
      const absMoveNorm =
        c === null ? 0 : clamp(Math.abs(c) / CHANGE_CLAMP, 0, 1);
      const tileSize = mvComp * (1 + absMoveNorm * MOVE_SIZE_WEIGHT);

      if (!sectors[sector])
        sectors[sector] = {
          totalSize: 0,
          totalMv: 0,
          weightedChangeSum: 0,
          children: [],
        };
      sectors[sector].totalSize += tileSize;
      sectors[sector].totalMv += mv;
      if (c !== null) sectors[sector].weightedChangeSum += c * mv;

      sectors[sector].children.push({
        name: h.ticker,
        size: tileSize,
        changePercent: c,
        nodeType: "ticker",
      });
    }

    // If a sector is zoomed, only return that sector's data
    if (zoomedSector && sectors[zoomedSector]) {
      const s = sectors[zoomedSector];
      const sectorChange =
        s.totalMv > 0 ? s.weightedChangeSum / s.totalMv : null;
      return [
        {
          name: zoomedSector,
          size: s.totalSize,
          children: [
            {
              name: "HEADER",
              size: s.totalSize * 0.05,
              nodeType: "sectorHeader",
              sectorName: zoomedSector,
              changePercent: sectorChange,
            },
            ...s.children,
          ],
        },
      ];
    }

    const result = Object.entries(sectors).map(([name, s]) => {
      const sectorChange =
        s.totalMv > 0 ? s.weightedChangeSum / s.totalMv : null;
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
    });

    return result.sort((a, b) => b.size - a.size);
  }, [equityHoldings, zoomedSector]);

  return (
    <div className="p-3 p-md-4 bg-white rounded shadow-sm border h-100">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="fw-bold mb-0">
          Daily Performance {zoomedSector && ` - ${zoomedSector}`}
        </h4>
        <div className="text-muted small">
          Click a sector header to zoom in/out
        </div>
      </div>

      <div style={{ width: "100%", height: "70vh", minHeight: 600 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            content={
              <CustomContent onZoom={handleZoom} isZoomed={!!zoomedSector} />
            }
            stroke="#ffffff"
            isAnimationActive={true}
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const node = payload[0].payload;
                return (
                  <div className="bg-white p-2 rounded shadow border small">
                    <div className="fw-bold">
                      {node.nodeType === "sectorHeader"
                        ? node.sectorName
                        : node.name}
                    </div>
                    <div>
                      Daily:{" "}
                      <span
                        className={
                          node.changePercent >= 0
                            ? "text-success"
                            : "text-danger"
                        }
                      >
                        {formatPct(node.changePercent)}
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
