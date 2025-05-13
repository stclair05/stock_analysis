import pandas as pd
from ta.momentum import RSIIndicator
from .utils import detect_zigzag_pivots
import numpy as np


def validate_impulse_rules(pivots: list[tuple[int, float]]) -> bool:
    """
    Enforces Elliott Wave impulse rules with realistic tolerances.
    
    Rules:
    - Wave 2 must not retrace more than 100% of Wave 1
    - Wave 3 must not be the shortest among 1, 3, 5
    - Wave 4 must not *significantly* overlap Wave 1 (allow minor overlap)
    """
    if len(pivots) < 5:
        return False

    wave0_idx, wave0 = pivots[0]
    wave1_idx, wave1 = pivots[1]
    wave2_idx, wave2 = pivots[2]
    wave3_idx, wave3 = pivots[3]
    wave4_idx, wave4 = pivots[4]

    len1 = abs(wave1 - wave0)
    len3 = abs(wave3 - wave1)
    len5 = abs(wave4 - wave3)

    # Rule 1: Wave 2 should not fully retrace Wave 1
    if wave1 > wave0 and wave2 <= wave0:
        return False
    if wave1 < wave0 and wave2 >= wave0:
        return False

    # Rule 2: Wave 3 must not be the shortest
    if len3 <= min(len1, len5):
        return False

    # Rule 3: Allow minor overlap in Wave 4 vs Wave 1 (up to 10%)
    if wave1 > wave0:
        if wave4 <= wave1 * 0.98:
            return False
    elif wave1 < wave0:
        if wave4 >= wave1 * 1.02:
            return False

    return True


def score_wave_count(wave_type, rsi_divergence, volume_confirmation, passed_rules):
    score = 0.0
    if passed_rules:
        score += 0.5
    if rsi_divergence in ["Bullish Divergence", "Bearish Divergence"]:
        score += 0.2
    if volume_confirmation == "Positive":
        score += 0.2
    if wave_type in ["Upward Impulse", "Downward Impulse"]:
        score += 0.1
    return round(score, 2)


