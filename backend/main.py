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
            current=self._safe_value(df_st['Signal'], -1),
            seven_days_ago=self._safe_value(df_st['Signal'], -2),
            fourteen_days_ago=self._safe_value(df_st['Signal'], -3),
            twentyone_days_ago=self._safe_value(df_st['Signal'], -4),
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
            current=self._safe_value(classification, -1),
            seven_days_ago=self._safe_value(classification, -2),
            fourteen_days_ago=self._safe_value(classification, -3),
            twentyone_days_ago=self._safe_value(classification, -4),
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
