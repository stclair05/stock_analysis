import pandas as pd
from ta.momentum import RSIIndicator
from .utils import detect_zigzag_pivots


def calculate_elliott_wave(df: pd.DataFrame, threshold: float = 0.05) -> dict:
    # 🟢 Resample to weekly data (Friday close)
    df = df.resample("W-FRI").agg({
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum"
    }).dropna()

    close = df['Close']
    volume = df['Volume']
    pivots = detect_zigzag_pivots(close, threshold, 5)

    if len(pivots) < 5:
        return {"error": "Not enough pivot points to determine wave count."}

    # Take the most recent 5 pivots
    pivots = pivots[-5:]
    wave0_idx, wave0 = pivots[0]
    wave1_idx, wave1 = pivots[1]
    wave2_idx, wave2 = pivots[2]
    wave3_idx, wave3 = pivots[3]
    wave4_idx, wave4 = pivots[4]

    current_price = close.iloc[-1]
    print(f"wave0: {wave0}, wave1: {wave1}, wave2: {wave2}, wave3: {wave3}, wave4: {wave4}")

    # ✅ Validate pivot sequence
    if not (wave0_idx < wave1_idx < wave2_idx < wave3_idx < wave4_idx):
        return {"error": "Invalid pivot sequence (non-sequential indices)."}

    abc_waves = {}

    # ✅ Classify wave structure
    if wave1 > wave0 and wave3 > wave1 and wave2 < wave1 and wave4 > wave2:
        wave_type = "Upward Impulse"
        wave1_length = wave1 - wave0
        wave3_projection = wave1 + 1.618 * wave1_length
        wave5_projection = wave3 + 0.618 * (wave3 - wave1)

        # Determine current wave
        if current_price > wave3:
            current_wave = "Wave 5"
            target = wave5_projection
        elif current_price > wave1:
            current_wave = "Wave 3"
            target = wave3_projection
        elif current_price > wave0:
            current_wave = "Wave 1"
            target = wave1 + (wave1 - wave0) * 0.5
        else:
            current_wave = "Corrective Wave"
            target = wave0

    elif wave1 < wave0 and wave3 < wave1 and wave2 > wave1 and wave4 < wave2:
        wave_type = "Downward Impulse"
        wave1_length = wave0 - wave1
        wave3_projection = wave1 - 1.618 * wave1_length
        wave5_projection = wave3 - 0.618 * (wave1 - wave3)

        # Determine current wave
        if current_price < wave3:
            current_wave = "Wave 5"
            target = wave5_projection
        elif current_price < wave1:
            current_wave = "Wave 3"
            target = wave3_projection
        elif current_price < wave0:
            current_wave = "Wave 1"
            target = wave1 - (wave0 - wave1) * 0.5
        else:
            current_wave = "Corrective Wave"
            target = wave0

    else:
        wave_type = "Corrective or Complex"
        wave3_projection = wave3
        wave5_projection = wave4
        current_wave = "Corrective Wave"
        target = wave0

        # ✅ Label ABC waves
        abc_waves = {
            "wave_a": round(wave1, 2),
            "wave_b": round(wave2, 2),
            "wave_c": round(wave3, 2)
        }

    # ✅ RSI divergence
    rsi = RSIIndicator(close, window=14).rsi()
    rsi_divergence = "Normal"
    if wave3_idx < len(rsi) and wave1_idx < len(rsi):
        if wave3 > wave1 and rsi.iloc[wave3_idx] < rsi.iloc[wave1_idx]:
            rsi_divergence = "Bearish Divergence"
        elif wave3 < wave1 and rsi.iloc[wave3_idx] > rsi.iloc[wave1_idx]:
            rsi_divergence = "Bullish Divergence"

    # ✅ Volume confirmation
    vol3 = volume.iloc[wave3_idx]
    vol1 = volume.iloc[wave1_idx]
    volume_confirmation = "Positive" if vol3 > vol1 else "Negative"

    # ✅ Prepare return dictionary
    result = {
        "wave_type": wave_type,
        "current_wave": current_wave,
        "wave_start_price": round(wave0, 2),
        "current_price": round(current_price, 2),
        "wave_end_projection": round(target, 2),
        "invalidation_level": round(wave0, 2),
        "buy_1": round(wave0 * 1.05, 2),
        "buy_2": round(wave2, 2),
        "buy_3": round(wave1 * 1.01, 2),
        "sell_price": round(wave3, 2),
        "arrow_target": round(wave5_projection, 2),
        "rsi_divergence": rsi_divergence,
        "volume_confirmation": volume_confirmation
    }

    # ✅ Add ABC waves if present
    if abc_waves:
        result.update(abc_waves)
        

    return result
