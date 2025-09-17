import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

_YF_COLS = ["Open", "High", "Low", "Close", "Adj Close", "Volume"]

def _normalize_yf_columns(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    # Drop ticker level if present after repair=True
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(-1)

    # Drop helper columns if present
    for extra in ["Repaired?", "Price"]:
        if extra in df.columns and extra not in _YF_COLS:
            df = df.drop(columns=[extra])

    # Ensure all expected columns exist and order them
    for c in _YF_COLS:
        if c not in df.columns:
            df[c] = np.nan
    df = df[_YF_COLS]

    # Index hygiene
    df = df.sort_index()
    df.index = pd.to_datetime(df.index)
    df = df[~df.index.duplicated(keep="last")]
    return df

def _get_price_data_cached(symbol: str) -> pd.DataFrame:
    # Base history (no repair)
    base = yf.download(symbol, period="12y", interval="1d", auto_adjust=False, threads=False)
    base = _normalize_yf_columns(base)

    # Patch last ~7 calendar days with repair=True
    today = datetime.now()
    start = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    end   = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    live = yf.download(
        symbol, start=start, end=end, interval="1d",
        auto_adjust=False, repair=True, threads=False
    )
    live = _normalize_yf_columns(live)

    # Union merge: prefer live (repaired) where base is missing
    # (combine_first keeps existing base values and fills gaps from live)
    df = base.combine_first(live)

    # Final tidy
    df = df.sort_index()
    df = df[~df.index.duplicated(keep="last")]
    # Only drop rows that are truly empty; don't over-eagerly filter just on 'Close'
    df = df.dropna(how="all")

    # Optional: fallback only if *pathologically* short (e.g., IPO/new listing)
    if len(df) < 200:  # <<-- use a sensible threshold, not 10000
        retry = yf.download(symbol, period="20y", interval="1d", auto_adjust=False, threads=False)
        retry = _normalize_yf_columns(retry)
        df = retry.combine_first(df).sort_index()

    return df

def get_price_data(symbol: str) -> pd.DataFrame:
    return _get_price_data_cached(symbol).copy()
print(get_price_data("HL"))