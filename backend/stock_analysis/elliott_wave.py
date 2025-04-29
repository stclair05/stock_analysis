import pandas as pd
import numpy as np
from .utils import detect_pivots


def calculate_elliott_wave(df: pd.DataFrame) -> dict:
    close_prices = df['Close'].dropna()
    pivots = detect_pivots(close_prices, window=5)

    if len(pivots) < 5:
        return {"error": "Not enough pivot points to determine wave count."}

    # Simplified rule-based wave mapping
    wave_points = pivots[-5:]  # Use latest 5 pivots
    wave_start_price = wave_points[0][1]
    wave_1_high = wave_points[1][1]
    wave_2_low = wave_points[2][1]
    wave_3_high = wave_points[3][1]
    wave_4_low = wave_points[4][1]

    current_price = close_prices.iloc[-1]

    # Estimate targets using simple Fib extension
    wave_1_length = wave_1_high - wave_start_price
    wave_3_projection = wave_2_low + 1.618 * wave_1_length
    wave_5_projection = wave_4_low + 0.618 * wave_1_length

    # Basic wave logic
    if current_price > wave_3_high:
        current_wave = "Wave 5"
    elif current_price > wave_1_high:
        current_wave = "Wave 3"
    elif current_price > wave_start_price:
        current_wave = "Wave 1"
    else:
        current_wave = "Corrective Wave"

    return {
        "current_wave": current_wave,
        "wave_start_price": round(wave_start_price, 2),
        "current_price": round(current_price, 2),
        "wave_end_projection": round(wave_3_projection, 2) if current_wave == "Wave 3" else round(wave_5_projection, 2),
        "invalidation_level": round(wave_start_price, 2),
        "buy_1": round(wave_start_price * 1.05, 2),
        "buy_2": round(wave_2_low, 2),
        "buy_3": round(wave_1_high, 2),
        "sell_price": round(wave_3_high, 2),
        "arrow_target": round(wave_5_projection, 2)
    }