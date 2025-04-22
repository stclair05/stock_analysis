from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
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
        df = yf.download(self.symbol, period='5y', interval='1d', auto_adjust=True)
        if df.empty or 'Close' not in df.columns:
            raise HTTPException(status_code=400, detail="Stock symbol not found or data unavailable.")
        return df

    def _safe_value(self, series: pd.Series, idx: int) -> float | None:
        if idx >= len(series) or idx < -len(series):
            return None
        value = series.iloc[idx]

        if isinstance(value, pd.Series):
            value = value.squeeze()

        if pd.isna(value):
            return None

        return round(float(value), 2)

    def get_current_price(self) -> float | None:
        latest_close = self._safe_value(self.df['Close'], -1)
        return latest_close

    def calculate_3year_ma(self) -> TimeSeriesMetric:
        monthly_close = self.df['Close'].resample('M').last()
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

    # Placeholder methods
    def ichimoku_cloud(self) -> TimeSeriesMetric:
        return TimeSeriesMetric(
            current="in progress",
            seven_days_ago="in progress",
            fourteen_days_ago="in progress",
            twentyone_days_ago="in progress",
        )

    def super_trend(self) -> TimeSeriesMetric:
        return TimeSeriesMetric(
            current="in progress",
            seven_days_ago="in progress",
            fourteen_days_ago="in progress",
            twentyone_days_ago="in progress",
        )

    def adx(self) -> TimeSeriesMetric:
        return TimeSeriesMetric(
            current="in progress",
            seven_days_ago="in progress",
            fourteen_days_ago="in progress",
            twentyone_days_ago="in progress",
        )

    def mace(self) -> TimeSeriesMetric:
        return TimeSeriesMetric(
            current="in progress",
            seven_days_ago="in progress",
            fourteen_days_ago="in progress",
            twentyone_days_ago="in progress",
        )

    def forty_week_status(self) -> TimeSeriesMetric:
        return TimeSeriesMetric(
            current="in progress",
            seven_days_ago="in progress",
            fourteen_days_ago="in progress",
            twentyone_days_ago="in progress",
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
        # FIRST: send historical data (last 30 min)
        hist_df = yf.download(tickers=symbol, period='1d', interval='1m', progress=False)
        if not hist_df.empty:
            historical_prices = [
                {
                    "time": int(ts.timestamp()),
                    "value": round(float(row["Close"]), 2)
                }
                for ts, row in hist_df.iterrows()
            ]
            await websocket.send_json({"history": historical_prices})

        # THEN: Start live updates
        while True:
            df = yf.download(tickers=symbol, period='1d', interval='1m', progress=False)
            if not df.empty:
                last_row = df.iloc[-1]
                live_data = {
                    "time": int(last_row.name.timestamp()),
                    "value": round(float(last_row['Close']), 2)
                }
                await websocket.send_json({"live": live_data})

            await asyncio.sleep(5)

    except WebSocketDisconnect:
        print(f"Client disconnected for symbol {symbol}")
