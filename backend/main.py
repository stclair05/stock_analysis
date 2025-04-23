from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np
import asyncio

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class StockAnalyser:
    def __init__(self, symbol: str):
        self.symbol = symbol.upper().strip()
        self.df = self._download_data()

    def _download_data(self) -> pd.DataFrame:
        df = yf.download(self.symbol, period='10y', interval='1d', auto_adjust=False)
        if df.empty:
            raise HTTPException(status_code=400, detail="Stock symbol not found or data unavailable.")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)
        return df

    def _safe_value(self, series: pd.Series, idx: int) -> float | str | None:
        if idx >= len(series) or idx < -len(series):
            return "in progress"
        value = series.iloc[idx]
        if isinstance(value, pd.Series):
            value = value.squeeze()
        if pd.isna(value):
            return "in progress"
        return round(float(value), 2) if isinstance(value, (int, float)) else str(value)

    def get_current_price(self) -> float | None:
        return self._safe_value(self.df['Close'], -1)

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
            current=self._safe_value(position, -1),
            seven_days_ago=self._safe_value(position, -2),
            fourteen_days_ago=self._safe_value(position, -3),
            twentyone_days_ago=self._safe_value(position, -4),
        )

    def super_trend(self) -> TimeSeriesMetric:
        df = self.df.last('600D')
        df_weekly = df.resample('W-FRI').agg({'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last'}).dropna()
        hl2 = (df_weekly['High'] + df_weekly['Low']) / 2
        atr = (df_weekly['High'].combine(df_weekly['Low'], max) - df_weekly['High'].combine(df_weekly['Low'], min)).rolling(10).mean()
        upper = hl2 + 3 * atr
        lower = hl2 - 3 * atr
        signal = pd.Series(index=df_weekly.index, dtype='object')
        in_uptrend = True
        for i in range(1, len(df_weekly)):
            if df_weekly['Close'].iloc[i] > upper.iloc[i-1]:
                in_uptrend = True
            elif df_weekly['Close'].iloc[i] < lower.iloc[i-1]:
                in_uptrend = False
            signal.iloc[i] = "Buy" if in_uptrend else "Sell"
        return TimeSeriesMetric(
            current=self._safe_value(signal, -1),
            seven_days_ago=self._safe_value(signal, -2),
            fourteen_days_ago=self._safe_value(signal, -3),
            twentyone_days_ago=self._safe_value(signal, -4),
        )

    def adx(self) -> TimeSeriesMetric:
        df = self.df.last('600D')
        df_weekly = df.resample('W-FRI').agg({'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last'}).dropna()
        plus_dm = (df_weekly['High'].diff().where(lambda x: x > df_weekly['Low'].diff())
                   .where(lambda x: x > 0, 0))
        minus_dm = (df_weekly['Low'].diff().where(lambda x: x > df_weekly['High'].diff())
                    .where(lambda x: x > 0, 0))
        tr = pd.concat([
            df_weekly['High'] - df_weekly['Low'],
            abs(df_weekly['High'] - df_weekly['Close'].shift()),
            abs(df_weekly['Low'] - df_weekly['Close'].shift())
        ], axis=1).max(axis=1)
        atr = tr.rolling(14).mean()
        plus_di = 100 * plus_dm.rolling(14).sum() / atr
        minus_di = 100 * minus_dm.rolling(14).sum() / atr
        dx = abs(plus_di - minus_di) / (plus_di + minus_di) * 100
        adx = dx.rolling(14).mean()
        levels = adx.map(lambda x: "Weak" if x < 20 else "Moderate" if x <= 40 else "Strong")
        return TimeSeriesMetric(
            current=self._safe_value(levels, -1),
            seven_days_ago=self._safe_value(levels, -2),
            fourteen_days_ago=self._safe_value(levels, -3),
            twentyone_days_ago=self._safe_value(levels, -4),
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
            current=self._safe_value(signal, -1),
            seven_days_ago=self._safe_value(signal, -2),
            fourteen_days_ago=self._safe_value(signal, -3),
            twentyone_days_ago=self._safe_value(signal, -4),
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
            current=self._safe_value(signal, -1),
            seven_days_ago=self._safe_value(signal, -2),
            fourteen_days_ago=self._safe_value(signal, -3),
            twentyone_days_ago=self._safe_value(signal, -4),
        )

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
        symbol = symbol.upper()
        if symbol in ["DJI", "GSPC", "IXIC"]:
            symbol = f"^{symbol}"

        hist_df = yf.download(tickers=symbol, period='1d', interval='1m', progress=False)
        if hist_df.empty:
            await websocket.send_json({"error": f"No data found for symbol {symbol}"})
            await websocket.close()
            return

        history = [
            {"time": int(ts.timestamp()), "value": round(float(row["Close"]), 2)}
            for ts, row in hist_df.iterrows()
        ]
        await websocket.send_json({"history": history})

        last_ts = hist_df.index[-1]

        while True:
            new_df = yf.download(tickers=symbol, period='1d', interval='1m', progress=False)
            new_rows = new_df[new_df.index > last_ts]
            for ts, row in new_rows.iterrows():
                await websocket.send_json({
                    "live": {
                        "time": int(ts.timestamp()),
                        "value": round(float(row['Close']), 2)
                    }
                })
                last_ts = ts
            await asyncio.sleep(5)

    except WebSocketDisconnect:
        print(f"Client disconnected for {symbol}")
    except Exception as e:
        print(f"WebSocket error for {symbol}: {e}")
        await websocket.close()
