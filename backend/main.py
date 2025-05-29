from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from stock_analysis.stock_analyser import StockAnalyser
from stock_analysis.portfolio_analyser import PortfolioAnalyser
from stock_analysis.models import StockRequest, StockAnalysisResponse, ElliottWaveScenariosResponse, FinancialMetrics
from stock_analysis.elliott_wave import calculate_elliott_wave
from stock_analysis.fmp_fundamentals import FMPFundamentals
from stock_analysis.twelve_data_fundamentals import TwelveDataFundamentals
from stock_analysis.utils import compute_sortino_ratio_cached as compute_sortino_ratio, convert_numpy_types
from fastapi.responses import JSONResponse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from time import time
from aliases import SYMBOL_ALIASES
import yfinance as yf
import asyncio
import json
from typing import List 
import boto3
import os
import pandas as pd
import re
from fastapi import Query

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Symbol → (Fundamentals, timestamp)
_fundamentals_cache = {}

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
        forty_week_status=analyser.forty_week_status(),
        fifty_dma_and_150_dma=analyser.fifty_dma_and_150_dma(),
        twenty_dma=analyser.calculate_20dma(),
        fifty_dma=analyser.calculate_50dma(),
        mean_rev_50dma=analyser.mean_reversion_50dma(),
        mean_rev_200dma=analyser.mean_reversion_200dma(),
        mean_rev_3yma=analyser.mean_reversion_3yma(),
        rsi_and_ma_daily=analyser.rsi_and_ma_daily(),
        rsi_divergence_daily=analyser.rsi_divergence_daily(),
        bollinger_band_width_percentile_daily=analyser.bollinger_band_width_percentile_daily(),
        rsi_ma_weekly=analyser.rsi_ma_weekly(),
        rsi_divergence_weekly=analyser.rsi_divergence_weekly(),
        rsi_ma_monthly=analyser.rsi_ma_monthly(),
        rsi_divergence_monthly=analyser.rsi_divergence_monthly(),
        chaikin_money_flow=analyser.chaikin_money_flow(),
    )

@app.post("/elliott", response_model=ElliottWaveScenariosResponse)
def elliott(stock_request: StockRequest):
    analyser = StockAnalyser(stock_request.symbol)
    df = analyser.df

    elliott_result = calculate_elliott_wave(df)

    if "error" in elliott_result:
        return JSONResponse(status_code=400, content={"detail": elliott_result["error"]})

    return convert_numpy_types(elliott_result)


@app.get("/portfolio_live_data")
def get_portfolio_live_data():
    try:
        analyser = PortfolioAnalyser()
        return analyser.analyse()
    except Exception as e:
        return {"error": str(e)}

def get_cached_fundamentals(symbol: str, ttl: int = 900):
    symbol = symbol.upper()
    now = time()
    if symbol in _fundamentals_cache:
        fundamentals, timestamp = _fundamentals_cache[symbol]
        if now - timestamp < ttl:
            return fundamentals
    fundamentals = FMPFundamentals(symbol)
    _fundamentals_cache[symbol] = (fundamentals, now)
    return fundamentals

@app.get("/fmp_financials/{symbol}", response_model=FinancialMetrics)
async def get_fmp_financials(symbol: str):
    try:
        fundamentals = FMPFundamentals(symbol)
        return fundamentals.get_financial_metrics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/12data_financials/{symbol}", response_model=FinancialMetrics)
async def get_financials(symbol: str):
    try:
        fundamentals = TwelveDataFundamentals(symbol)
        return fundamentals.get_financial_metrics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/chart_data_{timeframe}/{symbol}")
async def websocket_chart_data(websocket: WebSocket, timeframe: str, symbol: str):
    await websocket.accept()
    try:
        raw_symbol = symbol.upper()
        symbol = SYMBOL_ALIASES.get(raw_symbol, raw_symbol)

        analyser = StockAnalyser(symbol)
        df = analyser.get_price_data(symbol)

        if timeframe == "daily":
            hist_df = df
        elif timeframe == "weekly":
            hist_df = df.resample("W-FRI").agg({
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum"
            }).dropna()
        elif timeframe == "monthly":
            hist_df = df.resample("M").agg({
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum"
            }).dropna()
        else:
            await websocket.send_json({"error": f"Invalid timeframe: {timeframe}"})
            await websocket.close()
            return

        if hist_df.empty:
            await websocket.send_json({"error": f"No data found for symbol {symbol}"})
            await websocket.close()
            return

        history = [
            {
                "time": int(ts.timestamp()),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": round(float(row["Volume"]), 2)
            }
            for ts, row in hist_df.iterrows()
        ]

        await websocket.send_json({"history": history})

        last_ts = hist_df.index[-1]

    except WebSocketDisconnect:
        print(f"Client disconnected for {symbol}")
    except Exception as e:
        print(f"WebSocket error for {symbol}: {e}")
        await websocket.close()

