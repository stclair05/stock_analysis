import React, { useState, useEffect, useMemo, useRef } from "react";
import "../PortfolioPage.css";
import { BlockArrowBar } from "../../components/BlockArrowBar";
import { SlidersHorizontal } from "lucide-react";

const timeframes = ["daily", "weekly", "monthly"];
const allStrategies = [
  "trend_investor_pro",
  "northstar",
  "st_clair",
  "stclair_longterm",
  "mace_40w",
  "mansfield",
  // "demarker",
  // Add other strategies if needed
];

// Additional metrics available for optional columns
const METRIC_COLUMNS = [
  "current_price",
  "three_year_ma",
  "two_hundred_dma",
  "weekly_ichimoku",
  "super_trend",
  "adx",
  "mace",
  "forty_week_status",
  "fifty_dma_and_150_dma",
  "twenty_dma",
  "fifty_dma",
  "mean_rev_weekly",
  "bollinger_band_width_percentile_daily",
  "rsi_ma_weekly",
  "chaikin_money_flow",
];

// === Color helper functions (mirroring Metrics component) ===
const colorizeString = (value: number | string | null) => {
  if (typeof value !== "string") return "text-secondary";
  const lower = value.toLowerCase();

  if (
    lower.includes("slightly extended") ||
    lower.includes("slightly over sold") ||
    lower.includes("slightly oversold")
  )
    return "text-warning";
  if (lower.includes("extended")) return "text-danger";
  if (lower.includes("oversold") || lower.includes("over sold"))
    return "text-danger";
  if (lower.includes("overbought")) return "text-down-strong";
  if (lower.includes("normal")) return "text-secondary";

  if (lower.includes("below")) return "text-down-strong";
  if (lower.includes("above")) return "text-up-strong";
  if (lower.includes("inside")) return "text-neutral";
  if (lower.includes("between")) return "text-neutral";

  if (lower.includes("buy")) return "text-up-strong";
  if (lower.includes("sell")) return "text-down-strong";

  if (lower.includes("strong bullish")) return "text-up-strong";
  if (lower.includes("bullish")) return "text-up-weak";
  if (lower.includes("strong bearish")) return "text-down-strong";
  if (lower.includes("bearish")) return "text-down-weak";
  if (lower.includes("weak")) return "text-neutral";

  if (lower.includes("u1")) return "text-up-weak";
  if (lower.includes("u2")) return "text-up-strong";
  if (lower.includes("u3")) return "text-up-strong fw-bold";
  if (lower.includes("d1")) return "text-down-weak";
  if (lower.includes("d2")) return "text-down-strong";
  if (lower.includes("d3")) return "text-down-strong fw-bold";

  if (lower.includes("above rising ma")) return "text-up-strong fw-bold";
  if (lower.includes("above falling ma")) return "text-up-strong";
  if (lower.includes("below rising ma")) return "text-neutral";
  if (lower.includes("below falling ma")) return "text-down-strong";

  if (lower.includes("sloping upward")) return "text-up-weak";
  if (lower.includes("sloping downward")) return "text-down-weak";
  if (lower.includes("flat")) return "text-neutral";

  if (lower.includes("strong uptrend")) return "text-up-strong fw-bold";
  if (lower.includes("above both mas, but 50dma < 150dma"))
    return "text-up-weak";
  if (lower.includes("strong downtrend")) return "text-down-strong fw-bold";
  if (lower.includes("below both mas, but 50dma > 150dma"))
    return "text-down-weak";
  if (lower.includes("between/inside moving averages")) return "text-neutral";

  if (lower === "green") return "text-up-strong";
  if (lower === "light green") return "text-up-weak";
  if (lower === "red") return "text-down-strong";
  if (lower === "light red") return "text-down-weak";
  if (lower === "orange") return "text-neutral";
  if (lower === "in progress") return "text-secondary";

  if (lower.includes("above rising ma") || lower.includes("++"))
    return "text-up-strong fw-bold";
  if (lower.includes("above falling ma") || lower.includes("+-"))
    return "text-up-weak";
  if (lower.includes("below rising ma") || lower.includes("-+"))
    return "text-neutral";
  if (lower.includes("below falling ma") || lower.includes("--"))
    return "text-down-strong fw-bold";

  if (lower.includes("bullish divergence")) return "text-up-strong fw-bold";
  if (lower.includes("bearish divergence")) return "text-down-strong fw-bold";

  if (lower.includes("blue band")) return "text-neutral";
  if (lower.includes("red band")) return "text-down-strong";

  if (lower.includes("money inflow (increasing)"))
    return "text-up-strong fw-bold";
  if (lower.includes("money inflow (weakening)")) return "text-up-weak";
  if (lower.includes("money outflow (increasing)"))
    return "text-down-strong fw-bold";
  if (lower.includes("money outflow (weakening)")) return "text-down-weak";

  return "text-secondary";
};

const colorize = (
  price: number | null,
  value: number | string | null
): string => {
  if (price == null || typeof value !== "number") {
    return "text-secondary";
  }
  return value < price ? "text-success" : "text-danger";
};

