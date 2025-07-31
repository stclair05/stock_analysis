# symbol_aliases.py

SYMBOL_ALIASES = {
    # Commodities / Futures
    "USOIL": "CL=F",
    "WTI": "CL=F",
    "BRENT": "BZ=F",
    "XAG/USD": "XAGUSD",
    "XAG": "XAGUSD",
    "XAGUSD": "XAGUSD",
    "SILVER": "XAGUSD",
    "XAU/USD": "XAUUSD",
    "XAUUSD": "XAUUSD",
    "GOLD": "XAUUSD",
    "XAU": "XAUUSD",
    "COPPER": "HG=F",

    # Cryptocurrencies
    "BTC": "BTC-USD",
    "ETH": "ETH-USD",

    # Grains
    "WHEAT": "ZW=F",
    "ZW": "ZW=F",
    "ZW=F": "ZW=F",
    "SOYBEAN": "ZS=F",
    "ZS": "ZS=F",
    "ZS=F": "ZS=F",
    "CORN": "ZC=F",
    "ZC": "ZC=F",
    "ZC=F": "ZC=F",

    # Precious Metals
    "PLATINUM": "PLUSD",
    "XPTUSD": "PLUSD",
    "PL": "PLUSD",
    "PL=F": "PLUSD",
    "PLUSD": "PLUSD",
    "ALUMINIUM": "ALI=F",
    "ALUMINUM": "ALI=F",
    "ALI": "ALI=F",
    "ALI=F": "ALI=F",
    "PALLADIUM": "PAUSD",
    "XPDUSD": "PAUSD",
    "PAUSD": "PAUSD",

    # Energy
    "NATGAS": "NG=F",
    "NATURALGAS": "NG=F",
    "NG": "NG=F",
    "NG=F": "NG=F",
    "URANIUM": "URA",
    "UX": "URA",

    # Indexes (Yahoo symbols all start with ^)
    "S&P500": "^GSPC",
    "SPX": "^GSPC",
    "NASDAQ": "^IXIC",
    "NDX": "^NDX",
    "DOWJONES": "^DJI",
    "DJI": "^DJI",
    "RUSSELL2000": "^RUT",
    "RUT": "^RUT",
    "FTSE100": "^FTSE",
    "FTSE": "^FTSE",
    "DAX": "^GDAXI",
    "CAC40": "^FCHI",
    "NIKKEI": "^N225",
    "HANGSENG": "^HSI",
    "HSI": "^HSI",
    "STI": "^STI",  # Singapore Index
    "TYX": "^TYX",  # US Treasury Yield 30 years
}
