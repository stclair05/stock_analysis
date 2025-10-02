import csv
from datetime import datetime
import io
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
from stock_analysis.utils import (
    compute_sortino_ratio_cached as compute_sortino_ratio,
    convert_numpy_types,
    compute_wilder_rsi,
    compute_supertrend_lines,
    safe_value,
)
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
    change_amt, change_pct = analyser.get_daily_change()
    return StockAnalysisResponse(
        current_price=analyser.get_current_price(),
        daily_change=change_amt,
        daily_change_percent=change_pct,
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
        mean_rev_weekly=analyser.mean_reversion_weekly(),
        bollinger_band_width_percentile_daily=analyser.bollinger_band_width_percentile_daily(),
        rsi_ma_weekly=analyser.rsi_ma_weekly(),
        chaikin_money_flow=analyser.chaikin_money_flow(),
        short_interest=analyser.short_interest_percent(),
        short_term_trend=analyser.short_term_trend_score(),
        long_term_trend=analyser.long_term_trend_score(),
        sell_signal=analyser.sell_signal_score(),
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
    

def _sanitize_level(val):
    return val if isinstance(val, (int, float)) and val > 0 else None


@app.get("/portfolio_tickers")
def get_portfolio_tickers():
    json_path = Path("portfolio_store.json")
    if not json_path.exists():
        return []
    with open(json_path, "r") as f:
        data = json.load(f)
        equities = data.get("equities", [])
         # Return ticker, sector, and optional levels for each equity
        return [
            {
                "ticker": item["ticker"],
                "sector": item.get("sector", "N/A"),
                "target_1": _sanitize_level(item.get("target_1")),
                "target_2": _sanitize_level(item.get("target_2")),
                "target_3": _sanitize_level(item.get("target_3")),
                "invalidation_1": _sanitize_level(item.get("invalidation_1")),
                "invalidation_2": _sanitize_level(item.get("invalidation_2")),
                "invalidation_3": _sanitize_level(item.get("invalidation_3")),
            }
            for item in equities
            if "ticker" in item
        ]


def _status_for_holdings(holdings, price_direction: str):
    price_key_20 = "below_20dma" if price_direction == "below" else "above_20dma"
    price_key_200 = "below_200dma" if price_direction == "below" else "above_200dma"

    results = {
        price_key_20: [],
        price_key_200: [],
        "candle_signals": {},
        "extended_vol": [],
        "super_trend_daily": {},
        "mansfield_daily": {},
        "mace": {},
        "stage": {},
        "short_term_trend": {},
        "long_term_trend": {},
        "breach_hit": {},
    }

    for holding in holdings:
        ticker = holding.get("ticker")
        if not ticker:
            continue
        try:
            analyser = StockAnalyser(ticker)
            price = analyser.get_current_price()
            flagged = False

            short_trend = analyser.short_term_trend_score()
            short_total = short_trend.get("total") if isinstance(short_trend, dict) else None
            results["short_term_trend"][ticker] = (
                short_total if isinstance(short_total, (int, float)) else None
            )

            long_trend = analyser.long_term_trend_score()
            long_total = long_trend.get("total") if isinstance(long_trend, dict) else None
            results["long_term_trend"][ticker] = (
                long_total if isinstance(long_total, (int, float)) else None
            )

            twenty = analyser.calculate_20dma().current
            if isinstance(price, (int, float)) and isinstance(twenty, (int, float)):
                if price_direction == "below" and price < twenty:
                    results[price_key_20].append(ticker)
                    flagged = True
                if price_direction == "above" and price >= twenty:
                    results[price_key_20].append(ticker)
                    flagged = True

            two_hundred = analyser.calculate_200dma().current
            if isinstance(price, (int, float)) and isinstance(two_hundred, (int, float)):
                if price_direction == "below" and price < two_hundred:
                    results[price_key_200].append(ticker)
                    flagged = True
                if price_direction == "above" and price >= two_hundred:
                    results[price_key_200].append(ticker)
                    flagged = True

            engulf = analyser.detect_engulfing()
            daily = engulf.get("daily")
            weekly = engulf.get("weekly")

            candle_signal = None

            for timeframe, pattern in (
                ("weekly", weekly),
                ("daily", daily),
                ("monthly", engulf.get("monthly")),
            ):
                if not isinstance(pattern, str):
                    continue
                lower = pattern.lower()
                if "bearish" in lower:
                    candle_signal = {
                        "type": "bearish",
                        "timeframe": timeframe,
                        "label": pattern,
                    }
                    break
                if "bullish" in lower:
                    candle_signal = {
                        "type": "bullish",
                        "timeframe": timeframe,
                        "label": pattern,
                    }
                    break

            if candle_signal:
                results["candle_signals"][ticker] = candle_signal
                flagged = True

            rsi_series = compute_wilder_rsi(analyser.df["Close"])
            rsi_val = safe_value(rsi_series, -1)
            if isinstance(rsi_val, (int, float)) and rsi_val >= 70:
                results["extended_vol"].append(ticker)
                flagged = True

            try:
                daily_super_trend = compute_supertrend_lines(analyser.df)
                signal = safe_value(daily_super_trend.get("Signal"), -1)
                if isinstance(signal, str) and signal:
                    results["super_trend_daily"][ticker] = {"signal": signal}
                    flagged = True
            except Exception:
                pass

            mansfield_status = analyser.get_mansfield_status()
            if isinstance(mansfield_status, dict):
                results["mansfield_daily"][ticker] = mansfield_status
                if mansfield_status.get("status"):
                    flagged = True

            mace_signal = analyser.mace().current
            if isinstance(mace_signal, str) and mace_signal not in {"", "in progress"}:
                forty_week = analyser.forty_week_status().current
                trend_suffix: str | None = None
                if isinstance(forty_week, str):
                    parts = forty_week.strip().split()
                    if parts:
                        last = parts[-1]
                        if set(last).issubset({"+", "-"}) and len(last) == 2:
                            trend_suffix = last
                results["mace"][ticker] = {
                    "label": mace_signal,
                    "trend": trend_suffix,
                }
                flagged = True
            
            def _sanitize_level(value):
                return value if isinstance(value, (int, float)) and value > 0 else None

            def _breach_status(current_price, levels):
                status = None
                category = "neutral"

                if not isinstance(current_price, (int, float)):
                    return status, category

                if levels.get("target") is not None and current_price >= levels["target"]:
                    return "Hit Target", "target"
                if levels.get("target_3") is not None and current_price >= levels["target_3"]:
                    return "Hit Target 3", "target"
                if levels.get("target_2") is not None and current_price >= levels["target_2"]:
                    return "Hit Target 2", "target"
                if levels.get("target_1") is not None and current_price >= levels["target_1"]:
                    return "Hit Target 1", "target"
                if (
                    levels.get("invalidation_3") is not None
                    and current_price <= levels["invalidation_3"]
                ):
                    return "Breached Level 3", "invalidation"
                if (
                    levels.get("invalidation_2") is not None
                    and current_price <= levels["invalidation_2"]
                ):
                    return "Breached Level 2", "invalidation"
                if (
                    levels.get("invalidation_1") is not None
                    and current_price <= levels["invalidation_1"]
                ):
                    return "Breached Level 1", "invalidation"

                return status, category

            levels = {
                "target": _sanitize_level(holding.get("target")),
                "target_3": _sanitize_level(holding.get("target_3")),
                "target_2": _sanitize_level(holding.get("target_2")),
                "target_1": _sanitize_level(holding.get("target_1")),
                "invalidation_1": _sanitize_level(holding.get("invalidation_1")),
                "invalidation_2": _sanitize_level(holding.get("invalidation_2")),
                "invalidation_3": _sanitize_level(holding.get("invalidation_3")),
            }

            status, category = _breach_status(price, levels)
            results["breach_hit"][ticker] = {
                "status": status,
                "category": category,
            }

            if flagged:
                stage_val, weeks = analyser.stage_analysis()
                if stage_val is not None:
                    results["stage"][ticker] = {
                        "stage": stage_val,
                        "weeks": weeks,
                    }
        except Exception:
            continue

    return results

@app.get("/portfolio_status")
def get_portfolio_status():
    json_path = Path("portfolio_store.json")
    if not json_path.exists():
        return {
            "below_20dma": [],
            "below_200dma": [],
            "candle_signals": {},
            "extended_vol": [],
            "super_trend_daily": {},
            "mansfield_daily": {},
            "mace": {},
            "stage": {},
            "short_term_trend": {},
            "long_term_trend": {},
            "breach_hit": {},
        }

    with open(json_path, "r") as f:
        data = json.load(f)
        equities = [
            item
            for item in data.get("equities", [])
            if isinstance(item, dict) and "ticker" in item
        ]

    return _status_for_holdings(equities, "below")


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
    
# One-time script to download and cache
def cache_peers_bulk():
    url = f"https://financialmodelingprep.com/stable/peers-bulk?apikey={FMP_API_KEY}"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    decoded = resp.content.decode("utf-8")

    csv_reader = csv.DictReader(io.StringIO(decoded))
    result = []
    for row in csv_reader:
        peers = [p.strip() for p in row.get("peers", "").split(",") if p.strip()]
        result.append({"symbol": row["symbol"], "peers": peers})

    with open("peers_bulk.json", "w") as f:
        json.dump(result, f, indent=2)

@app.on_event("startup")
def ensure_peers_cache():
    if not Path("peers_bulk.json").exists():
        print("Generating peers_bulk.json on startup...")
        cache_peers_bulk()

'''
Downloads and loads price data upon starting up server
'''
@app.on_event("startup")
def preload_price_history():
    """Warm up price history cache for portfolio and watchlist tickers."""
    tickers: set[str] = set()

    # Load portfolio tickers
    try:
        with open("portfolio_store.json", "r") as f:
            data = json.load(f)
            for item in data.get("equities", []):
                t = item.get("ticker")
                if t:
                    tickers.add(t)
    except Exception as e:
        print(f"[warmup] Failed to read portfolio_store.json: {e}")

    # Load watchlist and buylist tickers
    try:
        with open(WATCHLIST_FILE, "r") as f:
            wdata = json.load(f)
            for entry in wdata.get("watchlist", []):
                t = entry.get("ticker") if isinstance(entry, dict) else entry
                if t:
                    tickers.add(t)
            for entry in wdata.get("buylist", []):
                t = entry.get("ticker") if isinstance(entry, dict) else entry
                if t:
                    tickers.add(t)
    except Exception as e:
        print(f"[warmup] Failed to read {WATCHLIST_FILE}: {e}")

    if not tickers:
        return

    print(f"[warmup] Preloading price data for {len(tickers)} tickers...")

    def _load(sym: str):
        try:
            StockAnalyser.get_price_data(sym)
        except Exception as exc:
            print(f"[warmup] Failed for {sym}: {exc}")

    with ThreadPoolExecutor(max_workers=6) as executor:
        list(executor.map(_load, tickers))

    print("[warmup] Price data warmup complete")

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

@app.get("/engulfing/{symbol}")
def get_engulfing(symbol: str):
    """Return bullish or bearish engulfing status for multiple timeframes."""
    try:
        analyser = StockAnalyser(symbol)
        return analyser.detect_engulfing()
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
            if "buylist" not in data:
                data["buylist"] = []
            if "portfolio" not in data:
                data["portfolio"] = []
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        return {"watchlist": [], "buylist": [], "portfolio": []}

def save_data(data):
    with open(WATCHLIST_FILE, "w") as f:
        json.dump(data, f, indent=2)

@app.get("/watchlist")
def get_watchlist():
    data = load_data()
    tickers = []
    for item in data["watchlist"]:
        if isinstance(item, dict):
            t = item.get("ticker")
            if t:
                tickers.append(t)
        else:
            tickers.append(item)
    return tickers

@app.post("/watchlist/{symbol}")
def add_to_watchlist(symbol: str):
    data = load_data()
    symbol = symbol.upper()
    for item in data["watchlist"]:
        if (
            (isinstance(item, dict) and item.get("ticker") == symbol)
            or item == symbol
        ):
            raise HTTPException(status_code=409, detail="Already in watchlist")
    data["watchlist"].append({"ticker": symbol, "sector": "", "technigrade": []})
    save_data(data)
    tickers = [i.get("ticker") if isinstance(i, dict) else i for i in data["watchlist"]]
    return {"watchlist": tickers}

@app.get("/buylist")
def get_buylist():
    """Return buylist tickers with sector and level information."""
    data = load_data()
    items = []
    for entry in data.get("buylist", []):
        if isinstance(entry, dict):
            ticker = entry.get("ticker")
            if ticker:
                sector = entry.get("sector") or "N/A"
                target_1 = _sanitize_level(entry.get("target_1"))
                fallback_target = _sanitize_level(entry.get("target"))
                if target_1 is None and fallback_target is not None:
                    target_1 = fallback_target
                breakout_price = _sanitize_level(entry.get("break_out"))
                item = {
                    "ticker": ticker,
                    "sector": sector,
                    "target": fallback_target,
                    "target_1": target_1,
                    "target_2": _sanitize_level(entry.get("target_2")),
                    "target_3": _sanitize_level(entry.get("target_3")),
                    "invalidation_1": _sanitize_level(entry.get("invalidation_1")),
                    "invalidation_2": _sanitize_level(entry.get("invalidation_2")),
                    "invalidation_3": _sanitize_level(entry.get("invalidation_3")),
                }
                if breakout_price is not None:
                    item["breakout_price"] = breakout_price
                items.append(item)
        elif isinstance(entry, str):
            items.append({"ticker": entry, "sector": "N/A"})
    return items


@app.get("/buylist_status")
def get_buylist_status():
    """Return technical status for tickers stored in the buylist."""
    data = load_data()
    holdings = []
    for entry in data.get("buylist", []):
        if isinstance(entry, dict):
            ticker = entry.get("ticker")
            if ticker:
                holdings.append(entry)
        elif isinstance(entry, str):
            holdings.append({"ticker": entry})

    if not holdings:
        return {
            "above_20dma": [],
            "above_200dma": [],
            "candle_signals": {},
            "extended_vol": [],
            "super_trend_daily": {},
            "mansfield_daily": {},
            "mace": {},
            "stage": {},
            "short_term_trend": {},
            "long_term_trend": {},
            "breach_hit": {},
        }

    return _status_for_holdings(holdings, "above")

@app.delete("/watchlist/{symbol}")
def remove_from_watchlist(symbol: str):
    data = load_data()
    symbol = symbol.upper()
    found = False
    new_list = []
    for item in data["watchlist"]:
        if (
            (isinstance(item, dict) and item.get("ticker") == symbol)
            or item == symbol
        ):
            found = True
            continue
        new_list.append(item)
    if not found:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    data["watchlist"] = new_list
    save_data(data)
    tickers = [i.get("ticker") if isinstance(i, dict) else i for i in data["watchlist"]]
    return {"watchlist": tickers}

@app.get("/technigrade/{symbol}")
def get_technigrade(symbol: str):
    """Return technigrade array for a symbol if present in portfolio or watchlist."""
    target = symbol.upper()

    # Check portfolio_store.json
    json_path = Path("portfolio_store.json")
    if json_path.exists():
        try:
            with open(json_path, "r") as f:
                pdata = json.load(f)
            for item in pdata.get("equities", []):
                if str(item.get("ticker", "")).upper() == target:
                    tg = item.get("technigrade")
                    if isinstance(tg, list):
                        return {"source": "portfolio", "technigrade": tg}
        except Exception:
            pass

    # Check watchlist and buylist
    data = load_data()
    for lst_name in ["watchlist", "buylist"]:
        for entry in data.get(lst_name, []):
            if isinstance(entry, dict):
                t = entry.get("ticker")
                if t and t.upper() == target:
                    tg = entry.get("technigrade")
                    if isinstance(tg, list):
                        return {"source": lst_name, "technigrade": tg}
                    else:
                        return {"source": lst_name, "technigrade": []}
            elif isinstance(entry, str) and entry.upper() == target:
                return {"source": lst_name, "technigrade": []}

    return {"technigrade": []}

def _get_portfolio_stage(symbol: str):
    """Return (stage, weeks) if available in portfolio_store.json."""
    target = symbol.upper()
    json_path = Path("portfolio_store.json")
    if json_path.exists():
        try:
            with open(json_path, "r") as f:
                pdata = json.load(f)
            for item in pdata.get("equities", []):
                if str(item.get("ticker", "")).upper() == target:
                    st = item.get("stage")
                    if (
                        isinstance(st, list)
                        and len(st) == 2
                        and isinstance(st[0], (int, float))
                        and isinstance(st[1], (int, float))
                    ):
                        return int(st[0]), int(st[1])
        except Exception:
            pass
    return None

@app.get("/stage/{symbol}")
def get_stage(symbol: str):
    """Return current Stage and duration in weeks."""
    cached = _get_portfolio_stage(symbol)
    if cached is not None:
        stage, weeks = cached
        return {"stage": stage, "weeks": weeks}
    
    analyser = StockAnalyser(symbol)
    stage, weeks = analyser.stage_analysis()
    return {"stage": stage, "weeks": weeks}

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

@app.post("/api/batch_signals")
def batch_signals(
    tickers: List[str] = Query(...),
    timeframe: str = Query("weekly"),
    strategies: List[str] = Query(...)
):
    results = {}
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {}

        for symbol in tickers:
            futures[symbol] = executor.submit(_get_signals_for_symbol, symbol, timeframe, strategies)

        for symbol, future in futures.items():
            try:
                results[symbol] = future.result()
            except Exception as e:
                results[symbol] = {"error": str(e)}

    return results


def _get_signals_for_symbol(symbol: str, timeframe: str, strategies: List[str]):
    analyser = StockAnalyser(symbol)
    result = {}
    for strat in strategies:
        if strat == "trendinvestorpro":
            result[strat] = {"markers": analyser.get_trendinvestorpro_signals(timeframe)}
        elif strat == "northstar":
            result[strat] = {"markers": analyser.get_northstar_signals(timeframe)}
        elif strat == "stclair":
            result[strat] = {"markers": analyser.get_stclair_signals(timeframe)}
        elif strat == "stclairlongterm":
            result[strat] = {"markers": analyser.get_stclairlongterm_signals(timeframe)}
        elif strat == "mace_40w":
            result[strat] = {"markers": analyser.get_mace_40w_signals()}
        elif strat == "mansfield":
            result[strat] = {"markers": analyser.get_mansfield_signals()}
        elif strat == "ndr":
            result[strat] = {"markers": analyser.get_ndr_signal(timeframe)}
    result["_generic"] = analyser.get_generic_strength_status(timeframe)
    return result


@app.get("/quadrant_data")
def get_quadrant_data(list_type: str = Query("portfolio", enum=["portfolio", "watchlist"])):
    """Return MACE x 40-week status table for portfolio or watchlist."""
    targets: dict[str, list[float]] = {}
    technigrades: dict[str, list] = {}
    if list_type == "portfolio":
        json_path = Path("portfolio_store.json")
        if not json_path.exists():
            tickers = []
        else:
            with open(json_path, "r") as f:
                data = json.load(f)
            tickers = []
            for item in data.get("equities", []):
                if "ticker" in item:
                    tickers.append(item["ticker"])
                    levels: list[float] = []
                    for key in ("target_1", "target_2", "target_3"):
                        t_val = item.get(key)
                        if isinstance(t_val, (int, float)) and t_val > 0:
                            levels.append(float(t_val))
                    if levels:
                        targets[item["ticker"]] = levels
                    if isinstance(item.get("technigrade"), list):
                        technigrades[item["ticker"]] = item["technigrade"]
    else:
        data = load_data()
        tickers = []
        for item in data.get("watchlist", []):
            if isinstance(item, dict):
                ticker = item.get("ticker")
                if ticker:
                    tickers.append(ticker)
                    if isinstance(item.get("technigrade"), list):
                        technigrades[ticker] = item["technigrade"]
            else:
                tickers.append(item)

    status_keys = ["U1", "U2", "U3", "D1", "D2", "D3"]
    forty_keys = ["++", "+-", "-+", "--"]

    # initialise table with ticker info objects
    table = {
        fw: {m: {"tickers": []} for m in status_keys} for fw in forty_keys
    }

    mace_rank = {"U3": 6, "U2": 5, "U1": 4, "D1": 3, "D2": 2, "D3": 1}

    def is_above(status: str | None) -> bool:
        return isinstance(status, str) and status.startswith("Above")

    def is_below(status: str | None) -> bool:
        return isinstance(status, str) and status.startswith("Below")

    for symbol in tickers:
        try:
            analyser = StockAnalyser(symbol)
            mace_metric = analyser.mace()
            fw_metric = analyser.forty_week_status()
            dma20 = analyser.calculate_20dma().current
            price_now = analyser.get_current_price()

            mace_now = mace_metric.current
            mace_prev = mace_metric.seven_days_ago
            fw_now = fw_metric.current
            fw_prev = fw_metric.seven_days_ago

            mace_key = mace_now if mace_now in status_keys else None
            fw_key = None
            if isinstance(fw_now, str):
                if "++" in fw_now:
                    fw_key = "++"
                elif "+-" in fw_now:
                    fw_key = "+-"
                elif "-+" in fw_now:
                    fw_key = "-+"
                elif "--" in fw_now:
                    fw_key = "--"
            arrow = None
            if is_above(fw_now) and is_below(fw_prev):
                arrow = "up"
            elif is_below(fw_now) and is_above(fw_prev):
                arrow = "down"
            elif (
                isinstance(mace_now, str)
                and isinstance(mace_prev, str)
                and mace_now in mace_rank
                and mace_prev in mace_rank
            ):
                if mace_rank[mace_now] > mace_rank[mace_prev]:
                    arrow = "right"
                elif mace_rank[mace_now] < mace_rank[mace_prev]:
                    arrow = "left"

            if mace_key and fw_key:
                near_target = False
                if list_type == "portfolio":
                    target_levels = targets.get(symbol)
                    if (
                        target_levels
                        and price_now is not None
                    ):
                        selected = target_levels[0]
                        for idx, level in enumerate(target_levels):
                            if idx == len(target_levels) - 1:
                                break
                            if price_now >= level:
                                selected = target_levels[idx + 1]
                            else:
                                break
                        if selected:
                            within_range = abs(price_now - selected) / selected <= 0.05
                            if price_now >= selected or within_range:
                                near_target = True

                table[fw_key][mace_key]["tickers"].append(
                    {
                        "symbol": symbol,
                        "arrow": arrow,
                        "below20dma": (
                            price_now is not None
                            and dma20 is not None
                            and price_now < dma20
                        ),
                        "nearTarget": near_target,
                        "technigrade": technigrades.get(symbol, []),
                    }
                )
        except Exception as e:
            print(f"Quadrant analysis error for {symbol}: {e}")

    return table

@app.get("/stage_table")
def get_stage_table(list_type: str = Query("portfolio", enum=["portfolio", "watchlist"])):
    """Return Stage quadrant table with 20DMA status."""
    stage_cache: dict[str, int] = {}
    if list_type == "portfolio":
        json_path = Path("portfolio_store.json")
        if not json_path.exists():
            tickers: list[str] = []
        else:
            with open(json_path, "r") as f:
                data = json.load(f)
            tickers = []
            for item in data.get("equities", []):
                t = item.get("ticker")
                if t:
                    tickers.append(t)
                    st = item.get("stage")
                    if (
                        isinstance(st, list)
                        and len(st) == 2
                        and isinstance(st[0], (int, float))
                    ):
                        stage_cache[t.upper()] = int(st[0])
    else:
        data = load_data()
        tickers = []
        for item in data.get("watchlist", []):
            if isinstance(item, dict):
                ticker = item.get("ticker")
                if ticker:
                    tickers.append(ticker)
            else:
                tickers.append(item)
        stage_cache = {}

    table = {stage: {"tickers": []} for stage in [1, 2, 3, 4]}

    for symbol in tickers:
        try:
            analyser = StockAnalyser(symbol)
            stage = stage_cache.get(symbol.upper())
            if stage is None:
                stage, _ = analyser.stage_analysis()
            dma20 = analyser.calculate_20dma().current
            price_now = analyser.get_current_price()
            if stage in [1, 2, 3, 4]:
                table[stage]["tickers"].append(
                    {
                        "symbol": symbol,
                        "below20dma": (
                            price_now is not None
                            and dma20 is not None
                            and price_now < dma20
                        ),
                    }
                )
        except Exception as e:
            print(f"Stage table error for {symbol}: {e}")

    return table

@app.get("/mansfield_table")
def get_mansfield_table(list_type: str = Query("portfolio", enum=["portfolio", "watchlist"])):
    """Return Mansfield quadrant table with 20DMA status and new buy flag."""
    if list_type == "portfolio":
        json_path = Path("portfolio_store.json")
        if not json_path.exists():
            tickers: list[str] = []
        else:
            with open(json_path, "r") as f:
                data = json.load(f)
            tickers = [item["ticker"] for item in data.get("equities", []) if "ticker" in item]
    else:
        data = load_data()
        tickers = []
        for item in data.get("watchlist", []):
            if isinstance(item, dict):
                t = item.get("ticker")
                if t:
                    tickers.append(t)
            else:
                tickers.append(item)

    table = {s: {"tickers": []} for s in ["BUY", "NEUTRAL", "SELL"]}

    for symbol in tickers:
        try:
            analyser = StockAnalyser(symbol)
            mansfield = analyser.get_mansfield_status()
            status = mansfield.get("status")
            new_buy = mansfield.get("new_buy", False)
            dma20 = analyser.calculate_20dma().current
            price_now = analyser.get_current_price()
            if status in ["BUY", "SELL", "NEUTRAL"]:
                table[status]["tickers"].append(
                    {
                        "symbol": symbol,
                        "below20dma": (
                            price_now is not None
                            and dma20 is not None
                            and price_now < dma20
                        ),
                        "newBuy": new_buy,
                    }
                )
        except Exception as e:
            print(f"Mansfield table error for {symbol}: {e}")

    return table

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
    elif strategy == "mansfield":
        return {"markers": analyser.get_mansfield_signals()}
    elif strategy == "ndr":
        return {"markers": analyser.get_ndr_signal(timeframe)}
    elif strategy == "demarker":
        return {"markers": analyser.get_demarker_signals(timeframe)}

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

@app.get("/forex_rates")
def get_forex_rates():
    url = f"{FMP_BASE_URL}/forex?apikey={FMP_API_KEY}"
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        data = resp.json()

        # FMP returns {"forexList": [{"ticker": "EUR/USD", "bid": ..., "ask": ...}, ...]}
        # Convert to a simpler array [{"ticker": "EURUSD", "price": 1.07}, ...]
        if isinstance(data, dict) and "forexList" in data:
            results = []
            for item in data["forexList"]:
                ticker = item.get("ticker")
                bid = item.get("bid")
                ask = item.get("ask")
                price = None
                try:
                    if bid is not None and ask is not None:
                        price = (float(bid) + float(ask)) / 2
                    elif bid is not None:
                        price = float(bid)
                    elif ask is not None:
                        price = float(ask)
                except (ValueError, TypeError):
                    price = None

                if ticker and price is not None:
                    results.append({"ticker": ticker.replace("/", ""), "price": price})
            return results

        return data
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

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

@app.get("/stock_peers/{symbol}")
def get_stock_peers(symbol: str):
    target = symbol.upper()
    try:
        with open("peers_bulk.json", "r") as f:
            data = json.load(f)  # ← this is a list, not a dict

        for entry in data:
            if entry["symbol"].upper() == target:
                return {"symbol": target, "peers": entry["peers"]}

        # Optional: Fallback to online fetch
        return fetch_peers_from_csv_online(target)

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


def fetch_peers_from_csv_online(target: str):
    url = f"https://financialmodelingprep.com/stable/peers-bulk?apikey={FMP_API_KEY}"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    csv_reader = csv.DictReader(io.StringIO(resp.content.decode("utf-8")))

    for row in csv_reader:
        if row.get("symbol", "").upper() == target:
            peers = [p.strip() for p in row.get("peers", "").split(",") if p.strip()]
            return {"symbol": target, "peers": peers}

    return JSONResponse(status_code=404, content={"error": f"No peers found for {target}"})


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
    elif strategy == "mansfield":
        markers = analyser.get_mansfield_signals()
    elif strategy == "ndr":
        markers = analyser.get_ndr_signal(timeframe)
    elif strategy == "demarker":
        markers = analyser.get_demarker_signals(timeframe)
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


@app.get("/api/signal_strength/{symbol}")
def get_signal_strength(
    symbol: str,
    timeframe: str = Query("weekly"),
    strategy: str = Query("northstar")
):
    analyser = StockAnalyser(symbol)

    if strategy == "trendinvestorpro":
        return analyser.get_trendinvestorpro_status_and_strength(timeframe)
    elif strategy == "stclair":
        return analyser.get_stclair_status_and_strength(timeframe)
    elif strategy == "stclairlongterm":
        return analyser.get_stclairlongterm_status_and_strength()
    elif strategy == "mace_40w":
        return analyser.get_mace_40w_status_and_strength()
    elif strategy == "mansfield":
        return analyser.get_mansfield_status()
    elif strategy == "demarker":
        return analyser.get_demarker_status_and_strength(timeframe)
    elif strategy == "northstar":
        return analyser.get_northstar_status_and_strength(timeframe)
    elif strategy == "generic":
        return analyser.get_generic_strength_status(timeframe)
    else:
        return {"error": f"Unknown strategy: {strategy}"}
    
@app.get("/api/price_rsi_divergence/{symbol}")
def price_rsi_divergence(symbol: str):
    """Return simple price/RSI divergence on multiple timeframes."""
    analyser = StockAnalyser(symbol)
    return {
        "daily": analyser.simple_divergence_daily(),
        "weekly": analyser.simple_divergence_weekly(),
        "monthly": analyser.simple_divergence_monthly(),
    }