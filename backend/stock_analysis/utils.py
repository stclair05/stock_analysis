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

# Pivot Detection for Elliott Wave
def detect_pivots(series: pd.Series, window: int = 5):
    pivots = []
    for i in range(window, len(series) - window):
        is_peak = all(series[i] > series[i - j] for j in range(1, window + 1)) and \
                  all(series[i] > series[i + j] for j in range(1, window + 1))
        is_trough = all(series[i] < series[i - j] for j in range(1, window + 1)) and \
                    all(series[i] < series[i + j] for j in range(1, window + 1))
        if is_peak or is_trough:
            pivots.append((i, series[i]))
    return pivots