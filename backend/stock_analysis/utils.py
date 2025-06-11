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
    Label the relationship of price to 50DMA and 150DMA:
    - 'Strong Uptrend: Price > 50DMA > 150DMA'
    - 'Above Both MAs, But 50DMA < 150DMA (No Crossover)'
    - 'Strong Downtrend: Price < 50DMA < 150DMA'
    - 'Below Both MAs, But 50DMA > 150DMA (No Crossover)'
    - 'Between/Inside Moving Averages'
    """
    result = pd.Series(index=close.index, dtype='object')
    valid = (~close.isna()) & (~ma50.isna()) & (~ma150.isna())

    # Strong uptrend: Price above both, 50DMA above 150DMA (classic breakout)
    result[(close > ma50) & (ma50 > ma150) & valid] = "Strong Uptrend: Price > 50DMA > 150DMA"

    # Price above both, but 50DMA below 150DMA (pre-crossover, trend not confirmed)
    result[(close > ma150) & (ma150 > ma50) & valid] = "Above Both MAs, But 50DMA < 150DMA (No Crossover)"

    # Strong downtrend: Price below both, 50DMA below 150DMA (classic breakdown)
    result[(close < ma50) & (ma50 < ma150) & valid] = "Strong Downtrend: Price < 50DMA < 150DMA"

    # Price below both, but 50DMA above 150DMA (pre-crossover on downside, trend not confirmed)
    result[(close < ma150) & (ma150 < ma50) & valid] = "Below Both MAs, But 50DMA > 150DMA (No Crossover)"

    # All other cases (price between MAs)
    result[valid & result.isna()] = "Between/Inside Moving Averages"

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

def compute_supertrend_lines(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> pd.DataFrame:
    """
    Calculates the Supertrend indicator lines and signals, replicating Pine Script logic.

    Args:
        df (pd.DataFrame): DataFrame with 'High', 'Low', 'Close' columns.
        period (int): ATR period. Defaults to 10.
        multiplier (float): ATR multiplier. Defaults to 3.0.

    Returns:
        tuple: A tuple containing:
            - pd.DataFrame: DataFrame with 'Close', 'ST_Line_Up', 'ST_Line_Down',
                            'Signal', 'Trend', 'BuySignal', 'SellSignal' columns.
            - pd.DataFrame: Debugging DataFrame with step-by-step calculation details.
    """
    df = df.copy()
    df.index = df.index.tz_localize(None) # Ensure no timezone issues

    high = df["High"]
    low = df["Low"]
    close = df["Close"]

    # Step 1: Calculate HL2 and True Range (TR)
    hl2 = (high + low) / 2
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # Step 2: Wilder's Smoothing for ATR (Pine Script's atr() function uses this)
    atr = tr.ewm(alpha=1 / period, adjust=False).mean()

    # Initialize series for supertrend calculations
    # 'up' and 'dn' are the internal Pine Script variables that hold the actual band values
    # They are then selectively plotted as ST_Line_Up or ST_Line_Down based on the trend
    up = pd.Series(index=df.index, dtype=float)
    dn = pd.Series(index=df.index, dtype=float)
    trend = pd.Series(index=df.index, dtype=int) # 1 for uptrend, -1 for downtrend

    # List to store debugging information for each bar
    debug_data = []

    # Step 3, 4, 5: Iterative Calculation of Bands and Trend
    for i in range(len(df)):
        current_date = df.index[i]
        current_close = close.iloc[i]
        current_hl2 = hl2.iloc[i]
        current_atr = atr.iloc[i]

        # Calculate initial upper and lower bands for the current bar based on HL2 and ATR
        basic_upper_band = current_hl2 + (multiplier * current_atr)
        basic_lower_band = current_hl2 - (multiplier * current_atr)

        if i == 0:
            # Initialize for the very first bar
            trend.iloc[i] = 1 # Pine Script default for 'trend' is 1 (uptrend)
            up.iloc[i] = basic_lower_band # 'up' variable stores the lower band (for an uptrend line)
            dn.iloc[i] = basic_upper_band # 'dn' variable stores the upper band (for a downtrend line)
        else:
            prev_close = close.iloc[i-1]
            prev_trend = trend.iloc[i-1]
            prev_up = up.iloc[i-1] # Previous value of the 'up' variable (support line)
            prev_dn = dn.iloc[i-1] # Previous value of the 'dn' variable (resistance line)

            # --- Pine Script's 'up' and 'dn' variable updates ---
            # up := close[1] > up1 ? max(up,up1) : up
            # dn := close[1] < dn1 ? min(dn,dn1) : dn
            # where 'up1' is nz(up[1], up) and 'dn1' is nz(dn[1], dn)

            # First, calculate the 'up' variable for the current bar
            # If the previous close was above the previous 'up' line, and current basic_lower_band is higher than prev_up,
            # then the 'up' line moves up. Otherwise, it resets to current basic_lower_band.
            if prev_close > prev_up:
                up.iloc[i] = max(basic_lower_band, prev_up)
            else:
                up.iloc[i] = basic_lower_band

            # Second, calculate the 'dn' variable for the current bar
            # If the previous close was below the previous 'dn' line, and current basic_upper_band is lower than prev_dn,
            # then the 'dn' line moves down. Otherwise, it resets to current basic_upper_band.
            if prev_close < prev_dn:
                dn.iloc[i] = min(basic_upper_band, prev_dn)
            else:
                dn.iloc[i] = basic_upper_band
            
            # --- Determine the 'trend' for the current bar ---
            # Pine Script: trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend
            # Here, prev_dn serves as dn1 and prev_up serves as up1 for the trend flip condition.

            if prev_trend == -1 and current_close > prev_dn: # Current close crosses above previous 'dn' line (resistance)
                trend.iloc[i] = 1 # Trend flips to UP
            elif prev_trend == 1 and current_close < prev_up: # Current close crosses below previous 'up' line (support)
                trend.iloc[i] = -1 # Trend flips to DOWN
            else:
                trend.iloc[i] = prev_trend # Trend remains unchanged

        # Capture debugging data for this iteration (optional, for detailed inspection)
        debug_data.append({
            'Date': current_date,
            'Close': current_close,
            'ATR': current_atr,
            'HL2': current_hl2,
            'Basic Upper': basic_upper_band,
            'Basic Lower': basic_lower_band,
            'Prev Trend': trend.iloc[i-1] if i > 0 else np.nan,
            'Prev Up (from last bar)': up.iloc[i-1] if i > 0 else np.nan,
            'Prev Dn (from last bar)': dn.iloc[i-1] if i > 0 else np.nan,
            'Current Up (calculated for this bar)': up.iloc[i],
            'Current Dn (calculated for this bar)': dn.iloc[i],
            'Final Trend (this bar)': trend.iloc[i]
        })

    # Convert debug data to a DataFrame for easier inspection
    debug_df = pd.DataFrame(debug_data).set_index('Date')

    # Step 6: Derive Signal and Final Plot Lines for the output DataFrame
    supertrend_df = pd.DataFrame(index=df.index)
    supertrend_df["Close"] = close
    supertrend_df["Trend"] = trend # 1 for uptrend, -1 for downtrend

    # ST_Line_Up: This is the 'up' variable value, but only when the trend is 1 (uptrend)
    supertrend_df["ST_Line_Up"] = np.where(supertrend_df["Trend"] == 1, up, np.nan)
    # ST_Line_Down: This is the 'dn' variable value, but only when the trend is -1 (downtrend)
    supertrend_df["ST_Line_Down"] = np.where(supertrend_df["Trend"] == -1, dn, np.nan)

    # Buy/Sell Signals based on trend changes
    supertrend_df["BuySignal"] = (supertrend_df["Trend"] == 1) & (supertrend_df["Trend"].shift(1) == -1)
    supertrend_df["SellSignal"] = (supertrend_df["Trend"] == -1) & (supertrend_df["Trend"].shift(1) == 1)

    # Map numerical trend to "Buy" or "Sell" for the 'Signal' column
    supertrend_df["Signal"] = supertrend_df["Trend"].map({1: "Buy", -1: "Sell"})

    return supertrend_df[["Close", "ST_Line_Up", "ST_Line_Down", "Signal", "Trend", "BuySignal", "SellSignal"]], debug_df




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
