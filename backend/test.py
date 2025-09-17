import pandas as pd
import yfinance as yf

t = yf.Ticker("LTBR")

# Pull recent intraday (use "5m" if 1m is too heavy)
m = t.history(period="7d", interval="1m", prepost=False, repair=True)
if m.empty:
    raise ValueError("No intraday data returned")

# Convert to US/Eastern so day boundaries align with the trading day incl. DST
m = m.tz_convert("America/New_York")

# Keep regular session only; adjust if you want pre/post
session = m.between_time("09:30", "16:00")

# Aggregate to daily OHLCV using Eastern-local day bins
daily = session.resample("1D").agg({
    "Open":  "first",
    "High":  "max",
    "Low":   "min",
    "Close": "last",
    "Volume":"sum"
}).dropna(how="all")

# Optional: drop empty days and remove tz from the index
daily = daily.dropna(subset=["Close"]).copy()
daily.index = daily.index.tz_localize(None)

print(daily.tail(3))
