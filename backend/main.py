from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np
import asyncio

app = FastAPI()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---

class TimeSeriesMetric(BaseModel):
    current: float | str | None
    seven_days_ago: float | str | None
    fourteen_days_ago: float | str | None
    twentyone_days_ago: float | str | None

class StockAnalysisResponse(BaseModel):
    current_price: float | None
    three_year_ma: TimeSeriesMetric
    two_hundred_dma: TimeSeriesMetric
    weekly_ichimoku: TimeSeriesMetric
    super_trend: TimeSeriesMetric
    adx: TimeSeriesMetric
    mace: TimeSeriesMetric
    forty_week_status: TimeSeriesMetric

class StockRequest(BaseModel):
    symbol: str

# --- Stock Analyser Class ---

class StockAnalyser:
    def __init__(self, symbol: str):
        self.symbol = symbol.upper().strip()
        self.df = self._download_data()

    def _download_data(self) -> pd.DataFrame:
        df = yf.download(self.symbol, period='5y', interval='1d', auto_adjust=False)
        if df.empty:
            raise HTTPException(status_code=400, detail="Stock symbol not found or data unavailable.")

        # Flatten MultiIndex if exists
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        return df

       

    def _safe_value(self, series: pd.Series, idx: int) -> float | str | None:
        if idx >= len(series) or idx < -len(series):
            return None
        value = series.iloc[idx]
        if isinstance(value, pd.Series):
            value = value.squeeze()
        if pd.isna(value):
            return None
        return round(float(value), 2) if isinstance(value, (int, float)) else str(value)

    def get_current_price(self) -> float | None:
        latest_close = self._safe_value(self.df['Close'], -1)
        return latest_close

    def calculate_3year_ma(self) -> TimeSeriesMetric:
        monthly_close = self.df['Close'].resample('ME').last()
        monthly_ma = monthly_close.rolling(window=36).mean()
        return TimeSeriesMetric(
            current=self._safe_value(monthly_ma, -1),
            seven_days_ago=self._safe_value(monthly_ma, -2),
            fourteen_days_ago=self._safe_value(monthly_ma, -3),
            twentyone_days_ago=self._safe_value(monthly_ma, -4),
        )

    def calculate_200dma(self) -> TimeSeriesMetric:
        daily_ma = self.df['Close'].rolling(window=200).mean()
        return TimeSeriesMetric(
            current=self._safe_value(daily_ma, -1),
            seven_days_ago=self._safe_value(daily_ma, -7),
            fourteen_days_ago=self._safe_value(daily_ma, -14),
            twentyone_days_ago=self._safe_value(daily_ma, -21),
        )
  
  
    def ichimoku_cloud(self) -> TimeSeriesMetric:
        df = self.df

        # 🧠 Slice to recent 2 years (or 90 weeks ≈ 450 trading days)
        df = df.last('450D')  # last 450 calendar days — approx 90 weeks

        # Flatten if needed
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        df_weekly = df.resample('W-FRI').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last'
        }).dropna()

        if df_weekly.empty:
            raise HTTPException(status_code=400, detail="Not enough weekly data for Ichimoku calculation.")

        # -- Ichimoku Calculations (same as before) --
        nine_high = df_weekly['High'].rolling(window=9).max()
        nine_low = df_weekly['Low'].rolling(window=9).min()
        tenkan_sen = (nine_high + nine_low) / 2

        twenty_six_high = df_weekly['High'].rolling(window=26).max()
        twenty_six_low = df_weekly['Low'].rolling(window=26).min()
        kijun_sen = (twenty_six_high + twenty_six_low) / 2

        senkou_span_a = ((tenkan_sen + kijun_sen) / 2).shift(26)
        fifty_two_high = df_weekly['High'].rolling(window=52).max()
        fifty_two_low = df_weekly['Low'].rolling(window=52).min()
        senkou_span_b = ((fifty_two_high + fifty_two_low) / 2).shift(26)

        df_weekly['SpanA'] = senkou_span_a
        df_weekly['SpanB'] = senkou_span_b

        # -- Fast vectorized classification --
        upper = df_weekly[['SpanA', 'SpanB']].max(axis=1)
        lower = df_weekly[['SpanA', 'SpanB']].min(axis=1)
        close = df_weekly['Close']

        conditions = [close > upper, close < lower]
        choices = ['Above', 'Below']
        df_weekly['CloudPosition'] = pd.Series(
            np.select(conditions, choices, default='Inside'),
            index=df_weekly.index
        )

        cloud_series = df_weekly['CloudPosition'].dropna()

        return TimeSeriesMetric(
            current=self._safe_value(cloud_series, -1),
            seven_days_ago=self._safe_value(cloud_series, -2),
            fourteen_days_ago=self._safe_value(cloud_series, -3),
            twentyone_days_ago=self._safe_value(cloud_series, -4),
        )

    
    

    # --- Placeholder methods for others ---
    def super_trend(self) -> TimeSeriesMetric:
        df = self.df

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        df = df.last('450D')  # Same slicing idea to be efficient

        df_weekly = df.resample('W-FRI').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last'
        }).dropna()

        if df_weekly.empty:
            raise HTTPException(status_code=400, detail="Not enough data for SuperTrend calculation.")
        
        def calculate_supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> pd.Series:
            hl2 = (df['High'] + df['Low']) / 2
            atr = df['High'].combine(df['Low'], max) - df['High'].combine(df['Low'], min)
            atr = atr.rolling(window=period, min_periods=1).mean()

            upperband = hl2 + (multiplier * atr)
            lowerband = hl2 - (multiplier * atr)

            supertrend = pd.Series(index=df.index, dtype='object')
            in_uptrend = True

            for current in range(1, len(df.index)):
                previous = current - 1

                if df['Close'].iloc[current] > upperband.iloc[previous]:
                    in_uptrend = True
                elif df['Close'].iloc[current] < lowerband.iloc[previous]:
                    in_uptrend = False

                if in_uptrend:
                    supertrend.iloc[current] = "Buy"
                else:
                    supertrend.iloc[current] = "Sell"

            return supertrend

        # Calculate SuperTrend
        supertrend_signal = calculate_supertrend(df_weekly)

        supertrend_signal = supertrend_signal.dropna()

        return TimeSeriesMetric(
            current=self._safe_value(supertrend_signal, -1),
            seven_days_ago=self._safe_value(supertrend_signal, -2),
            fourteen_days_ago=self._safe_value(supertrend_signal, -3),
            twentyone_days_ago=self._safe_value(supertrend_signal, -4),
        )

    

    def adx(self) -> TimeSeriesMetric:
        df = self.df

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        df = df.last('450D')  # Recent data slice

        df_weekly = df.resample('W-FRI').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last'
        }).dropna()

        if df_weekly.empty:
            raise HTTPException(status_code=400, detail="Not enough data for ADX calculation.")

        def calculate_adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
            delta_high = df['High'].diff()
            delta_low = df['Low'].diff()

            plus_dm = (delta_high.where((delta_high > delta_low) & (delta_high > 0), 0.0))
            minus_dm = (delta_low.where((delta_low > delta_high) & (delta_low > 0), 0.0))

            tr1 = df['High'] - df['Low']
            tr2 = abs(df['High'] - df['Close'].shift())
            tr3 = abs(df['Low'] - df['Close'].shift())
            tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

            atr = tr.rolling(window=period, min_periods=1).mean()

            plus_di = 100 * (plus_dm.rolling(window=period, min_periods=1).sum() / atr)
            minus_di = 100 * (minus_dm.rolling(window=period, min_periods=1).sum() / atr)

            dx = (abs(plus_di - minus_di) / (plus_di + minus_di)) * 100
            adx = dx.rolling(window=period, min_periods=1).mean()

            return adx

        adx_series = calculate_adx(df_weekly)
        adx_series = adx_series.dropna()

        # Classify into Weak, Moderate, Strong
        def classify_adx(value):
            if value < 20:
                return "Weak"
            elif value <= 40:
                return "Moderate"
            else:
                return "Strong"

        classified_adx = adx_series.map(classify_adx)

        return TimeSeriesMetric(
            current=self._safe_value(classified_adx, -1),
            seven_days_ago=self._safe_value(classified_adx, -2),
            fourteen_days_ago=self._safe_value(classified_adx, -3),
            twentyone_days_ago=self._safe_value(classified_adx, -4),
        )


    def mace(self) -> TimeSeriesMetric:
        df = self.df.copy()

        # Flatten MultiIndex if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        # Slice to ~450 days for sufficient weekly data
        df = df.last('450D')

        # Weekly resampling
        df_weekly = df.resample('W-FRI').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last'
        }).dropna()

        if df_weekly.empty:
            raise HTTPException(status_code=400, detail="Not enough data for MACE calculation.")

        # Compute short (S), medium (M), long (L) weekly MAs
        S = df_weekly['Close'].rolling(window=4).mean()
        M = df_weekly['Close'].rolling(window=13).mean()
        L = df_weekly['Close'].rolling(window=26).mean()

        def classify_mace(s, m, l):
            if pd.isna(s) or pd.isna(m) or pd.isna(l):
                return None
            if l > s > m:
                return "U1"
            elif s > l > m:
                return "U2"
            elif s > m > l:
                return "U3"
            elif m > s > l:
                return "D1"
            elif m > l > s:
                return "D2"
            elif l > m > s:
                return "D3"
            return "Unclassified"

        # Generate classification series
        mace_series = pd.Series(index=df_weekly.index, dtype='object')
        for i in range(len(df_weekly)):
            mace_series.iloc[i] = classify_mace(S.iloc[i], M.iloc[i], L.iloc[i])

        mace_series = mace_series.dropna()

        return TimeSeriesMetric(
            current=self._safe_value(mace_series, -1),
            seven_days_ago=self._safe_value(mace_series, -2),
            fourteen_days_ago=self._safe_value(mace_series, -3),
            twentyone_days_ago=self._safe_value(mace_series, -4),
        )


    def forty_week_status(self) -> TimeSeriesMetric:
        df = self.df.copy()

        # Flatten columns if needed
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        # Keep last ~450 days
        df = df.last('450D')

        # Resample weekly OHLC
        df_weekly = df.resample('W-FRI').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last'
        }).dropna()

        if df_weekly.empty:
            raise HTTPException(status_code=400, detail="Not enough weekly data for 40-week MA status.")

        # Calculate 40-week moving average
        ma_40w = df_weekly['Close'].rolling(window=40).mean()
        ma_40w_slope = ma_40w.diff()

        status_series = pd.Series(index=df_weekly.index, dtype='object')

        for i in range(len(df_weekly)):
            price = df_weekly['Close'].iloc[i]
            ma = ma_40w.iloc[i]
            slope = ma_40w_slope.iloc[i]

            if pd.isna(price) or pd.isna(ma) or pd.isna(slope):
                status_series.iloc[i] = None
            elif price > ma:
                status_series.iloc[i] = "Above Rising MA" if slope > 0 else "Above Falling MA"
            else:
                status_series.iloc[i] = "Below Rising MA" if slope > 0 else "Below Falling MA"

        status_series = status_series.dropna()

        return TimeSeriesMetric(
            current=self._safe_value(status_series, -1),
            seven_days_ago=self._safe_value(status_series, -2),
            fourteen_days_ago=self._safe_value(status_series, -3),
            twentyone_days_ago=self._safe_value(status_series, -4),
        )

