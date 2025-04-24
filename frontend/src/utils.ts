// utils.ts

export const tradingViewSymbolMap: Record<string, string> = {
    // Indexes
    "^GSPC": "TVC:SPX",             // S&P 500
    "^IXIC": "TVC:NAS100",          // NASDAQ
    "^NDX": "TVC:NSDQ100",          // NASDAQ 100 (alternative)
    "^DJI": "TVC:DJI",              // Dow Jones Industrial
    "^RUT": "TVC:RUSSELL2000",      // Russell 2000
    "^FTSE": "TVC:UKX",             // FTSE 100
    "^GDAXI": "TVC:DAX",            // DAX (Germany)
    "^FCHI": "TVC:CAC40",           // CAC 40 (France)
    "^N225": "TVC:NIKKEI225",       // Nikkei 225
    "^HSI": "TVC:HSI",              // Hang Seng Index
    "^STI": "TVC:STI",              // Straits Times Index (SG)
  
    // Commodities / Futures
    "CL=F": "TVC:USOIL",            // Crude Oil (WTI)
    "BZ=F": "TVC:UKOIL",            // Brent Crude
    "SI=F": "TVC:SILVER",           // Silver
    "GC=F": "TVC:GOLD",             // Gold
    "HG=F": "TVC:COPPER",           // Copper
  
    // Cryptocurrencies
    "BTC-USD": "CRYPTO:BTCUSD",     // Bitcoin
    "ETH-USD": "CRYPTO:ETHUSD",     // Ethereum
  };
  
  
  
  export const getTradingViewUrl = (
    rawSymbol: string,
    layoutId = "EDjTntBs"
  ): string => {
    const backendSymbol = rawSymbol.toUpperCase(); // what we send to backend
    const tradingSymbol = tradingViewSymbolMap[backendSymbol] || `NASDAQ:${backendSymbol}`;
    return `https://www.tradingview.com/chart/${layoutId}/?symbol=${encodeURIComponent(tradingSymbol)}`;
  };
  
  