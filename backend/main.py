from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
from stock_analysis.pricetarget import find_downtrend_lines
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
    

@app.get("/portfolio_tickers")
def get_portfolio_tickers():
    json_path = Path("portfolio_store.json")
    if not json_path.exists():
        return []
    with open(json_path, "r") as f:
        data = json.load(f)
        equities = data.get("equities", [])
        # MODIFIED: Return ticker and sector for each equity
        # If 'sector' is not present, default it to "N/A"
        return [
            {"ticker": item["ticker"], "sector": item.get("sector", "N/A")}
            for item in equities
            if "ticker" in item
        ]

@app.get("/fmp_financials/{symbol}", response_model=FinancialMetrics)
async def get_fmp_financials(symbol: str):
    try:
        fundamentals = FMPFundamentals(symbol)
        metrics = fundamentals.get_financial_metrics()
        # Grab the latest quarterly income statement date (or use another source if you prefer)
        as_of_date = fundamentals.income_data[0].get("date") if fundamentals.income_data else None
        # Convert metrics to dict
        metrics_dict = metrics.model_dump() if hasattr(metrics, "model_dump") else metrics.dict()
        # Add the as_of_date field
        metrics_dict["as_of_date"] = as_of_date
        return JSONResponse(metrics_dict)
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
    elif strategy == "stclair":
        return {"markers": analyser.get_stclair_signals(timeframe)}
    elif strategy == "northstar":
        return {"markers": analyser.get_northstar_signals(timeframe)}
    elif strategy == "stclairlongterm":
        return {"markers": analyser.get_stclairlongterm_signals(timeframe)}
    elif strategy == "mace_40w":
        return {"markers": analyser.get_mace_40w_signals()}

    else:
        return {"error": f"Unknown strategy: {strategy}"}
    

@app.get("/signal_lines/{symbol}")
def get_signal_lines(
    symbol: str,
    timeframe: str = "daily"
):
    try:
        analyser = StockAnalyser(symbol)
        lines = analyser.get_signal_lines(timeframe=timeframe)
        return lines
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    

FMP_API_KEY = os.getenv("FMP_API_KEY")
FMP_BASE_URL = os.getenv("FMP_BASE_URL")


@app.get("/etf_holdings/{symbol}")
def get_etf_holdings(symbol: str):
    url = f"https://financialmodelingprep.com/stable/etf/holdings?symbol={symbol.upper()}&apikey={FMP_API_KEY}"
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        if not data or not isinstance(data, list):
            return JSONResponse(status_code=404, content={"error": "No ETF holdings found for this symbol"})

        # Limit to top 20 holdings (by order given, which is typically by weight)
        top_holdings = data[:20]

        return {
            "symbol": symbol.upper(),
            "holdings": top_holdings
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/projection_arrows/{symbol}")
def get_projection_arrows(symbol: str, timeframe: str = Query("weekly")):
    analyser = StockAnalyser(symbol)
    if timeframe == "daily":
        df = analyser.df
    elif timeframe == "weekly":
        df = analyser.weekly_df
    elif timeframe == "monthly":
        df = analyser.monthly_df
    else:
        return {"error": f"Invalid timeframe: {timeframe}"}

    result = find_downtrend_lines(df)
    return result


@app.get("/api/backtest_signals_{timeframe}/{symbol}")
def backtest_signals(
    timeframe: str, 
    symbol: str,
    start: str = Query(..., description="Start date DDMMYYYY"),
    end: str = Query(..., description="End date DDMMYYYY"),
    strategy: str = Query("northstar")
):
    def parse_date(d: str) -> datetime:
        return datetime.strptime(d, "%d%m%Y")
    start_dt = parse_date(start)
    end_dt = parse_date(end)

    analyser = StockAnalyser(symbol)

    # No dataframe filtering by date here!

    # Get all signals
    if strategy == "trendinvestorpro":
        markers = analyser.get_trendinvestorpro_signals(timeframe)
    elif strategy == "stclair":
        markers = analyser.get_stclair_signals(timeframe)
    elif strategy == "northstar":
        markers = analyser.get_northstar_signals(timeframe)
    elif strategy == "stclairlongterm":
        markers = analyser.get_stclairlongterm_signals(timeframe)
    elif strategy == "mace_40w":
        markers = analyser.get_mace_40w_signals()
    else:
        return {"error": f"Unknown strategy: {strategy}"}

    # Filter markers by date
    start_ts = int(start_dt.timestamp())
    end_ts = int(end_dt.timestamp())
    filtered_markers = [
        m for m in markers if start_ts <= m["time"] <= end_ts
    ]

    print("Filtered markers:", filtered_markers)
    results = analyser.backtest_signal_markers(filtered_markers)
    return results
