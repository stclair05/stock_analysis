import { useCallback, useEffect, useMemo, useState } from "react";

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

export default function BuyPage() {
  const [data, setData] = useState<BuyStatusResponse | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/buylist_status")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch(() => setData(FALLBACK_DATA));
  }, []);

  const resolvedData = data ?? FALLBACK_DATA;

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const sortStyle = { cursor: "pointer", userSelect: "none" as const };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else {
        setSortColumn(null);
        setSortDirection("desc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const renderSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) {
      return "";
    }
    return sortDirection === "asc" ? " ▲" : " ▼";
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
    if (!sortColumn) {
      return baseSortedSymbols;
    }

    const sorted = [...baseSortedSymbols];
    sorted.sort((a, b) => {
      const aValue = getSortValue(a, sortColumn);
      const bValue = getSortValue(b, sortColumn);

      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === "asc" ? comparison : -comparison;
      }

      const aNum =
        typeof aValue === "number" ? aValue : Number.NEGATIVE_INFINITY;
      const bNum =
        typeof bValue === "number" ? bValue : Number.NEGATIVE_INFINITY;

      if (aNum !== bNum) {
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }

      return a.localeCompare(b);
    });

    return sorted;
  }, [baseSortedSymbols, getSortValue, sortColumn, sortDirection]);

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
      <h1 className="fw-bold mb-4">Buy List Status</h1>
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