def evaluate_wave_scenario(pivots, df):
    wave0_idx, wave0 = pivots[0]
    wave1_idx, wave1 = pivots[1]
    wave2_idx, wave2 = pivots[2]
    wave3_idx, wave3 = pivots[3]
    wave4_idx, wave4 = pivots[4]

    close = df['Close']
    volume = df['Volume']
    current_price = float(close.iloc[-1])

    result = {}
    wave_type = "Corrective or Complex"
    current_wave = "Corrective Wave"
    target = None
    abc_waves = {}
    passed_rules = validate_impulse_rules(pivots)

    if wave1 > wave0 and wave3 > wave1 and wave2 < wave1 and wave4 > wave2 and passed_rules:
        wave_type = "Upward Impulse"
        wave1_length = wave1 - wave0
        wave3_projection = wave1 + 1.618 * wave1_length
        wave5_projection = wave3 + 0.618 * (wave3 - wave1)

        if current_price > wave3:
            current_wave = "Wave 5"
            target = wave5_projection
        elif current_price > wave1:
            current_wave = "Wave 3"
            target = wave3_projection
        elif current_price > wave0:
            current_wave = "Wave 1"
            target = wave1 + 0.5 * wave1_length
        else:
            current_wave = "Corrective Wave"
            target = wave2 - (wave1 - wave2)

    elif wave1 < wave0 and wave3 < wave1 and wave2 > wave1 and wave4 < wave2 and passed_rules:
        wave_type = "Downward Impulse"
        wave1_length = wave0 - wave1
        wave3_projection = wave1 - 1.618 * wave1_length
        wave5_projection = wave3 - 0.618 * (wave1 - wave3)

        if current_price < wave3:
            current_wave = "Wave 5"
            target = wave5_projection
        elif current_price < wave1:
            current_wave = "Wave 3"
            target = wave3_projection
        elif current_price < wave0:
            current_wave = "Wave 1"
            target = wave1 - 0.5 * wave1_length
        else:
            current_wave = "Corrective Wave"
            target = wave0

    else:
        wave_type = "Corrective or Complex"
        current_wave = "Corrective Wave"
        wave_a_len = wave1 - wave2
        target = wave2 - wave_a_len

        abc_waves = {
            "wave_a": float(wave1),
            "wave_b": float(wave2),
            "wave_c": float(wave3)
        }

        if current_price >= max(wave0, wave1, wave3) * 0.998:
            current_wave = "Wave 1"
            wave_type = "Upward Impulse"
            target = None
            abc_waves = {}
            wave0 = wave3

    rsi = RSIIndicator(close, window=14).rsi()
    rsi_divergence = "Normal"
    if wave3_idx < len(rsi) and wave1_idx < len(rsi):
        if wave3 > wave1 and rsi.iloc[wave3_idx] < rsi.iloc[wave1_idx]:
            rsi_divergence = "Bearish Divergence"
        elif wave3 < wave1 and rsi.iloc[wave3_idx] > rsi.iloc[wave1_idx]:
            rsi_divergence = "Bullish Divergence"

    vol3 = volume.iloc[wave3_idx]
    vol1 = volume.iloc[wave1_idx]
    volume_confirmation = "Positive" if vol3 > vol1 else "Negative"

    # Flip entry_type if TP is above entry in short
    if target is None:
        entry_type = "None"
    elif target > current_price:
        entry_type = "Long"
    else:
        entry_type = "Short"

    entry_price = wave1 if current_wave == "Wave 3" else wave0
    stop_loss = wave0 if entry_type == "Long" else wave1
    take_profit = target if target else wave3

    confidence = score_wave_count(wave_type, rsi_divergence, volume_confirmation, passed_rules)

    result.update({
        "wave_type": wave_type,
        "current_wave": current_wave,
        "wave_start_price": float(wave0),
        "current_price": float(current_price),
        "wave_end_projection": float(target) if target else None,
        "invalidation_level": float(wave0),
        "buy_1": float(wave0 * 1.05),
        "buy_2": float(wave2),
        "buy_3": float(wave1 * 1.01),
        "sell_price": float(wave3),
        "arrow_target": float(target) if target else None,
        "rsi_divergence": rsi_divergence,
        "volume_confirmation": volume_confirmation,
        "confidence": confidence,
        "entry_signal": True,
        "entry_type": entry_type,
        "entry_price": float(entry_price),
        "stop_loss": float(stop_loss),
        "take_profit": float(take_profit),
        "wave_labels": [
            {"index": wave0_idx, "price": float(wave0), "label": "Wave 0"},
            {"index": wave1_idx, "price": float(wave1), "label": "Wave 1"},
            {"index": wave2_idx, "price": float(wave2), "label": "Wave 2"},
            {"index": wave3_idx, "price": float(wave3), "label": "Wave 3"},
            {"index": wave4_idx, "price": float(wave4), "label": "Wave 4"},
        ]
    })

    if abc_waves:
        result.update(abc_waves)

    return result

def calculate_elliott_wave(df):
    close = df["Close"]
    pivots = detect_zigzag_pivots(close, threshold=0.07, window=5)

    if len(pivots) < 5:
        return {"error": "Not enough pivots detected for Elliott Wave analysis."}

    results = []

    for i in range(len(pivots) - 4):
        pivot_slice = pivots[i:i + 5]
        scenario = evaluate_wave_scenario(pivot_slice, df)

        # Ignore very low-confidence ones
        if scenario.get("confidence", 0) < 0.3:
            continue

        scenario["pivot_count"] = len(pivots)
        results.append(scenario)

    # Sort by confidence descending
    results = sorted(results, key=lambda x: x["confidence"], reverse=True)

    # Return top 3 only
    return {"scenarios": results[:3]}
