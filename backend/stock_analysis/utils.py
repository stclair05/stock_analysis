import pandas as pd
import numpy as np
from typing import List
import yfinance as yf
from typing import Optional
from functools import lru_cache
from scipy.stats import rankdata

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

def detect_zigzag_pivots(df: pd.DataFrame, threshold: float = 0.07, window: int = 5):
    """
    Detects zigzag pivots using raw High for peaks and Low for troughs.
    Closest to TradingView's wick-to-wick swing logic.
    """
    pivots = []
    last_pivot_idx = None
    last_pivot_price = None

    for i in range(window, len(df) - window):
        high_range = df['High'].iloc[i - window:i + window + 1]
        low_range = df['Low'].iloc[i - window:i + window + 1]

        current_high = df['High'].iloc[i]
        current_low = df['Low'].iloc[i]

        is_local_max = current_high == high_range.max()
        is_local_min = current_low == low_range.min()

        if is_local_max or is_local_min:
            current_price = current_high if is_local_max else current_low
            if last_pivot_price is None:
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

def wilder_smooth(values: pd.Series, period: int) -> pd.Series:
    """
    Implements Wilder's smoothing method:
    - SMA for the first 'period' values
    - Then (prior * (period - 1) + current) / period
    """
    result = [np.nan] * (period - 1)
    if len(values) < period:
        return pd.Series(result + [np.nan] * (len(values) - (period - 1)), index=values.index)

    initial = values.iloc[:period].sum()
    result.append(initial)

    for i in range(period, len(values)):
        prev = result[-1]
        curr = values.iloc[i]
        smoothed = (prev * (period - 1) + curr) / period
        result.append(smoothed)

    return pd.Series(result, index=values.index)


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

def detect_rsi_divergence(
    df: pd.DataFrame,
    rsi_period: int = 14,
    pivot_strength: int = 3,
    rsi_threshold: float = 3.0,
    lookback_range: tuple[int, int] = (5, 30)
) -> pd.Series:

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
        for lookback in range(*lookback_range):  # Check prior pivots in a window
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

def classify_adx_trend(adx: pd.Series, plus_di: pd.Series, minus_di: pd.Series) -> pd.Series:
    labels = []
    for i in range(len(adx)):
        a = adx.iloc[i]
        p = plus_di.iloc[i]
        m = minus_di.iloc[i]
        prev_a = adx.iloc[i - 1] if i > 0 else np.nan
        prev_p = plus_di.iloc[i - 1] if i > 0 else np.nan
        prev_m = minus_di.iloc[i - 1] if i > 0 else np.nan

        if pd.isna(a) or pd.isna(p) or pd.isna(m) or pd.isna(prev_a):
            labels.append("in progress")
            continue

        sigUp = a > prev_a
        hlRange = a <= 20
        diUp = p >= m
        diDn = m > p

        if hlRange:
            labels.append("Orange")  # same as color.orange
        elif sigUp and diUp:
            labels.append("Green")  # strong bullish trend
        elif not sigUp and diUp:
            labels.append("Light Green")  # weakening bullish trend
        elif sigUp and diDn:
            labels.append("Red")  # strong bearish trend
        elif not sigUp and diDn:
            labels.append("Light Red")  # weakening bearish trend
        else:
            labels.append("Unknown")

    return pd.Series(labels, index=adx.index)



def classify_mace_signal(s: pd.Series, m: pd.Series, l: pd.Series) -> pd.Series:
    """
    Classify each point in time according to MACE trend classification:
    U1, U2, U3, D1, D2, D3, or Unclassified.
    """
    result = pd.Series(index=s.index, dtype='object')

    mask_valid = (~s.isna()) & (~m.isna()) & (~l.isna())

    cond_u1 = (l > s) & (s > m)
    cond_u2 = (s > l) & (l > m)
    cond_u3 = (s > m) & (m > l)
    cond_d1 = (m > s) & (s > l)
    cond_d2 = (m > l) & (l > s)
    cond_d3 = (l > m) & (m > s)

    result[cond_u1 & mask_valid] = "U1"
    result[cond_u2 & mask_valid] = "U2"
    result[cond_u3 & mask_valid] = "U3"
    result[cond_d1 & mask_valid] = "D1"
    result[cond_d2 & mask_valid] = "D2"
    result[cond_d3 & mask_valid] = "D3"
    result[result.isna() & mask_valid] = "Unclassified"

    return result

