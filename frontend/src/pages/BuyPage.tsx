import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type CandleTimeframe = "daily" | "weekly" | "monthly";
type CandlePattern = "engulfing" | "harami";

type CandleSignal = {
  pattern: CandlePattern;
  type: "bullish" | "bearish";
  timeframes: CandleTimeframe[];
};

type MovingAverageKey = "20dma" | "200dma" | "40wma" | "70wma" | "3yma";
type MovingAverageDirection = "above" | "below";
type MovingAverageCrossovers = Record<
  string,
  Partial<Record<MovingAverageKey, MovingAverageDirection>>
>;

type ExtendedStatus = "overbought" | "oversold";

type SuperTrendSignal = {
  signal: string;
};

type MaceSignal = {
  label: string;
  trend: string | null | undefined;
};

type StageStatus = {
  stage: number;
  weeks: number;
};

type MansfieldDailyStatus = {
  status: string | null;
  new_buy?: boolean;
};

type DivergenceInfo = {
  daily?: string;
  weekly?: string;
  monthly?: string;
};

type BreachHitCategory = "target" | "invalidation" | "neutral";

type BreachHitStatus = {
  status: string | null;
  category: BreachHitCategory;
};

type BuyStatusResponse = {
  above_20dma: string[];
  above_200dma: string[];
  above_40wma: string[];
  above_70wma: string[];
  above_3yma: string[];
  candle_signals: Record<string, CandleSignal[]>;
  extended_vol: Record<string, ExtendedStatus>;
  super_trend_daily: Record<string, SuperTrendSignal>;
  mansfield_daily: Record<string, MansfieldDailyStatus>;
  mace: Record<string, MaceSignal>;
  stage: Record<string, StageStatus>;
  short_term_trend: Record<string, number | null>;
  long_term_trend: Record<string, number | null>;
  breach_hit: Record<string, BreachHitStatus>;
  ma_crossovers: MovingAverageCrossovers;
  momentum: Record<string, number>;
  portfolio_momentum: Record<string, number>;
  divergence: Record<string, DivergenceInfo>;
};

const FALLBACK_DATA: BuyStatusResponse = {
  above_20dma: [],
  above_200dma: [],
  above_40wma: [],
  above_70wma: [],
  above_3yma: [],
  candle_signals: {},
  extended_vol: {},
  super_trend_daily: {},
  mansfield_daily: {},
  mace: {},
  stage: {},
  short_term_trend: {},
  long_term_trend: {},
  breach_hit: {},
  ma_crossovers: {},
  momentum: {},
  portfolio_momentum: {},
  divergence: {},
};

type SortColumn =
  | "symbol"
  | "above20"
  | "above200"
  | "above40"
  | "above70"
  | "above3y"
  | "candle"
  | "extended"
  | "superTrend"
  | "mansfield"
  | "mace"
  | "stage"
  | "momentum"
  | "portfolioMomentum"
  | "divergence"
  | "shortTrend"
  | "longTrend"
  | "breach";

type DataColumn = Exclude<SortColumn, "symbol">;

const DATA_COLUMN_META: { key: DataColumn; label: string }[] = [
  { key: "above20", label: "20DMA" },
  { key: "above200", label: "200DMA" },
  { key: "above40", label: "40WMA" },
  { key: "above70", label: "70WMA" },
  { key: "above3y", label: "3YMA" },
  { key: "candle", label: "Bearish / Bullish Candle" },
  { key: "extended", label: "Extended / Vol" },
  { key: "superTrend", label: "Super Trend (D)" },
  { key: "mansfield", label: "Mansfield (D)" },
  { key: "mace", label: "MACE" },
  { key: "stage", label: "Stage" },
  { key: "momentum", label: "Momentum (Sector)" },
  { key: "portfolioMomentum", label: "Momentum (Portfolio)" },
  { key: "divergence", label: "Divergence" },
  { key: "shortTrend", label: "Short-Term Trend" },
  { key: "longTrend", label: "Long-Term Trend" },
  { key: "breach", label: "Breach / Hit" },
];

const SORT_OPTIONS: { value: SortColumn; label: string }[] = [
  { value: "symbol", label: "Symbol" },
  ...DATA_COLUMN_META.map((meta) => ({ value: meta.key, label: meta.label })),
];

const ALL_SORT_COLUMNS: SortColumn[] = SORT_OPTIONS.map(
  (option) => option.value
);
const DATA_COLUMN_KEYS: DataColumn[] = DATA_COLUMN_META.map((meta) => meta.key);

