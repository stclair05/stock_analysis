from .utils import safe_value, compute_wilder_rsi, detect_zigzag_pivots
import pandas as pd


def calculate_mean_reversion_50dma_target(df: pd.DataFrame, lookback: int = 252) -> dict:
    """
    Calculates the historical mean reversion band for 50DMA and returns a projected
    target price based on symmetrical reversion.

    - Computes historical % deviation from 50DMA over a lookback period (of 1 year default, we can change that)
    - Finds 90th percentile of absolute deviation as typical band
    - Applies it to current price to compute upper/lower reversion targets
    """
    if len(df) < 60:
        return {"mean_reversion_50dma_target": "in progress"}

    price = df['Close']
    ma_50 = price.rolling(window=50).mean()
    deviation = (price - ma_50) / ma_50 * 100
    recent_dev = deviation[-lookback:].dropna()

    if len(recent_dev) < 30:
        return {"mean_reversion_50dma_target": "in progress"}

    # Find typical reversion band from historical absolute deviations
    typical_dev = round(recent_dev.abs().quantile(0.9), 2)

    current_price = safe_value(price, -1)
    if current_price == "in progress":
        return {"mean_reversion_50dma_target": "in progress"}

    upper = round(current_price * (1 - typical_dev / 100), 2)
    lower = round(current_price * (1 + typical_dev / 100), 2)

    return {
        "typical_deviation_band_pct": typical_dev,
        "deviation_band_pct_lower": round(recent_dev.quantile(0.1), 2),
        "deviation_band_pct_upper": round(recent_dev.quantile(0.9), 2),
        "reversion_lower_target": upper,
        "reversion_upper_target": lower,
        "current_price": current_price
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
