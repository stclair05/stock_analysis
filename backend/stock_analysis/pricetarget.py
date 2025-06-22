from .utils import safe_value, compute_wilder_rsi, detect_zigzag_pivots
import pandas as pd
import numpy as np


def calculate_mean_reversion_50dma_target(df: pd.DataFrame, lookback: int | None = None) -> dict:
    """
    Calculates a mean reversion target price based on deviation from the 50DMA.

    - Computes historical % deviation from 50DMA over the entire available history
      (or a specified lookback period when provided).
    - Uses the 90th percentile of absolute deviation as the typical deviation band.
    - Applies this to the latest 50DMA to compute a projected upper bound price.

    Returns a full diagnostic output, including percentiles and current price.
    """
    if len(df) < 60:
        return {"mean_reversion_50dma_target": "in progress"}

    price = df['Close']
    ma_50 = price.rolling(window=50).mean()
    deviation = (price - ma_50) / ma_50 * 100
    recent_dev = (
        deviation[-lookback:].dropna() if isinstance(lookback, int) else deviation.dropna()
    )

    if len(recent_dev) < 30:
        return {"mean_reversion_50dma_target": "in progress"}

    # Calculate deviation metrics based on two standard deviations
    dev_mean = recent_dev.mean()
    dev_std = recent_dev.std()
    typical_dev = round(2 * dev_std, 2)
    deviation_band_pct_lower = round(dev_mean - 2 * dev_std, 2)
    deviation_band_pct_upper = round(dev_mean + 2 * dev_std, 2)

    current_price = price.iloc[-1]
    latest_ma_50 = ma_50.iloc[-1]
    if pd.isna(current_price) or pd.isna(latest_ma_50):
        return {"mean_reversion_50dma_target": "in progress"}

    # Project target price based on the upper deviation band (two standard deviations)
    # projected_target_price = round(latest_ma_50 * (1 + typical_dev / 100), 2)

    projected_target_price = round(latest_ma_50 * (1 + deviation_band_pct_upper  / 100), 2)

    return {
        "typical_deviation_band_pct": typical_dev,
        "deviation_band_pct_lower": deviation_band_pct_lower,
        "deviation_band_pct_upper": deviation_band_pct_upper,
        "reversion_projected_target_price": projected_target_price,
        "current_price": round(current_price, 2),
        "latest_50dma": round(latest_ma_50, 2)
    }



def calculate_fibonacci_volatility_target(df: pd.DataFrame, fib_ratios: list[float] = [1.618, 2.618]) -> dict:
    """
    Swing-based Fibonacci Extension with Volatility & RSI Confirmation
    - Identify last pivot swing using zigzag
    - Apply Fibonacci projection
    - Confirm using ATR breakout and RSI trend filter
    """
    if len(df) < 100:
        return {"fib_volatility_target": "in progress"}

    price = df['Close']
    pivots = detect_zigzag_pivots(df, threshold=0.07, window=5)
    if len(pivots) < 2:
        return {"fib_volatility_target": "not enough pivots"}

    (idx1, price1), (idx2, price2) = pivots[-2], pivots[-1]
    if idx1 == idx2 or price1 == price2:
        return {"fib_volatility_target": "invalid swing range"}

    swing_range = abs(price2 - price1)
    latest_price = df['Close'].iloc[-1]

    # Refined swing direction logic
    if price2 < price1 and latest_price > price2:
        direction = "up"  # Price has rebounded after downtrend
        swing_status = "downtrend broken, projecting up"
    elif price2 > price1 and latest_price < price2:
        direction = "down"  # Price has fallen after uptrend
        swing_status = "uptrend broken, projecting down"
    else:
        direction = "up" if price2 > price1 else "down"
        swing_status = "trend intact"

    targets = {
        "swing_direction": direction,
        "swing_status": swing_status,
        "pivot_1_index": idx1,
        "pivot_2_index": idx2,
        "pivot_1_price": round(price1, 2),
        "pivot_2_price": round(price2, 2),
        "latest_price": round(latest_price, 2)
    }

    # ATR breakout confirmation
    df['TR'] = df[['High', 'Low', 'Close']].apply(
        lambda row: max(row['High'] - row['Low'],
                        abs(row['High'] - row['Close']),
                        abs(row['Low'] - row['Close'])), axis=1)
    atr = df['TR'].rolling(window=14).mean().dropna()
    if len(atr) < 20:
        return {"fib_volatility_target": "in progress"}
    breakout = atr.iloc[-1] > atr[-20:].mean()
    targets['atr_breakout_confirmed'] = bool(breakout)

    # RSI trend confirmation
    df['RSI'] = compute_wilder_rsi(df['Close'], period=14)
    rsi_trend = df['RSI'].iloc[-1]
    rsi_confirm = rsi_trend > 50 if direction == "up" else rsi_trend < 50
    targets['rsi_trend_confirmed'] = bool(rsi_confirm)

    # Fibonacci projections
    for ratio in fib_ratios:
        if direction == "up":
            target = price2 + swing_range * ratio
            targets[f"fib_{ratio:.3f}_up"] = round(target, 2)
        else:
            target = price2 - swing_range * ratio
            targets[f"fib_{ratio:.3f}_down"] = round(target, 2)

    return targets




def get_price_targets(df: pd.DataFrame, symbol: str = "") -> dict:
    mean_reversion_result = calculate_mean_reversion_50dma_target(df)
    fib_volatility_result = calculate_fibonacci_volatility_target(df)

    return {
        "symbol": symbol,
        "price_targets": {
            "mean_reversion": mean_reversion_result,
            "fibonacci": fib_volatility_result
        }
    }


def find_downtrend_lines(df: pd.DataFrame, threshold=0.07, window=5):
    def get_utctimestamp(idx):
        val = df.index[idx]
        if isinstance(val, (int, float, np.integer, np.floating)):
            return int(val)
        return int(pd.to_datetime(val).timestamp())
    
    pivots = detect_zigzag_pivots(df, threshold=threshold, window=window)
    lines = []

    i = 0
    while i < len(pivots) - 1:
        idx_i, price_i = pivots[i]
        if price_i == df['High'].iloc[idx_i]:
            for j in range(i + 1, len(pivots)):
                idx_j, price_j = pivots[j]
                if price_j == df['Low'].iloc[idx_j]:
                    trendline = {
                        "start": [get_utctimestamp(idx_i), float(df['High'].iloc[idx_i])],
                        "end": [get_utctimestamp(idx_j), float(df['Low'].iloc[idx_j])]
                    }
                    lines.append(trendline)
                    i = j  # Skip ahead to just after the trough
                    break
            else:
                i += 1
        else:
            i += 1

    return {"trendlines": lines}
