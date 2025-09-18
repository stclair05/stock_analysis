import { useEffect, useState } from "react";

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

type StatusResponse = {
  below_20dma: string[];
  below_200dma: string[];
  candle_signals: Record<string, CandleSignal>;
  extended_vol: string[];
  super_trend_daily: Record<string, SuperTrendSignal>;
  mace: Record<string, MaceSignal>;
  stage: Record<string, StageStatus>;
};

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/portfolio_status")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch(() =>
        setData({
          below_20dma: [],
          below_200dma: [],
          candle_signals: {},
          extended_vol: [],
          super_trend_daily: {},
          mace: {},
          stage: {},
        })
      );
  }, []);

  if (!data) {
    return <div className="container mt-4">Loading...</div>;
  }

  const counts: Record<string, number> = {};
  const orderedSymbols = [
    ...data.below_20dma,
    ...data.below_200dma,
    ...Object.keys(data.candle_signals),
    ...data.extended_vol,
    ...Object.keys(data.super_trend_daily),
    ...Object.keys(data.mace),
  ];

  orderedSymbols.forEach((sym) => {
    counts[sym] = (counts[sym] || 0) + 1;
  });

  const uniqueSymbols = Array.from(new Set(orderedSymbols));

  const below20Set = new Set(data.below_20dma);
  const below200Set = new Set(data.below_200dma);
  const extendedSet = new Set(data.extended_vol);

  const getCellClass = (symbol?: string) =>
    symbol && counts[symbol] >= 2 ? "table-danger" : undefined;

  const getCandleClass = (candleInfo?: CandleSignal) => {
    if (!candleInfo) return undefined;
    return candleInfo.type === "bullish" ? "table-success" : "table-danger";
  };

  const getSuperTrendClass = (superTrendInfo?: SuperTrendSignal) => {
    if (!superTrendInfo) return undefined;
    return superTrendInfo.signal.toLowerCase() === "buy"
      ? "table-success"
      : "table-danger";
  };

  const getMaceClass = (maceInfo?: MaceSignal) => {
    if (!maceInfo) return undefined;
    if (maceInfo.label.startsWith("U")) {
      return "table-success";
    }
    if (maceInfo.label.startsWith("D")) {
      return "table-danger";
    }
    return undefined;
  };

  const getStageClass = (stageInfo?: StageStatus) => {
    if (!stageInfo) return undefined;
    if (stageInfo.stage === 1 || stageInfo.stage === 3) {
      return "table-warning";
    }
    if (stageInfo.stage === 2) {
      return "table-success";
    }
    if (stageInfo.stage === 4) {
      return "table-danger";
    }
    return undefined;
  };

  const candleValues = Object.values(data.candle_signals || {});
  const bearishCount = candleValues.filter(
    (signal) => signal.type === "bearish"
  ).length;
  const bullishCount = candleValues.filter(
    (signal) => signal.type === "bullish"
  ).length;

  const superTrendValues = Object.values(data.super_trend_daily || {});
  const superTrendSell = superTrendValues.filter(
    (signal) => signal.signal.toLowerCase() === "sell"
  ).length;
  const superTrendBuy = superTrendValues.filter(
    (signal) => signal.signal.toLowerCase() === "buy"
  ).length;

  const maceValues = Object.values(data.mace || {});
  const maceUp = maceValues.filter((signal) =>
    signal.label.startsWith("U")
  ).length;
  const maceDown = maceValues.filter((signal) =>
    signal.label.startsWith("D")
  ).length;

  const stageCounts = Object.values(data.stage || {}).reduce((acc, item) => {
    const key = item.stage;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return (
    <div className="container mt-4" style={{ maxWidth: "60%" }}>
      <h1 className="fw-bold mb-4">Status</h1>
      <table className="table text-center excel-table">
        <thead>
          <tr>
            <th></th>
            <th>{data.below_20dma.length}</th>
            <th>{data.below_200dma.length}</th>
            <th>
              {bearishCount}/{bullishCount}
            </th>
            <th>{data.extended_vol.length}</th>
            <th>
              {superTrendSell}/{superTrendBuy}
            </th>
            <th>
              {maceUp}/{maceDown}
            </th>
            <th>
              {([1, 2, 3, 4] as const)
                .map(
                  (stageNumber) =>
                    `${stageNumber}:${stageCounts[stageNumber] || 0}`
                )
                .join(" ")}
            </th>
          </tr>
          <tr>
            <th>Symbol</th>
            <th>Below 20 DMA</th>
            <th>Below 200 DMA</th>
            <th>Bearish / Bullish Candle</th>
            <th>Extended / Vol</th>
            <th>Super Trend (D)</th>
            <th>MACE</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {uniqueSymbols.map((symbol) => {
            const below20Symbol = below20Set.has(symbol) ? symbol : undefined;
            const below200Symbol = below200Set.has(symbol) ? symbol : undefined;
            const extendedSymbol = extendedSet.has(symbol) ? symbol : undefined;
            const candleInfo = data.candle_signals?.[symbol];
            const superTrendInfo = data.super_trend_daily?.[symbol];
            const maceInfo = data.mace?.[symbol];
            const stageInfo = data.stage?.[symbol];

            return (
              <tr key={symbol}>
                <th scope="row">{symbol}</th>
                <td className={getCellClass(below20Symbol)}>
                  {below20Symbol || ""}
                </td>
                <td className={getCellClass(below200Symbol)}>
                  {below200Symbol || ""}
                </td>
                <td className={getCandleClass(candleInfo)}>
                  {candleInfo
                    ? `${
                        candleInfo.type === "bullish" ? "Bullish" : "Bearish"
                      } (${candleInfo.timeframe.charAt(0).toUpperCase()})`
                    : ""}
                </td>
                <td className={getCellClass(extendedSymbol)}>
                  {extendedSymbol || ""}
                </td>
                <td className={getSuperTrendClass(superTrendInfo)}>
                  {superTrendInfo ? superTrendInfo.signal : ""}
                </td>
                <td className={getMaceClass(maceInfo)}>
                  {maceInfo
                    ? `${maceInfo.label}${
                        maceInfo.trend ? ` (${maceInfo.trend})` : ""
                      }`
                    : ""}
                </td>
                <td className={getStageClass(stageInfo)}>
                  {stageInfo
                    ? `Stage ${stageInfo.stage}${
                        stageInfo.weeks ? ` (${stageInfo.weeks}w)` : ""
                      }`
                    : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
