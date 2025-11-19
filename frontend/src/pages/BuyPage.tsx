import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CandleSignal = {
  type: "bullish" | "bearish";
  timeframe: "daily" | "weekly" | "monthly";
  label: string;
};

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

type BreachHitCategory = "target" | "invalidation" | "neutral";

type BreachHitStatus = {
  status: string | null;
  category: BreachHitCategory;
};

type BuyStatusResponse = {
  above_20dma: string[];
  above_200dma: string[];
  candle_signals: Record<string, CandleSignal>;
  extended_vol: string[];
  super_trend_daily: Record<string, SuperTrendSignal>;
  mansfield_daily: Record<string, MansfieldDailyStatus>;
  mace: Record<string, MaceSignal>;
  stage: Record<string, StageStatus>;
  short_term_trend: Record<string, number | null>;
  long_term_trend: Record<string, number | null>;
  breach_hit: Record<string, BreachHitStatus>;
};

const FALLBACK_DATA: BuyStatusResponse = {
  above_20dma: [],
  above_200dma: [],
  candle_signals: {},
  extended_vol: [],
  super_trend_daily: {},
  mansfield_daily: {},
  mace: {},
  stage: {},
  short_term_trend: {},
  long_term_trend: {},
  breach_hit: {},
};

type SortColumn =
  | "symbol"
  | "above20"
  | "above200"
  | "candle"
  | "extended"
  | "superTrend"
  | "mansfield"
  | "mace"
  | "stage"
  | "shortTrend"
  | "longTrend"
  | "breach";

