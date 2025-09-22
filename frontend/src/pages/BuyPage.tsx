import { useEffect, useMemo, useState } from "react";

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
  mace: {},
  stage: {},
  short_term_trend: {},
  long_term_trend: {},
  breach_hit: {},
};

export default function BuyPage() {
  const [data, setData] = useState<BuyStatusResponse | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/buylist_status")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch(() => setData(FALLBACK_DATA));
  }, []);

  const resolvedData = data ?? FALLBACK_DATA;

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

  const sortedSymbols = useMemo(() => {
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
            <th>Symbol</th>
            <th>Above 20 DMA</th>
            <th>Above 200 DMA</th>
            <th>Bearish / Bullish Candle</th>
            <th>Extended / Vol</th>
            <th>Super Trend (D)</th>
            <th>MACE</th>
            <th>Stage</th>
            <th>Short-Term Trend</th>
            <th>Long-Term Trend</th>
            <th>Breach / Hit</th>
          </tr>
        </thead>
        <tbody>
          {sortedSymbols.map((symbol) => {
            const candleInfo = resolvedData.candle_signals?.[symbol];
            const superTrendInfo = resolvedData.super_trend_daily?.[symbol];
            const maceInfo = resolvedData.mace?.[symbol];
            const stageInfo = resolvedData.stage?.[symbol];
            const shortTrendScore = resolvedData.short_term_trend?.[symbol];
            const longTrendScore = resolvedData.long_term_trend?.[symbol];
            const breachInfo = resolvedData.breach_hit?.[symbol];

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