# --- API Route ---

@app.post("/analyse", response_model=StockAnalysisResponse)
def analyse(stock_request: StockRequest):
    analyser = StockAnalyser(stock_request.symbol)

    return StockAnalysisResponse(
        current_price=analyser.get_current_price(),
        three_year_ma=analyser.calculate_3year_ma(),
        two_hundred_dma=analyser.calculate_200dma(),
        weekly_ichimoku=analyser.ichimoku_cloud(),
        super_trend=analyser.super_trend(),
        adx=analyser.adx(),
        mace=analyser.mace(),
        forty_week_status=analyser.forty_week_status()
    )

@app.websocket("/ws/chart_data/{symbol}")
async def websocket_chart_data(websocket: WebSocket, symbol: str):
    await websocket.accept()
    try:
        # FIRST: send historical 1-day 1-minute candles
        hist_df = yf.download(tickers=symbol, period='1d', interval='1m', progress=False)

        if hist_df.empty:
            await websocket.send_json({"error": f"No data found for symbol {symbol}"})
            await websocket.close()
            return

        # Send historical data
        historical_prices = [
            {
                "time": int(ts.timestamp()),
                "value": round(float(row["Close"]), 2)
            }
            for ts, row in hist_df.iterrows()
        ]
        await websocket.send_json({"history": historical_prices})

        # Store latest timestamp
        last_timestamp = hist_df.index[-1]

        # Live updates every 5 seconds
        while True:
            live_df = yf.download(tickers=symbol, period='1d', interval='1m', progress=False)

            if live_df.empty:
                print(f"Warning: no new data for {symbol}")
                await asyncio.sleep(5)
                continue

            # Find new rows AFTER last sent
            new_rows = live_df[live_df.index > last_timestamp]

            for ts, row in new_rows.iterrows():
                live_data = {
                    "time": int(ts.timestamp()),
                    "value": round(float(row['Close'].item()), 2)
                }
                await websocket.send_json({"live": live_data})
                last_timestamp = ts  # Update last timestamp

            await asyncio.sleep(5)

    except WebSocketDisconnect:
        print(f"Client disconnected for symbol {symbol}")
    except Exception as e:
        print(f"WebSocket error for {symbol}: {e}")
        await websocket.close()