def classify_40w_status(close: pd.Series, ma_40: pd.Series, slope: pd.Series) -> pd.Series:
    """
    Classify weekly price relative to 40-week MA and its slope.
    Returns one of:
    - "Above Rising MA"
    - "Above Falling MA"
    - "Below Rising MA"
    - "Below Falling MA"
    """
    signal = pd.Series(index=close.index, dtype='object')
    mask_valid = (~close.isna()) & (~ma_40.isna()) & (~slope.isna())

    signal[(close > ma_40) & (slope > 0) & mask_valid] = "Above Rising MA ++"
    signal[(close > ma_40) & (slope <= 0) & mask_valid] = "Above Falling MA +-"
    signal[(close <= ma_40) & (slope > 0) & mask_valid] = "Below Rising MA -+"
    signal[(close <= ma_40) & (slope <= 0) & mask_valid] = "Below Falling MA --"

    return signal

def classify_dma_trend(close: pd.Series, ma50: pd.Series, ma150: pd.Series) -> pd.Series:
    """
    Classify daily price relative to 50DMA and 150DMA into:
    - "Above Both (Uptrend)"
    - "Above 150DMA Only"
    - "Below Both (Downtrend)"
    - "Below 150DMA Only"
    - "Between Averages"
    """
    result = pd.Series(index=close.index, dtype='object')

    valid = (~close.isna()) & (~ma50.isna()) & (~ma150.isna())

    result[(close > ma50) & (ma50 > ma150) & valid] = "Above Both (Uptrend)"
    result[(close > ma150) & (ma150 > ma50) & valid] = "Above 150DMA Only"
    result[(close < ma50) & (ma50 < ma150) & valid] = "Below Both (Downtrend)"
    result[(close < ma150) & (ma150 < ma50) & valid] = "Below 150DMA Only"
    result[valid & result.isna()] = "Between Averages"

    return result

def classify_bbwp_percentile(bbwp: pd.Series) -> pd.Series:
    """
    Classify BBWP values into bands:
    - ≥ 90: "Blue Band"
    - ≤ 10: "Red Band"
    - Else: "Normal"
    """
    return pd.Series(
        np.select(
            [bbwp >= 90, bbwp <= 10],
            ["Blue Band", "Red Band"],
            default="Normal"
        ),
        index=bbwp.index
    )


