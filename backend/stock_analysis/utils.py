import pandas as pd
import numpy as np
from typing import List

def safe_value(series: pd.Series, idx: int):
    if idx >= len(series) or idx < -len(series):
        return "in progress"
    value = series.iloc[idx]
    if isinstance(value, pd.Series):
        value = value.squeeze()
    if pd.isna(value):
        return "in progress"
    return round(float(value), 2) if isinstance(value, (int, float)) else str(value)

# utils.py

def detect_zigzag_pivots(prices: pd.Series, threshold: float = 0.07, window: int = 5):
    """
    Detects zigzag pivots using a rolling window method.
    
    Parameters:
        prices (pd.Series): A Series of prices.
        threshold (float): Minimum percentage change from last confirmed pivot.
        window (int): Lookaround window to determine local maxima/minima.

    Returns:
        List of tuples (index, price) representing pivot points.
    """
    pivots = []
    last_pivot_idx = None
    last_pivot_price = None

    for i in range(window, len(prices) - window):
        local_range = prices.iloc[(i - window):(i + window + 1)]
        current_price = prices.iloc[i]

        is_local_max = current_price == local_range.max()
        is_local_min = current_price == local_range.min()

        if is_local_max or is_local_min:
            if last_pivot_price is None:
                # First pivot
                pivots.append((i, current_price))
                last_pivot_price = current_price
                last_pivot_idx = i
            else:
                change = abs((current_price - last_pivot_price) / last_pivot_price)
                if change >= threshold:
                    pivots.append((i, current_price))
                    last_pivot_price = current_price
                    last_pivot_idx = i

    return pivots

def compute_wilder_rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)

    avg_gain = gain.ewm(alpha=1/period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def find_pivots(series: np.ndarray, window: int = 3) -> tuple[List[int], List[int]]:
    highs, lows = [], []
    for i in range(window, len(series) - window):
        left = series[i - window:i]
        right = series[i + 1:i + window + 1]
        if series[i] > max(np.max(left), np.max(right)):
            highs.append(i)
        if series[i] < min(np.min(left), np.min(right)):
            lows.append(i)
    return highs, lows

def compute_wilder_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """
    Computes Wilder's RSI for a given close price series.
    Used by both daily and weekly RSI-based indicators.
    """
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)

    avg_gain = gain.ewm(alpha=1/period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period).mean()

    rs = np.where(avg_loss == 0, np.inf, avg_gain / avg_loss)
    rsi = 100 - (100 / (1 + rs))

    return pd.Series(rsi, index=close.index)

def detect_rsi_divergence(df: pd.DataFrame, rsi_period=14, pivot_strength=3, rsi_threshold=3.0) -> pd.Series:
    df = df[['Close']].copy()
    df['RSI'] = compute_wilder_rsi(df['Close'], rsi_period)
    df.dropna(inplace=True)

    close = df['Close'].values
    rsi = df['RSI'].values
    index = df.index

    highs, lows = find_pivots(close, pivot_strength)
    labels = pd.Series("Normal", index=index)

    # Search for non-consecutive divergence candidates
    for i in range(len(index)):
        for lookback in range(5, 30):  # Check prior pivots in a window
            j = i - lookback
            if j < 0:
                break

            # Bullish Divergence: Price lower low, RSI higher low
            if j in lows and i in lows:
                if close[i] < close[j] and rsi[i] > rsi[j] and abs(rsi[i] - rsi[j]) >= rsi_threshold and rsi[i] < 50:
                    labels.iloc[i] = "Bullish Divergence"
                    break

            # Bearish Divergence: Price higher high, RSI lower high
            if j in highs and i in highs:
                if close[i] > close[j] and rsi[i] < rsi[j] and abs(rsi[i] - rsi[j]) >= rsi_threshold and rsi[i] > 50:
                    labels.iloc[i] = "Bearish Divergence"
                    break
    # print("RSI Divergences Found:")
    # print(labels[labels != "Normal"].tail(10))  # print last 10 non-Normal labels

    return labels