type SortRule = {
  id: number;
  column: SortColumn;
  direction: "asc" | "desc";
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
    const allColumns: SortColumn[] = [
      "symbol",
      "above20",
      "above200",
      "candle",
      "extended",
      "superTrend",
      "mansfield",
      "mace",
      "stage",
      "shortTrend",
      "longTrend",
      "breach",
    ];

    const usedColumns = new Set(sortRules.map((rule) => rule.column));
    const nextColumn =
      allColumns.find((column) => !usedColumns.has(column)) ?? "symbol";

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
  const extendedSet = useMemo(
    () => new Set(resolvedData.extended_vol),
    [resolvedData.extended_vol]
  );

  const getSortValue = useCallback(
    (symbol: string, column: SortColumn): number | string => {
      const candleInfo = resolvedData.candle_signals?.[symbol];
      const superTrendInfo = resolvedData.super_trend_daily?.[symbol];
      const mansfieldInfo = resolvedData.mansfield_daily?.[symbol];
      const maceInfo = resolvedData.mace?.[symbol];
      const stageInfo = resolvedData.stage?.[symbol];
      const shortTrendScore = resolvedData.short_term_trend?.[symbol];
      const longTrendScore = resolvedData.long_term_trend?.[symbol];
      const breachInfo = resolvedData.breach_hit?.[symbol];

      switch (column) {
        case "symbol":
          return symbol;
        case "above20":
          return above20Set.has(symbol) ? 1 : 0;
        case "above200":
          return above200Set.has(symbol) ? 1 : 0;
        case "candle":
          if (!candleInfo) return 0;
          return candleInfo.type === "bullish" ? 2 : -2;
        case "extended":
          return extendedSet.has(symbol) ? 0 : 1;
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
        default:
          return 0;
      }
    },
    [
      above20Set,
      above200Set,
      extendedSet,
      resolvedData.breach_hit,
      resolvedData.candle_signals,
      resolvedData.long_term_trend,
      resolvedData.mace,
      resolvedData.mansfield_daily,
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
      ...Object.keys(resolvedData.candle_signals || {}),
      ...resolvedData.extended_vol,
      ...Object.keys(resolvedData.super_trend_daily || {}),
      ...Object.keys(resolvedData.mace || {}),
    ],
    [
      resolvedData.above_20dma,
      resolvedData.above_200dma,
      resolvedData.candle_signals,
      resolvedData.extended_vol,
      resolvedData.super_trend_daily,
      resolvedData.mace,
    ]
  );

  const uniqueSymbols = useMemo(
    () =>
      Array.from(new Set([...baseSymbols, ...trendSymbols, ...breachSymbols])),
    [baseSymbols, trendSymbols, breachSymbols]
  );

  const baseSortedSymbols = useMemo(() => {
    return [...uniqueSymbols].sort((a, b) => {
      const candleA = resolvedData.candle_signals?.[a];
      const candleB = resolvedData.candle_signals?.[b];
      const aScore =
        (above20Set.has(a) ? 1 : 0) +
        (above200Set.has(a) ? 1 : 0) +
        (candleA?.type === "bullish" ? 1 : 0);
      const bScore =
        (above20Set.has(b) ? 1 : 0) +
        (above200Set.has(b) ? 1 : 0) +
        (candleB?.type === "bullish" ? 1 : 0);

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

  const sortOptions: { value: SortColumn; label: string }[] = [
    { value: "symbol", label: "Symbol" },
    { value: "above20", label: "Above 20 DMA" },
    { value: "above200", label: "Above 200 DMA" },
    { value: "candle", label: "Bearish / Bullish Candle" },
    { value: "extended", label: "Extended / Vol" },
    { value: "superTrend", label: "Super Trend (D)" },
    { value: "mansfield", label: "Mansfield (D)" },
    { value: "mace", label: "MACE" },
    { value: "stage", label: "Stage" },
    { value: "shortTrend", label: "Short-Term Trend" },
    { value: "longTrend", label: "Long-Term Trend" },
    { value: "breach", label: "Breach / Hit" },
  ];

  const candleValues = Object.values(resolvedData.candle_signals || {});
  const bearishCount = candleValues.filter(
    (signal) => signal.type === "bearish"
  ).length;
  const bullishCount = candleValues.filter(
    (signal) => signal.type === "bullish"
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

  const breachValues = Object.values(resolvedData.breach_hit || {});
  const breachTarget = breachValues.filter(
    (value) => value?.category === "target"
  ).length;
  const breachInvalidation = breachValues.filter(
    (value) => value?.category === "invalidation"
  ).length;

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
                      {sortOptions.map((option) => (
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
      <table className="table text-center excel-table">
        <thead>
          <tr className="table-secondary" style={{ fontSize: "0.67rem" }}>
            <th scope="col" className="text-start">
              Summary
            </th>
            <th scope="col">{resolvedData.above_20dma.length}</th>
            <th scope="col">{resolvedData.above_200dma.length}</th>
            <th scope="col">
              {bearishCount}/{bullishCount}
            </th>
            <th scope="col">{resolvedData.extended_vol.length}</th>
            <th scope="col">
              {superTrendSell}/{superTrendBuy}
            </th>
            <th scope="col">
              {`${mansfieldSell}/${mansfieldBuy}/${mansfieldNeutral}`}
            </th>
            <th scope="col">
              {([1, 2, 3, 4] as const)
                .map(
                  (stageNumber) =>
                    `${stageNumber}:${stageCounts[stageNumber] || 0}`
                )
                .join(" ")}
            </th>
            <th scope="col">{`${shortUp}/${shortDown}`}</th>
            <th scope="col">{`${longUp}/${longDown}`}</th>
            <th scope="col">{`${breachTarget}/${breachInvalidation}`}</th>
          </tr>
          <tr>
            <th onClick={() => handleSort("symbol")} style={sortStyle}>
              Symbol{renderSortIndicator("symbol")}
            </th>
            <th onClick={() => handleSort("above20")} style={sortStyle}>
              Above 20 DMA{renderSortIndicator("above20")}
            </th>
            <th onClick={() => handleSort("above200")} style={sortStyle}>
              Above 200 DMA{renderSortIndicator("above200")}
            </th>
            <th onClick={() => handleSort("candle")} style={sortStyle}>
              Bearish / Bullish Candle{renderSortIndicator("candle")}
            </th>
            <th onClick={() => handleSort("extended")} style={sortStyle}>
              Extended / Vol{renderSortIndicator("extended")}
            </th>
            <th onClick={() => handleSort("superTrend")} style={sortStyle}>
              Super Trend (D){renderSortIndicator("superTrend")}
            </th>
            <th onClick={() => handleSort("mansfield")} style={sortStyle}>
              Mansfield (D){renderSortIndicator("mansfield")}
            </th>
            <th onClick={() => handleSort("mace")} style={sortStyle}>
              MACE{renderSortIndicator("mace")}
            </th>
            <th onClick={() => handleSort("stage")} style={sortStyle}>
              Stage{renderSortIndicator("stage")}
            </th>
            <th onClick={() => handleSort("shortTrend")} style={sortStyle}>
              Short-Term Trend{renderSortIndicator("shortTrend")}
            </th>
            <th onClick={() => handleSort("longTrend")} style={sortStyle}>
              Long-Term Trend{renderSortIndicator("longTrend")}
            </th>
            <th onClick={() => handleSort("breach")} style={sortStyle}>
              Breach / Hit{renderSortIndicator("breach")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedSymbols.map((symbol) => {
            const candleInfo = resolvedData.candle_signals?.[symbol];
            const superTrendInfo = resolvedData.super_trend_daily?.[symbol];
            const mansfieldDaily = resolvedData.mansfield_daily?.[symbol];
            const maceInfo = resolvedData.mace?.[symbol];
            const stageInfo = resolvedData.stage?.[symbol];
            const shortTrendScore = resolvedData.short_term_trend?.[symbol];
            const longTrendScore = resolvedData.long_term_trend?.[symbol];
            const breachInfo = resolvedData.breach_hit?.[symbol];

            const mansfieldStatus = mansfieldDaily?.status?.toLowerCase() ?? "";
            const mansfieldBaseClass = mansfieldStatus
              ? mansfieldStatus === "buy"
                ? "table-success"
                : mansfieldStatus === "sell"
                ? "table-danger"
                : mansfieldStatus === "neutral"
                ? "table-warning"
                : undefined
              : undefined;
            const mansfieldClassNames = [
              mansfieldBaseClass,
              mansfieldDaily?.new_buy ? "mansfield-new-buy" : undefined,
            ]
              .filter(Boolean)
              .join(" ");
            const mansfieldCellClass =
              mansfieldClassNames.length > 0 ? mansfieldClassNames : undefined;

            return (
              <tr key={symbol}>
                <th scope="row">{symbol}</th>
                <td
                  className={
                    above20Set.has(symbol) ? "table-success" : undefined
                  }
                >
                  {above20Set.has(symbol) ? symbol : ""}
                </td>
                <td
                  className={
                    above200Set.has(symbol) ? "table-success" : undefined
                  }
                >
                  {above200Set.has(symbol) ? symbol : ""}
                </td>
                <td
                  className={
                    candleInfo
                      ? candleInfo.type === "bullish"
                        ? "table-success"
                        : "table-danger"
                      : undefined
                  }
                >
                  {candleInfo
                    ? `${
                        candleInfo.type === "bullish" ? "Bullish" : "Bearish"
                      } (${candleInfo.timeframe.charAt(0).toUpperCase()})`
                    : ""}
                </td>
                <td
                  className={
                    extendedSet.has(symbol) ? "table-danger" : undefined
                  }
                >
                  {extendedSet.has(symbol) ? symbol : ""}
                </td>
                <td
                  className={
                    superTrendInfo
                      ? superTrendInfo.signal.toLowerCase() === "buy"
                        ? "table-success"
                        : "table-danger"
                      : undefined
                  }
                >
                  {superTrendInfo ? superTrendInfo.signal : ""}
                </td>
                <td className={mansfieldCellClass}>
                  {mansfieldDaily?.status || ""}
                </td>
                <td
                  className={
                    maceInfo
                      ? maceInfo.label.startsWith("U")
                        ? "table-success"
                        : maceInfo.label.startsWith("D")
                        ? "table-danger"
                        : undefined
                      : undefined
                  }
                >
                  {maceInfo
                    ? `${maceInfo.label}${
                        maceInfo.trend ? ` (${maceInfo.trend})` : ""
                      }`
                    : ""}
                </td>
                <td
                  className={
                    stageInfo
                      ? stageInfo.stage === 2
                        ? "table-success"
                        : stageInfo.stage === 1 || stageInfo.stage === 3
                        ? "table-warning"
                        : stageInfo.stage === 4
                        ? "table-danger"
                        : undefined
                      : undefined
                  }
                >
                  {stageInfo
                    ? `Stage ${stageInfo.stage}${
                        stageInfo.weeks ? ` (${stageInfo.weeks}w)` : ""
                      }`
                    : ""}
                </td>
                <td
                  className={
                    typeof shortTrendScore === "number"
                      ? shortTrendScore >= 2
                        ? "table-success"
                        : "table-danger"
                      : undefined
                  }
                >
                  {typeof shortTrendScore === "number"
                    ? `${
                        shortTrendScore >= 2 ? "Uptrend" : "Downtrend"
                      } (${shortTrendScore}/3)`
                    : ""}
                </td>
                <td
                  className={
                    typeof longTrendScore === "number"
                      ? longTrendScore >= 4
                        ? "table-success"
                        : "table-danger"
                      : undefined
                  }
                >
                  {typeof longTrendScore === "number"
                    ? `${
                        longTrendScore >= 4 ? "Uptrend" : "Downtrend"
                      } (${longTrendScore}/6)`
                    : ""}
                </td>
                <td
                  className={
                    breachInfo?.category === "target"
                      ? "table-success"
                      : breachInfo?.category === "invalidation"
                      ? "table-danger"
                      : undefined
                  }
                >
                  {breachInfo?.status || ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