def compute_weekly_natr(df_weekly: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Computes Normalized Average True Range (NATR) on weekly data.
    NATR = (ATR / Close) * 100
    ATR is calculated using the True Range (TR) method.
    """

    high = df_weekly["High"]
    low = df_weekly["Low"]
    close = df_weekly["Close"]
    prev_close = close.shift(1)

    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()

    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = true_range.rolling(window=period).mean()
    natr = (atr / close) * 100

    return natr.dropna()

def compute_bbwp(close: pd.Series, length: int = 13, bbwp_window: int = 252) -> pd.Series:
    if len(close.dropna()) < length + 10:
        print(f"⚠️ Not enough data to compute BBWP base (need ~{length + 10}, got {len(close)})")
        return pd.Series(dtype=float)

    sma = close.rolling(window=length).mean()
    std = close.rolling(window=length).std()

    upper = sma + 2 * std
    lower = sma - 2 * std
    mid = sma

    bbw = (upper - lower) / mid
    bbw = bbw.dropna()

    # 🎯 GROWING WINDOW PERCENTILE RANK
    bbwp = []
    bbw_values = bbw.values
    for i in range(len(bbw_values)):
        window = bbw_values[max(0, i - bbwp_window + 1):i + 1]
        rank = rankdata(window)[-1] / len(window) * 100
        bbwp.append(rank)

    bbwp_series = pd.Series(bbwp, index=bbw.index)
    return bbwp_series




def compute_ichimoku_lines(df_weekly: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    tenkan_sen = (df_weekly['High'].rolling(9).max() + df_weekly['Low'].rolling(9).min()) / 2
    kijun_sen = (df_weekly['High'].rolling(26).max() + df_weekly['Low'].rolling(26).min()) / 2
    span_a = ((tenkan_sen + kijun_sen) / 2).shift(26)
    span_b = ((df_weekly['High'].rolling(52).max() + df_weekly['Low'].rolling(52).min()) / 2).shift(26)
    return tenkan_sen, kijun_sen, span_a, span_b

def compute_supertrend_lines(
    df: pd.DataFrame,
    atr_period: int = 10,
    multiplier: float = 3.0,
    use_wilders_atr: bool = True # Corresponds to changeATR = true in Pine
) -> pd.DataFrame:
    """
    Computes Supertrend lines and signals based on the provided OHLCV DataFrame.
    This version aims for closer alignment with TradingView's Supertrend logic,
    especially focusing on a more robust ATR calculation matching Pine Script's rma.

    Args:
        df (pd.DataFrame): DataFrame with 'High', 'Low', 'Close' columns.
        atr_period (int): Period for ATR calculation.
        multiplier (float): Multiplier for ATR to calculate bands.
        use_wilders_atr (bool): If True, uses Wilder's ATR (default in Pine Script's atr()).
                                If False, uses SMA of True Range (atr2 in Pine).

    Returns:
        pd.DataFrame: DataFrame with 'Supertrend', 'Buy', 'Sell', 'Trend', 'Signal' columns.
    """
    df_copy = df.copy() # Work on a copy to avoid modifying the original DataFrame

    high = df_copy["High"].values
    low = df_copy["Low"].values
    close = df_copy["Close"].values
    hl2 = (high + low) / 2

    # --- 1. True Range (TR) Calculation ---
    tr_values = np.zeros(len(df_copy))
    tr_values[0] = high[0] - low[0] # For the first bar, as in Pine Script
    for i in range(1, len(df_copy)):
        range1 = high[i] - low[i]
        range2 = abs(high[i] - close[i-1])
        range3 = abs(low[i] - close[i-1])
        tr_values[i] = max(range1, range2, range3)

    # --- 2. ATR Calculation (Revised for Pine Script compatibility) ---
    atr = np.zeros(len(df_copy))
    if use_wilders_atr:
        # Implement Wilder's Smoothing explicitly to match Pine Script's `rma`
        # For the first `atr_period` bars, it's a simple moving average
        # Then, it transitions to the recursive formula: (prev_atr * (period - 1) + current_tr) / period

        # Initial SMA for the first 'atr_period' bars
        atr[atr_period-1] = np.mean(tr_values[:atr_period]) # First ATR value calculated after 'atr_period' bars

        # Recursive calculation for subsequent bars
        for i in range(atr_period, len(df_copy)):
            atr[i] = (atr[i-1] * (atr_period - 1) + tr_values[i]) / atr_period
            
        # For bars before atr_period-1, Pine Script often just leaves them as NaN or 0, or calculates SMA up to that point.
        # Let's fill initial values based on a simple rolling mean, mimicking how Pine builds up `sum` for `rma`.
        # This part ensures non-zero ATR from the start if needed.
        for i in range(1, atr_period): # Calculate SMA for initial bars
             atr[i] = np.mean(tr_values[:i+1])


    else:
        # Simple Moving Average of True Range (Pine's sma(tr, Periods))
        atr = pd.Series(tr_values).rolling(window=atr_period, min_periods=1).mean().values

    # --- 3. Supertrend Band Initialization and Calculation ---
    final_up_band = np.zeros(len(df_copy))
    final_dn_band = np.zeros(len(df_copy))
    trend = np.zeros(len(df_copy), dtype=int) # 1 for uptrend, -1 for downtrend

    supertrend_line = np.zeros(len(df_copy))
    buy_signals = np.full(len(df_copy), np.nan)
    sell_signals = np.full(len(df_copy), np.nan)

    for i in range(len(df_copy)):
        basic_upper_band_curr = hl2[i] + (multiplier * atr[i])
        basic_lower_band_curr = hl2[i] - (multiplier * atr[i])

        if i == 0:
            final_up_band[i] = basic_upper_band_curr
            final_dn_band[i] = basic_lower_band_curr
            trend[i] = 1 # Assume uptrend initially
        else:
            # Band stickiness/trailing logic
            if close[i-1] > final_up_band[i-1]:
                final_up_band[i] = max(basic_upper_band_curr, final_up_band[i-1])
            else:
                final_up_band[i] = basic_upper_band_curr

            if close[i-1] < final_dn_band[i-1]:
                final_dn_band[i] = min(basic_lower_band_curr, final_dn_band[i-1])
            else:
                final_dn_band[i] = basic_lower_band_curr

            # Trend determination
            prev_trend = trend[i-1]
            if prev_trend == -1 and close[i] > final_dn_band[i-1]:
                trend[i] = 1
            elif prev_trend == 1 and close[i] < final_up_band[i-1]:
                trend[i] = -1
            else:
                trend[i] = prev_trend

            # Band adjustment on trend reversal
            if trend[i] == 1 and prev_trend == -1: # Flipped to Buy
                final_dn_band[i] = final_dn_band[i-1] # Lock previous lower band as new Supertrend line
            elif trend[i] == -1 and prev_trend == 1: # Flipped to Sell
                final_up_band[i] = final_up_band[i-1] # Lock previous upper band as new Supertrend line

        # Calculate Supertrend line and signals
        if trend[i] == 1:
            if i > 0 and trend[i-1] == -1:
                # Just flipped to uptrend (BUY)
                supertrend_line[i] = final_up_band[i]
                buy_signals[i] = supertrend_line[i]
            else:
                supertrend_line[i] = final_dn_band[i]
        else:
            if i > 0 and trend[i-1] == 1:
                # Just flipped to downtrend (SELL)
                supertrend_line[i] = final_dn_band[i]
                sell_signals[i] = supertrend_line[i]
            else:
                supertrend_line[i] = final_up_band[i]

        # Debugging prints
        if i >= len(df_copy) - 50:
            print(f"Date: {df_copy.index[i].strftime('%Y-%m-%d')}")
            print(f"  Close: {close[i]:.2f}")
            print(f"  TR: {tr_values[i]:.4f}")
            print(f"  ATR: {atr[i]:.4f}") # Print the new ATR
            print(f"  Basic Up (curr): {basic_upper_band_curr:.2f}, Basic Dn (curr): {basic_lower_band_curr:.2f}")
            if i > 0:
                print(f"  Prev Close: {close[i-1]:.2f}, Prev Final Up: {final_up_band[i-1]:.2f}, Prev Final Dn: {final_dn_band[i-1]:.2f}")
                print(f"  Prev Trend: {trend[i-1]}")
            print(f"  Final Up: {final_up_band[i]:.2f}, Final Dn: {final_dn_band[i]:.2f}")
            print(f"  Current Trend: {trend[i]} ({'Buy' if trend[i] == 1 else 'Sell'})")
            print(f"  Supertrend Line (calculated): {supertrend_line[i]:.2f}")
            if not np.isnan(buy_signals[i]):
                print(f"  Buy Signal at: {buy_signals[i]:.2f}")
            if not np.isnan(sell_signals[i]):
                print(f"  Sell Signal at: {sell_signals[i]:.2f}")
            print("-" * 50)

    results_df = pd.DataFrame(index=df_copy.index)
    results_df["Supertrend"] = supertrend_line
    results_df["Buy"] = buy_signals
    results_df["Sell"] = sell_signals
    results_df["Trend"] = trend
    results_df["Signal"] = np.where(trend == 1, "Buy", "Sell")

    return results_df




@lru_cache(maxsize=100)
def get_risk_free_rate() -> float:
    try:
        tnx = yf.Ticker("^TNX")
        rate = tnx.info.get("regularMarketPrice")
        if rate is None:
            raise ValueError("Missing ^TNX price")
        return rate / 100  # Convert from e.g., 45.0 to 0.045
    except Exception as e:
        print(f"❌ Failed to fetch 10Y yield: {e}")
        return 0.045  # fallback to historical average
    

def get_equity_risk_premium() -> float:
    return 0.055  # 5.5% — global average, based on Damodaran's ERP estimates


def sortino_ratio(symbol: str, period: str = "1y", interval: str = "1d") -> Optional[float]:
    '''
    Calculates the 1-year daily Sortino Ratio using Yahoo Finance data.

    Disclaimer:
    - This is a simplified retail/institutional-grade Sortino Ratio.
    - Uses 1 year of daily returns (252 trading days).
    - Downside deviation is calculated relative to the daily risk-free rate (10Y U.S. Treasury yield annualized).
    - Returns are arithmetic (not log).
    - Risk-free rate is constant over the period (no term-matching or forward curve).
    - Suitable for dashboards, high-level analytics, or early-stage quant models.
    - NOT equivalent to Bloomberg/FactSet/Barra-calculated Sortino ratios, which may use MAR thresholds, exponential weighting, or term structure adjustments.
    
    '''
    try:
        print(f"📈 Calculating Sortino Ratio for {symbol} over {period}...")

        data = yf.download(symbol, period=period, interval=interval, progress=False)
        if data.empty:
            print("❌ No price data.")
            return None

        returns = data["Close"].pct_change().dropna()
        rf_daily = get_risk_free_rate() / 252

        downside_returns = returns[returns < rf_daily]
        downside_std = downside_returns.std()

        # Force scalar float
        if isinstance(downside_std, pd.Series):
            downside_std = downside_std.iloc[0]
        downside_std = float(downside_std)

        if np.isnan(downside_std) or downside_std == 0:
            print("⚠️ No downside volatility — Sortino undefined.")
            return None

        mean_return = returns.mean()
        if isinstance(mean_return, pd.Series):
            mean_return = mean_return.iloc[0]
        mean_return = float(mean_return)

        excess_returns = mean_return - rf_daily
        sortino = excess_returns / downside_std

        print(f"✅ Sortino Ratio: {sortino:.2f}")
        return round(sortino, 2)

    except Exception as e:
        print(f"❌ Error calculating Sortino Ratio: {e}")
        return None

@lru_cache(maxsize=500)
def compute_sortino_ratio_cached(symbol: str):
    return sortino_ratio(symbol)

def convert_numpy_types(obj):
    if isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(v) for v in obj]
    elif isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    return obj

def to_series(series: pd.Series) -> list[dict]:
    if not isinstance(series, pd.Series):
        raise TypeError(f"Expected pd.Series, got {type(series)}")
    return [
        {"time": int(ts.timestamp()), "value": round(val, 2)}
        for ts, val in series.items()
        if not pd.isna(val)
    ]

def reindex_indicator(base: pd.Series, indicator: pd.Series) -> pd.Series:
    full = pd.Series(index=base.index, dtype=float)
    full.loc[indicator.index] = indicator.values
    return full
