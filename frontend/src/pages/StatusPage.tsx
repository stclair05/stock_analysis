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

type BreachHitCategory = "target" | "invalidation" | "neutral";

type BreachHitStatus = {
  status: string | null;
  category: BreachHitCategory;
};

type StatusResponse = {
  below_20dma: string[];
  below_200dma: string[];
  candle_signals: Record<string, CandleSignal>;
  extended_vol: string[];
  super_trend_daily: Record<string, SuperTrendSignal>;
  mace: Record<string, MaceSignal>;
  stage: Record<string, StageStatus>;
  short_term_trend: Record<string, number | null>;
  long_term_trend: Record<string, number | null>;
  breach_hit: Record<string, BreachHitStatus>;
};

type RatioStatus = "above" | "below" | "equal" | "unknown";

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [ratioStatus, setRatioStatus] = useState<Record<string, RatioStatus>>(
    {}
  );

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
          short_term_trend: {},
          long_term_trend: {},
          breach_hit: {},
        })
      );
  }, []);

  useEffect(() => {
    if (!data) return;

    const orderedSymbols = [
      ...data.below_20dma,
      ...data.below_200dma,
      ...Object.keys(data.candle_signals),
      ...data.extended_vol,
      ...Object.keys(data.super_trend_daily),
      ...Object.keys(data.mace),
    ];

    const trendSymbols = [
      ...Object.keys(data.short_term_trend || {}),
      ...Object.keys(data.long_term_trend || {}),
    ];
    const breachSymbols = Object.keys(data.breach_hit || {});

    const uniqueSymbols = Array.from(
      new Set([...orderedSymbols, ...trendSymbols, ...breachSymbols])
    );

    if (uniqueSymbols.length === 0) {
      setRatioStatus({});
      return;
    }

    let isCancelled = false;

    const fetchRatioStatuses = async () => {
      const entries = await Promise.all(
        uniqueSymbols.map(async (symbol) => {
          try {
            const res = await fetch(
              `http://localhost:8000/compare_ratio?symbol1=${encodeURIComponent(
                symbol
              )}&symbol2=SPX&timeframe=weekly`
            );

            if (!res.ok) {
              throw new Error(`Failed to fetch ratio for ${symbol}`);
            }

            const json = await res.json();
            const ratios = Array.isArray(json?.ratio) ? json.ratio : [];
            const maSeries = Array.isArray(json?.ratio_ma_36)
              ? json.ratio_ma_36
              : [];

            if (ratios.length === 0 || maSeries.length === 0) {
              return [symbol, "unknown"] as const;
            }

            const latestRatioPoint = ratios[ratios.length - 1];
            const ratioValue = Number(latestRatioPoint?.value);
            const ratioTime = Number(latestRatioPoint?.time);

            if (!Number.isFinite(ratioValue) || !Number.isFinite(ratioTime)) {
              return [symbol, "unknown"] as const;
            }

            const latestMAPoint = [...maSeries].reverse().find((point) => {
              const maTime = Number(point?.time);
              const maValue = Number(point?.value);
              return (
                Number.isFinite(maTime) &&
                Number.isFinite(maValue) &&
                maTime <= ratioTime
              );
            });

            if (!latestMAPoint) {
              return [symbol, "unknown"] as const;
            }

            const maValue = Number(latestMAPoint.value);

            if (!Number.isFinite(maValue)) {
              return [symbol, "unknown"] as const;
            }

            if (ratioValue > maValue) {
              return [symbol, "above"] as const;
            }

            if (ratioValue < maValue) {
              return [symbol, "below"] as const;
            }

            return [symbol, "equal"] as const;
          } catch (error) {
            console.error(error);
            return [symbol, "unknown"] as const;
          }
        })
      );

      if (!isCancelled) {
        setRatioStatus(Object.fromEntries(entries));
      }
    };

    fetchRatioStatuses();

    return () => {
      isCancelled = true;
    };
  }, [data]);

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

  const trendSymbols = [
    ...Object.keys(data.short_term_trend || {}),
    ...Object.keys(data.long_term_trend || {}),
  ];
  const breachSymbols = Object.keys(data.breach_hit || {});

  const uniqueSymbols = Array.from(
    new Set([...orderedSymbols, ...trendSymbols, ...breachSymbols])
  );

  const below20Set = new Set(data.below_20dma);
  const below200Set = new Set(data.below_200dma);
  const extendedSet = new Set(data.extended_vol);

  const getCellClass = (symbol?: string) =>
    symbol && counts[symbol] >= 2 ? "table-danger" : undefined;

  const getSymbolClass = (symbol: string) => {
    const status = ratioStatus[symbol];
    if (status === "above") return "table-success";
    if (status === "below") return "table-danger";
    if (status === "equal") return "table-warning";
    return undefined;
  };

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

  const shortTrendScores = Object.values(data.short_term_trend || {});
  const shortUp = shortTrendScores.filter(
    (score): score is number => typeof score === "number" && score >= 2
  ).length;
  const shortDown = shortTrendScores.filter(
    (score): score is number => typeof score === "number" && score < 2
  ).length;

  const longTrendScores = Object.values(data.long_term_trend || {});
  const longUp = longTrendScores.filter(
    (score): score is number => typeof score === "number" && score >= 4
  ).length;
  const longDown = longTrendScores.filter(
    (score): score is number => typeof score === "number" && score < 4
  ).length;

  const breachValues = Object.values(data.breach_hit || {});
  const breachTarget = breachValues.filter(
    (value) => value?.category === "target"
  ).length;
  const breachInvalidation = breachValues.filter(
    (value) => value?.category === "invalidation"
  ).length;

  return (
    <div className="container mt-4" style={{ maxWidth: "60%" }}>
      <h1 className="fw-bold mb-4">Status</h1>
      <table className="table text-center excel-table">
        <thead>
          <tr className="table-secondary" style={{ fontSize: "0.67rem" }}>
            <th scope="col" className="text-start">
              Summary
            </th>
            <th scope="col">{data.below_20dma.length}</th>
            <th scope="col">{data.below_200dma.length}</th>
            <th scope="col">
              {bearishCount}/{bullishCount}
            </th>
            <th scope="col">{data.extended_vol.length}</th>
            <th scope="col">
              {superTrendSell}/{superTrendBuy}
            </th>
            <th scope="col">
              {maceUp}/{maceDown}
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
            <th>Below 20 DMA</th>
            <th>Below 200 DMA</th>
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
          {uniqueSymbols.map((symbol) => {
            const below20Symbol = below20Set.has(symbol) ? symbol : undefined;
            const below200Symbol = below200Set.has(symbol) ? symbol : undefined;
            const extendedSymbol = extendedSet.has(symbol) ? symbol : undefined;
            const candleInfo = data.candle_signals?.[symbol];
            const superTrendInfo = data.super_trend_daily?.[symbol];
            const maceInfo = data.mace?.[symbol];
            const stageInfo = data.stage?.[symbol];
            const shortTrendScore = data.short_term_trend?.[symbol];
            const longTrendScore = data.long_term_trend?.[symbol];
            const breachInfo = data.breach_hit?.[symbol];

            return (
              <tr key={symbol}>
                <th scope="row" className={getSymbolClass(symbol)}>
                  {symbol}
                </th>
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
