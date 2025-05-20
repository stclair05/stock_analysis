from .utils import safe_value, compute_wilder_rsi
import pandas as pd


def calculate_mean_reversion_50dma_target(df: pd.DataFrame, lookback: int = 365) -> dict:
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
        "reversion_lower_target": upper,
        "reversion_upper_target": lower,
        "current_price": current_price
    }


def calculate_fibonacci_volatility_target(df: pd.DataFrame, rsi_period: int = 14, fib_ratio: float = 1.618) -> dict:
    """
    Projects target price using Fibonacci Extension + RSI-based volatility filter.
    """
    df = df.copy()
    df['RSI'] = compute_wilder_rsi(df['Close'], period=rsi_period)

    if len(df.dropna()) < 60:
        return {"fib_volatility_target": "in progress"}

    # Recent swing low and high over the past 40 days
    recent_window = df[-40:]
    swing_low = recent_window['Close'].min()
    swing_high = recent_window['Close'].max()

    # Directional bias based on RSI
    rsi = df['RSI'].iloc[-1]

    target = None
    if rsi > 50:
        # Bullish extension
        extension = (swing_high - swing_low) * fib_ratio
        target = swing_high + extension
    elif rsi < 50:
        # Bearish extension
        extension = (swing_high - swing_low) * fib_ratio
        target = swing_low - extension

    return {"fib_volatility_target": round(float(target), 2) if target else "in progress"}


def get_price_targets(df: pd.DataFrame) -> dict:
    """
    Aggregates both mean reversion targets and Fibonacci-based targets.
    """
    result = {}
    result.update(calculate_mean_reversion_50dma_target(df))
    result.update(calculate_fibonacci_volatility_target(df))
    return result