type SortRule = {
  id: number;
  column: SortColumn;
  direction: "asc" | "desc";
};

type RowContext = {
  symbol: string;
  candleSignals?: CandleSignal[];
  superTrendInfo?: SuperTrendSignal;
  mansfieldDaily?: MansfieldDailyStatus;
  maceInfo?: MaceSignal;
  stageInfo?: StageStatus;
  shortTrendScore?: number | null;
  longTrendScore?: number | null;
  breachInfo?: BreachHitStatus;
  maCrossovers?: Partial<Record<MovingAverageKey, MovingAverageDirection>>;
  momentumScore?: number;
  portfolioMomentumScore?: number;
  divergenceInfo?: DivergenceInfo;
};

type CellDisplay = {
  className?: string;
  content: ReactNode;
  style?: CSSProperties;
};

type BuyPageProps = {
  statusEndpoint?: string;
  title?: string;
};

export default function BuyPage({
  statusEndpoint = "http://localhost:8000/buylist_status",
  title = "Buy List Status",
}: BuyPageProps) {
  const [data, setData] = useState<BuyStatusResponse | null>(null);

  useEffect(() => {
    fetch(statusEndpoint)
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch(() => setData(FALLBACK_DATA));
  }, [statusEndpoint]);

  const resolvedData = data ?? FALLBACK_DATA;

  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const sortIdRef = useRef(0);

  const sortStyle = { cursor: "pointer", userSelect: "none" as const };

  const [visibleColumns, setVisibleColumns] = useState<Set<DataColumn>>(
    () => new Set<DataColumn>(DATA_COLUMN_KEYS)
  );

  const toggleColumnVisibility = (column: DataColumn) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  const handleSelectAllColumns = () => {
    setVisibleColumns(new Set<DataColumn>(DATA_COLUMN_KEYS));
  };

  const handleClearColumns = () => {
    setVisibleColumns(new Set<DataColumn>());
  };

  const handleSort = (column: SortColumn) => {
    setSortRules((prev) => {
      const existingIndex = prev.findIndex((rule) => rule.column === column);

      if (existingIndex === 0) {
        const currentDirection = prev[0].direction;
        if (currentDirection === "desc") {
          const updated = [...prev];
          updated[0] = { ...updated[0], direction: "asc" };
          return updated;
        }
        return prev.slice(1);
      }

      if (existingIndex > 0) {
        const updated = [...prev];
        const [rule] = updated.splice(existingIndex, 1);
        return [rule, ...updated];
      }

      const newRule: SortRule = {
        id: sortIdRef.current++,
        column,
        direction: "desc",
      };

      return [newRule, ...prev];
    });
  };

  const renderSortIndicator = (column: SortColumn) => {
    const index = sortRules.findIndex((rule) => rule.column === column);
    if (index === -1) {
      return "";
    }
    const directionSymbol = sortRules[index].direction === "asc" ? " ▲" : " ▼";
    return `${directionSymbol}${index + 1}`;
  };

  const handleAddSortRule = () => {
    const usedColumns = new Set(sortRules.map((rule) => rule.column));
    const nextColumn =
      ALL_SORT_COLUMNS.find((column) => !usedColumns.has(column)) ?? "symbol";

    setSortRules((prev) => [
      ...prev,
      {
        id: sortIdRef.current++,
        column: nextColumn,
        direction: "desc",
      },
    ]);
  };

  const handleRemoveSortRule = (id: number) => {
    setSortRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const handleSortRuleColumnChange = (id: number, column: SortColumn) => {
    setSortRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, column } : rule))
    );
  };

  const handleSortRuleDirectionChange = (
    id: number,
    direction: "asc" | "desc"
  ) => {
    setSortRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, direction } : rule))
    );
  };

  const handleMoveSortRule = (id: number, direction: "up" | "down") => {
    setSortRules((prev) => {
      const index = prev.findIndex((rule) => rule.id === id);
      if (index === -1) {
        return prev;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }

      const updated = [...prev];
      const [movedRule] = updated.splice(index, 1);
      updated.splice(targetIndex, 0, movedRule);
      return updated;
    });
  };

  const handleResetSortRules = () => {
    setSortRules([]);
  };

  const above20Set = useMemo(
    () => new Set(resolvedData.above_20dma),
    [resolvedData.above_20dma]
  );
  const above200Set = useMemo(
    () => new Set(resolvedData.above_200dma),
    [resolvedData.above_200dma]
  );
  const above40Set = useMemo(
    () => new Set(resolvedData.above_40wma),
    [resolvedData.above_40wma]
  );
  const above70Set = useMemo(
    () => new Set(resolvedData.above_70wma),
    [resolvedData.above_70wma]
  );
  const above3ySet = useMemo(
    () => new Set(resolvedData.above_3yma),
    [resolvedData.above_3yma]
  );
  const extendedStatusMap = resolvedData.extended_vol || {};

  const getSortValue = useCallback(
    (symbol: string, column: SortColumn): number | string => {
      const candleSignals = resolvedData.candle_signals?.[symbol] ?? [];
      const superTrendInfo = resolvedData.super_trend_daily?.[symbol];
      const mansfieldInfo = resolvedData.mansfield_daily?.[symbol];
      const maceInfo = resolvedData.mace?.[symbol];
      const stageInfo = resolvedData.stage?.[symbol];
      const shortTrendScore = resolvedData.short_term_trend?.[symbol];
      const longTrendScore = resolvedData.long_term_trend?.[symbol];
      const breachInfo = resolvedData.breach_hit?.[symbol];
      const momentumScore = resolvedData.momentum?.[symbol];
      const portfolioMomentumScore = resolvedData.portfolio_momentum?.[symbol];
      const divergenceInfo = resolvedData.divergence?.[symbol];

      const getDivergenceScore = (info?: DivergenceInfo) => {
        if (!info) return 0;
        const weights: Record<keyof DivergenceInfo, number> = {
          daily: 1,
          weekly: 2,
          monthly: 3,
        };
        return (Object.keys(info) as (keyof DivergenceInfo)[]).reduce(
          (sum, key) => {
            const value = info[key];
            if (typeof value !== "string") return sum;
            const lower = value.toLowerCase();
            if (lower.includes("bullish")) return sum + weights[key];
            if (lower.includes("bearish")) return sum - weights[key];
            return sum;
          },
          0
        );
      };

      switch (column) {
        case "symbol":
          return symbol;
        case "above20":
          return above20Set.has(symbol) ? 1 : 0;
        case "above200":
          return above200Set.has(symbol) ? 1 : 0;
        case "above40":
          return above40Set.has(symbol) ? 1 : 0;
        case "above70":
          return above70Set.has(symbol) ? 1 : 0;
        case "above3y":
          return above3ySet.has(symbol) ? 1 : 0;
        case "candle": {
          if (candleSignals.length === 0) return 0;
          const hasBullish = candleSignals.some(
            (signal) => signal.type === "bullish"
          );
          const hasBearish = candleSignals.some(
            (signal) => signal.type === "bearish"
          );
          if (hasBullish && hasBearish) return 1;
          return hasBullish ? 2 : -2;
        }
        case "extended": {
          const status = extendedStatusMap[symbol];
          if (status === "oversold") return 2;
          if (status === "overbought") return 0;
          return 1;
        }
        case "superTrend": {
          const value = superTrendInfo?.signal?.toLowerCase();
          if (value === "buy") return 2;
          if (value === "sell") return -2;
          return value ? 1 : 0;
        }
        case "mansfield": {
          if (!mansfieldInfo) return 0;
          const status = mansfieldInfo.status?.toUpperCase();
          if (status === "BUY") return mansfieldInfo.new_buy ? 3 : 2;
          if (status === "NEUTRAL") return 1;
          if (status === "SELL") return -2;
          return mansfieldInfo.new_buy ? 0.5 : 0;
        }
        case "mace": {
          const label = maceInfo?.label ?? "";
          if (label.startsWith("U")) return 2;
          if (label.startsWith("D")) return -2;
          return label ? 1 : 0;
        }
        case "stage": {
          const stage = stageInfo?.stage;
          if (stage === 2) return 2;
          if (stage === 1 || stage === 3) return 1;
          if (stage === 4) return -2;
          return 0;
        }
        case "momentum":
          return typeof momentumScore === "number"
            ? momentumScore
            : Number.NEGATIVE_INFINITY;
        case "portfolioMomentum":
          return typeof portfolioMomentumScore === "number"
            ? portfolioMomentumScore
            : Number.NEGATIVE_INFINITY;
        case "shortTrend":
          if (typeof shortTrendScore !== "number") return 0;
          return shortTrendScore >= 2 ? 2 : -2;
        case "longTrend":
          if (typeof longTrendScore !== "number") return 0;
          return longTrendScore >= 4 ? 2 : -2;
        case "breach":
          if (!breachInfo) return 0;
          if (breachInfo.category === "target") return 2;
          if (breachInfo.category === "invalidation") return -2;
          return 1;
        case "divergence":
          return getDivergenceScore(divergenceInfo);
        default:
          return 0;
      }
    },
    [
      above20Set,
      above200Set,
      above40Set,
      above70Set,
      above3ySet,
      resolvedData.extended_vol,
      resolvedData.breach_hit,
      resolvedData.candle_signals,
      resolvedData.long_term_trend,
      resolvedData.momentum,
      resolvedData.portfolio_momentum,
      resolvedData.mace,
      resolvedData.mansfield_daily,
      resolvedData.divergence,
      resolvedData.short_term_trend,
      resolvedData.stage,
      resolvedData.super_trend_daily,
    ]
  );

  const trendSymbols = useMemo(
    () => [
      ...Object.keys(resolvedData.short_term_trend || {}),
      ...Object.keys(resolvedData.long_term_trend || {}),
    ],
    [resolvedData.long_term_trend, resolvedData.short_term_trend]
  );

  const breachSymbols = useMemo(
    () => Object.keys(resolvedData.breach_hit || {}),
    [resolvedData.breach_hit]
  );

  const baseSymbols = useMemo(
    () => [
      ...resolvedData.above_20dma,
      ...resolvedData.above_200dma,
      ...resolvedData.above_40wma,
      ...resolvedData.above_70wma,
      ...resolvedData.above_3yma,
      ...Object.keys(resolvedData.candle_signals || {}),
      ...Object.keys(resolvedData.extended_vol || {}),
      ...Object.keys(resolvedData.super_trend_daily || {}),
      ...Object.keys(resolvedData.mace || {}),
      ...Object.keys(resolvedData.ma_crossovers || {}),
      ...Object.keys(resolvedData.momentum || {}),
      ...Object.keys(resolvedData.portfolio_momentum || {}),
      ...Object.keys(resolvedData.divergence || {}),
    ],
    [
      resolvedData.above_20dma,
      resolvedData.above_200dma,
      resolvedData.above_40wma,
      resolvedData.above_70wma,
      resolvedData.above_3yma,
      resolvedData.candle_signals,
      resolvedData.extended_vol,
      resolvedData.super_trend_daily,
      resolvedData.mace,
      resolvedData.ma_crossovers,
      resolvedData.momentum,
      resolvedData.portfolio_momentum,
      resolvedData.divergence,
    ]
  );

  const uniqueSymbols = useMemo(
    () =>
      Array.from(new Set([...baseSymbols, ...trendSymbols, ...breachSymbols])),
    [baseSymbols, trendSymbols, breachSymbols]
  );

  const baseSortedSymbols = useMemo(() => {
    return [...uniqueSymbols].sort((a, b) => {
      const candleA = resolvedData.candle_signals?.[a] ?? [];
      const candleB = resolvedData.candle_signals?.[b] ?? [];
      const hasBullishA = candleA.some((signal) => signal.type === "bullish");
      const hasBullishB = candleB.some((signal) => signal.type === "bullish");
      const aScore =
        (above20Set.has(a) ? 1 : 0) +
        (above200Set.has(a) ? 1 : 0) +
        (hasBullishA ? 1 : 0);
      const bScore =
        (above20Set.has(b) ? 1 : 0) +
        (above200Set.has(b) ? 1 : 0) +
        (hasBullishB ? 1 : 0);

      if (bScore !== aScore) {
        return bScore - aScore;
      }
      return a.localeCompare(b);
    });
  }, [uniqueSymbols, resolvedData.candle_signals, above20Set, above200Set]);

  const sortedSymbols = useMemo(() => {
    if (sortRules.length === 0) {
      return baseSortedSymbols;
    }

    const sorted = [...baseSortedSymbols];
    sorted.sort((a, b) => {
      for (const rule of sortRules) {
        const aValue = getSortValue(a, rule.column);
        const bValue = getSortValue(b, rule.column);

        if (typeof aValue === "string" && typeof bValue === "string") {
          const comparison = aValue.localeCompare(bValue);
          if (comparison !== 0) {
            return rule.direction === "asc" ? comparison : -comparison;
          }
          continue;
        }

        const aNum =
          typeof aValue === "number" ? aValue : Number.NEGATIVE_INFINITY;
        const bNum =
          typeof bValue === "number" ? bValue : Number.NEGATIVE_INFINITY;

        if (aNum !== bNum) {
          return rule.direction === "asc" ? aNum - bNum : bNum - aNum;
        }
      }

      return a.localeCompare(b);
    });

    return sorted;
  }, [baseSortedSymbols, getSortValue, sortRules]);

  const candleValues = Object.values(resolvedData.candle_signals || {});
  const bearishCount = candleValues.filter((signals) =>
    signals?.some((signal) => signal.type === "bearish")
  ).length;
  const bullishCount = candleValues.filter((signals) =>
    signals?.some((signal) => signal.type === "bullish")
  ).length;

  const superTrendValues = Object.values(resolvedData.super_trend_daily || {});
  const superTrendSell = superTrendValues.filter(
    (signal) => signal.signal.toLowerCase() === "sell"
  ).length;
  const superTrendBuy = superTrendValues.filter(
    (signal) => signal.signal.toLowerCase() === "buy"
  ).length;

  const mansfieldValues = Object.values(resolvedData.mansfield_daily || {});
  const mansfieldSell = mansfieldValues.filter(
    (signal) => signal?.status?.toLowerCase() === "sell"
  ).length;
  const mansfieldBuy = mansfieldValues.filter(
    (signal) => signal?.status?.toLowerCase() === "buy"
  ).length;
  const mansfieldNeutral = mansfieldValues.filter(
    (signal) => signal?.status?.toLowerCase() === "neutral"
  ).length;

  const maceValues = Object.values(resolvedData.mace || {});
  const maceUp = maceValues.filter((signal) =>
    signal.label.startsWith("U")
  ).length;
  const maceDown = maceValues.filter((signal) =>
    signal.label.startsWith("D")
  ).length;

  const stageCounts = Object.values(resolvedData.stage || {}).reduce(
    (acc, item) => {
      const key = item.stage;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<number, number>
  );

  const shortTrendScores = Object.values(resolvedData.short_term_trend || {});
  const shortUp = shortTrendScores.filter(
    (score): score is number => typeof score === "number" && score >= 2
  ).length;
  const shortDown = shortTrendScores.filter(
    (score): score is number => typeof score === "number" && score < 2
  ).length;

  const longTrendScores = Object.values(resolvedData.long_term_trend || {});
  const longUp = longTrendScores.filter(
    (score): score is number => typeof score === "number" && score >= 4
  ).length;
  const longDown = longTrendScores.filter(
    (score): score is number => typeof score === "number" && score < 4
  ).length;

  const extendedValues = Object.values(extendedStatusMap || {});
  const overboughtCount = extendedValues.filter(
    (status) => status === "overbought"
  ).length;
  const oversoldCount = extendedValues.filter(
    (status) => status === "oversold"
  ).length;

  const breachValues = Object.values(resolvedData.breach_hit || {});
  const breachTarget = breachValues.filter(
    (value) => value?.category === "target"
  ).length;
  const breachInvalidation = breachValues.filter(
    (value) => value?.category === "invalidation"
  ).length;

  const stageSummary = ([1, 2, 3, 4] as const)
    .map((stageNumber) => `${stageNumber}:${stageCounts[stageNumber] || 0}`)
    .join(" ");

  const momentumValues = Object.values(resolvedData.momentum || {}).filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  );
  const avgMomentum =
    momentumValues.length > 0
      ? momentumValues.reduce((sum, value) => sum + value, 0) /
        momentumValues.length
      : null;

  const portfolioMomentumValues = Object.values(
    resolvedData.portfolio_momentum || {}
  ).filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  );
  const avgPortfolioMomentum =
    portfolioMomentumValues.length > 0
      ? portfolioMomentumValues.reduce((sum, value) => sum + value, 0) /
        portfolioMomentumValues.length
      : null;

  const divergenceValues = Object.values(resolvedData.divergence || {});
  const divergenceCounts = divergenceValues.reduce(
    (acc, info) => {
      (Object.values(info) as string[]).forEach((value) => {
        if (typeof value !== "string") return;
        const lower = value.toLowerCase();
        if (lower.includes("bullish")) acc.bullish += 1;
        if (lower.includes("bearish")) acc.bearish += 1;
      });
      return acc;
    },
    { bearish: 0, bullish: 0 }
  );

  const columnSummaryMap: Record<DataColumn, ReactNode> = {
    above20: resolvedData.above_20dma.length,
    above200: resolvedData.above_200dma.length,
    above40: resolvedData.above_40wma.length,
    above70: resolvedData.above_70wma.length,
    above3y: resolvedData.above_3yma.length,
    candle: `${bearishCount}/${bullishCount}`,
    extended: `${overboughtCount}/${oversoldCount}`,
    superTrend: `${superTrendSell}/${superTrendBuy}`,
    mansfield: `${mansfieldSell}/${mansfieldBuy}/${mansfieldNeutral}`,
    mace: `${maceUp}/${maceDown}`,
    stage: stageSummary,
    momentum: avgMomentum !== null ? avgMomentum.toFixed(2) : "—",
    portfolioMomentum:
      avgPortfolioMomentum !== null ? avgPortfolioMomentum.toFixed(2) : "—",
    divergence: `${divergenceCounts.bearish}/${divergenceCounts.bullish}`,
    shortTrend: `${shortUp}/${shortDown}`,
    longTrend: `${longUp}/${longDown}`,
    breach: `${breachTarget}/${breachInvalidation}`,
  };

  const getCellDisplay = useCallback(
    (context: RowContext, column: DataColumn): CellDisplay => {
      const {
        symbol,
        candleSignals,
        superTrendInfo,
        mansfieldDaily,
        maceInfo,
        stageInfo,
        shortTrendScore,
        longTrendScore,
        breachInfo,
        maCrossovers,
        momentumScore,
        portfolioMomentumScore,
        divergenceInfo,
      } = context;

      const formatTimeframes = (timeframes: CandleTimeframe[]) =>
        timeframes.map((tf) => tf.charAt(0).toUpperCase()).join("/");

      const formatPatternLabel = (signal: CandleSignal) => {
        const label =
          signal.pattern.charAt(0).toUpperCase() + signal.pattern.slice(1);
        const direction = signal.type === "bullish" ? "Bullish" : "Bearish";
        return `${direction} ${label} (${formatTimeframes(signal.timeframes)})`;
      };

      const maCell = (
        isAbove: boolean,
        crossover?: MovingAverageDirection
      ): CellDisplay => {
        const baseClass = isAbove
          ? "table-success text-success fw-semibold"
          : "table-danger text-danger fw-semibold";
        const crossoverClass =
          crossover === "above"
            ? "ma-crossed-above"
            : crossover === "below"
            ? "ma-crossed-below"
            : "";
        const className = [baseClass, crossoverClass].filter(Boolean).join(" ");
        return {
          className: className || undefined,
          content: isAbove ? "Above" : "Below",
        };
      };

      const momentumCell = (score?: number): CellDisplay => {
        if (typeof score !== "number" || Number.isNaN(score)) {
          return { className: "text-muted", content: "—" };
        }

        let className: string | undefined;
        if (score >= 1) {
          className = "table-success text-success fw-semibold";
        } else if (score <= -1) {
          className = "table-danger text-danger fw-semibold";
        } else {
          className = "table-warning text-warning";
        }

        return { className, content: score.toFixed(2) };
      };

      switch (column) {
        case "above20": {
          const isAbove = above20Set.has(symbol);
          return maCell(isAbove, maCrossovers?.["20dma"]);
        }
        case "above200": {
          const isAbove = above200Set.has(symbol);
          return maCell(isAbove, maCrossovers?.["200dma"]);
        }
        case "above40": {
          const isAbove = above40Set.has(symbol);
          return maCell(isAbove, maCrossovers?.["40wma"]);
        }
        case "above70": {
          const isAbove = above70Set.has(symbol);
          return maCell(isAbove, maCrossovers?.["70wma"]);
        }
        case "above3y": {
          const isAbove = above3ySet.has(symbol);
          return maCell(isAbove, maCrossovers?.["3yma"]);
        }
        case "candle": {
          const signals = candleSignals ?? [];
          if (signals.length === 0) {
            return { className: undefined, content: "" };
          }
          const hasBullish = signals.some(
            (signal) => signal.type === "bullish"
          );
          const hasBearish = signals.some(
            (signal) => signal.type === "bearish"
          );
          let className: string | undefined;
          if (hasBullish && hasBearish) {
            className = "table-warning";
          } else if (hasBullish) {
            className = "table-success";
          } else if (hasBearish) {
            className = "table-danger";
          }
          return {
            className,
            content: signals
              .map((signal) => formatPatternLabel(signal))
              .join("; "),
          };
        }
        case "extended": {
          const status = extendedStatusMap[symbol];
          if (!status) {
            return { className: undefined, content: "" };
          }
          const isOverbought = status === "overbought";
          return {
            className: isOverbought
              ? "table-danger text-danger fw-semibold"
              : "table-success text-success fw-semibold",
            content: isOverbought ? "Over bought" : "Over sold",
          };
        }
        case "superTrend":
          return {
            className: superTrendInfo
              ? superTrendInfo.signal.toLowerCase() === "buy"
                ? "table-success"
                : "table-danger"
              : undefined,
            content: superTrendInfo ? superTrendInfo.signal : "",
          };
        case "mansfield": {
          const status = mansfieldDaily?.status?.toLowerCase() ?? "";
          const baseClass = status
            ? status === "buy"
              ? "table-success"
              : status === "sell"
              ? "table-danger"
              : status === "neutral"
              ? "table-warning"
              : undefined
            : undefined;
          const classNames = [
            baseClass,
            mansfieldDaily?.new_buy ? "mansfield-new-buy" : undefined,
          ]
            .filter(Boolean)
            .join(" ");

          return {
            className: classNames || undefined,
            content: mansfieldDaily?.status || "",
          };
        }
        case "mace":
          return {
            className: maceInfo
              ? maceInfo.label.startsWith("U")
                ? "table-success"
                : maceInfo.label.startsWith("D")
                ? "table-danger"
                : undefined
              : undefined,
            content: maceInfo
              ? `${maceInfo.label}${
                  maceInfo.trend ? ` (${maceInfo.trend})` : ""
                }`
              : "",
          };
        case "stage":
          return {
            className: stageInfo
              ? stageInfo.stage === 2
                ? "table-success"
                : stageInfo.stage === 1 || stageInfo.stage === 3
                ? "table-warning"
                : stageInfo.stage === 4
                ? "table-danger"
                : undefined
              : undefined,
            content: stageInfo
              ? `Stage ${stageInfo.stage}${
                  stageInfo.weeks ? ` (${stageInfo.weeks}w)` : ""
                }`
              : "",
          };
        case "momentum": {
          return momentumCell(momentumScore);
        }
        case "portfolioMomentum": {
          return momentumCell(portfolioMomentumScore);
        }
        case "divergence": {
          const divergenceTimeframes: (keyof DivergenceInfo)[] = [
            "daily",
            "weekly",
            "monthly",
          ];
          const entries = divergenceTimeframes
            .map((tf) => {
              const value = divergenceInfo?.[tf];
              if (!value || value === "No Divergence") return null;
              const lower = value.toLowerCase();
              const isBullish = lower.includes("bullish");
              const timeframeLabel = tf.charAt(0).toUpperCase() + tf.slice(1);
              return {
                label: `${timeframeLabel} ${isBullish ? "Bullish" : "Bearish"}`,
                isBullish,
              };
            })
            .filter((entry): entry is { label: string; isBullish: boolean } =>
              Boolean(entry)
            );

          if (entries.length === 0) {
            return { className: undefined, content: "" };
          }

          const hasBullish = entries.some((entry) => entry.isBullish);
          const hasBearish = entries.some((entry) => !entry.isBullish);
          let className: string | undefined;

          if (hasBullish && hasBearish) {
            className = "table-warning";
          } else if (hasBullish) {
            className = "table-success text-success fw-semibold";
          } else if (hasBearish) {
            className = "table-danger text-danger fw-semibold";
          }

          return {
            className,
            content: entries.map((entry) => entry.label).join("; "),
          };
        }
        case "shortTrend":
          return {
            className:
              typeof shortTrendScore === "number"
                ? shortTrendScore >= 2
                  ? "table-success"
                  : "table-danger"
                : undefined,
            content:
              typeof shortTrendScore === "number"
                ? `${
                    shortTrendScore >= 2 ? "Uptrend" : "Downtrend"
                  } (${shortTrendScore}/3)`
                : "",
          };
        case "longTrend":
          return {
            className:
              typeof longTrendScore === "number"
                ? longTrendScore >= 4
                  ? "table-success"
                  : "table-danger"
                : undefined,
            content:
              typeof longTrendScore === "number"
                ? `${
                    longTrendScore >= 4 ? "Uptrend" : "Downtrend"
                  } (${longTrendScore}/6)`
                : "",
          };
        case "breach":
          return {
            className:
              breachInfo?.category === "target"
                ? "table-success"
                : breachInfo?.category === "invalidation"
                ? "table-danger"
                : undefined,
            content: breachInfo?.status || "",
          };
        default:
          return { className: undefined, content: "" };
      }
    },
    [
      above20Set,
      above200Set,
      above40Set,
      above70Set,
      above3ySet,
      resolvedData.extended_vol,
      resolvedData.divergence,
    ]
  );

  const visibleColumnMeta = useMemo(
    () => DATA_COLUMN_META.filter((meta) => visibleColumns.has(meta.key)),
    [visibleColumns]
  );

  if (!data) {
    return <div className="container mt-4">Loading...</div>;
  }

  return (
    <div className="container mt-4" style={{ maxWidth: "60%" }}>
      <h1 className="fw-bold mb-4">{title}</h1>
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="card-title mb-0">Sorting Priority</h5>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleAddSortRule}
              >
                Add Sort Level
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={handleResetSortRules}
                disabled={sortRules.length === 0}
              >
                Reset
              </button>
            </div>
          </div>
          {sortRules.length === 0 ? (
            <p className="text-muted mb-0">
              No custom sorting applied. Click "Add Sort Level" to define your
              preferred priority.
            </p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {sortRules.map((rule, index) => (
                <div
                  className="row g-2 align-items-center"
                  key={rule.id}
                  style={{ fontSize: "0.85rem" }}
                >
                  <div className="col-auto">
                    <span className="badge text-bg-secondary">{index + 1}</span>
                  </div>
                  <div className="col">
                    <select
                      className="form-select form-select-sm"
                      value={rule.column}
                      onChange={(event) =>
                        handleSortRuleColumnChange(
                          rule.id,
                          event.target.value as SortColumn
                        )
                      }
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-auto">
                    <select
                      className="form-select form-select-sm"
                      value={rule.direction}
                      onChange={(event) =>
                        handleSortRuleDirectionChange(
                          rule.id,
                          event.target.value as "asc" | "desc"
                        )
                      }
                    >
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </div>
                  <div className="col-auto d-flex gap-1">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => handleMoveSortRule(rule.id, "up")}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => handleMoveSortRule(rule.id, "down")}
                      disabled={index === sortRules.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleRemoveSortRule(rule.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="card-title mb-0">Column Visibility</h5>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleSelectAllColumns}
                disabled={visibleColumns.size === DATA_COLUMN_KEYS.length}
              >
                Show All
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleClearColumns}
                disabled={visibleColumns.size === 0}
              >
                Hide All
              </button>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-3">
            {DATA_COLUMN_META.map((column) => (
              <div className="form-check form-check-inline" key={column.key}>
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`column-toggle-${column.key}`}
                  checked={visibleColumns.has(column.key)}
                  onChange={() => toggleColumnVisibility(column.key)}
                />
                <label
                  className="form-check-label"
                  htmlFor={`column-toggle-${column.key}`}
                >
                  {column.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
      <table className="table text-center excel-table">
        <thead>
          <tr className="table-secondary" style={{ fontSize: "0.67rem" }}>
            <th scope="col" className="text-start">
              Summary
            </th>
            {visibleColumnMeta.map((column) => (
              <th scope="col" key={`summary-${column.key}`}>
                {columnSummaryMap[column.key]}
              </th>
            ))}
          </tr>
          <tr>
            <th onClick={() => handleSort("symbol")} style={sortStyle}>
              Symbol{renderSortIndicator("symbol")}
            </th>
            {visibleColumnMeta.map((column) => (
              <th
                key={`header-${column.key}`}
                onClick={() => handleSort(column.key)}
                style={sortStyle}
              >
                {column.label}
                {renderSortIndicator(column.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedSymbols.map((symbol) => {
            const candleSignals = resolvedData.candle_signals?.[symbol];
            const superTrendInfo = resolvedData.super_trend_daily?.[symbol];
            const mansfieldDaily = resolvedData.mansfield_daily?.[symbol];
            const maceInfo = resolvedData.mace?.[symbol];
            const stageInfo = resolvedData.stage?.[symbol];
            const shortTrendScore = resolvedData.short_term_trend?.[symbol];
            const longTrendScore = resolvedData.long_term_trend?.[symbol];
            const breachInfo = resolvedData.breach_hit?.[symbol];
            const maCrossovers = resolvedData.ma_crossovers?.[symbol];
            const momentumScore = resolvedData.momentum?.[symbol];
            const portfolioMomentumScore =
              resolvedData.portfolio_momentum?.[symbol];
            const divergenceInfo = resolvedData.divergence?.[symbol];
            const rowContext: RowContext = {
              symbol,
              candleSignals,
              superTrendInfo,
              mansfieldDaily,
              maceInfo,
              stageInfo,
              shortTrendScore,
              longTrendScore,
              breachInfo,
              maCrossovers,
              momentumScore,
              portfolioMomentumScore,
              divergenceInfo,
            };
            return (
              <tr key={symbol}>
                <th scope="row">{symbol}</th>
                {visibleColumnMeta.map((column) => {
                  const cell = getCellDisplay(rowContext, column.key);
                  return (
                    <td
                      key={`${symbol}-${column.key}`}
                      className={cell.className}
                      style={cell.style}
                    >
                      {cell.content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
