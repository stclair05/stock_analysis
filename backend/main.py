from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import pandas as pd

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

class StockRequest(BaseModel):
    symbol: str

class StockAnalysisResponse(BaseModel):
    three_year_ma: float | None
    two_hundred_dma: float | None
    ichimoku_cloud: str
    super_trend: str
    adx: int
    mace: str
    forty_week_status: str

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

    def calculate_3year_ma(self) -> float | None:
        monthly_close = self.df['Close'].resample('ME').last()
        monthly_ma = monthly_close.rolling(window=36).mean()
        latest_ma = monthly_ma.iloc[-1]

        if isinstance(latest_ma, (pd.Series, pd.DataFrame)):
            latest_ma = latest_ma.squeeze()

        if pd.isna(latest_ma):
            return None
        return round(float(latest_ma), 2)

    def calculate_200dma(self) -> float | None:
        daily_ma = self.df['Close'].rolling(window=200).mean()
        latest_dma = daily_ma.iloc[-1]

        if isinstance(latest_dma, (pd.Series, pd.DataFrame)):
            latest_dma = latest_dma.squeeze()

        if pd.isna(latest_dma):
            return None
        return round(float(latest_dma), 2)

    # Placeholder methods for indicators
    def ichimoku_cloud(self) -> str:
        return "Green"

    def super_trend(self) -> str:
        return "Bullish"

    def adx(self) -> int:
        return 25

    def mace(self) -> str:
        return "Neutral"

    def forty_week_status(self) -> str:
        return "Above"

# --- API Route ---

@app.post("/analyse", response_model=StockAnalysisResponse)
def analyse(stock_request: StockRequest):
    analyser = StockAnalyser(stock_request.symbol)

    return StockAnalysisResponse(
        three_year_ma=analyser.calculate_3year_ma(),
        two_hundred_dma=analyser.calculate_200dma(),
        ichimoku_cloud=analyser.ichimoku_cloud(),
        super_trend=analyser.super_trend(),
        adx=analyser.adx(),
        mace=analyser.mace(),
        forty_week_status=analyser.forty_week_status()
    )
