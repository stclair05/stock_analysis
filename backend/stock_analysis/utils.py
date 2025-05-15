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

def detect_zigzag_pivots(prices: pd.Series, threshold: float = 0.07, window: int = 5):
    """
    Detects zigzag pivots using a rolling window method.
    
    Parameters:
        prices (pd.Series): A Series of prices.
        threshold (float): Minimum percentage change from last confirmed pivot.
        window (int): Lookaround window to determine local maxima/minima.

    Returns:
        List of tuples (index, price) representing pivot points.
    """
    pivots = []
    last_pivot_idx = None
    last_pivot_price = None

    for i in range(window, len(prices) - window):
        local_range = prices.iloc[(i - window):(i + window + 1)]
        current_price = prices.iloc[i]

        is_local_max = current_price == local_range.max()
        is_local_min = current_price == local_range.min()

        if is_local_max or is_local_min:
            if last_pivot_price is None:
                # First pivot
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

def classify_adx_trend(
    adx_series: pd.Series,
    plus_di_series: pd.Series,
    minus_di_series: pd.Series,
    hl_range: int = 20,
    hl_trend: int = 35
) -> pd.Series:
    """
    Mimics TradingView's ADX classification logic with directional strength.
    Returns a pandas Series with labels:
    'Strong Bullish', 'Bullish', 'Strong Bearish', 'Bearish', 'Weak', 'Moderate'
    """
    result = []

    for i in range(len(adx_series)):
        adx = adx_series.iloc[i]
        prev_adx = adx_series.iloc[i - 1] if i > 0 else None
        plus_di = plus_di_series.iloc[i]
        minus_di = minus_di_series.iloc[i]

        if pd.isna(adx) or pd.isna(plus_di) or pd.isna(minus_di):
            result.append(None)
            continue

        is_adx_rising = prev_adx is not None and adx > prev_adx
        is_trend_weak = adx <= hl_range
        is_bullish = plus_di >= minus_di
        is_strong_plus = plus_di >= hl_trend
        is_strong_minus = minus_di >= hl_trend

        if is_trend_weak:
            result.append("Weak")
        elif is_adx_rising:
            if is_bullish and is_strong_plus:
                result.append("Strong Bullish")
            elif is_bullish:
                result.append("Bullish")
            elif not is_bullish and is_strong_minus:
                result.append("Strong Bearish")
            else:
                result.append("Bearish")
        else:
            result.append("Moderate")

    return pd.Series(result, index=adx_series.index)

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

    signal[(close > ma_40) & (slope > 0) & mask_valid] = "Above Rising MA"
    signal[(close > ma_40) & (slope <= 0) & mask_valid] = "Above Falling MA"
    signal[(close <= ma_40) & (slope > 0) & mask_valid] = "Below Rising MA"
    signal[(close <= ma_40) & (slope <= 0) & mask_valid] = "Below Falling MA"

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

def compute_bbwp(close: pd.Series, length: int = 20, bbwp_window: int = 252) -> pd.Series:
    """
    Computes Bollinger Band Width Percentile (BBWP).
    Based on TradingView logic.
    """
    sma = close.rolling(window=length).mean()
    std = close.rolling(window=length).std()

    upper = sma + 2 * std
    lower = sma - 2 * std
    mid = sma

    bbw = (upper - lower) / mid  # raw width

    # Calculate rolling percentile (BBWP)
    def percentile_rank(x):
        return rankdata(x)[-1] / len(x)

    bbwp = bbw.rolling(window=bbwp_window).apply(percentile_rank).dropna() * 100

    return bbwp

def compute_ichimoku_lines(df_weekly: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    tenkan_sen = (df_weekly['High'].rolling(9).max() + df_weekly['Low'].rolling(9).min()) / 2
    kijun_sen = (df_weekly['High'].rolling(26).max() + df_weekly['Low'].rolling(26).min()) / 2
    span_a = ((tenkan_sen + kijun_sen) / 2).shift(26)
    span_b = ((df_weekly['High'].rolling(52).max() + df_weekly['Low'].rolling(52).min()) / 2).shift(26)
    return tenkan_sen, kijun_sen, span_a, span_b

def compute_supertrend_lines(df_weekly: pd.DataFrame):
    high = df_weekly['High']
    low = df_weekly['Low']
    close = df_weekly['Close']
    prev_close = close.shift(1)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)

    atr = tr.rolling(window=10, min_periods=1).mean()
    hl2 = (high + low) / 2

    upperband = hl2 + 3 * atr
    lowerband = hl2 - 3 * atr

    df_st = pd.DataFrame(index=df_weekly.index)
    df_st['Close'] = close
    df_st['UpperBand'] = upperband
    df_st['LowerBand'] = lowerband
    df_st['InUptrend'] = True

    for i in range(1, len(df_st)):
        prev = df_st.iloc[i - 1]
        curr = df_st.iloc[i]

        df_st.iloc[i, df_st.columns.get_loc('InUptrend')] = prev['InUptrend']

        if curr['Close'] > prev['UpperBand']:
            df_st.iloc[i, df_st.columns.get_loc('InUptrend')] = True
        elif curr['Close'] < prev['LowerBand']:
            df_st.iloc[i, df_st.columns.get_loc('InUptrend')] = False
        else:
            if prev['InUptrend']:
                df_st.iloc[i, df_st.columns.get_loc('LowerBand')] = min(curr['LowerBand'], prev['LowerBand'])
                df_st.iloc[i, df_st.columns.get_loc('UpperBand')] = np.nan
            else:
                df_st.iloc[i, df_st.columns.get_loc('UpperBand')] = max(curr['UpperBand'], prev['UpperBand'])
                df_st.iloc[i, df_st.columns.get_loc('LowerBand')] = np.nan

    df_st['Signal'] = df_st['InUptrend'].map(lambda x: 'Buy' if x else 'Sell')

    return df_st[['UpperBand', 'LowerBand', 'Signal']]


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

