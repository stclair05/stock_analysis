import yfinance as yf
import pandas as pd
import numpy as np
from fastapi import HTTPException
from functools import lru_cache
from functools import cached_property
from .models import TimeSeriesMetric
from aliases import SYMBOL_ALIASES
from .utils import compute_demarker, safe_value, detect_rsi_divergence, find_pivots, compute_wilder_rsi, compute_bbwp, compute_ichimoku_lines, compute_supertrend_lines, to_series, classify_adx_trend, classify_mace_signal, classify_40w_status, classify_dma_trend, classify_bbwp_percentile, wilder_smooth, reindex_indicator
from .pricetarget import get_price_targets
from threading import Lock

_price_data_lock = Lock()

class StockAnalyser:
    def __init__(self, symbol: str):
        raw_symbol = symbol.upper().strip()
        self.symbol = SYMBOL_ALIASES.get(raw_symbol, raw_symbol)
        self.df = StockAnalyser.get_price_data(self.symbol)

    def _download_data(self) -> pd.DataFrame:
        df = yf.download(self.symbol, period='20y', interval='1d', auto_adjust=False)
        print(df.tail())
        if df.empty:
            raise HTTPException(status_code=400, detail="Stock symbol not found or data unavailable.")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)
        print(df)
        return df
    
    

    @staticmethod
    @lru_cache(maxsize=100)
    def get_price_data(symbol: str) -> pd.DataFrame:
        with _price_data_lock: 
            df = yf.download(symbol, period="12y", interval="1d", auto_adjust=False)
            if df.empty:
                raise HTTPException(status_code=400, detail="Stock symbol not found or data unavailable.")  # <--- raise here
            # Patch with today’s close (1D)
            try:
                live_df = yf.download(symbol, period="1d", interval="1d")
                if not live_df.empty:
                    # Align columns and patch
                    live_df = live_df[df.columns]
                    for idx in live_df.index:
                        df.loc[pd.to_datetime(idx)] = live_df.loc[idx]
            except Exception:
                pass
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.droplevel(1)
            # Clean up index and rows after patch
            df = df.sort_index()
            df = df[~df.index.duplicated(keep='last')]
            df = df[df['Close'].notna()]
            return df


    
    @cached_property
    def weekly_df(self) -> pd.DataFrame:
        df = self.df.copy()
        # Use "Adj Close" for resampling if it exists
        if "Adj Close" in df.columns:
            df["Close"] = df["Adj Close"]
        return df.resample("W-FRI").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum" if "Volume" in df.columns else "first"
        }).dropna()


    @cached_property
    def monthly_df(self) -> pd.DataFrame:
        return self.df.resample("ME").last().dropna()

    def get_current_price(self) -> float | None:
        return safe_value(self.df['Close'], -1)

    def calculate_3year_ma(self) -> TimeSeriesMetric:
        # 3 years of weekly closes = 156 weeks
        if len(self.weekly_df) < 156:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})
        weekly_close = self.weekly_df["Close"]
        weekly_ma = weekly_close.rolling(window=156).mean()

        print("Last 5 weekly closes:")
        print(self.weekly_df["Close"].tail(5))
        print("Last 5 SMA 156:")
        print(self.weekly_df["Close"].rolling(window=156).mean().tail(5))



        return TimeSeriesMetric(
            current=safe_value(weekly_ma, -1),
            seven_days_ago=safe_value(weekly_ma, -2),
            fourteen_days_ago=safe_value(weekly_ma, -3),
            twentyone_days_ago=safe_value(weekly_ma, -4),
        )

    def calculate_200dma(self) -> TimeSeriesMetric:
        if len(self.df) < 200:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        daily_ma = self.df['Close'].rolling(window=200).mean()
        return TimeSeriesMetric(
            current=safe_value(daily_ma, -1),
            seven_days_ago=safe_value(daily_ma, -7),
            fourteen_days_ago=safe_value(daily_ma, -14),
            twentyone_days_ago=safe_value(daily_ma, -21),
        )

    def ichimoku_cloud(self) -> TimeSeriesMetric:
        df_weekly = self.weekly_df.last('600D')

        if len(df_weekly) < 30 or df_weekly.empty:  # ~30 weeks
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})


        # Use util function to get Ichimoku lines
        _, _, span_a, span_b = compute_ichimoku_lines(df_weekly)

        # Compute upper and lower cloud bounds
        upper = np.maximum(span_a, span_b)
        lower = np.minimum(span_a, span_b)

        # Current close
        close = df_weekly['Close'].reindex(upper.index)

        # Determine position
        position = pd.Series(
            np.where(close > upper, "Above",
                    np.where(close < lower, "Below", "Inside")),
            index=close.index
        )

        return TimeSeriesMetric(
            current=safe_value(position, -1),
            seven_days_ago=safe_value(position, -2),
            fourteen_days_ago=safe_value(position, -3),
            twentyone_days_ago=safe_value(position, -4),
        )


    def super_trend(self) -> TimeSeriesMetric:
        df_weekly = self.weekly_df.last('600D')

        if len(df_weekly) < 30 or df_weekly.empty:  # ~30 weeks
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})
    
        df_st = compute_supertrend_lines(df_weekly)

        return TimeSeriesMetric(
            current=safe_value(df_st["Signal"], -1),
            seven_days_ago=safe_value(df_st["Signal"], -2),
            fourteen_days_ago=safe_value(df_st["Signal"], -3),
            twentyone_days_ago=safe_value(df_st["Signal"], -4),
        )


    def adx(self) -> TimeSeriesMetric:
        df_weekly = self.weekly_df.last('600D')

        if len(df_weekly) < 20 or df_weekly.empty:  # ~20 weeks
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        high = df_weekly['High']
        low = df_weekly['Low']
        close = df_weekly['Close']

        prev_high = high.shift(1)
        prev_low = low.shift(1)
        prev_close = close.shift(1)

        tr = pd.concat([
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs()
        ], axis=1).max(axis=1)

        up_move = high - prev_high
        down_move = prev_low - low

        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

        period = 14

        smoothed_tr = wilder_smooth(tr, period)
        smoothed_plus_dm = wilder_smooth(pd.Series(plus_dm, index=tr.index), period)
        smoothed_minus_dm = wilder_smooth(pd.Series(minus_dm, index=tr.index), period)

        plus_di = 100 * smoothed_plus_dm / smoothed_tr
        minus_di = 100 * smoothed_minus_dm / smoothed_tr
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)

        adx = wilder_smooth(dx.dropna(), period)

        # Align all series to match final ADX index
        common_index = adx.index
        plus_di = plus_di.reindex(common_index)
        minus_di = minus_di.reindex(common_index)


        # Classification (same as before)
        classification = classify_adx_trend(adx, plus_di, minus_di)

        return TimeSeriesMetric(
            current=safe_value(classification, -1),
            seven_days_ago=safe_value(classification, -2),
            fourteen_days_ago=safe_value(classification, -3),
            twentyone_days_ago=safe_value(classification, -4),
        )


    def mace(self) -> TimeSeriesMetric:
        df_weekly = self.weekly_df.last('600D')

        if len(df_weekly) < 30 or df_weekly.empty:  # ~30 weeks
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        close = df_weekly['Close']
        s = close.rolling(4).mean()
        m = close.rolling(13).mean()
        l = close.rolling(26).mean()

        signal = classify_mace_signal(s, m, l)

        return TimeSeriesMetric(
            current=safe_value(signal, -1),
            seven_days_ago=safe_value(signal, -2),
            fourteen_days_ago=safe_value(signal, -3),
            twentyone_days_ago=safe_value(signal, -4),
        )

    def forty_week_status(self) -> TimeSeriesMetric:
        df_weekly = self.weekly_df.last('600D')

        if len(df_weekly) < 30 or df_weekly.empty:  # ~30 weeks
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        close = df_weekly['Close']
        ma_40 = close.rolling(40).mean()
        slope = ma_40.diff()

        signal = classify_40w_status(close, ma_40, slope)

        return TimeSeriesMetric(
            current=safe_value(signal, -1),
            seven_days_ago=safe_value(signal, -2),
            fourteen_days_ago=safe_value(signal, -3),
            twentyone_days_ago=safe_value(signal, -4),
        )

    
    def fifty_dma_and_150_dma(self) -> TimeSeriesMetric:
        df = self.df
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        close = df["Close"]
        ma50 = close.rolling(50).mean()
        ma150 = close.rolling(150).mean()

        labels = classify_dma_trend(close, ma50, ma150)

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
    
    def mean_reversion_50dma(self, lookback: int = 756) -> TimeSeriesMetric:
        if len(self.df) < 60:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        price = self.df['Close']
        ma_50 = price.rolling(window=50).mean()
        deviation = (price - ma_50) / ma_50 * 100
        recent_dev = deviation[-lookback:].dropna()

        if len(recent_dev) < 30:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        lower = recent_dev.quantile(0.05)
        upper = recent_dev.quantile(0.95)

        def classify(dev: float | None) -> str | None:
            if dev is None or pd.isna(dev):
                return None
            if isinstance(dev, str):
                return dev
            if dev > upper:
                return "Overbought"
            elif dev < lower:
                return "Oversold"
            else:
                return "Average"

        return TimeSeriesMetric(
            current=classify(safe_value(deviation, -1)),
            seven_days_ago=classify(safe_value(deviation, -7)),
            fourteen_days_ago=classify(safe_value(deviation, -14)),
            twentyone_days_ago=classify(safe_value(deviation, -21)),
        )


    def mean_reversion_200dma(self, lookback: int = 220*3) -> TimeSeriesMetric:
        if len(self.df) < 220:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        price = self.df['Close']
        ma_200 = price.rolling(window=200).mean()
        deviation = (price - ma_200) / ma_200 * 100
        recent_dev = deviation[-lookback:].dropna()

        if len(recent_dev) < 30:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        lower = recent_dev.quantile(0.05)
        upper = recent_dev.quantile(0.95)

        def classify(dev: float | None) -> str | None:
            if dev is None or pd.isna(dev):
                return None
            if isinstance(dev, str):
                return dev
            if dev > upper:
                return "Overbought"
            elif dev < lower:
                return "Oversold"
            else:
                return "Average"

        return TimeSeriesMetric(
            current=classify(safe_value(deviation, -1)),
            seven_days_ago=classify(safe_value(deviation, -7)),
            fourteen_days_ago=classify(safe_value(deviation, -14)),
            twentyone_days_ago=classify(safe_value(deviation, -21)),
        )



    def mean_reversion_3yma(self, lookback: int = 36*3) -> TimeSeriesMetric:
        if len(self.df) < 800:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        monthly_close = self.monthly_df["Close"]
        ma_3y = monthly_close.rolling(window=36).mean()
        deviation = (monthly_close - ma_3y) / ma_3y * 100
        recent_dev = deviation[-lookback:].dropna()

        if len(recent_dev) < 10:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        lower = recent_dev.quantile(0.05)
        upper = recent_dev.quantile(0.95)

        def classify(dev: float | str | None) -> str | None:
            if dev is None or pd.isna(dev) or dev == "in progress":
                return "in progress"
            if isinstance(dev, str):
                return dev
            if dev > upper:
                return "Overbought"
            elif dev < lower:
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
        close = self.df['Close']
        if len(close) < 126:
            raise HTTPException(status_code=400, detail="Not enough data for Bollinger Band Width Percentile.")

        bbwp = compute_bbwp(close, length=20, bbwp_window=126)
        band_labels = classify_bbwp_percentile(bbwp).dropna()

        return TimeSeriesMetric(
            current=safe_value(band_labels, -1),
            seven_days_ago=safe_value(band_labels, -2),
            fourteen_days_ago=safe_value(band_labels, -3),
            twentyone_days_ago=safe_value(band_labels, -4),
        )

    
    def rsi_ma_weekly(self) -> TimeSeriesMetric:
        df_weekly = self.weekly_df 
        if df_weekly.empty or len(df_weekly) < 30:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})
        
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
        # Resample to weekly frequency using Friday as week end
        df_weekly = self.weekly_df 

        if df_weekly.empty or len(df_weekly) < 30:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        signals = detect_rsi_divergence(
            df_weekly[["Close"]],
            rsi_period=rsi_period,
            pivot_strength=pivot_strength,
            rsi_threshold=rsi_threshold,
            lookback_range=(5, 30)  # weekly default
        ).dropna()

        return TimeSeriesMetric(
            current=safe_value(signals, -1),
            seven_days_ago=safe_value(signals, -2),
            fourteen_days_ago=safe_value(signals, -3),
            twentyone_days_ago=safe_value(signals, -4),
        )


    def rsi_ma_monthly(self) -> TimeSeriesMetric:
        # Resample to month-end (last calendar trading day of each month)
        df_monthly = self.monthly_df
        if df_monthly.empty or len(df_monthly) < 30:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        close = df_monthly["Close"]

        rsi = compute_wilder_rsi(close)
        rsi_ma = rsi.rolling(window=14).mean()

        condition = (rsi > rsi_ma).replace({True: "Above", False: "Below"})

        return TimeSeriesMetric(
            current=safe_value(condition, -1),
            seven_days_ago=safe_value(condition, -2),
            fourteen_days_ago=safe_value(condition, -3),
            twentyone_days_ago=safe_value(condition, -4),
        )


    
    def rsi_divergence_monthly(self, pivot_strength: int = 2, rsi_period: int = 14, rsi_threshold: float = 3.0) -> TimeSeriesMetric:
        df_monthly = self.monthly_df

        if df_monthly.empty or len(df_monthly) < 12:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

        signals = detect_rsi_divergence(
            df_monthly[["Close"]],
            rsi_period=rsi_period,
            pivot_strength=pivot_strength,
            rsi_threshold=rsi_threshold,
            lookback_range=(3, 12)  # ⬅️ your custom monthly lookback
        ).dropna()

        return TimeSeriesMetric(
            current=safe_value(signals, -1),
            seven_days_ago=safe_value(signals, -2),
            fourteen_days_ago=safe_value(signals, -3),
            twentyone_days_ago=safe_value(signals, -4),
        )


    
    def chaikin_money_flow(self) -> TimeSeriesMetric:
        df = self.weekly_df 

        if df.empty or len(df) < 30:
            raise HTTPException(status_code=400, detail="Not enough weekly data for CMF.")

        high = df["High"]
        low = df["Low"]
        close = df["Close"]
        volume = pd.to_numeric(df["Volume"], errors="coerce").fillna(0)

        hl_range = (high - low).replace(0, np.nan)
        mfm = ((close - low) - (high - close)) / hl_range
        mfm = mfm.fillna(0)

        mfv = mfm * volume
        cmf = mfv.rolling(window=21).sum() / volume.rolling(window=21).sum().replace(0, np.nan)

        def classify_cmf(val: float | None) -> str | None:
            if val is None or pd.isna(val):
                return None
            if val > 0.2:
                return "Overbought"
            elif val < -0.2:
                return "Oversold"
            else:
                return "Neutral"

        signal = cmf.apply(classify_cmf)

        return TimeSeriesMetric(
            current=safe_value(signal, -1),
            seven_days_ago=safe_value(signal, -2),
            fourteen_days_ago=safe_value(signal, -3),
            twentyone_days_ago=safe_value(signal, -4),
        )


    
    def get_price_line(self):
        return to_series(self.df["Close"].dropna())


    def get_3year_ma_series(self):
        monthly_close = self.monthly_df["Close"]
        ma = monthly_close.rolling(window=36).mean()
        return to_series(reindex_indicator(monthly_close, ma))


    def get_200dma_series(self):
        close = self.df["Close"]
        ma = close.rolling(200).mean()
        return to_series(reindex_indicator(close, ma))


    def get_150dma_series(self):
        close = self.df["Close"]
        ma150 = close.rolling(150).mean()
        return to_series(reindex_indicator(close, ma150))

    def get_50dma_series(self):
        close = self.df["Close"]
        ma50 = close.rolling(window=50).mean()
        return to_series(reindex_indicator(close, ma50))

    
    def get_mace_series(self):
        df_weekly = self.weekly_df

        close = df_weekly["Close"]

        s = reindex_indicator(close, close.rolling(4).mean())   # Short-term
        m = reindex_indicator(close, close.rolling(13).mean())  # Medium-term
        l = reindex_indicator(close, close.rolling(26).mean())  # Long-term

        return {
            "mace_4w": to_series(s),
            "mace_13w": to_series(m),
            "mace_26w": to_series(l),
        }

    
    def get_40_week_ma_series(self):
        df_weekly = self.weekly_df
        close = df_weekly["Close"]
        ma = close.rolling(window=40).mean()
        return to_series(reindex_indicator(close, ma))
    
    def get_rsi_ma_series(self, period: int = 14):
        close = self.df["Close"]
        rsi = compute_wilder_rsi(close)
        rsi_ma = rsi.rolling(window=period).mean()
        return to_series(reindex_indicator(close, rsi_ma))


    def get_rsi_series(self):
        df_weekly = self.weekly_df
        close = df_weekly["Close"]
        rsi = compute_wilder_rsi(close)
        print(f"RSI Min: {rsi.min()}, Max: {rsi.max()}")
        return to_series(reindex_indicator(close, rsi))
    
    def get_rsi_lines(self, period: int = 14, timeframe: str = "weekly") -> dict:
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")

        close = df["Close"]
        rsi = compute_wilder_rsi(close, period)
        rsi_aligned = reindex_indicator(close, rsi)
        rsi_series = to_series(rsi_aligned)
        rsi_ma = rsi.rolling(window=period).mean()
        rsi_ma_aligned = reindex_indicator(close, rsi_ma)
        rsi_ma_series = to_series(rsi_ma_aligned)

        rsi_times = [point["time"] for point in rsi_series]
        rsi_upper_band = [{"time": t, "value": 70} for t in rsi_times]
        rsi_middle_band = [{"time": t, "value": 50} for t in rsi_times]
        rsi_lower_band = [{"time": t, "value": 30} for t in rsi_times]

        return {
            "rsi": rsi_series,
            "rsi_ma_14": rsi_ma_series,
            "rsi_upper_band": rsi_upper_band,
            "rsi_middle_band": rsi_middle_band,
            "rsi_lower_band": rsi_lower_band,
        }

    
    def get_volatility_bbwp(self, timeframe: str = "weekly"):
        if timeframe == "daily":
            close = self.df["Close"]
        elif timeframe == "weekly":
            close = self.weekly_df["Close"]
        elif timeframe == "monthly":
            close = self.monthly_df["Close"]
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")

        # You may want to adjust the defaults for each timeframe for BBWP calculation
        length = 13
        bbwp_window = 252

        # Optionally, tune these for daily/monthly (e.g. length=20 for daily, etc)
        # For now, match TradingView weekly logic for all
        bbwp = compute_bbwp(close, length=length, bbwp_window=bbwp_window)

        bbwp_full = pd.Series(index=close.index, dtype=float)
        bbwp_full.loc[bbwp.index] = bbwp.values

        print(f"✅ [TV Match] BBWP length: {len(bbwp_full.dropna())} of {len(bbwp_full)}")

        bbwp_ma_5 = bbwp_full.rolling(window=5).mean()

        return {
            "volatility": to_series(bbwp_full),
            "volatility_ma_5": to_series(bbwp_ma_5)
        }


    def get_ichimoku_lines(self):
        df_weekly = self.weekly_df

        tenkan, kijun, span_a, span_b = compute_ichimoku_lines(df_weekly)
        close_index = df_weekly["Close"]  # Base time index for reindexing

        return {
            "ichimoku_tenkan": to_series(reindex_indicator(close_index, tenkan)),
            "ichimoku_kijun":  to_series(reindex_indicator(close_index, kijun)),
            "ichimoku_span_a": to_series(reindex_indicator(close_index, span_a)),
            "ichimoku_span_b": to_series(reindex_indicator(close_index, span_b)),
        }



    def get_supertrend_lines(self):
        df_weekly = self.weekly_df
        df_st = compute_supertrend_lines(df_weekly)

        close = df_weekly["Close"]

        return {
            "supertrend_up": to_series(reindex_indicator(close, df_st["ST_Line_Up"])),
            "supertrend_down": to_series(reindex_indicator(close, df_st["ST_Line_Down"])),
        }

    
    def get_mean_reversion_deviation_lines(self) -> dict:
        price = self.df["Close"]
        ma50 = price.rolling(window=50).mean()
        dev_50 = (price - ma50) / ma50 * 100

        dev_50_full = reindex_indicator(price, dev_50)

        return {
            "mean_rev_50dma": to_series(dev_50_full)
        }


    def get_bollinger_band(self, timeframe: str = "weekly", window: int = 20, mult: float = 2.0):
        df = self.df.copy()

        if timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        close = df["Close"]
        
        sma = close.rolling(window=window).mean()
        std = close.rolling(window=window).std()

        upper = sma + mult * std
        lower = sma - mult * std

        return {
            "bb_upper": to_series(reindex_indicator(close, upper)),
            "bb_middle": to_series(reindex_indicator(close, sma)),
            "bb_lower": to_series(reindex_indicator(close, lower)),
        }
    
    def get_ma_series(self, period: int, timeframe: str = "weekly"):
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")
        close = df["Close"]
        ma = close.rolling(window=period).mean()
        return to_series(reindex_indicator(close, ma))



    def get_overlay_lines(self, timeframe: str = "daily") -> dict:
        return {
            "price_line": self.get_price_line(),
            **self.get_bollinger_band(timeframe),
            
            # First Chart
            "three_year_ma": self.get_3year_ma_series(),

            # Second Chart
            "dma_200": self.get_200dma_series(),
            **self.get_ichimoku_lines(),
            **self.get_supertrend_lines(),

            # Third Chart
            **self.get_mace_series(),
            "forty_week_ma": self.get_40_week_ma_series(),

            # Fourth Chart
            "dma_50": self.get_50dma_series(),
            "dma_150": self.get_150dma_series(),

            # Others
            **self.get_rsi_lines(timeframe=timeframe), #3rd chart from price
            **self.get_volatility_bbwp(timeframe=timeframe),  #1st chart from price
            **self.get_mean_reversion_deviation_lines(), #2nd chart from price
        }
    
    def get_signal_lines(self, timeframe: str = "daily") -> dict:
        """
        Returns the correct overlays for each strategy, aligning all moving averages
        with the requested chart timeframe. Daily MAs are resampled for weekly/monthly.
        """
        overlays = {}

        # 1. Setup base dataframes for each resolution
        if timeframe == "daily":
            index = self.df.index
            # Northstar: daily MA12, MA36
            overlays["ma_12"] = self.get_ma_series(12, timeframe="daily")
            overlays["ma_36"] = self.get_ma_series(36, timeframe="daily")
            # StClair/TrendInvestorPro: daily MA20, MA200, MA5, MA200
            overlays["ma_20d"] = self.get_ma_series(20, timeframe="daily")    # StClair
            overlays["dma_200"] = self.get_ma_series(200, timeframe="daily")  # TrendInvestorPro
            overlays["ma_5d"] = self.get_ma_series(5, timeframe="daily")      # TrendInvestorPro

        elif timeframe == "weekly":
            index = self.weekly_df.index
            # -- Daily MAs (e.g. 20DMA, 200DMA, 5DMA) need to be computed on daily closes then resampled to weekly --
            ma_20_daily = self.df["Close"].rolling(20).mean().resample("W-FRI").last().reindex(index)
            ma_200_daily = self.df["Close"].rolling(200).mean().resample("W-FRI").last().reindex(index)
            ma_5_daily = self.df["Close"].rolling(5).mean().resample("W-FRI").last().reindex(index)
            # Northstar: uses *weekly* MA12, MA36
            overlays["ma_12"] = self.get_ma_series(12, timeframe="weekly")
            overlays["ma_36"] = self.get_ma_series(36, timeframe="weekly")
            # StClair/TrendInvestorPro: resampled daily MAs
            overlays["ma_20d"] = to_series(ma_20_daily)
            overlays["dma_200"] = to_series(ma_200_daily)
            overlays["ma_5d"] = to_series(ma_5_daily)
            # StClairLongterm
            overlays.update(self.get_supertrend_lines())
            overlays.update(self.get_ichimoku_lines())

            # MACE_40W
            overlays["ma_4w"] = self.get_ma_series(4, timeframe="weekly")      # 4-week MA
            overlays["ma_13w"] = self.get_ma_series(13, timeframe="weekly")    # 13-week MA
            overlays["ma_26w"] = self.get_ma_series(26, timeframe="weekly")    # 26-week MA
        elif timeframe == "monthly":
            index = self.monthly_df.index
            # -- Daily MAs resampled to monthly --
            ma_20_daily = self.df["Close"].rolling(20).mean().resample("M").last().reindex(index)
            ma_200_daily = self.df["Close"].rolling(200).mean().resample("M").last().reindex(index)
            ma_5_daily = self.df["Close"].rolling(5).mean().resample("M").last().reindex(index)
            # Northstar: uses *monthly* MA12, MA36
            overlays["ma_12"] = self.get_ma_series(12, timeframe="monthly")
            overlays["ma_36"] = self.get_ma_series(36, timeframe="monthly")
            # StClair/TrendInvestorPro: resampled daily MAs
            overlays["ma_20d"] = to_series(ma_20_daily)
            overlays["dma_200"] = to_series(ma_200_daily)
            overlays["ma_5d"] = to_series(ma_5_daily)
        else:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        return overlays


    def price_targets(self) -> dict:
        """
        Combines mean reversion targets and Fibonacci extension targets.
        """
        return get_price_targets(self.df, self.symbol)

    def compare_ratio_with(
        self,
        other_symbol: str,
        timeframe: str = "weekly",
        period: str = None
    ) -> dict:
        symbol1 = self.symbol
        raw_symbol2 = other_symbol.upper().strip()
        symbol2 = SYMBOL_ALIASES.get(raw_symbol2, raw_symbol2)
        other = StockAnalyser(symbol2)

        if timeframe == "daily":
            df1 = self.df.copy()
            df2 = other.df.copy()
        elif timeframe == "weekly":
            df1 = self.weekly_df.copy()
            df2 = other.weekly_df.copy()
        elif timeframe == "monthly":
            df1 = self.monthly_df.copy()
            df2 = other.monthly_df.copy()
        else:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        # 1. Union of all dates
        all_dates = df1.index.union(df2.index).sort_values()
        df1_ff = df1.reindex(all_dates).ffill()
        df2_ff = df2.reindex(all_dates).ffill()

        # 2. Only keep rows where both have data (should always be true after ffill, unless one never traded yet)
        mask = df1_ff["Close"].notna() & df2_ff["Close"].notna()
        ratio_df = pd.DataFrame(index=all_dates[mask])

        # 3. Calculate ratio columns (OHLC)
        for col in ["Open", "High", "Low", "Close"]:
            ratio_df[col] = df1_ff[col][mask] / df2_ff[col][mask]

        # 4. For volume, just use first ticker’s (not meaningful, but for chart API shape)
        ratio_df["Volume"] = df1_ff["Volume"][mask] if "Volume" in df1_ff else 0

        # 5. Format for frontend
        ratio_history = [
            {
                "time": int(pd.Timestamp(idx).timestamp()),
                "open": round(float(o), 4) if pd.notna(o) else None,
                "high": round(float(h), 4) if pd.notna(h) else None,
                "low": round(float(l), 4) if pd.notna(l) else None,
                "close": round(float(c), 4) if pd.notna(c) else None,
                "volume": round(float(v), 2) if pd.notna(v) else 0.0,
            }
            for idx, o, h, l, c, v in zip(
                ratio_df.index, ratio_df["Open"], ratio_df["High"], ratio_df["Low"], ratio_df["Close"], ratio_df["Volume"]
            )
        ]
        return {"history": ratio_history}

    

    '''
    Buy / Sell Indicators 
    '''
    def get_trendinvestorpro_signals(self, timeframe: str = "daily") -> list[dict]:
        """
        Implements the TrendInvestorPro strategy logic.
        Returns a list of marker dicts: {time, price, side, label}
        """
        # 1. Choose correct OHLC dataframe
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")

        df = df.copy().dropna()
        if len(df) < 210:
            return []

        # 2. Calculate all indicators
        close = df["Close"]
        high = df["High"]
        low = df["Low"]

        # 5-day and 200-day SMAs
        ma_short = close.rolling(window=5).mean()
        ma_long = close.rolling(window=200).mean()
        spread_pct = (ma_short - ma_long) / ma_long * 100

        # Keltner Channel
        ebasis = close.ewm(span=65, adjust=False).mean()
        atr_kc = (high.combine(close.shift(), max) - low.combine(close.shift(), min)).rolling(window=65).mean()
        lower_kc = ebasis - 2 * atr_kc

        exitCondMA = spread_pct <= -1.0

        # Track consecutive closes below lowerKC
        consec_below = (close < lower_kc).astype(int)
        consec_below = consec_below.groupby((consec_below != consec_below.shift()).cumsum()).cumsum()
        exitCondKC = consec_below >= 5

        # State flags
        enableMAReentry = False
        enableKCReentry = False
        sawDownCross = False

        in_position = False  # Strategy position flag
        markers = []

        for i in range(200, len(df)):
            # Use iloc for safety
            t = df.index[i]
            price = close.iloc[i]
            s_pct = spread_pct.iloc[i]
            below_kc = consec_below.iloc[i] >= 5
            ex_ma = s_pct <= -1.0
            ex_kc = below_kc

            # Entry Logic
            entry_signal = False
            reentry_signal = False

            # Initial entry
            if (s_pct >= 1.0) and not (enableMAReentry or enableKCReentry) and not in_position:
                entry_signal = True

            # Re-entry
            if (s_pct >= 1.0) and sawDownCross and (enableMAReentry or enableKCReentry) and not in_position:
                reentry_signal = True

            # Place entry marker
            if entry_signal or reentry_signal:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "buy",
                    "label": "ENTRY" if entry_signal else "RE-ENTRY",
                })
                in_position = True
                enableMAReentry = False
                enableKCReentry = False
                sawDownCross = False

            # Exits
            if in_position and ex_ma:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "sell",
                    "label": "EXIT MA"
                })
                in_position = False
                enableMAReentry = True
                enableKCReentry = False
                sawDownCross = False

            if in_position and ex_kc:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "sell",
                    "label": "EXIT KC"
                })
                in_position = False
                enableMAReentry = False
                enableKCReentry = True
                sawDownCross = False

            # Track a down-cross
            if (enableMAReentry or enableKCReentry) and s_pct <= -1.0:
                sawDownCross = True

        return markers
    
    def get_trendinvestorpro_status_and_strength(self, timeframe: str = "daily") -> dict:
        """
        Returns the most recent TrendInvestorPro signal (BUY/SELL) and whether the signal is
        strengthening, weakening, or crossed.
        """
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")

        df = df.copy().dropna()
        if len(df) < 210:
            return {"status": None, "delta": None}

        close = df["Close"]
        high = df["High"]
        low = df["Low"]

        ma_short = close.rolling(window=5).mean()
        ma_long = close.rolling(window=200).mean()
        spread_pct = (ma_short - ma_long) / ma_long * 100

        ebasis = close.ewm(span=65, adjust=False).mean()
        atr_kc = (high.combine(close.shift(), max) - low.combine(close.shift(), min)).rolling(window=65).mean()
        lower_kc = ebasis - 2 * atr_kc

        consec_below = (close < lower_kc).astype(int)
        consec_below = consec_below.groupby((consec_below != consec_below.shift()).cumsum()).cumsum()

        # Use last 2 bars
        try:
            s_now = spread_pct.iloc[-1]
            s_prev = spread_pct.iloc[-2]
            c_now = consec_below.iloc[-1]
            c_prev = consec_below.iloc[-2]
        except IndexError:
            return {"status": None, "delta": None}

        # Defensive default
        status = None
        delta = None

        # Determine current state
        entry_now = s_now >= 1.0
        exit_ma_now = s_now <= -1.0
        exit_kc_now = c_now >= 5

        entry_prev = s_prev >= 1.0
        exit_ma_prev = s_prev <= -1.0
        exit_kc_prev = c_prev >= 5

        # Determine status
        if entry_now and not (exit_ma_now or exit_kc_now):
            status = "BUY"
        elif exit_ma_now or exit_kc_now:
            status = "SELL"
        else:
            return {"status": None, "delta": None}

        # Determine delta
        if status == "BUY" and not entry_prev:
            delta = "crossed"
        elif status == "SELL" and not (exit_ma_prev or exit_kc_prev):
            delta = "crossed"
        elif status == "BUY":
            delta = "strengthening" if s_now > s_prev else "weakening"
        elif status == "SELL":
            delta = "strengthening" if c_now > c_prev else "weakening"

        return {"status": status, "delta": delta}


    
    def get_stclair_signals(self, timeframe: str = "weekly") -> list[dict]:
        """
        Implements the multi-timeframe trend-following strategy described in PineScript.
        Returns list of {time, price, side, label}.
        - timeframe: "weekly", "monthly", or "daily"
        """
        # Choose base OHLC dataframe for the given timeframe
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")

        # Must use daily data for moving averages, and resampled for RSI signals
        daily_df = self.df
        # For price comparison, always use daily close aligned with higher timeframe
        # We'll use the last close *before or at* each bar for SMA check

        # Prepare the signals DataFrame
        markers = []

        # Precompute moving averages (on daily data)
        sma20 = daily_df['Close'].rolling(window=20).mean()
        sma200 = daily_df['Close'].rolling(window=200).mean()

        # Get the close price for each bar (on timeframe)
        close = df['Close']

        # Compute RSI and its 14-period SMA on the chosen timeframe
        rsi = compute_wilder_rsi(close, 14)
        rsi_ma = rsi.rolling(window=14).mean()

        # Align daily MA to higher timeframe index (take most recent available)
        daily_close = daily_df['Close']

        in_position = False
        entry_price = None

        # For each bar in the selected timeframe, determine signals
        for idx in range(len(df)):
            t = df.index[idx]
            bar_close = close.iloc[idx]
            # Get most recent SMA values up to this bar
            recent_daily = daily_df.loc[:t]
            if len(recent_daily) < 200:
                continue  # skip if not enough data

            latest_sma20 = sma20.loc[:t].iloc[-1]
            latest_sma200 = sma200.loc[:t].iloc[-1]

            # Entry/exit conditions
            weekly_rsi = rsi.iloc[idx]
            weekly_rsi_ma = rsi_ma.iloc[idx]

            enter_cond = (
                (bar_close > latest_sma200)
                and (bar_close > latest_sma20)
                and (weekly_rsi > weekly_rsi_ma)
            )
            exit_cond = (weekly_rsi < weekly_rsi_ma)

            if enter_cond and not in_position:
                # Enter long
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": bar_close,
                    "side": "buy",
                    "label": "ENTRY",
                })
                in_position = True
                entry_price = bar_close

            elif exit_cond and in_position:
                # Exit long
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": bar_close,
                    "side": "sell",
                    "label": "EXIT",
                })
                in_position = False
                entry_price = None

        return markers
    
    def get_stclair_status_and_strength(self, timeframe: str = "weekly") -> dict:
        """
        Returns the latest signal ('BUY' or 'SELL') and its trend delta
        ('crossed', 'strengthening', 'weakening', 'neutral'), enhanced with Supertrend.
        """
        # Load correct timeframe
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")

        daily_df = self.df
        if len(daily_df) < 200 or len(df) < 3:
            return {"status": None, "delta": None}

        # --- Daily SMAs for price context
        sma20 = daily_df['Close'].rolling(20).mean()
        sma200 = daily_df['Close'].rolling(200).mean()

        # --- RSI and RSI MA on current timeframe
        close = df['Close']
        rsi = compute_wilder_rsi(close, 14)
        rsi_ma = rsi.rolling(14).mean()

        # Helper: extract key values
        def get_latest_values(index):
            t = df.index[index]
            bar_close = close.iloc[index]

            recent_daily = daily_df.loc[:t]
            if len(recent_daily) < 200:
                return None

            sma20_val = sma20.loc[:t].iloc[-1]
            sma200_val = sma200.loc[:t].iloc[-1]
            rsi_val = rsi.iloc[index]
            rsi_ma_val = rsi_ma.iloc[index]

            return {
                "bar_close": bar_close,
                "sma20": sma20_val,
                "sma200": sma200_val,
                "rsi": rsi_val,
                "rsi_ma": rsi_ma_val,
            }

        latest = get_latest_values(-1)
        prev = get_latest_values(-2)
        if not latest or not prev:
            return {"status": None, "delta": None}

        # Signal classification
        def classify(entry_vals):
            if (
                entry_vals["bar_close"] > entry_vals["sma200"]
                and entry_vals["bar_close"] > entry_vals["sma20"]
                and entry_vals["rsi"] > entry_vals["rsi_ma"]
            ):
                return "BUY"
            else:
                return "SELL"

        curr_signal = classify(latest)
        prev_signal = classify(prev)

        # --- Base delta logic (gap-based)
        if curr_signal != prev_signal and prev_signal is not None:
            delta = "crossed"
        elif curr_signal == "BUY":
            curr_gap = latest["bar_close"] - latest["sma20"] + latest["rsi"] - latest["rsi_ma"]
            prev_gap = prev["bar_close"] - prev["sma20"] + prev["rsi"] - prev["rsi_ma"]
            delta = "strengthening" if curr_gap > prev_gap else "weakening"
        elif curr_signal == "SELL":
            curr_gap = latest["rsi_ma"] - latest["rsi"]
            prev_gap = prev["rsi_ma"] - prev["rsi"]
            delta = "strengthening" if curr_gap > prev_gap else "weakening"
        else:
            return {"status": curr_signal, "delta": None}

        # --- Integrate Supertrend direction into delta
        st_df = compute_supertrend_lines(df)
        supertrend_now = st_df["Trend"].iloc[-1]  # 1 = uptrend, -1 = downtrend

        if curr_signal == "BUY":
            if supertrend_now == 1 and delta == "weakening":
                delta = "neutral"
            elif supertrend_now == -1 and delta == "strengthening":
                delta = "weakening"
        elif curr_signal == "SELL":
            if supertrend_now == -1 and delta == "weakening":
                delta = "neutral"
            elif supertrend_now == 1 and delta == "strengthening":
                delta = "weakening"

        return {"status": curr_signal, "delta": delta}



    def get_northstar_signals(self, timeframe: str = "daily") -> list[dict]:
        """
        Implements the NorthStar trend-following strategy:
        Entry: Price > 12MA and Price > 36MA
        Exit: Price < 12MA
        No entry if Price < 36MA.
        Returns markers: {time, price, side, label}
        """
        # Select OHLC dataframe for requested timeframe
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")

        df = df.copy().dropna()
        
        if len(df) < 40:
            return []  # not enough data

        close = df['Close']
        ma12 = close.rolling(window=12).mean()
        ma36 = close.rolling(window=36).mean()

        in_position = False
        markers = []

        for idx in range(len(df)):
            t = df.index[idx]
            price = close.iloc[idx]
            curr_ma12 = ma12.iloc[idx]
            curr_ma36 = ma36.iloc[idx]

            # --- Entry Condition ---
            enter_cond = (
                price > curr_ma12
                and price > curr_ma36
                and not in_position
            )
            # --- Do not enter if price is below 36MA ---
            do_not_enter = price < curr_ma36

            # --- Exit Condition ---
            exit_cond = (
                price < curr_ma12
                and in_position
            )

            if enter_cond and not do_not_enter:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "buy",
                    "label": "ENTRY",
                })
                in_position = True

            elif exit_cond:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "sell",
                    "label": "EXIT",
                })
                in_position = False


        return markers
    
    def get_northstar_status_and_strength(self, timeframe: str = "weekly") -> dict:
        """
        Returns the latest status ('BUY' or 'SELL') and trend delta
        ('strengthening' / 'weakening' / 'crossed'), adjusted with Supertrend trend.
        """
        df = {
            "daily": self.df,
            "weekly": self.weekly_df,
            "monthly": self.monthly_df
        }[timeframe].copy()

        if len(df) < 37:
            return {"status": None, "delta": None}

        close = df["Close"]
        ma12 = close.rolling(12).mean()
        ma36 = close.rolling(36).mean()

        latest_idx = -1
        prev_idx = -2

        latest_price = close.iloc[latest_idx]
        prev_price = close.iloc[prev_idx]

        latest_ma12 = ma12.iloc[latest_idx]
        prev_ma12 = ma12.iloc[prev_idx]

        latest_ma36 = ma36.iloc[latest_idx]
        prev_ma36 = ma36.iloc[prev_idx]

        # Determine current and previous signals
        def get_signal(price, ma12, ma36):
            return "BUY" if price > ma12 and price > ma36 else "SELL"

        curr_sig = get_signal(latest_price, latest_ma12, latest_ma36)
        prev_sig = get_signal(prev_price, prev_ma12, prev_ma36)

        print(f"curr_sig is: {curr_sig}")
        print(f"prev_sig is: {prev_sig}")

        # Base delta logic
        if curr_sig != prev_sig and (prev_sig is not None):
            delta = "crossed"
        elif curr_sig == "BUY":
            delta = "strengthening" if latest_price - latest_ma12 > prev_price - prev_ma12 else "weakening"
        elif curr_sig == "SELL":
            delta = "strengthening" if prev_ma12 - latest_price > prev_ma12 - prev_price else "weakening"
        else:
            delta = "neutral"

        # Supertrend-enhanced delta adjustment
        st_df = compute_supertrend_lines(df)
        supertrend_now = st_df["Trend"].iloc[-1]  # 1 for uptrend, -1 for downtrend

        if curr_sig == "BUY":
            if supertrend_now == 1 and delta == "weakening":
                delta = "neutral"
            elif supertrend_now == -1 and delta == "strengthening":
                delta = "weakening"
        elif curr_sig == "SELL":
            if supertrend_now == -1 and delta == "weakening":
                delta = "neutral"
            elif supertrend_now == 1 and delta == "strengthening":
                delta = "weakening"

        return {"status": curr_sig, "delta": delta}



    def get_stclairlongterm_signals(self, timeframe: str = "weekly") -> list[dict]:
        """
        Implements the StClairLongTerm strategy.

        Entry: At least 2 of 3 signals True:
            1. Weekly Supertrend "Buy"
            2. Price above the weekly Ichimoku cloud
            3. Monthly RSI > Monthly RSI MA (using the most recent monthly value)

        Exit: At least 2 of 3 signals True:
            1. Weekly Supertrend "Sell"
            2. Price below the weekly Ichimoku cloud
            3. Monthly RSI < Monthly RSI MA (using the most recent monthly value)

        Returns markers in the form {time, price, side, label}
        """
        if timeframe != "weekly":
            raise HTTPException(status_code=400, detail="stclairlongterm is only available for weekly timeframe.")
        df_weekly = self.weekly_df
        if len(df_weekly) < 40:
            return []

        close = df_weekly["Close"]

        # --- Supertrend ---
        df_st = compute_supertrend_lines(df_weekly)
        st_signal = df_st["Signal"]  # "Buy" or "Sell", already weekly indexed

        # --- Ichimoku Cloud ---
        _, _, span_a, span_b = compute_ichimoku_lines(df_weekly)
        upper_cloud = np.maximum(span_a, span_b)
        lower_cloud = np.minimum(span_a, span_b)
        ichimoku_status = pd.Series(
            np.where(close > upper_cloud, "Above",
                np.where(close < lower_cloud, "Below", "Inside")),
            index=close.index
        )

        # --- Monthly RSI MA (use last value up to each week) ---
        monthly_close = self.monthly_df["Close"]
        monthly_rsi = compute_wilder_rsi(monthly_close, 14)
        monthly_rsi_ma = monthly_rsi.rolling(window=14).mean()

       # Reindex both to weekly
        monthly_rsi_for_week = monthly_rsi.reindex(df_weekly.index, method="ffill")
        monthly_rsi_ma_for_week = monthly_rsi_ma.reindex(df_weekly.index, method="ffill")

        # --- Iterate and detect signals ---
        markers = []
        in_position = False

        for idx in range(len(df_weekly)):
            t = df_weekly.index[idx]
            price = close.iloc[idx]
            signals_entry = 0
            signals_exit = 0

            # --- Supertrend checks commented out
            if st_signal.iloc[idx] == "Buy":
                signals_entry += 1
            if st_signal.iloc[idx] == "Sell":
                signals_exit += 1

            # Ichimoku
            if ichimoku_status.iloc[idx] == "Above":
                signals_entry += 1
            if ichimoku_status.iloc[idx] == "Below":
                signals_exit += 1

            # RSI vs monthly RSI MA
            rsi_val = monthly_rsi_for_week.iloc[idx]
            rsi_ma_val = monthly_rsi_ma_for_week.iloc[idx]
            if pd.notna(rsi_val) and pd.notna(rsi_ma_val):
                if rsi_val > rsi_ma_val:
                    signals_entry += 1
                if rsi_val < rsi_ma_val:
                    signals_exit += 1


            # --- Entry: require at least two confirming signals ---
            if not in_position and signals_entry >= 2:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "buy",
                    "label": "ENTRY"
                })
                in_position = True
           # --- Exit: require at least two confirming signals ---
            elif in_position and signals_exit >= 2:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "sell",
                    "label": "EXIT"
                })
                in_position = False

        return markers
    
    def get_stclairlongterm_status_and_strength(self) -> dict:
        """
        Returns the most recent StClairLongTerm signal and whether it is
        strengthening, weakening, or has crossed.
        """
        df_weekly = self.weekly_df
        if len(df_weekly) < 40:
            return {"status": None, "delta": None}

        close = df_weekly["Close"]

        # --- Supertrend ---
        df_st = compute_supertrend_lines(df_weekly)
        st_signal = df_st["Signal"]

        # --- Ichimoku ---
        _, _, span_a, span_b = compute_ichimoku_lines(df_weekly)
        upper_cloud = np.maximum(span_a, span_b)
        lower_cloud = np.minimum(span_a, span_b)
        ichimoku_status = pd.Series(
            np.where(close > upper_cloud, "Above",
            np.where(close < lower_cloud, "Below", "Inside")),
            index=close.index
        )

        # --- Monthly RSI and MA ---
        monthly_rsi = compute_wilder_rsi(self.monthly_df["Close"], 14)
        monthly_rsi_ma = monthly_rsi.rolling(14).mean()
        monthly_rsi_for_week = monthly_rsi.reindex(df_weekly.index, method="ffill")
        monthly_rsi_ma_for_week = monthly_rsi_ma.reindex(df_weekly.index, method="ffill")

        # --- Helper to calculate signal scores for a given index ---
        def get_scores(idx):
            entry_score = 0
            exit_score = 0

            # Supertrend (weighted more heavily)
            st = st_signal.iloc[idx]
            if st == "Buy":
                entry_score += 2
            elif st == "Sell":
                exit_score += 2

            # Ichimoku
            ich = ichimoku_status.iloc[idx]
            if ich == "Above":
                entry_score += 1
            elif ich == "Below":
                exit_score += 1

            # Monthly RSI
            rsi_val = monthly_rsi_for_week.iloc[idx]
            rsi_ma_val = monthly_rsi_ma_for_week.iloc[idx]
            if pd.notna(rsi_val) and pd.notna(rsi_ma_val):
                if rsi_val > rsi_ma_val:
                    entry_score += 1
                elif rsi_val < rsi_ma_val:
                    exit_score += 1

            return entry_score, exit_score


        idx_now = -1
        idx_prev = -2

        e_now, x_now = get_scores(idx_now)
        e_prev, x_prev = get_scores(idx_prev)

        # Classify signal
        def classify(entry_score, exit_score):
            if entry_score >= 2:
                return "BUY"
            elif exit_score >= 2:
                return "SELL"

        curr = classify(e_now, x_now)
        prev = classify(e_prev, x_prev)

         # --- Handle undefined signal ---
        if curr is None:
            return {"status": None, "delta": None}

        # --- Determine delta ---
        if curr != prev and prev is not None:
            delta = "crossed"
        elif curr == "BUY":
            delta = "strengthening" if e_now > e_prev else "weakening"
        elif curr == "SELL":
            delta = "strengthening" if x_now > x_prev else "weakening"
        else:
            return {"status": curr, "delta": None}

        return {"status": curr, "delta": delta}


    def backtest_signal_markers(self, markers: list[dict]) -> dict:
        """
        Given a list of {time, price, side, label}, pairs ENTRY/EXIT and computes stats.
        Returns:
            - trades: list of {entry_time, entry_price, exit_time, exit_price, profit, profit_pct}
            - stats: number of trades, profitable trades, total profit, total loss, net profit
        """
        trades = []
        entry = None

        for m in markers:
            if m['side'] == 'buy':
                entry = m
            elif m['side'] == 'sell' and entry is not None:
                profit = m['price'] - entry['price']
                profit_pct = (profit / entry['price']) * 100 if entry['price'] != 0 else 0
                trades.append({
                    "entry_time": entry['time'],
                    "entry_price": entry['price'],
                    "exit_time": m['time'],
                    "exit_price": m['price'],
                    "profit": profit,
                    "profit_pct": profit_pct,
                })
                entry = None  # reset for next trade

        num_trades = len(trades)
        profitable_trades = sum(1 for t in trades if t['profit'] > 0)
        total_profit_pct = sum(t['profit_pct'] for t in trades if t['profit_pct'] > 0)
        total_loss_pct = sum(t['profit_pct'] for t in trades if t['profit_pct'] < 0)
        net_profit_pct = total_profit_pct + total_loss_pct

        return {
            "num_trades": num_trades,
            "profitable_trades": profitable_trades,
            "total_profit_pct": total_profit_pct,
            "total_loss_pct": total_loss_pct,
            "net_profit_pct": net_profit_pct,
            "trades": trades,
        }

    
    def get_mace_40w_signals(self) -> list[dict]:
        df_weekly = self.weekly_df
        if len(df_weekly) < 60:
            print("Not enough data (less than 60 bars).")
            return []

        close = df_weekly['Close']
        s = close.rolling(4).mean()
        m = close.rolling(13).mean()
        l = close.rolling(26).mean()
        mace_signals = classify_mace_signal(s, m, l)

        ma_40 = close.rolling(40).mean()
        slope = ma_40.diff()
        fortyw_signals = classify_40w_status(close, ma_40, slope)

        markers = []
        in_position = False

        for idx in range(len(df_weekly)):
            if idx < 41:
                continue

            date = df_weekly.index[idx]

            mace_now = mace_signals.iloc[idx]
            mace_prev = mace_signals.iloc[idx - 1]

            status_now = fortyw_signals.iloc[idx]
            status_prev = fortyw_signals.iloc[idx - 1]
            '''
            first draft: not bad results but can be
            entry_cond = (
                ((mace_now in ['U2', 'U3']) or
                (status_now == "Above Rising MA ++")) and
                ((mace_prev in ['U1', 'U2', 'D1']) or
                (status_prev in ["Above Rising MA ++", "Below Rising MA -+"]))
            )
            '''
            entry_cond = (
                ((mace_now in ['U2', 'U3']) or (status_now == "Above Rising MA ++")) and
                ((mace_prev not in ['D2', 'D3']) and (status_prev != "Below Falling MA --"))
            )


            exit_cond = (
                (mace_now not in ['U2', 'U3']) or     #change to and for a more patient trade
                (status_now != "Above Rising MA ++")
            )

            price = close.iloc[idx]

            if entry_cond and not in_position:
                print(f"--> Entry triggered on {date.date()} at price {price:.2f}")
                markers.append({
                    "time": int(pd.Timestamp(date).timestamp()),
                    "price": price,
                    "side": "buy",
                    "label": "ENTRY"
                })
                in_position = True

            elif exit_cond and in_position:
                print(f"--> Exit triggered on {date.date()} at price {price:.2f}")
                markers.append({
                    "time": int(pd.Timestamp(date).timestamp()),
                    "price": price,
                    "side": "sell",
                    "label": "EXIT"
                })
                in_position = False

        print("Final markers:", markers)
        return markers
    
    def get_mace_40w_status_and_strength(self) -> dict:
        """
        Returns the latest MACE+40W signal and whether it's strengthening or weakening 
        based on combined MACE, 40W, and Supertrend ranking.
        """
        df = self.weekly_df
        if len(df) < 60:
            return {"status": None, "delta": None}

        close = df["Close"]
        s = close.rolling(4).mean()
        m = close.rolling(13).mean()
        l = close.rolling(26).mean()
        mace_signals = classify_mace_signal(s, m, l)

        ma_40 = close.rolling(40).mean()
        slope = ma_40.diff()
        fortyw_signals = classify_40w_status(close, ma_40, slope)

        df_st = compute_supertrend_lines(df)
        st_signal = df_st["Signal"]

        idx_now = -1
        idx_prev = -2

        mace_now = mace_signals.iloc[idx_now]
        mace_prev = mace_signals.iloc[idx_prev]
        status_now = fortyw_signals.iloc[idx_now]
        status_prev = fortyw_signals.iloc[idx_prev]
        st_now = st_signal.iloc[idx_now]
        st_prev = st_signal.iloc[idx_prev]

        mace_rank = {"U3": 6, "U2": 5, "U1": 4, "D1": 3, "D2": 2, "D3": 1}
        fortyw_rank = {
            "Above Rising MA ++": 4,
            "Above Falling MA +-": 3,
            "Below Rising MA -+": 2,
            "Below Falling MA --": 1,
        }
        st_rank = {"Buy": 2, "Sell": 1}

        # Use rank dictionaries
        mace_now_rank = mace_rank.get(mace_now, 0)
        mace_prev_rank = mace_rank.get(mace_prev, 0)
        fw_now_rank = fortyw_rank.get(status_now, 0)
        fw_prev_rank = fortyw_rank.get(status_prev, 0)
        st_now_rank = st_rank.get(st_now, 0)
        st_prev_rank = st_rank.get(st_prev, 0)

        # Determine signal direction
        is_bullish = mace_now in ["U1", "U2", "U3"] or status_now in [
            "Above Rising MA ++", "Above Falling MA +-"
        ] or st_now == "Buy"

        is_bearish = mace_now in ["D1", "D2", "D3"] or status_now in [
            "Below Rising MA -+", "Below Falling MA --"
        ] or st_now == "Sell"

        if is_bullish:
            status = "BUY"
        elif is_bearish:
            status = "SELL"
        else:
            return {"status": None, "delta": None}

        # Equal-weighted composite score
        score_now = (mace_now_rank + fw_now_rank + st_now_rank) / 3
        score_prev = (mace_prev_rank + fw_prev_rank + st_prev_rank) / 3

        # Determine delta
        if status == "BUY":
            delta = "strengthening" if score_now > score_prev else "weakening"
        elif status == "SELL":
            delta = "strengthening" if score_now < score_prev else "weakening"
        else:
            delta = "neutral"

        return {"status": status, "delta": delta}



    
    
    def get_demarker_signals(self, timeframe: str = "weekly", period: int = 14) -> list[dict]:
        """
        Generate buy/sell signals based on the DeMarker indicator.
        Entry: DeMarker crosses above 0.3 (oversold to rising = Buy)
        Exit:  DeMarker crosses below 0.7 (overbought to falling = Sell)
        """
        # 1. Get data
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")
        if len(df) < period + 5:
            return []

        high = df["High"]
        low = df["Low"]
        close = df["Close"]

        dem = compute_demarker(close, high, low, period=period)

        markers = []
        in_position = False

        # Signals: Buy when DeM crosses above 0.3 from below. Sell when DeM crosses below 0.7 from above.
        for idx in range(1, len(df)):
            t = df.index[idx]
            price = close.iloc[idx]
            dem_prev = dem.iloc[idx - 1]
            dem_now = dem.iloc[idx]

            # Entry: DeM crosses above 0.3
            entry_cond = (dem_prev < 0.3) and (dem_now >= 0.3)
            # Exit: DeM crosses below 0.7
            exit_cond = (dem_prev > 0.7) and (dem_now <= 0.7)

            if entry_cond and not in_position:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "buy",
                    "label": "ENTRY"
                })
                in_position = True

            elif exit_cond and in_position:
                markers.append({
                    "time": int(pd.Timestamp(t).timestamp()),
                    "price": price,
                    "side": "sell",
                    "label": "EXIT"
                })
                in_position = False

        return markers
    
    def get_demarker_status_and_strength(self, timeframe: str = "weekly", period: int = 14) -> dict:
        """
        Returns the most recent DeMarker signal (BUY/SELL/HOLD) and whether the signal is strengthening,
        weakening, or has just crossed.
        """
        if timeframe == "daily":
            df = self.df
        elif timeframe == "weekly":
            df = self.weekly_df
        elif timeframe == "monthly":
            df = self.monthly_df
        else:
            raise ValueError(f"Invalid timeframe: {timeframe}")

        if len(df) < period + 5:
            return {"status": None, "delta": None}

        high = df["High"]
        low = df["Low"]
        close = df["Close"]

        dem = compute_demarker(close, high, low, period=period)

        # Use the last two bars to detect crossovers and momentum
        idx_now = -1
        idx_prev = -2

        dem_now = dem.iloc[idx_now]
        dem_prev = dem.iloc[idx_prev]

        if pd.isna(dem_now) or pd.isna(dem_prev):
            return {"status": None, "delta": None}

         # Determine signal and delta
        if dem_prev < 0.3 and dem_now >= 0.3:
            return {"status": "BUY", "delta": "crossed"}
        elif dem_prev > 0.7 and dem_now <= 0.7:
            return {"status": "SELL", "delta": "crossed"}
        elif dem_now <= 0.7:  # Default to BUY zone (0.3 to 0.7)
            delta = "strengthening" if dem_now > dem_prev else "weakening"
            return {"status": "BUY", "delta": delta}
        else:  # dem_now > 0.7
            delta = "strengthening" if dem_now < dem_prev else "weakening"
            return {"status": "SELL", "delta": delta}

