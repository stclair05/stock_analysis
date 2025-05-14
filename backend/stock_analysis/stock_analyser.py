import yfinance as yf
import pandas as pd
import numpy as np
from fastapi import HTTPException
from functools import lru_cache
from .models import TimeSeriesMetric
from aliases import SYMBOL_ALIASES
from .utils import safe_value, detect_rsi_divergence, find_pivots, compute_wilder_rsi



class StockAnalyser:
    def __init__(self, symbol: str):
        raw_symbol = symbol.upper().strip()
        self.symbol = SYMBOL_ALIASES.get(raw_symbol, raw_symbol)
        self.df = StockAnalyser.get_price_data(self.symbol)

    def _download_data(self) -> pd.DataFrame:
        df = yf.download(self.symbol, period='12y', interval='1d', auto_adjust=False)
        if df.empty:
            raise HTTPException(status_code=400, detail="Stock symbol not found or data unavailable.")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)
        return df
    
    @staticmethod
    @lru_cache(maxsize=100)
    def get_price_data(symbol: str) -> pd.DataFrame:
        df = yf.download(symbol, period="12y", interval="1d", auto_adjust=False)
        if df.empty:
            return df

        # Patch with today’s close (1D)
        try:
            live_df = yf.download(symbol, period="1d", interval="1d")
            if not live_df.empty:
                df.loc[live_df.index[-1]] = live_df.iloc[-1]
        except Exception:
            pass

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        return df



    def get_current_price(self) -> float | None:
        return safe_value(self.df['Close'], -1)

    def calculate_3year_ma(self) -> TimeSeriesMetric:
        monthly_close = self.df['Close'].resample('ME').last()
        monthly_ma = monthly_close.rolling(window=36).mean()
        return TimeSeriesMetric(
            current=safe_value(monthly_ma, -1),
            seven_days_ago=safe_value(monthly_ma, -2),
            fourteen_days_ago=safe_value(monthly_ma, -3),
            twentyone_days_ago=safe_value(monthly_ma, -4),
        )

    def calculate_200dma(self) -> TimeSeriesMetric:
        daily_ma = self.df['Close'].rolling(window=200).mean()
        return TimeSeriesMetric(
            current=safe_value(daily_ma, -1),
            seven_days_ago=safe_value(daily_ma, -7),
            fourteen_days_ago=safe_value(daily_ma, -14),
            twentyone_days_ago=safe_value(daily_ma, -21),
        )

    def ichimoku_cloud(self) -> TimeSeriesMetric:
        df = self.df.last('600D')
        df_weekly = df.resample('W-FRI').agg({'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last'}).dropna()
        if df_weekly.empty:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})
        tenkan_sen = (df_weekly['High'].rolling(9).max() + df_weekly['Low'].rolling(9).min()) / 2
        kijun_sen = (df_weekly['High'].rolling(26).max() + df_weekly['Low'].rolling(26).min()) / 2
        span_a = ((tenkan_sen + kijun_sen) / 2).shift(26)
        span_b = ((df_weekly['High'].rolling(52).max() + df_weekly['Low'].rolling(52).min()) / 2).shift(26)
        upper = pd.concat([span_a, span_b], axis=1).max(axis=1)
        lower = pd.concat([span_a, span_b], axis=1).min(axis=1)
        close = df_weekly['Close']
        position = pd.Series(np.select([close > upper, close < lower], ['Above', 'Below'], default='Inside'), index=close.index)
        return TimeSeriesMetric(
            current=safe_value(position, -1),
            seven_days_ago=safe_value(position, -2),
            fourteen_days_ago=safe_value(position, -3),
            twentyone_days_ago=safe_value(position, -4),
        )

    def super_trend(self) -> TimeSeriesMetric:
        df = self.df.copy()

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        # Resample daily data to weekly OHLC
        df = df.last("600D")
        df_weekly = df.resample("W-FRI").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last"
        }).dropna()
        print(f"{self.symbol} weekly rows available for SuperTrend: {df_weekly.shape[0]}")

        # --- ATR Calculation ---
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

        # --- Super Trend Bands ---
        hl2 = (high + low) / 2
        upperband = hl2 + 3 * atr
        lowerband = hl2 - 3 * atr

        df_st = pd.DataFrame(index=df_weekly.index)
        df_st['Close'] = close
        df_st['UpperBand'] = upperband
        df_st['LowerBand'] = lowerband
        df_st['InUptrend'] = True  # Default start as uptrend

        for i in range(1, len(df_st)):
            prev = df_st.iloc[i - 1]
            curr = df_st.iloc[i]

            # Default to previous trend
            df_st.iloc[i, df_st.columns.get_loc('InUptrend')] = prev['InUptrend']

            # Check for trend change
            if curr['Close'] > prev['UpperBand']:
                df_st.iloc[i, df_st.columns.get_loc('InUptrend')] = True
            elif curr['Close'] < prev['LowerBand']:
                df_st.iloc[i, df_st.columns.get_loc('InUptrend')] = False
            else:
                # Continue trend, adjust bands
                if prev['InUptrend']:
                    if curr['LowerBand'] > prev['LowerBand']:
                        df_st.iloc[i, df_st.columns.get_loc('LowerBand')] = curr['LowerBand']
                    else:
                        df_st.iloc[i, df_st.columns.get_loc('LowerBand')] = prev['LowerBand']
                    df_st.iloc[i, df_st.columns.get_loc('UpperBand')] = np.nan
                else:
                    if curr['UpperBand'] < prev['UpperBand']:
                        df_st.iloc[i, df_st.columns.get_loc('UpperBand')] = curr['UpperBand']
                    else:
                        df_st.iloc[i, df_st.columns.get_loc('UpperBand')] = prev['UpperBand']
                    df_st.iloc[i, df_st.columns.get_loc('LowerBand')] = np.nan

        # Final signal column
        df_st['Signal'] = df_st['InUptrend'].map(lambda x: 'Buy' if x else 'Sell')

        return TimeSeriesMetric(
            current=safe_value(df_st['Signal'], -1),
            seven_days_ago=safe_value(df_st['Signal'], -2),
            fourteen_days_ago=safe_value(df_st['Signal'], -3),
            twentyone_days_ago=safe_value(df_st['Signal'], -4),
        )


    def adx(self) -> TimeSeriesMetric:
        df = self.df.copy()

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        # Use the last ~600 days and resample to weekly (ending on Friday)
        df = df.last("600D")
        df_weekly = df.resample("W-FRI").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last"
        }).dropna()


        high = df_weekly['High']
        low = df_weekly['Low']
        close = df_weekly['Close']

        # Directional Movement
        up_move = high.diff()
        down_move = low.diff().abs()

        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

        # True Range
        prev_close = close.shift(1)
        tr1 = high - low
        tr2 = (high - prev_close).abs()
        tr3 = (low - prev_close).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

        # Wilder's smoothing (EMA-like with alpha = 1/14)
        atr = pd.Series(tr).ewm(alpha=1/14, adjust=False).mean()
        plus_dm = pd.Series(plus_dm, index=df_weekly.index).ewm(alpha=1/14, adjust=False).mean()
        minus_dm = pd.Series(minus_dm, index=df_weekly.index).ewm(alpha=1/14, adjust=False).mean()

        plus_di = 100 * (plus_dm / atr)
        minus_di = 100 * (minus_dm / atr)
        dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di))
        adx = dx.ewm(alpha=1/14, adjust=False).mean()

        # Trend strength classification
        def classify_trend(adx_series, plus_di_series, minus_di_series,
                hl_range=20, hl_trend=35) -> pd.Series:
            """
            Mimics TradingView's ADX classification logic with directional strength.
            Returns a pandas Series with labels like:
            'Strong Bullish', 'Bullish', 'Strong Bearish', 'Bearish', 'Weak'
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


        classification = classify_trend(adx, plus_di, minus_di)

        return TimeSeriesMetric(
            current=safe_value(classification, -1),
            seven_days_ago=safe_value(classification, -2),
            fourteen_days_ago=safe_value(classification, -3),
            twentyone_days_ago=safe_value(classification, -4),
        )



    def mace(self) -> TimeSeriesMetric:
        df = self.df.last('600D')
        df_weekly = df.resample('W-FRI').agg({'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last'}).dropna()
        s = df_weekly['Close'].rolling(4).mean()
        m = df_weekly['Close'].rolling(13).mean()
        l = df_weekly['Close'].rolling(26).mean()
        signal = pd.Series(index=df_weekly.index, dtype='object')
        for i in range(len(df_weekly)):
            if pd.isna(s[i]) or pd.isna(m[i]) or pd.isna(l[i]):
                continue
            if l[i] > s[i] > m[i]: signal[i] = "U1"
            elif s[i] > l[i] > m[i]: signal[i] = "U2"
            elif s[i] > m[i] > l[i]: signal[i] = "U3"
            elif m[i] > s[i] > l[i]: signal[i] = "D1"
            elif m[i] > l[i] > s[i]: signal[i] = "D2"
            elif l[i] > m[i] > s[i]: signal[i] = "D3"
            else: signal[i] = "Unclassified"
        return TimeSeriesMetric(
            current=safe_value(signal, -1),
            seven_days_ago=safe_value(signal, -2),
            fourteen_days_ago=safe_value(signal, -3),
            twentyone_days_ago=safe_value(signal, -4),
        )

    def forty_week_status(self) -> TimeSeriesMetric:
        df = self.df.last('600D')
        df_weekly = df.resample('W-FRI').agg({'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last'}).dropna()
        ma_40 = df_weekly['Close'].rolling(40).mean()
        slope = ma_40.diff()
        signal = pd.Series(index=df_weekly.index, dtype='object')
        for i in range(len(df_weekly)):
            p = df_weekly['Close'].iloc[i]
            ma = ma_40.iloc[i]
            sl = slope.iloc[i]
            if pd.isna(p) or pd.isna(ma) or pd.isna(sl): continue
            if p > ma:
                signal[i] = "Above Rising MA" if sl > 0 else "Above Falling MA"
            else:
                signal[i] = "Below Rising MA" if sl > 0 else "Below Falling MA"
        return TimeSeriesMetric(
            current=safe_value(signal, -1),
            seven_days_ago=safe_value(signal, -2),
            fourteen_days_ago=safe_value(signal, -3),
            twentyone_days_ago=safe_value(signal, -4),
        )
    
    def fifty_dma_and_150_dma(self) -> TimeSeriesMetric:
        df = self.df.copy()

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        close = df['Close']
        ma50 = close.rolling(window=50).mean()
        ma150 = close.rolling(window=150).mean()

        def classify(index: int) -> str | None:
            if index >= len(df):
                return None
            p = close.iloc[index]
            m50 = ma50.iloc[index]
            m150 = ma150.iloc[index]

            if pd.isna(p) or pd.isna(m50) or pd.isna(m150):
                return None

            if p > m50 and m50 > m150:
                return "Above Both (Uptrend)"
            elif p > m150 and m150 > m50:
                return "Above 150DMA Only"
            elif p < m50 and m50 < m150:
                return "Below Both (Downtrend)"
            elif p < m150 and m150 < m50:
                return "Below 150DMA Only"
            else:
                return "Between Averages"

        labels = pd.Series([classify(i) for i in range(len(close))], index=close.index)
        labels = labels.dropna()

        return TimeSeriesMetric(
            current=safe_value(labels, -1),
            seven_days_ago=safe_value(labels, -2),
            fourteen_days_ago=safe_value(labels, -3),
            twentyone_days_ago=safe_value(labels, -4),
        )
    
    def calculate_20dma(self) -> TimeSeriesMetric:
        ma_20 = self.df['Close'].rolling(window=20).mean()
        return TimeSeriesMetric(
            current=safe_value(ma_20, -1),
            seven_days_ago=safe_value(ma_20, -7),
            fourteen_days_ago=safe_value(ma_20, -14),
            twentyone_days_ago=safe_value(ma_20, -21),
        )
    
    def calculate_50dma(self) -> TimeSeriesMetric:
        ma_50 = self.df['Close'].rolling(window=50).mean()
        return TimeSeriesMetric(
            current=safe_value(ma_50, -1),
            seven_days_ago=safe_value(ma_50, -7),
            fourteen_days_ago=safe_value(ma_50, -14),
            twentyone_days_ago=safe_value(ma_50, -21),
        )
    
    def mean_reversion_50dma(self) -> TimeSeriesMetric:
        price = self.df['Close']
        ma_50 = price.rolling(window=50).mean()
        deviation = (price - ma_50) / ma_50 * 100

        def classify(dev: float | None) -> str | None:
            if dev is None or pd.isna(dev):
                return None
            if dev > 5:
                return "Extended"
            elif dev < -5:
                return "Oversold"
            else:
                return "Average"

        return TimeSeriesMetric(
            current=classify(safe_value(deviation, -1)),
            seven_days_ago=classify(safe_value(deviation, -7)),
            fourteen_days_ago=classify(safe_value(deviation, -14)),
            twentyone_days_ago=classify(safe_value(deviation, -21)),
        )


    def mean_reversion_200dma(self) -> TimeSeriesMetric:
        price = self.df['Close']
        ma_200 = price.rolling(window=200).mean()
        deviation = (price - ma_200) / ma_200 * 100

        def classify(dev: float | None) -> str | None:
            if dev is None or pd.isna(dev):
                return None
            if dev > 5:
                return "Extended"
            elif dev < -5:
                return "Oversold"
            else:
                return "Average"

        return TimeSeriesMetric(
            current=classify(safe_value(deviation, -1)),
            seven_days_ago=classify(safe_value(deviation, -7)),
            fourteen_days_ago=classify(safe_value(deviation, -14)),
            twentyone_days_ago=classify(safe_value(deviation, -21)),
        )


    def mean_reversion_3yma(self) -> TimeSeriesMetric:
        monthly_close = self.df['Close'].resample('ME').last()
        ma_3y = monthly_close.rolling(window=36).mean()
        deviation = (monthly_close - ma_3y) / ma_3y * 100

        def classify(dev: float | None) -> str | None:
            if dev is None or pd.isna(dev):
                return None
            if dev > 5:
                return "Extended"
            elif dev < -5:
                return "Oversold"
            else:
                return "Average"

        return TimeSeriesMetric(
            current=classify(safe_value(deviation, -1)),
            seven_days_ago=classify(safe_value(deviation, -2)),
            fourteen_days_ago=classify(safe_value(deviation, -3)),
            twentyone_days_ago=classify(safe_value(deviation, -4)),
        )
    
    def rsi_and_ma_daily(self) -> TimeSeriesMetric:
        close = self.df['Close']
        delta = close.diff()

        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)

        avg_gain = gain.rolling(window=14).mean()
        avg_loss = loss.rolling(window=14).mean()

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

        rsi_ma = rsi.rolling(window=50).mean()

        comparison = (rsi > rsi_ma).map(lambda x: "Above" if x else "Below")

        return TimeSeriesMetric(
            current=safe_value(comparison, -1),
            seven_days_ago=safe_value(comparison, -7),
            fourteen_days_ago=safe_value(comparison, -14),
            twentyone_days_ago=safe_value(comparison, -21),
        )
    
    def rsi_divergence_daily(self, pivot_strength: int = 3, rsi_period: int = 14, rsi_threshold: float = 3.0) -> TimeSeriesMetric:
        result = detect_rsi_divergence(
            self.df,
            rsi_period=rsi_period,
            pivot_strength=pivot_strength,
            rsi_threshold=rsi_threshold
        )

        return TimeSeriesMetric(
            current=safe_value(result, -1),
            seven_days_ago=safe_value(result, -2),
            fourteen_days_ago=safe_value(result, -3),
            twentyone_days_ago=safe_value(result, -4),
        )

    
    def bollinger_band_width_percentile_daily(self) -> TimeSeriesMetric:
        df = self.df[['Close']].copy()
        if len(df) < 126:
            raise HTTPException(status_code=400, detail="Not enough data for Bollinger Band Width Percentile.")

        # Bollinger Bands
        ma = df['Close'].rolling(20).mean()
        std = df['Close'].rolling(20).std()
        upper = ma + 2 * std
        lower = ma - 2 * std

        # Band width
        width = (upper - lower) / ma
        df['Width'] = np.where(ma != 0, (upper - lower) / ma, np.nan)

        # Calculate rolling percentiles (over last 126 days)
        percentiles = df['Width'].rolling(126).apply(
            lambda x: (x[-1] > x).mean() * 100, raw=False
        )

        df['Percentile'] = percentiles

        def classify(p):
            if pd.isna(p):
                return None
            if p >= 90:
                return "Blue Band"
            elif p <= 10:
                return "Red Band"
            return "Normal"

        df['BandStatus'] = df['Percentile'].apply(classify)
        band_series = df['BandStatus'].dropna()

        return TimeSeriesMetric(
            current=safe_value(band_series, -1),
            seven_days_ago=safe_value(band_series, -2),
            fourteen_days_ago=safe_value(band_series, -3),
            twentyone_days_ago=safe_value(band_series, -4),
        )
    
    def rsi_ma_weekly(self) -> TimeSeriesMetric:
        df_weekly = self.df.resample("W-FRI").last().dropna()
        close = df_weekly["Close"]
        rsi = compute_wilder_rsi(close)

        # Compare RSI to its 14-period MA (or keep price MA if that's intended)
        rsi_ma = pd.Series(rsi, index=close.index).rolling(window=14).mean()
        condition = (rsi > rsi_ma).replace({True: "Above", False: "Below"})

        return TimeSeriesMetric(
            current=safe_value(condition, -1),
            seven_days_ago=safe_value(condition, -2),
            fourteen_days_ago=safe_value(condition, -3),
            twentyone_days_ago=safe_value(condition, -4),
        )


    
    def rsi_divergence_weekly(self, pivot_strength: int = 3, rsi_period: int = 14, rsi_threshold: float = 3.0) -> TimeSeriesMetric:
        # Resample to weekly frequency using Friday as the week-end
        df_weekly = self.df.resample("W-FRI").last().dropna()
        close = df_weekly["Close"]

        # Compute RSI and align valid index
        rsi = compute_wilder_rsi(close, rsi_period)
        rsi = rsi.dropna()
        close = close[rsi.index]  # align with RSI (since first few will be NaN)

        close_values = close.values
        rsi_values = rsi.values
        index = close.index

        # Find pivot highs and lows on price (not RSI)
        highs, lows = find_pivots(close_values, window=pivot_strength)

        signals = pd.Series("Normal", index=index)

        for i in range(len(index)):
            for lookback in range(5, 30):  # Compare against prior pivot up to 30 weeks back
                j = i - lookback
                if j < 0:
                    break

                # Bullish Divergence: price makes lower low, RSI makes higher low
                if j in lows and i in lows:
                    if (close_values[i] < close_values[j] and
                        rsi_values[i] > rsi_values[j] and
                        abs(rsi_values[i] - rsi_values[j]) >= rsi_threshold and
                        rsi_values[i] < 50):
                        signals.iloc[i] = "Bullish Divergence"
                        break

                # Bearish Divergence: price makes higher high, RSI makes lower high
                if j in highs and i in highs:
                    if (close_values[i] > close_values[j] and
                        rsi_values[i] < rsi_values[j] and
                        abs(rsi_values[i] - rsi_values[j]) >= rsi_threshold and
                        rsi_values[i] > 50):
                        signals.iloc[i] = "Bearish Divergence"
                        break

        return TimeSeriesMetric(
            current=safe_value(signals, -1),
            seven_days_ago=safe_value(signals, -2),
            fourteen_days_ago=safe_value(signals, -3),
            twentyone_days_ago=safe_value(signals, -4),
        )

    def rsi_ma_monthly(self) -> TimeSeriesMetric:
        # Resample to month-end data (last trading day of each month)
        df_monthly = self.df.resample("M").last().dropna()
        close = df_monthly["Close"]

        # Compute Wilder's RSI (standard)
        rsi = compute_wilder_rsi(close)

        # Compare RSI to its 14-period RSI moving average
        rsi_ma = rsi.rolling(window=14).mean()
        condition = (rsi > rsi_ma).replace({True: "Above", False: "Below"})

        # For monthly frequency, use month-wise offsets
        return TimeSeriesMetric(
            current=safe_value(condition, -1),
            seven_days_ago=safe_value(condition, -2),
            fourteen_days_ago=safe_value(condition, -3),
            twentyone_days_ago=safe_value(condition, -4),
        )

    
    def rsi_divergence_monthly(self, pivot_strength: int = 2, rsi_period: int = 14, rsi_threshold: float = 3.0) -> TimeSeriesMetric:
        # Resample to month-end data
        df_monthly = self.df.resample("M").last().dropna()
        close = df_monthly["Close"]

        # Compute RSI using Wilder's method
        rsi = compute_wilder_rsi(close, rsi_period)
        rsi = rsi.dropna()
        close = close[rsi.index]

        close_values = close.values
        rsi_values = rsi.values
        index = close.index

        # Find pivot highs and lows on price
        highs, lows = find_pivots(close_values, window=pivot_strength)

        signals = pd.Series("Normal", index=index)

        for i in range(len(index)):
            for lookback in range(3, 12):  # lookback range of 3 to 12 months
                j = i - lookback
                if j < 0:
                    break

                # Bullish Divergence: price lower low, RSI higher low
                if j in lows and i in lows:
                    if (close_values[i] < close_values[j] and
                        rsi_values[i] > rsi_values[j] and
                        abs(rsi_values[i] - rsi_values[j]) >= rsi_threshold and
                        rsi_values[i] < 50):
                        signals.iloc[i] = "Bullish Divergence"
                        break

                # Bearish Divergence: price higher high, RSI lower high
                if j in highs and i in highs:
                    if (close_values[i] > close_values[j] and
                        rsi_values[i] < rsi_values[j] and
                        abs(rsi_values[i] - rsi_values[j]) >= rsi_threshold and
                        rsi_values[i] > 50):
                        signals.iloc[i] = "Bearish Divergence"
                        break

        return TimeSeriesMetric(
            current=safe_value(signals, -1),
            seven_days_ago=safe_value(signals, -2),
            fourteen_days_ago=safe_value(signals, -3),
            twentyone_days_ago=safe_value(signals, -4),
        )
    
    def chaikin_money_flow(self) -> TimeSeriesMetric:
        df = self.df.dropna()

        if len(df) < 30:
            raise HTTPException(status_code=400, detail="Not enough data for CMF.")

        df = df.tail(100)  # use last 100 days to get enough for 21-day CMF

        high = df["High"]
        low = df["Low"]
        close = df["Close"]
        volume = pd.to_numeric(df["Volume"], errors="coerce").fillna(0)

        hl_range = (high - low).replace(0, np.nan)
        mfm = ((close - low) - (high - close)) / hl_range
        mfm = mfm.fillna(0)

        mfv = mfm * volume
        cmf = mfv.rolling(window=21).sum() / volume.rolling(window=21).sum()

        signal = cmf.apply(lambda x: "Positive" if x > 0 else "Negative")

        return TimeSeriesMetric(
            current=safe_value(signal, -1),
            seven_days_ago=safe_value(signal, -2),
            fourteen_days_ago=safe_value(signal, -3),
            twentyone_days_ago=safe_value(signal, -4),
        )
    
    def get_overlay_lines(self) -> dict:
        df = self.df.copy()

        # 3Y MA (monthly)
        monthly_close = df["Close"].resample("ME").last()
        ma3y = monthly_close.rolling(window=36).mean().dropna()
        ma3y_series = [
            {"time": int(ts.timestamp()), "value": round(val, 2)}
            for ts, val in ma3y.items()
            if not pd.isna(val)
        ]

        # 50DMA (daily)
        dma50 = df["Close"].rolling(window=50).mean().dropna()
        dma50_series = [
            {"time": int(ts.timestamp()), "value": round(val, 2)}
            for ts, val in dma50.items()
            if not pd.isna(val)
        ]

        # MACE (weekly)
        df_weekly = df.resample("W-FRI").agg({"Open": "first", "High": "max", "Low": "min", "Close": "last"}).dropna()
        s = df_weekly["Close"].rolling(4).mean()
        m = df_weekly["Close"].rolling(13).mean()
        l = df_weekly["Close"].rolling(26).mean()
        mace = (s + m + l) / 3
        mace_series = [
            {"time": int(ts.timestamp()), "value": round(val, 2)}
            for ts, val in mace.items()
            if not pd.isna(val)
        ]

        # Mean reversion
        mean_rev = self.get_mean_reversion_deviation_lines()

        return {
            "three_year_ma": ma3y_series,
            "dma_50": dma50_series,
            "mace": mace_series,
            **mean_rev
        }
    
    def get_mean_reversion_deviation_lines(self) -> dict:
        price = self.df["Close"]
        ma50 = price.rolling(window=50).mean()

        dev_50 = ((price - ma50) / ma50 * 100).dropna()

        return {
            "mean_rev_50dma": [
                {"time": int(ts.timestamp()), "value": round(val, 2)}
                for ts, val in dev_50.items()
            ],
        }


