from .utils import safe_value, compute_wilder_rsi, detect_zigzag_pivots
import pandas as pd


def calculate_mean_reversion_50dma_target(df: pd.DataFrame, lookback: int = 252) -> dict:
    """
    Calculates a mean reversion target price based on deviation from the 50DMA.

    - Computes historical % deviation from 50DMA over a lookback period.
    - Uses the 90th percentile of absolute deviation as the typical deviation band.
    - Applies this to the latest 50DMA to compute a projected upper bound price.

    Returns a full diagnostic output, including percentiles and current price.
    """
    if len(df) < 60:
        return {"mean_reversion_50dma_target": "in progress"}

    price = df['Close']
    ma_50 = price.rolling(window=50).mean()
    deviation = (price - ma_50) / ma_50 * 100
    recent_dev = deviation[-lookback:].dropna()

    if len(recent_dev) < 30:
        return {"mean_reversion_50dma_target": "in progress"}

    # Calculate deviation metrics
    typical_dev = round(recent_dev.abs().quantile(0.9), 2)
    deviation_band_pct_lower = round(recent_dev.quantile(0.1), 2)
    deviation_band_pct_upper = round(recent_dev.quantile(0.9), 2)

    current_price = price.iloc[-1]
    latest_ma_50 = ma_50.iloc[-1]
    if pd.isna(current_price) or pd.isna(latest_ma_50):
        return {"mean_reversion_50dma_target": "in progress"}

    # Project target price based on 90th percentile deviation band applied to 50DMA
    projected_target_price = round(latest_ma_50 * (1 + typical_dev / 100), 2)

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
    Swing-based Fibonacci Extension with Volatility Confirmation
    - Identify last pivot swing using zigzag
    - Apply Fibonacci projection
    - Confirm using ATR breakout and RSI trend filter
    """
    if len(df) < 100:
        return {"fib_volatility_target": "in progress"}

    price = df['Close']
    pivots = detect_zigzag_pivots(price, threshold=0.07, window=5)
    if len(pivots) < 2:
        return {"fib_volatility_target": "not enough pivots"}

    # Use last valid upswing or downswing
    (idx1, price1), (idx2, price2) = pivots[-2], pivots[-1]
    df_range = df.iloc[min(idx1, idx2): max(idx1, idx2) + 1]
    swing_range = abs(price2 - price1)

    direction = "up" if price2 > price1 else "down"
    targets = {"swing_direction": direction}

    # ATR breakout filter
    df['TR'] = df[['High', 'Low', 'Close']].apply(
        lambda row: max(row['High'] - row['Low'], abs(row['High'] - row['Close']), abs(row['Low'] - row['Close'])), axis=1)
    atr = df['TR'].rolling(window=14).mean()
    breakout = atr.iloc[-1] > atr[-20:].mean()
    targets['atr_breakout_confirmed'] = bool(breakout)

    # Project Fibonacci Extensions
    for ratio in fib_ratios:
        if direction == "up":
            target = price2 + swing_range * ratio
            targets[f"fib_{ratio:.3f}_up"] = round(target, 2)
        else:
            target = price2 - swing_range * ratio
            targets[f"fib_{ratio:.3f}_down"] = round(target, 2)

    return targets


def get_price_targets(df: pd.DataFrame) -> dict:
    """
    Aggregates both mean reversion targets and Fibonacci-based targets.
    """
    result = {}
    result.update(calculate_mean_reversion_50dma_target(df))
    result.update(calculate_fibonacci_volatility_target(df))
    return result
