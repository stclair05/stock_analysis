import pandas as pd
import numpy as np

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
