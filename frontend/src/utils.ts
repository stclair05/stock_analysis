// utils.ts

const symbolMap: Record<string, string> = {
    "^DJI": "TVC:DJI",
    "^GSPC": "TVC:SPX",
    "^IXIC": "TVC:NAS100",
    "^RUT": "TVC:RUSSELL2000", // Russell 2000
  };
  
  export const getTradingViewUrl = (
    symbol: string,
    layoutId = "EDjTntBs"
  ): string => {
    const mappedSymbol = symbolMap[symbol.toUpperCase()] || `NASDAQ:${symbol.toUpperCase()}`;
    return `https://www.tradingview.com/chart/${layoutId}/?symbol=${encodeURIComponent(mappedSymbol)}`;
  };
  