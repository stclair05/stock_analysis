import yfinance as yf
import pandas as pd
import numpy as np
from fastapi import HTTPException
from functools import lru_cache
from functools import cached_property
from .models import TimeSeriesMetric
from aliases import SYMBOL_ALIASES
from .utils import safe_value, detect_rsi_divergence, find_pivots, compute_wilder_rsi, compute_bbwp, compute_ichimoku_lines, compute_supertrend_lines, to_series, classify_adx_trend, classify_mace_signal, classify_40w_status, classify_dma_trend, classify_bbwp_percentile, wilder_smooth, reindex_indicator
from .pricetarget import get_price_targets



class StockAnalyser:
    def __init__(self, symbol: str):
        raw_symbol = symbol.upper().strip()
        self.symbol = SYMBOL_ALIASES.get(raw_symbol, raw_symbol)
        self.df = StockAnalyser.get_price_data(self.symbol)

    def _download_data(self) -> pd.DataFrame:
        df = yf.download(self.symbol, period='20y', interval='1d', auto_adjust=False)
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
    
    @cached_property
    def weekly_df(self) -> pd.DataFrame:
        return self.df.resample("W-FRI").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum" if "Volume" in self.df.columns else "first"
        }).dropna()

    @cached_property
    def monthly_df(self) -> pd.DataFrame:
        return self.df.resample("ME").last().dropna()

    def get_current_price(self) -> float | None:
        return safe_value(self.df['Close'], -1)

    def calculate_3year_ma(self) -> TimeSeriesMetric:
        if len(self.df) < 800:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})
        monthly_close = self.monthly_df["Close"]
        monthly_ma = monthly_close.rolling(window=36).mean()

        return TimeSeriesMetric(
            current=safe_value(monthly_ma, -1),
            seven_days_ago=safe_value(monthly_ma, -2),
            fourteen_days_ago=safe_value(monthly_ma, -3),
            twentyone_days_ago=safe_value(monthly_ma, -4),
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
    
    def mean_reversion_50dma(self) -> TimeSeriesMetric:
        if len(self.df) < 60:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})

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
        if len(self.df) < 220:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})
        
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
        if len(self.df) < 800:
            return TimeSeriesMetric(**{k: "in progress" for k in TimeSeriesMetric.__fields__})
        
        monthly_close = self.monthly_df["Close"]
        ma_3y = monthly_close.rolling(window=36).mean()
        deviation = (monthly_close - ma_3y) / ma_3y * 100

        def classify(dev: float | str | None) -> str | None:
            if dev is None or pd.isna(dev) or dev == "in progress":
                return "in progress"
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
    
    def get_volatility_bbwp(self):
        df_weekly = self.weekly_df
        close = df_weekly["Close"]

        # Match TradingView: BB Length = 13, Percentile Lookback = 252
        bbwp = compute_bbwp(close, length=13, bbwp_window=252)

        # Reindex to full close index to preserve alignment
        bbwp_full = pd.Series(index=close.index, dtype=float)
        bbwp_full.loc[bbwp.index] = bbwp.values

        print(f"✅ [TV Match] BBWP length: {len(bbwp_full.dropna())} of {len(bbwp_full)}")

        return to_series(bbwp_full)

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
            "rsi": self.get_rsi_series(),
            "rsi_ma_14": self.get_rsi_ma_series(),
            "volatility": self.get_volatility_bbwp(),
            **self.get_mean_reversion_deviation_lines(),
        }


    def price_targets(self) -> dict:
        """
        Combines mean reversion targets and Fibonacci extension targets.
        """
        return get_price_targets(self.df, self.symbol)


