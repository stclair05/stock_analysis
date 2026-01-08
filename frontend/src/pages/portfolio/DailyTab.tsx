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
  shares?: number;
  daily_change_percent?: number | null;
  five_day_change_percent?: number | null;
  twenty_one_day_change_percent?: number | null;
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
  dailyChange?: number | null;
  nodeType?: "sectorHeader" | "ticker";
  sectorName?: string;
  sectorLabel?: string;
  fiveDayChangePercent?: number | null;
  twentyOneDayChangePercent?: number | null;
  portfolioMomentum5d?: number | null;
  portfolioMomentum21d?: number | null;
  children?: TreemapNode[];
};

type HeatmapMode =
  | "dailyChange"
  | "priceChange5d"
  | "priceChange21d"
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

const formatCurrency = (v?: number | null) =>
  v === null || v === undefined
    ? "N/A"
    : v.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
      });

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
    const dailyChangeText =
      heatmapMode === "dailyChange" &&
      node.dailyChange !== null &&
      node.dailyChange !== undefined
        ? formatCurrency(node.dailyChange)
        : null;
    const dailyChangeColor =
      (node.dailyChange ?? 0) >= 0 ? "#bef264" : "#fca5a5";

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
        {dailyChangeText && (
          <text
            x={x + width / 2}
            y={y + height / 2 + font + changeFont}
            fill={dailyChangeColor}
            fontSize={changeFont}
            fontWeight={800}
            textAnchor="middle"
            pointerEvents="none"
          >
            {dailyChangeText}
          </text>
        )}
      </g>
    );
  }

  /* -------- Ticker Tile -------- */
  const metricValue =
    (heatmapMode === "dailyChange"
      ? node.changePercent
      : heatmapMode === "priceChange5d"
      ? node.fiveDayChangePercent
      : heatmapMode === "priceChange21d"
      ? node.twentyOneDayChangePercent
      : heatmapMode === "portfolioMomentum5d"
      ? node.portfolioMomentum5d
      : node.portfolioMomentum21d) ?? null;

  const metricLabel =
    heatmapMode === "dailyChange"
      ? "1D"
      : heatmapMode === "priceChange5d"
      ? "5D"
      : heatmapMode === "priceChange21d"
      ? "21D"
      : heatmapMode === "portfolioMomentum5d"
      ? "Port 5d"
      : "Port 21d";

  const metricFormatter =
    heatmapMode === "portfolioMomentum5d" ||
    heatmapMode === "portfolioMomentum21d"
      ? formatMomentum
      : formatPct;

  const bg =
    heatmapMode === "portfolioMomentum5d" ||
    heatmapMode === "portfolioMomentum21d"
      ? getColorForMomentum(metricValue)
      : getColorForChange(metricValue);
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
          {metricLabel}: {metricFormatter(metricValue)}
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

  const portfolioChangeSummary = useMemo(() => {
    const computeChange = (
      getPercent: (h: Holding) => number | null,
      getAbsoluteChange?: (h: Holding) => number | null
    ) => {
      let totalMarketValue = 0;
      let totalChange = 0;
      let weightedPctNumerator = 0;
      let pctWeight = 0;

      normalizedHoldings.forEach((h) => {
        const mv =
          typeof h.market_value === "number"
            ? Math.max(h.market_value, 0)
            : null;
        if (mv !== null) totalMarketValue += mv;

        const pct = getPercent(h);
        const changeFromPercent =
          pct !== null && mv !== null ? (mv * pct) / 100 : null;
        const absoluteChange = getAbsoluteChange?.(h) ?? null;
        const change =
          absoluteChange !== null && typeof absoluteChange === "number"
            ? absoluteChange
            : changeFromPercent;

        if (typeof change === "number") totalChange += change;
        if (pct !== null && mv !== null) {
          weightedPctNumerator += mv * pct;
          pctWeight += mv;
        }
      });

      const totalChangePercent =
        pctWeight > 0 ? weightedPctNumerator / pctWeight : null;

      return { totalMarketValue, totalChange, totalChangePercent };
    };

    const daily = computeChange(
      (h) =>
        typeof h.daily_change_percent === "number"
          ? h.daily_change_percent
          : null,
      (h) =>
        typeof h.daily_change === "number" && typeof h.shares === "number"
          ? h.daily_change * h.shares
          : null
    );

    const fiveDay = computeChange((h) =>
      typeof h.five_day_change_percent === "number"
        ? h.five_day_change_percent
        : null
    );

    const twentyOneDay = computeChange((h) =>
      typeof h.twenty_one_day_change_percent === "number"
        ? h.twenty_one_day_change_percent
        : null
    );

    return { daily, fiveDay, twentyOneDay };
  }, [normalizedHoldings]);

  const changeSummary = useMemo(() => {
    if (heatmapMode === "priceChange5d") {
      return { ...portfolioChangeSummary.fiveDay, label: "5D change" };
    }
    if (heatmapMode === "priceChange21d") {
      return { ...portfolioChangeSummary.twentyOneDay, label: "21D change" };
    }
    return { ...portfolioChangeSummary.daily, label: "Daily change" };
  }, [heatmapMode, portfolioChangeSummary]);

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

    const getChangeForMode = (h: Holding) => {
      if (heatmapMode === "priceChange5d")
        return h.five_day_change_percent ?? null;
      if (heatmapMode === "priceChange21d")
        return h.twenty_one_day_change_percent ?? null;
      return h.daily_change_percent ?? null;
    };

    for (const h of equityHoldings) {
      const sector = (h.sector || "Other").trim();
      const mv = Math.max(h.market_value ?? 0, 0);
      if (mv <= 0) continue;

      const c = getChangeForMode(h);
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
          dailyChangeTotal: 0,
          dailyChangeSeen: false,
          children: [],
        };

      sectors[sector].totalSize += tileSize;
      sectors[sector].totalMv += mv;
      if (c !== null) {
        sectors[sector].changeValue += mv * c;
        sectors[sector].changeMv += mv;
      }
      if (typeof h.daily_change === "number" && typeof h.shares === "number") {
        sectors[sector].dailyChangeTotal += h.daily_change * h.shares;
        sectors[sector].dailyChangeSeen = true;
      }

      sectors[sector].children.push({
        name: h.ticker,
        size: tileSize,
        changePercent: h.daily_change_percent ?? null,
        fiveDayChangePercent: h.five_day_change_percent ?? null,
        twentyOneDayChangePercent: h.twenty_one_day_change_percent ?? null,
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
      const sectorDailyChange = s.dailyChangeSeen ? s.dailyChangeTotal : null;
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
              dailyChange: sectorDailyChange,
            },
            ...s.children,
          ],
        },
      ];
    }

    return Object.entries(sectors)
      .map(([name, s]) => {
        const sectorChange = s.changeMv > 0 ? s.changeValue / s.changeMv : null;
        const sectorDailyChange = s.dailyChangeSeen ? s.dailyChangeTotal : null;
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
              dailyChange: sectorDailyChange,
            },
            ...s.children,
          ],
        };
      })
      .sort((a, b) => b.size - a.size);
  }, [equityHoldings, heatmapMode, momentumMaps, zoomedSector]);

  if (loading) return <div className="p-4">Loading performance…</div>;
  if (error) return <div className="p-4 text-danger">{error}</div>;

  return (
    <div className="p-3 p-md-4 bg-white rounded shadow-sm border h-100">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-3">
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
        <div className="d-flex flex-column align-items-end gap-2">
          <div className="text-end">
            <div className="text-uppercase small fw-semibold text-muted">
              Total portfolio value
            </div>
            <div className="fw-bold fs-5">
              {formatCurrency(changeSummary.totalMarketValue)}
            </div>
            <div className="small">
              <span
                className={
                  typeof changeSummary.totalChange === "number"
                    ? changeSummary.totalChange >= 0
                      ? "text-success fw-semibold"
                      : "text-danger fw-semibold"
                    : "text-muted"
                }
              >
                {formatCurrency(changeSummary.totalChange)}
                <span className="ms-1">
                  ({formatPct(changeSummary.totalChangePercent)})
                </span>
              </span>
              <span className="ms-2 text-muted text-uppercase fw-semibold">
                {changeSummary.label}
              </span>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
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
                  heatmapMode === "priceChange5d"
                    ? "btn-primary"
                    : "btn-outline-primary"
                }`}
                onClick={() => setHeatmapMode("priceChange5d")}
              >
                5D price change
              </button>
              <button
                type="button"
                className={`btn ${
                  heatmapMode === "priceChange21d"
                    ? "btn-primary"
                    : "btn-outline-primary"
                }`}
                onClick={() => setHeatmapMode("priceChange21d")}
              >
                21D price change
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
      </div>

      <div style={{ width: "100%", height: "70vh", minHeight: 650 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            key={heatmapMode}
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
                    : heatmapMode === "priceChange5d"
                    ? node.fiveDayChangePercent
                    : heatmapMode === "priceChange21d"
                    ? node.twentyOneDayChangePercent
                    : heatmapMode === "portfolioMomentum5d"
                    ? node.portfolioMomentum5d
                    : node.portfolioMomentum21d;

                const colorLabel =
                  heatmapMode === "dailyChange"
                    ? "1D price change"
                    : heatmapMode === "priceChange5d"
                    ? "5D price change"
                    : heatmapMode === "priceChange21d"
                    ? "21D price change"
                    : heatmapMode === "portfolioMomentum5d"
                    ? "Portfolio momentum (5d)"
                    : "Portfolio momentum (21d)";

                const colorFormatter =
                  heatmapMode === "portfolioMomentum5d" ||
                  heatmapMode === "portfolioMomentum21d"
                    ? formatMomentum
                    : formatPct;

                const colorClass =
                  (heatmapMode === "dailyChange" ||
                    heatmapMode === "priceChange5d" ||
                    heatmapMode === "priceChange21d") &&
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