@app.get("/api/chart_data_{timeframe}/{symbol}")
async def get_chart_data(timeframe: str, symbol: str):
    raw_symbol = symbol.upper()
    symbol = SYMBOL_ALIASES.get(raw_symbol, raw_symbol)

    analyser = StockAnalyser(symbol)
    df = analyser.get_price_data(symbol)

    if timeframe == "daily":
        hist_df = df
    elif timeframe == "weekly":
        hist_df = df.resample("W-FRI").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum"
        }).dropna()
    elif timeframe == "monthly":
        hist_df = df.resample("M").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum"
        }).dropna()
    else:
        return {"error": f"Invalid timeframe: {timeframe}"}

    if hist_df.empty:
        return {"error": f"No data found for symbol {symbol}"}

    history = [
        {
            "time": int(ts.timestamp()),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": round(float(row["Volume"]), 2)
        }
        for ts, row in hist_df.iterrows()
    ]

    return {"history": history}


@app.get("/overlay_data/{symbol}")
def get_overlay_data(symbol: str, timeframe: str = "weekly"):
    try:
        analyser = StockAnalyser(symbol)
        overlays = analyser.get_overlay_lines(timeframe=timeframe)
        return JSONResponse(content=overlays)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/price_targets/{symbol}")
def get_price_targets(symbol: str):
    try:
        analyser = StockAnalyser(symbol)
        return analyser.price_targets()  
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

'''
TEMP WATCHLIST DATABASE 
'''
WATCHLIST_FILE = "watchlist.json"

def load_data():
    try:
        with open(WATCHLIST_FILE, "r") as f:
            data = json.load(f)
            # Always ensure both keys exist, for safety
            if "watchlist" not in data:
                data["watchlist"] = []
            if "portfolio" not in data:
                data["portfolio"] = []
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        return {"watchlist": [], "portfolio": []}

def save_data(data):
    with open(WATCHLIST_FILE, "w") as f:
        json.dump(data, f, indent=2)

@app.get("/watchlist")
def get_watchlist():
    data = load_data()
    return data["watchlist"]

@app.post("/watchlist/{symbol}")
def add_to_watchlist(symbol: str):
    data = load_data()
    symbol = symbol.upper()
    if symbol in data["watchlist"]:
        raise HTTPException(status_code=409, detail="Already in watchlist")
    data["watchlist"].append(symbol)
    save_data(data)
    return {"watchlist": data["watchlist"]}

@app.delete("/watchlist/{symbol}")
def remove_from_watchlist(symbol: str):
    data = load_data()
    symbol = symbol.upper()
    if symbol not in data["watchlist"]:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    data["watchlist"].remove(symbol)
    save_data(data)
    return {"watchlist": data["watchlist"]}

@app.post("/analyse_batch")
def analyse_batch(stock_requests: List[StockRequest]):
    results = {}
    with ThreadPoolExecutor(max_workers=8) as executor:
        future_to_symbol = {
            executor.submit(analyse, req): req.symbol for req in stock_requests
        }
        for future in as_completed(future_to_symbol):
            symbol = future_to_symbol[future]
            try:
                results[symbol] = future.result()
            except Exception as exc:
                results[symbol] = {"error": str(exc)}
    return results

@app.get("/s3-images")
def list_s3_images(prefix: str = "natgas/"):
    s3 = boto3.client(
        's3',
        region_name='ap-southeast-2',
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )
    bucket_name = "stclair-ndr-bucket"
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
    images = []
    for obj in response.get("Contents", []):
        key = obj["Key"]
        if key.lower().endswith((".png", ".jpg", ".jpeg", ".gif")):
            images.append(f"https://{bucket_name}.s3.ap-southeast-2.amazonaws.com/{key}")
    # ---- Natural Sort by number in filename ----
    def sort_key(url):
        match = re.search(r'(nat_gas|oil)_(\d+)\.png', url)
        return int(match.group(2)) if match else 0
    images.sort(key=sort_key)
    return {"images": images}



@app.get("/compare_ratio")
def compare_ratio(
    symbol1: str,
    symbol2: str,
    timeframe: str = "weekly",
):
    try:
        analyser1 = StockAnalyser(symbol1)
        return analyser1.compare_ratio_with(
            other_symbol=symbol2, 
            timeframe=timeframe, 
        )
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/signals_{timeframe}/{symbol}")
def get_signals(timeframe: str, symbol: str, strategy: str = Query("trendinvestorpro")):
    analyser = StockAnalyser(symbol)
    if strategy == "trendinvestorpro":
        return {"markers": analyser.get_trendinvestorpro_signals(timeframe)}
    else:
        return {"error": f"Unknown strategy: {strategy}"}