export default function BuySellSignalsTab({
  initialListType = "portfolio",
  onListTypeChange,
}: {
  initialListType?: "portfolio" | "watchlist";
  onListTypeChange?: (lt: "portfolio" | "watchlist") => void;
}) {
  // MODIFIED: portfolio state now includes sector
  const [portfolio, setPortfolio] = useState<
    { ticker: string; sector?: string; target?: number }[]
  >([]);
  const [signalSummary, setSignalSummary] = useState<any>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState("weekly");
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);
  const columnsDropdownRef = useRef<HTMLDivElement | null>(null);

  // Cache for the actual BUY/SELL signals (based on timeframe and listType)
  const signalsCache = useRef<{
    [key: string]: { [ticker: string]: { [strategy: string]: string } };
  }>({});

  // NEW: Cache for the portfolio/watchlist ticker lists themselves
  // MODIFIED: portfolioDataCache now includes sector
  const portfolioDataCache = useRef<{
    portfolio?: { ticker: string; sector?: string; target?: number }[];
    watchlist?: { ticker: string; sector?: string; target?: number }[];
  }>({});

  // State for list type selection
  const [listType, setListType] = useState<"portfolio" | "watchlist">(
    initialListType
  );

  // State for sorting (primary and optional secondary)
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [secondarySortColumn, setSecondarySortColumn] = useState<string | null>(
    null
  );
  const [secondarySortDirection, setSecondarySortDirection] = useState<
    "asc" | "desc"
  >("asc");

  // State for global signal filtering
  const [filterType, setFilterType] = useState<
    "ALL" | "BUY" | "SELL" | "MIXED"
  >("ALL");

  // Hold mean reversion, RSI, Chaikin Money Flow, Supertrend, and current price info for each ticker
  const [meanRevRsi, setMeanRevRsi] = useState<
    Record<
      string,
      {
        meanRev: string | null;
        rsi: string | null;
        supertrend: string | null;
        cmf: string | null;
        currentPrice: number | null;
        dailyChange: number | null;
        dailyChangePercent: number | null;
        metrics?: any;
      }
    >
  >({});

  // Hold shares and average cost info for P/L calculation
  const [holdingInfo, setHoldingInfo] = useState<
    Record<string, { shares: number; average_cost: number }>
  >({});
  // Store forex rates for currency conversion
  const [forexRates, setForexRates] = useState<Record<string, number>>({});

  const strategyApiMap: Record<string, string> = {
    trend_investor_pro: "trendinvestorpro",
    st_clair: "stclair",
    northstar: "northstar",
    stclair_longterm: "stclairlongterm",
    mace_40w: "mace_40w",
    mansfield: "mansfield",
    // demarker: "demarker",
  };

  const COLUMN_LABELS: Record<string, string> = {
    mean_rev_rsi: "Mean Rev | RSI",
    pnl: "P/L",
    daily_change: "Daily Δ",
    price_target: "Price vs Target",
    cmf: "Chaikin MF",
    supertrend: "Supertrend",
    current_price: "Current Price",
    three_year_ma: "3-Year MA",
    two_hundred_dma: "200 DMA",
    weekly_ichimoku: "Weekly Ichimoku",
    super_trend: "Super Trend (Metric)",
    adx: "ADX",
    mace: "MACE",
    forty_week_status: "40-Week Status",
    fifty_dma_and_150_dma: "50/150 DMA",
    twenty_dma: "20 DMA",
    fifty_dma: "50 DMA",
    mean_rev_weekly: "Mean Rev (Weekly)",
    bollinger_band_width_percentile_daily: "BBWP (Daily)",
    rsi_ma_weekly: "RSI & MA (Weekly)",
    chaikin_money_flow: "Chaikin Money Flow",
  };

  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  const baseColumns = useMemo(() => {
    const cols = ["mean_rev_rsi"] as string[];
    if (listType === "portfolio") {
      cols.push("pnl", "daily_change", "price_target");
    } else {
      cols.push("daily_change");
    }
    cols.push("cmf", "supertrend");
    return cols;
  }, [listType]);

  const allColumns = useMemo(() => {
    return [
      ...baseColumns,
      ...METRIC_COLUMNS,
      ...getVisibleAndOrderedStrategies(selectedTimeframe),
    ];
  }, [selectedTimeframe, baseColumns]);

  useEffect(() => {
    setSelectedColumns((prev) => {
      if (prev.length === 0) return baseColumns;
      const kept = prev.filter((c) => allColumns.includes(c));
      const addedBase = baseColumns.filter((c) => !kept.includes(c));
      return Array.from(new Set([...kept, ...addedBase]));
    });
  }, [allColumns, baseColumns]);

  const getSlopeArrow = (val: string | null) => {
    if (!val) return "-";
    const lower = val.toLowerCase();
    if (lower.includes("sloping upward")) return "↗";
    if (lower.includes("sloping downward")) return "↘";
    return "-";
  };

  const getSlopeDirection = (val: string | null) => {
    if (!val) return null;
    const lower = val.toLowerCase();
    if (lower.includes("sloping upward")) return "up";
    if (lower.includes("sloping downward")) return "down";
    return null;
  };

  const getMeanRevRsiScore = (ticker: string): number | null => {
    const meanDir = getSlopeDirection(meanRevRsi[ticker]?.meanRev ?? null);
    const rsiDir = getSlopeDirection(meanRevRsi[ticker]?.rsi ?? null);

    if (!meanDir || !rsiDir) return null;

    if (meanDir === "up" && rsiDir === "up") return 1;
    if (meanDir === "down" && rsiDir === "down") return 3;
    if (
      (meanDir === "up" && rsiDir === "down") ||
      (meanDir === "down" && rsiDir === "up")
    ) {
      return 2;
    }

    return null;
  };

  const getMeanRevColor = (val: string | null) => {
    if (!val) return "#bdbdbd";
    const lower = val.toLowerCase();
    if (lower.includes("oversold") || lower.includes("over sold"))
      return "#4caf50";
    if (lower.includes("extended") || lower.includes("overbought"))
      return "#f44336";
    return "#bdbdbd";
  };

  const getRsiColor = (val: string | null) => {
    if (!val) return "#bdbdbd";
    const lower = val.toLowerCase();
    // Prioritise extremes
    if (lower.includes("extended") || lower.includes("overbought"))
      return "#f44336";
    if (lower.includes("over sold") || lower.includes("oversold"))
      return "#4caf50";
    if (lower.includes("above")) return "#4caf50";
    if (lower.includes("below")) return "#f44336";
    return "#bdbdbd";
  };

  const getCmfColor = (val: string | null) => {
    if (!val) return "#9e9e9e"; // darker neutral for better visibility

    const lower = val.toLowerCase();
    const weakening = lower.includes("weakening");

    if (lower.includes("money inflow")) {
      return weakening ? "#a5d6a7" : "#2e7d32"; // light green / dark green
    }

    if (lower.includes("money outflow")) {
      return weakening ? "#ef9a9a" : "#c62828"; // light red / dark red
    }

    return "#9e9e9e"; // fallback neutral
  };

  function getVisibleAndOrderedStrategies(timeframe: string) {
    let currentVisibleStrategies: string[] = [];

    switch (timeframe) {
      case "weekly":
        currentVisibleStrategies = allStrategies.filter(
          (s) => s !== "trend_investor_pro"
        );
        break;
      case "daily":
        currentVisibleStrategies = ["trend_investor_pro", "northstar"];
        break;
      case "monthly":
        currentVisibleStrategies = ["northstar"];
        break;
      default:
        currentVisibleStrategies = allStrategies;
    }

    const filteredStrategies = currentVisibleStrategies.filter(
      (strategy) => !isUnavailable(strategy, timeframe)
    );

    filteredStrategies.sort((a, b) => {
      // Prioritize "st_clair"
      if (a === "st_clair") return -1;
      if (b === "st_clair") return 1;

      // Then prioritize "stclair_longterm"
      if (a === "stclair_longterm") return -1;
      if (b === "stclair_longterm") return 1;

      // Maintain original order for others
      return 0;
    });

    return filteredStrategies;
  }

  // Determine local currency from ticker suffix
  const getCurrencyForTicker = (ticker: string): string => {
    if (ticker.endsWith(".AX")) return "AUD";
    if (ticker.endsWith(".TO")) return "CAD";
    if (ticker.endsWith(".HK")) return "HKD";
    if (ticker.endsWith(".AS")) return "EUR";
    return "USD";
  };

  // Get conversion rate from USD to target currency using fetched forex rates
  const getUsdToCurrencyRate = (currency: string): number => {
    if (currency === "USD") return 1;
    const pair1 = `USD${currency}`;
    const pair2 = `${currency}USD`;
    if (forexRates[pair1]) return forexRates[pair1];
    if (forexRates[pair2]) return 1 / forexRates[pair2];
    return 1;
  };

  const formatCurrency = (value: number): string =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // MODIFIED: Fetch tickers from selected list type, with caching
  // This useEffect now handles the new backend response format
  useEffect(() => {
    const fetchTickers = async () => {
      // Check cache first
      if (portfolioDataCache.current[listType]) {
        setPortfolio(portfolioDataCache.current[listType]!);
        setSignalSummary({}); // Clear signals to indicate potential change
        setSortColumn(null);
        setSecondarySortColumn(null);
        setFilterType("ALL");
        return;
      }

      setSignalsLoading(true); // Indicate loading when fetching new tickers
      const endpoint =
        listType === "portfolio" ? "/portfolio_tickers" : "/watchlist"; // Assuming a /watchlist endpoint exists and returns similar data

      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();

        // MODIFIED: Safely format tickers, expecting { ticker, sector } objects
        const formattedTickers: {
          ticker: string;
          sector?: string;
          target?: number;
        }[] = Array.isArray(data)
          ? data
              .map((item: any) => {
                // Handle both string (old backend) and object (new backend) formats
                if (typeof item === "string") {
                  return { ticker: item, sector: "N/A" }; // Default sector if only ticker string is returned
                } else if (
                  item &&
                  typeof item === "object" &&
                  "ticker" in item
                ) {
                  return {
                    ticker: item.ticker,
                    sector: item.sector || "N/A",
                    target:
                      typeof item.target === "number" ? item.target : undefined,
                  }; // Use provided sector or default
                }
                return { ticker: "", sector: "N/A" }; // Fallback for malformed data
              })
              .filter((item) => item.ticker !== "") // Filter out any empty tickers resulting from malformed data
          : [];

        // Store in cache
        portfolioDataCache.current[listType] = formattedTickers;
        setPortfolio(formattedTickers);

        // Clear caches and reset states when list type changes
        signalsCache.current = {}; // Clear signals cache as the underlying tickers changed
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith("signalsCache-")) localStorage.removeItem(k);
        });
        setSignalSummary({});
        setSortColumn(null);
        setSecondarySortColumn(null);
        setFilterType("ALL");
      } catch (error) {
        console.error(`Error fetching ${listType} tickers:`, error);
        setPortfolio([]); // Clear portfolio on error
        portfolioDataCache.current[listType] = []; // Cache empty array on error
        signalsCache.current = {};
        setSignalSummary({});
        setSortColumn(null);
        setSecondarySortColumn(null);
        setFilterType("ALL");
      } finally {
        setSignalsLoading(false); // End loading indicator
      }
    };

    fetchTickers();
  }, [listType]); // Rerun this effect when listType changes

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        columnsDropdownRef.current &&
        !columnsDropdownRef.current.contains(event.target as Node)
      ) {
        setShowColumnsDropdown(false);
      }
    }
    if (showColumnsDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnsDropdown]);

  // Fetch live portfolio data (shares and average cost) for P/L
  useEffect(() => {
    if (listType !== "portfolio") {
      setHoldingInfo({});
      return;
    }
    const fetchLive = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/portfolio_live_data`
        );
        const data = await res.json();
        const map: Record<string, { shares: number; average_cost: number }> =
          {};
        if (Array.isArray(data)) {
          data.forEach((item: any) => {
            if (item && item.ticker)
              map[item.ticker] = {
                shares: item.shares,
                average_cost: item.average_cost,
              };
          });
        }
        setHoldingInfo(map);
      } catch {
        setHoldingInfo({});
      }
    };
    fetchLive();
  }, [listType]);

  // Fetch forex rates once for currency conversion
  useEffect(() => {
    const fetchFx = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/forex_rates`);
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

  // Fetch mean reversion and RSI metrics for all tickers
  useEffect(() => {
    if (portfolio.length === 0) return;

    const fetchMetrics = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/analyse_batch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(portfolio.map((p) => ({ symbol: p.ticker }))),
          }
        );
        if (!res.ok) throw new Error("Failed metrics");
        const data = await res.json();
        const summary: Record<
          string,
          {
            meanRev: string | null;
            rsi: string | null;
            supertrend: string | null;
            cmf: string | null;
            currentPrice: number | null;
            dailyChange: number | null;
            dailyChangePercent: number | null;
            metrics?: any;
          }
        > = {};
        Object.entries(data).forEach(([sym, val]: any) => {
          summary[sym] = {
            meanRev: val?.mean_rev_weekly?.current ?? null,
            rsi: val?.rsi_ma_weekly?.current ?? null,
            supertrend: val?.super_trend?.current ?? null,
            cmf: val?.chaikin_money_flow?.current ?? null,
            currentPrice:
              typeof val?.current_price === "number" ? val.current_price : null,
            dailyChange:
              typeof val?.daily_change === "number" ? val.daily_change : null,
            dailyChangePercent:
              typeof val?.daily_change_percent === "number"
                ? val.daily_change_percent
                : null,
            metrics: val,
          };
        });
        setMeanRevRsi(summary);
      } catch {
        setMeanRevRsi({});
      }
    };

    fetchMetrics();
  }, [portfolio]);

  // Fetch signals for all stocks/strategies/timeframes
  useEffect(() => {
    // Only fetch signals if portfolio is not empty and not currently fetching new tickers
    if (portfolio.length === 0 || signalsLoading) return;

    setSignalsLoading(true);

    const tickersKey = portfolio
      .map((p) => p.ticker)
      .sort()
      .join(",");
    const cacheKey = `${selectedTimeframe}-${listType}-${tickersKey}`;
    const storageKey = `signalsCache-${cacheKey}`;

    // Check localStorage first
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < 100 * 60 * 1000) {
          signalsCache.current[cacheKey] = parsed.data;
          setSignalSummary(parsed.data);
          setSignalsLoading(false);
          return;
        }
        localStorage.removeItem(storageKey);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    // If cached in memory, use it immediately
    if (signalsCache.current[cacheKey]) {
      setSignalSummary(signalsCache.current[cacheKey]);
      setSignalsLoading(false);
      return;
    }

    async function fetchAllSignals() {
      const summary: any = {};
      const strategiesToFetch =
        getVisibleAndOrderedStrategies(selectedTimeframe);

      await Promise.all(
        portfolio.map(async (holding) => {
          const row: any = {};
          // Fetch the generic signal strength once per ticker
          let genericStrength: any = null;
          try {
            const resStrength = await fetch(
              `${import.meta.env.VITE_API_URL}/api/signal_strength/${
                holding.ticker
              }?strategy=generic&timeframe=${selectedTimeframe}`
            );
            genericStrength = resStrength.ok ? await resStrength.json() : null;
          } catch (e) {
            genericStrength = null;
          }
          await Promise.all(
            strategiesToFetch.map(async (strategy) => {
              try {
                const apiStrategy = strategyApiMap[strategy] || strategy;
                const resSignals = await fetch(
                  `${
                    import.meta.env.VITE_API_URL
                  }/api/signals_${selectedTimeframe}/${
                    holding.ticker
                  }?strategy=${apiStrategy}`
                );

                const signalData = resSignals.ok
                  ? await resSignals.json()
                  : null;

                // Fetch Mansfield status separately to determine new buy flag
                let mansfieldStatus: any = null;
                if (strategy === "mansfield") {
                  try {
                    const res = await fetch(
                      `${import.meta.env.VITE_API_URL}/api/signal_strength/${
                        holding.ticker
                      }?strategy=mansfield`
                    );
                    mansfieldStatus = res.ok ? await res.json() : null;
                  } catch {
                    mansfieldStatus = null;
                  }
                }

                let latestSignal = "";
                if (
                  Array.isArray(signalData?.markers) &&
                  signalData.markers.length > 0
                ) {
                  const last =
                    signalData.markers[signalData.markers.length - 1];
                  latestSignal = last.side.toUpperCase();
                }

                const status =
                  strategy === "mansfield"
                    ? mansfieldStatus?.status || ""
                    : genericStrength?.status || "";
                const delta =
                  strategy === "mansfield"
                    ? ""
                    : genericStrength?.strength || "";
                const details =
                  strategy === "mansfield" ? null : genericStrength?.details;

                row[strategy] = {
                  signal: latestSignal,
                  status,
                  delta,
                  details,
                  newBuy: mansfieldStatus?.new_buy || false,
                };
              } catch (e) {
                row[strategy] = {
                  signal: "",
                  status: "",
                  delta: "",
                  details: null,
                  newBuy: false,
                };
              }
            })
          );
          // store generic strength separately for easy access
          row["_generic"] = genericStrength;
          summary[holding.ticker] = row;
        })
      );
      signalsCache.current[cacheKey] = summary;
      localStorage.setItem(
        `signalsCache-${cacheKey}`,
        JSON.stringify({ timestamp: Date.now(), data: summary })
      );
      setSignalSummary(summary);
      setSignalsLoading(false);
    }

    fetchAllSignals();
    // eslint-disable-next-line
  }, [portfolio, selectedTimeframe]); // Ensure this effect runs when portfolio changes

  // Calculate P/L in USD currency for a given ticker
  // Return P/L in USD
  const getPnlForTicker = (
    ticker: string
  ): { amount: number; percent: number; currency: string } | null => {
    const info = holdingInfo[ticker];
    const price = meanRevRsi[ticker]?.currentPrice;
    if (!info || price == null) return null;

    const currency = getCurrencyForTicker(ticker); // e.g., "EUR"
    const rate = getUsdToCurrencyRate(currency); // e.g., USD to EUR

    let currentPriceInUSD = price;
    if (currency !== "USD") {
      currentPriceInUSD = price / rate; // Convert local price to USD
    }

    const avgCost = info.average_cost; // Already in USD
    const diff = currentPriceInUSD - avgCost;
    const amount = diff * info.shares;
    // Avoid Infinity when avgCost is zero
    const percent = avgCost === 0 ? 100 : (diff / avgCost) * 100;
    return { amount, percent, currency: "USD" };
  };

  function isUnavailable(strategy: string, tf: string) {
    if (
      strategy === "trend_investor_pro" &&
      (tf === "weekly" || tf === "monthly")
    )
      return true;
    if (strategy === "st_clair" && (tf === "daily" || tf === "monthly"))
      return true;
    if (strategy === "stclair_longterm" && tf !== "weekly") return true;
    if (strategy === "mace_40w" && tf !== "weekly") return true;
    if (strategy === "mansfield" && tf !== "weekly") return true;
    return false;
  }

  const handleHeaderClick = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else if (sortColumn === "mean_rev_rsi" && column === "price_target") {
      if (secondarySortColumn === column) {
        setSecondarySortDirection(
          secondarySortDirection === "asc" ? "desc" : "asc"
        );
      } else {
        setSecondarySortColumn(column);
        setSecondarySortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
      setSecondarySortColumn(null);
    }
  };

  const displayedPortfolio = useMemo(() => {
    let currentPortfolio = [...portfolio];
    const visibleAndOrderedStrategies =
      getVisibleAndOrderedStrategies(selectedTimeframe);

    if (filterType !== "ALL") {
      currentPortfolio = currentPortfolio.filter((holding) => {
        let hasMatchingSignal = false; // For BUY/SELL filters
        let hasContradictorySignal = false;
        let hasBuySignal = false;
        let hasSellSignal = false;

        for (const strategy of visibleAndOrderedStrategies) {
          const signalObj = signalSummary[holding.ticker]?.[strategy];
          const buySell = signalObj?.signal || "";

          if (buySell === "BUY") hasBuySignal = true;
          if (buySell === "SELL") hasSellSignal = true;

          if (filterType === "BUY" || filterType === "SELL") {
            if (buySell === filterType) {
              hasMatchingSignal = true;
            } else if (buySell && buySell !== "-") {
              hasContradictorySignal = true;
              break;
            }
          }
        }
        // Include Supertrend in the same BUY/SELL logic
        const stVal =
          meanRevRsi[holding.ticker]?.supertrend?.toUpperCase() || "";
        if (stVal === "BUY") hasBuySignal = true;
        if (stVal === "SELL") hasSellSignal = true;
        if (filterType === "BUY" || filterType === "SELL") {
          if (stVal === filterType) {
            hasMatchingSignal = true;
          } else if (stVal && stVal !== "-") {
            hasContradictorySignal = true;
          }
        }

        if (filterType === "MIXED") {
          return hasBuySignal && hasSellSignal;
        }
        // Include if it has at least one matching signal AND no contradictory signals
        return hasMatchingSignal && !hasContradictorySignal;
      });
    }

    if (sortColumn && Object.keys(signalSummary).length > 0) {
      const compareByColumn = (
        col: string,
        dir: "asc" | "desc",
        a: { ticker: string; target?: number },
        b: { ticker: string; target?: number }
      ) => {
        if (col === "price_target") {
          const priceA = meanRevRsi[a.ticker]?.currentPrice;
          const targetA = a.target;
          const priceB = meanRevRsi[b.ticker]?.currentPrice;
          const targetB = b.target;

          const isValidA =
            typeof priceA === "number" &&
            typeof targetA === "number" &&
            !isNaN(targetA);
          const isValidB =
            typeof priceB === "number" &&
            typeof targetB === "number" &&
            !isNaN(targetB);

          if (!isValidA && !isValidB) return 0;
          if (!isValidA) return 1; // push A to bottom
          if (!isValidB) return -1; // push B to bottom

          const diffA = ((priceA - targetA) / targetA) * 100;
          const diffB = ((priceB - targetB) / targetB) * 100;

          return dir === "asc" ? diffA - diffB : diffB - diffA;
        } else if (col === "pnl" && listType === "portfolio") {
          const pnlA = getPnlForTicker(a.ticker);
          const pnlB = getPnlForTicker(b.ticker);
          const valA = pnlA ? pnlA.percent : -Infinity;
          const valB = pnlB ? pnlB.percent : -Infinity;
          if (valA === valB) return a.ticker.localeCompare(b.ticker);
          return dir === "asc" ? valA - valB : valB - valA;
        } else if (col === "mean_rev_rsi") {
          const valA = getMeanRevRsiScore(a.ticker);
          const valB = getMeanRevRsiScore(b.ticker);
          if (valA !== valB) return dir === "asc" ? valA - valB : valB - valA;
          return 0;
        } else if (col === "daily_change") {
          const chA = meanRevRsi[a.ticker]?.dailyChangePercent;
          const chB = meanRevRsi[b.ticker]?.dailyChangePercent;
          const valA = typeof chA === "number" ? chA : -Infinity;
          const valB = typeof chB === "number" ? chB : -Infinity;
          if (valA === valB) return a.ticker.localeCompare(b.ticker);
          return dir === "asc" ? valA - valB : valB - valA;
        } else if (METRIC_COLUMNS.includes(col)) {
          const valAraw = meanRevRsi[a.ticker]?.metrics?.[col];
          const valBraw = meanRevRsi[b.ticker]?.metrics?.[col];
          const vA =
            valAraw && typeof valAraw === "object" && "current" in valAraw
              ? valAraw.current
              : valAraw;
          const vB =
            valBraw && typeof valBraw === "object" && "current" in valBraw
              ? valBraw.current
              : valBraw;
          if (typeof vA === "number" && typeof vB === "number") {
            if (vA === vB) return a.ticker.localeCompare(b.ticker);
            return dir === "asc" ? vA - vB : vB - vA;
          }
          const sA = vA != null ? String(vA).toLowerCase() : "";
          const sB = vB != null ? String(vB).toLowerCase() : "";
          const cmp = sA.localeCompare(sB);
          if (cmp === 0) return a.ticker.localeCompare(b.ticker);
          return dir === "asc" ? cmp : -cmp;
        } else {
          const sortOrder = { BUY: 1, SELL: 2, "": 3, "-": 4 };
          const signalA = signalSummary[a.ticker]?.[col]?.status || "-";
          const signalB = signalSummary[b.ticker]?.[col]?.status || "-";

          const valA = sortOrder[signalA as keyof typeof sortOrder] || 4;
          const valB = sortOrder[signalB as keyof typeof sortOrder] || 4;

          if (valA < valB) return dir === "asc" ? -1 : 1;
          if (valA > valB) return dir === "asc" ? 1 : -1;

          return a.ticker.localeCompare(b.ticker);
        }
      };
      currentPortfolio.sort((a, b) => {
        let result = compareByColumn(sortColumn, sortDirection, a, b);
        if (result === 0 && secondarySortColumn) {
          result = compareByColumn(
            secondarySortColumn,
            secondarySortDirection,
            a,
            b
          );
        }
        if (result === 0) {
          return a.ticker.localeCompare(b.ticker);
        }
        return result;
      });
    }

    return currentPortfolio;
  }, [
    portfolio,
    signalSummary,
    sortColumn,
    sortDirection,
    secondarySortColumn,
    secondarySortDirection,
    filterType,
    selectedTimeframe,
  ]);

  // NEW: Memoized calculation for sector summary
  const sectorSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    // Only calculate for specific filter types (BUY/SELL)
    if (
      filterType === "ALL" ||
      filterType === "MIXED" ||
      displayedPortfolio.length === 0
    ) {
      return {};
    }

    const strategiesToCheck = getVisibleAndOrderedStrategies(selectedTimeframe);

    displayedPortfolio.forEach((holding) => {
      const signals = signalSummary[holding.ticker];
      if (!signals || !holding.sector || holding.sector === "N/A") return; // Skip if no signals or no valid sector info

      // IMPORTANT: The filtering for "all buys/sells even with nil" is now handled
      // by the `displayedPortfolio` itself. So, if a ticker is in `displayedPortfolio`
      // under a specific filterType, it already meets the new criteria.
      // We no longer need to re-check `allSignalsMatch` here in `sectorSummary`.
      // The `displayedPortfolio` will only contain tickers that either
      // (a) have at least one matching signal AND no contradictory signals,
      // or (b) are "ALL" where this logic doesn't apply.

      const sector = holding.sector;
      counts[sector] = (counts[sector] || 0) + 1;
    });

    return counts;
  }, [displayedPortfolio, signalSummary, filterType, selectedTimeframe]); // Depend on relevant states

  const visibleAndOrderedStrategies =
    getVisibleAndOrderedStrategies(selectedTimeframe);

  const emptyListMessage =
    listType === "portfolio"
      ? "No equities in your portfolio."
      : "No equities in your watchlist.";

  // Determine the badge color based on the filterType
  const badgeColorClass =
    filterType === "BUY"
      ? "bg-success"
      : filterType === "SELL"
      ? "bg-danger"
      : "bg-primary";

  // Calculate the total count for the summary
  const totalSectorCount = useMemo(() => {
    return Object.values(sectorSummary).reduce((sum, count) => sum + count, 0);
  }, [sectorSummary]);

  const renderHeader = (col: string) => {
    const label =
      COLUMN_LABELS[col] ||
      col.replace(/_/g, " ").replace("longterm", " LongTerm");
    if (col === "mean_rev_rsi") {
      return (
        <th
          key={col}
          style={{ width: "120px", cursor: "pointer" }}
          onClick={() => handleHeaderClick(col)}
        >
          {label}
          {(sortColumn === col || secondarySortColumn === col) && (
            <span className="ms-1">
              {(sortColumn === col ? sortDirection : secondarySortDirection) ===
              "asc"
                ? " ▲"
                : " ▼"}
            </span>
          )}
        </th>
      );
    } else if (col === "pnl") {
      return (
        <th
          key={col}
          style={{ cursor: "pointer" }}
          onClick={() => handleHeaderClick(col)}
        >
          {label}
          {sortColumn === col && (
            <span className="ms-1">
              {sortDirection === "asc" ? " ▲" : " ▼"}
            </span>
          )}
        </th>
      );
    } else if (col === "daily_change") {
      return (
        <th
          key={col}
          style={{ cursor: "pointer" }}
          onClick={() => handleHeaderClick(col)}
        >
          {label}
          {sortColumn === col && (
            <span className="ms-1">
              {sortDirection === "asc" ? " ▲" : " ▼"}
            </span>
          )}
        </th>
      );
    } else if (col === "price_target") {
      return (
        <th
          key={col}
          style={{ cursor: "pointer" }}
          onClick={() => handleHeaderClick(col)}
        >
          {label}
          {(sortColumn === col || secondarySortColumn === col) && (
            <span className="ms-1">
              {(sortColumn === col ? sortDirection : secondarySortDirection) ===
              "asc"
                ? " ▲"
                : " ▼"}
            </span>
          )}
        </th>
      );
    } else if (col === "cmf" || col === "supertrend") {
      return <th key={col}>{label}</th>;
    } else {
      return (
        <th
          key={col}
          onClick={() => handleHeaderClick(col)}
          style={{ cursor: "pointer" }}
        >
          {label}
          {sortColumn === col && (
            <span className="ms-1">
              {sortDirection === "asc" ? " ▲" : " ▼"}
            </span>
          )}
        </th>
      );
    }
  };

  const isDataReadyForColumn = (ticker: string, col: string) => {
    const t = ticker.toUpperCase().trim(); // enforce safe key usage

    const signalCols = [
      "northstar",
      "trendinvestorpro",
      "demarker",
      "stclair",
      "stclairlongterm",
      "mace_40w",
      "mansfield",
      "generic",
    ];

    const priceCols = [
      "mean_rev_rsi",
      "daily_change",
      "cmf",
      "price_target",
      "supertrend",
    ];

    if (METRIC_COLUMNS.includes(col)) {
      return meanRevRsi[t]?.metrics?.[col] != null;
    }

    if (signalCols.includes(col)) {
      return !!signalSummary[t]?.[col];
    }

    if (col === "mean_rev_rsi") {
      return !!meanRevRsi[t]?.meanRev && !!meanRevRsi[t]?.rsi;
    }

    if (col === "daily_change") {
      return (
        meanRevRsi[t]?.dailyChange != null &&
        meanRevRsi[t]?.dailyChangePercent != null
      );
    }

    if (col === "price_target") {
      return meanRevRsi[t]?.currentPrice != null;
    }

    if (col === "cmf") {
      return meanRevRsi[t]?.cmf != null;
    }

    if (col === "supertrend") {
      return meanRevRsi[t]?.supertrend != null;
    }

    if (col === "pnl") {
      return (
        holdingInfo[t]?.shares != null &&
        holdingInfo[t]?.average_cost != null &&
        meanRevRsi[t]?.currentPrice != null
      );
    }

    return true; // fallback for other columns
  };

  const renderCell = (
    col: string,
    holding: { ticker: string; sector?: string; target?: number }
  ) => {
    const ticker = holding.ticker;

    if (!isDataReadyForColumn(ticker, col)) {
      return <td style={{ textAlign: "center", color: "#ccc" }}>⏳</td>;
    }

    if (col === "mean_rev_rsi") {
      return (
        <td style={{ textAlign: "center" }}>
          <span
            style={{
              color: getMeanRevColor(meanRevRsi[ticker]?.meanRev ?? null),
            }}
          >
            {getSlopeArrow(meanRevRsi[ticker]?.meanRev ?? null)}
          </span>{" "}
          |{" "}
          <span
            style={{
              color: getRsiColor(meanRevRsi[ticker]?.rsi ?? null),
            }}
          >
            {getSlopeArrow(meanRevRsi[ticker]?.rsi ?? null)}
          </span>
        </td>
      );
    }

    if (col === "pnl") {
      const pnl = getPnlForTicker(ticker);
      if (!pnl) return <td style={{ textAlign: "center" }}>-</td>;
      const color =
        pnl.amount > 0 ? "#4caf50" : pnl.amount < 0 ? "#f44336" : "#bdbdbd";
      const sign = pnl.amount > 0 ? "+" : "";
      return (
        <td style={{ textAlign: "center", color, fontWeight: 700 }}>
          {`${sign}${pnl.percent.toFixed(2)}%`}
          <div style={{ fontSize: "0.8em", fontStyle: "italic", marginTop: 2 }}>
            {`(${sign}${formatCurrency(pnl.amount)} ${pnl.currency})`}
          </div>
        </td>
      );
    }

    if (col === "daily_change") {
      const ch = meanRevRsi[ticker];
      const amount = ch?.dailyChange;
      const pct = ch?.dailyChangePercent;
      if (amount == null || pct == null)
        return <td style={{ textAlign: "center" }}>-</td>;
      const color = amount > 0 ? "#4caf50" : amount < 0 ? "#f44336" : "#bdbdbd";
      const sign = amount > 0 ? "+" : "";
      return (
        <td style={{ textAlign: "center", color, fontWeight: 700 }}>
          {`${sign}${formatCurrency(amount)}`} ({`${sign}${pct.toFixed(2)}%`})
        </td>
      );
    }

    if (col === "price_target") {
      const price = meanRevRsi[ticker]?.currentPrice;
      const target = holding.target;
      if (typeof price === "number" && typeof target === "number") {
        const diff = ((price - target) / target) * 100;
        const diffStr =
          diff >= 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
        const cellClass =
          diff >= 0 ? "price-target-positive" : "price-target-negative";
        return (
          <td className={cellClass} style={{ textAlign: "center" }}>
            {`${price.toFixed(2)} | ${target.toFixed(2)} (${diffStr})`}
          </td>
        );
      }
      return (
        <td style={{ textAlign: "center" }}>
          {price != null ? price.toFixed(2) : "-"}
        </td>
      );
    }

    if (col === "cmf") {
      return (
        <td
          style={{
            color: getCmfColor(meanRevRsi[ticker]?.cmf ?? null),
            textAlign: "center",
            fontWeight: 550,
          }}
        >
          {meanRevRsi[ticker]?.cmf ?? "-"}
        </td>
      );
    }

    if (col === "supertrend") {
      const stVal = meanRevRsi[ticker]?.supertrend ?? null;
      const buySell = stVal ? stVal.toUpperCase() : "";
      const delta = signalSummary[ticker]?._generic?.strength || "";
      const color =
        buySell === "BUY"
          ? "#4caf50"
          : buySell === "SELL"
          ? "#f44336"
          : "#bdbdbd";

      let cellClass = "";
      const genericStatus = signalSummary[ticker]?._generic?.status || "";

      if (genericStatus === "BUY") {
        if (delta === "very strong") cellClass = "signal-buy-very-strong";
        else if (delta === "strengthening")
          cellClass = "signal-buy-strengthening";
        else if (delta === "weakening") cellClass = "signal-buy-weakening";
        else if (delta === "very weak") cellClass = "signal-buy-very-weak";
      } else if (genericStatus === "SELL") {
        if (delta === "very strong") cellClass = "signal-sell-very-strong";
        else if (delta === "strengthening")
          cellClass = "signal-sell-strengthening";
        else if (delta === "weakening") cellClass = "signal-sell-weakening";
        else if (delta === "very weak") cellClass = "signal-sell-very-weak";
      }

      if (delta === "crossed") {
        cellClass += " signal-crossed";
      }

      return (
        <td
          style={{ color, textAlign: "center", fontWeight: 700 }}
          className={cellClass}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <span title={delta}>{buySell || "-"}</span>
          </div>
        </td>
      );
    }

    if (METRIC_COLUMNS.includes(col)) {
      if (col === "current_price") {
        const val = meanRevRsi[ticker]?.metrics?.current_price;
        return (
          <td style={{ textAlign: "center" }}>
            {typeof val === "number" ? val.toFixed(2) : val ?? "-"}
          </td>
        );
      }

      const metric = meanRevRsi[ticker]?.metrics?.[col];
      let value: any = metric;
      if (metric && typeof metric === "object" && "current" in metric) {
        value = metric.current;
      }
      const price = meanRevRsi[ticker]?.metrics?.current_price ?? null;
      // Determine how to display the metric
      let className: string;
      let display: string | number | null | undefined;

      if (
        col === "twenty_dma" ||
        col === "fifty_dma" ||
        col === "two_hundred_dma" ||
        col === "three_year_ma"
      ) {
        if (typeof value === "number" && typeof price === "number") {
          className = colorize(price, value);
          if (price > value) display = "Above";
          else if (price < value) display = "Below";
          else display = "at";
        } else {
          className =
            typeof value === "string"
              ? colorizeString(value)
              : colorize(price, value);
          display = typeof value === "number" ? value.toFixed(2) : value ?? "-";
        }
      } else {
        className =
          typeof value === "string"
            ? colorizeString(value)
            : colorize(price, value);
        display = typeof value === "number" ? value.toFixed(2) : value ?? "-";
      }

      return (
        <td className={className} style={{ textAlign: "center" }}>
          {display}
        </td>
      );
    }

    // Special handling for Mansfield strategy
    if (col === "mansfield") {
      const mObj = signalSummary[ticker]?.[col] ?? {};
      const buySell = mObj.signal || "";
      const isNewBuy = mObj.newBuy;
      const color =
        buySell === "BUY"
          ? "#4caf50"
          : buySell === "SELL"
          ? "#f44336"
          : "#bdbdbd";
      const cellClass = isNewBuy ? "signal-new-buy" : "";
      return (
        <td
          key={col}
          style={{ color, textAlign: "center", fontWeight: 700 }}
          className={cellClass}
        >
          {buySell || "-"}
        </td>
      );
    }

    // fallback for other signal strategy columns
    const signalObj = signalSummary[ticker]?.[col] ?? {};
    const buySell = signalObj.signal || "";
    const delta = signalSummary[ticker]?._generic?.strength || "";
    const color =
      buySell === "BUY"
        ? "#4caf50"
        : buySell === "SELL"
        ? "#f44336"
        : "#bdbdbd";
    const genericStatus = signalSummary[ticker]?._generic?.status || "";
    let cellClass = "";
    let icon = "";

    if (genericStatus === "BUY") {
      if (delta === "very strong") cellClass = "signal-buy-very-strong";
      else if (delta === "strengthening")
        cellClass = "signal-buy-strengthening";
      else if (delta === "weakening") cellClass = "signal-buy-weakening";
      else if (delta === "very weak") cellClass = "signal-buy-very-weak";
    } else if (genericStatus === "SELL") {
      if (delta === "very strong") cellClass = "signal-sell-very-strong";
      else if (delta === "strengthening")
        cellClass = "signal-sell-strengthening";
      else if (delta === "weakening") cellClass = "signal-sell-weakening";
      else if (delta === "very weak") cellClass = "signal-sell-very-weak";
    }

    if (delta === "crossed") {
      icon = " 🔁";
      cellClass += " signal-crossed";
    }

    return (
      <td
        key={col}
        style={{ color, textAlign: "center", fontWeight: 700 }}
        className={cellClass}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span title={delta}>
            {buySell || "-"}
            {icon}
          </span>
        </div>
      </td>
    );
  };

  return (
    <div>
      <div className="mb-3 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center">
          {/* List Type Dropdown */}
          <label className="fw-semibold me-2">List:</label>
          <select
            value={listType}
            onChange={(e) => {
              const val = e.target.value as "portfolio" | "watchlist";
              setListType(val);
              onListTypeChange?.(val);
            }}
            className="me-4"
          >
            <option value="portfolio">Portfolio</option>
            <option value="watchlist">Watchlist</option>
          </select>

          {/* Timeframe Dropdown */}
          <label className="fw-semibold me-2">Timeframe:</label>
          <select
            value={selectedTimeframe}
            onChange={(e) => {
              setSelectedTimeframe(e.target.value);
              setSortColumn(null);
              setSecondarySortColumn(null);
              setFilterType("ALL");
            }}
          >
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>

          <div
            className="dropdown ms-3"
            ref={columnsDropdownRef}
            style={{ position: "relative" }}
          >
            <button
              className="btn btn-outline-primary d-flex align-items-center gap-2"
              type="button"
              onClick={() => setShowColumnsDropdown((v) => !v)}
            >
              <SlidersHorizontal size={18} /> Columns
            </button>
            {showColumnsDropdown && (
              <div
                className="dropdown-menu show p-2 mt-2 shadow rounded-3"
                style={{
                  display: "block",
                  position: "absolute",
                  left: 0,
                  top: "110%",
                  minWidth: 200,
                  maxHeight: 320,
                  overflowY: "auto",
                  zIndex: 30,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {allColumns.map((col) => (
                  <label
                    key={col}
                    className="dropdown-item d-flex align-items-center"
                    style={{ userSelect: "none" }}
                  >
                    <input
                      type="checkbox"
                      className="form-check-input me-2"
                      checked={selectedColumns.includes(col)}
                      onChange={() => {
                        setSelectedColumns((prev) =>
                          prev.includes(col)
                            ? prev.filter((c) => c !== col)
                            : [...prev, col]
                        );
                      }}
                    />
                    {COLUMN_LABELS[col] ||
                      col.replace(/_/g, " ").replace("longterm", " LongTerm")}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Global Signal Filter Dropdown */}
        <div className="d-flex align-items-center">
          <label className="fw-semibold ms-4 me-2">Show:</label>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as "ALL" | "BUY" | "SELL" | "MIXED");
              setSortColumn(null);
              setSecondarySortColumn(null);
            }}
          >
            <option value="ALL">All Signals</option>
            <option value="BUY">BUY Only</option>
            <option value="SELL">SELL Only</option>
            <option value="MIXED">Mixed</option>
          </select>
        </div>
      </div>

      {/* Loading or No Data States */}
      {signalsLoading ? (
        <div className="text-center my-4">
          <span className="spinner-border" role="status" aria-hidden="true" />
          <span className="ms-2">Loading signals...</span>
        </div>
      ) : portfolio.length === 0 ? (
        <div className="text-center my-4 text-muted">{emptyListMessage}</div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered signal-summary-table">
              <thead>
                <tr>
                  <th style={{ minWidth: "260px" }}>Stock</th>
                  {selectedColumns.map((c) => renderHeader(c))}
                </tr>
              </thead>
              <tbody>
                {displayedPortfolio.length === 0 ? (
                  <tr>
                    <td
                      colSpan={selectedColumns.length + 1}
                      className="text-center text-muted"
                    >
                      No signals found matching your filter.
                    </td>
                  </tr>
                ) : (
                  displayedPortfolio.map((holding) => (
                    <tr key={holding.ticker}>
                      <td
                        style={{
                          verticalAlign: "middle",
                          padding: "4px 8px",
                          maxWidth: "240px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr auto",
                            alignItems: "center",
                            width: "100%",
                            gap: 6,
                          }}
                        >
                          <div style={{ fontWeight: "bold", fontSize: "1rem" }}>
                            {holding.ticker}
                          </div>

                          {(() => {
                            const details =
                              signalSummary[holding.ticker]?._generic?.details;
                            const delta =
                              signalSummary[holding.ticker]?._generic?.strength;
                            if (
                              details?.spread_short_now !== undefined &&
                              details?.spread_long_now !== undefined
                            ) {
                              const isShortBullish =
                                details.ma12_now > details.ma36_now;
                              const shortSpreadNow = Math.abs(
                                details.spread_short_now
                              );
                              const shortSpreadPrev = Math.abs(
                                details.spread_short_prev
                              );
                              const shortTopColor = isShortBullish
                                ? "#00BCD4"
                                : "#9C27B0";
                              const shortBottomColor = isShortBullish
                                ? "#9C27B0"
                                : "#00BCD4";
                              const shortArrowDirection =
                                delta === "crossed"
                                  ? "cross"
                                  : isShortBullish
                                  ? shortSpreadNow > shortSpreadPrev
                                    ? "up"
                                    : "down"
                                  : shortSpreadNow < shortSpreadPrev
                                  ? "up"
                                  : "down";

                              const isLongBullish =
                                details.ma50_now > details.ma150_now;
                              const longSpreadNow = Math.abs(
                                details.spread_long_now
                              );
                              const longSpreadPrev = Math.abs(
                                details.spread_long_prev
                              );
                              const longTopColor = isLongBullish
                                ? "#2962FF"
                                : "#FF9800";
                              const longBottomColor = isLongBullish
                                ? "#FF9800"
                                : "#2962FF";
                              const longArrowDirection =
                                delta === "crossed"
                                  ? "cross"
                                  : isLongBullish
                                  ? longSpreadNow > longSpreadPrev
                                    ? "up"
                                    : "down"
                                  : longSpreadNow < longSpreadPrev
                                  ? "up"
                                  : "down";

                              const shortArrowColor =
                                shortArrowDirection === "up"
                                  ? "#4caf50"
                                  : shortArrowDirection === "down"
                                  ? "#e53935"
                                  : "#2196f3";
                              const longArrowColor =
                                longArrowDirection === "up"
                                  ? "#4caf50"
                                  : longArrowDirection === "down"
                                  ? "#e53935"
                                  : "#2196f3";

                              const shortGapText =
                                shortArrowDirection === "cross"
                                  ? "recently crossed"
                                  : isShortBullish
                                  ? shortArrowDirection === "up"
                                    ? "gap is widening"
                                    : "gap is closing"
                                  : shortArrowDirection === "up"
                                  ? "gap is closing"
                                  : "gap is widening";

                              const longGapText =
                                longArrowDirection === "cross"
                                  ? "recently crossed"
                                  : isLongBullish
                                  ? longArrowDirection === "up"
                                    ? "gap is widening"
                                    : "gap is closing"
                                  : longArrowDirection === "up"
                                  ? "gap is closing"
                                  : "gap is widening";

                              const shortText = (
                                <>
                                  <span
                                    style={{
                                      color: isShortBullish
                                        ? "#00BCD4"
                                        : "#9C27B0",
                                    }}
                                  >
                                    {isShortBullish ? "12w" : "36w"}
                                  </span>{" "}
                                  &gt;{" "}
                                  <span
                                    style={{
                                      color: isShortBullish
                                        ? "#9C27B0"
                                        : "#00BCD4",
                                    }}
                                  >
                                    {isShortBullish ? "36w" : "12w"}
                                  </span>
                                  {`, ${shortGapText}`}
                                </>
                              );
                              const longText = (
                                <>
                                  <span
                                    style={{
                                      color: isLongBullish
                                        ? "#2962FF"
                                        : "#FF9800",
                                    }}
                                  >
                                    {isLongBullish ? "50d" : "150d"}
                                  </span>{" "}
                                  &gt;{" "}
                                  <span
                                    style={{
                                      color: isLongBullish
                                        ? "#FF9800"
                                        : "#2962FF",
                                    }}
                                  >
                                    {isLongBullish ? "150d" : "50d"}
                                  </span>
                                  {`, ${longGapText}`}
                                </>
                              );

                              const shortTopLabel = isShortBullish
                                ? "12w"
                                : "36w";
                              const shortBottomLabel = isShortBullish
                                ? "36w"
                                : "12w";
                              const longTopLabel = isLongBullish
                                ? "50d"
                                : "150d";
                              const longBottomLabel = isLongBullish
                                ? "150d"
                                : "50d";

                              return (
                                <>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    <div style={{ color: shortArrowColor }}>
                                      {shortText}
                                    </div>
                                    <div style={{ color: longArrowColor }}>
                                      {longText}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 4,
                                      marginLeft: "auto",
                                    }}
                                  >
                                    <BlockArrowBar
                                      topColor={shortTopColor}
                                      bottomColor={shortBottomColor}
                                      direction={shortArrowDirection}
                                      topLabel={shortTopLabel}
                                      bottomLabel={shortBottomLabel}
                                    />
                                    <BlockArrowBar
                                      topColor={longTopColor}
                                      bottomColor={longBottomColor}
                                      direction={longArrowDirection}
                                      topLabel={longTopLabel}
                                      bottomLabel={longBottomLabel}
                                    />
                                  </div>
                                </>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      {selectedColumns.map((c) => renderCell(c, holding))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Display Sector Summary - Improved Look */}
          {filterType !== "ALL" && Object.keys(sectorSummary).length > 0 && (
            <div className="card mt-4 shadow-sm border-0">
              <div className="card-header bg-light fw-bold fs-5 border-bottom-0">
                Summary of {filterType} Signals by Sector (Consistent Signals)
              </div>
              <ul className="list-group list-group-flush">
                {Object.entries(sectorSummary)
                  .sort(([sectorA], [sectorB]) =>
                    sectorA.localeCompare(sectorB)
                  )
                  .map(([sector, count]) => (
                    <li
                      key={sector}
                      className="list-group-item d-flex justify-content-between align-items-center py-3"
                      style={{ fontSize: "1.12rem" }}
                    >
                      <span>{sector}</span>
                      <span
                        className={`badge ${badgeColorClass} rounded-pill px-4 py-2 fs-5 fw-bold`}
                        style={{ minWidth: "2.5rem", textAlign: "center" }}
                      >
                        {count}
                      </span>
                    </li>
                  ))}
                {/* Total Row - Stand Out */}
                <li
                  className="list-group-item d-flex justify-content-between align-items-center fw-bold bg-secondary bg-opacity-10 border-0 py-3"
                  style={{ fontSize: "1.15rem" }}
                >
                  Total Consistent Tickers:
                  <span
                    className={`badge ${badgeColorClass} rounded-pill px-4 py-2 fs-5 fw-bold`}
                    style={{ minWidth: "2.5rem", textAlign: "center" }}
                  >
                    {totalSectorCount}
                  </span>
                </li>
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
