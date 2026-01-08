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
from stock_analysis.sector_momentum import (
    _peer_returns,
    _sanitize_peers,
    get_fmp_peers,
    period_return,
    portfolio_relative_momentum_zscores,
    sector_relative_momentum_zscore,
     _z_score,
)
from fastapi.responses import JSONResponse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from time import time
import math
from aliases import SYMBOL_ALIASES
import yfinance as yf
import asyncio
import json
from typing import List, Literal
import boto3
import os
import pandas as pd
import re
from fastapi import Query
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Symbol → (Fundamentals, timestamp)
_fundamentals_cache: dict[tuple[str, str], tuple[FinancialMetrics, float]] = {}
_FUNDAMENTALS_TTL_SECONDS = 60 * 60  # 60 minutes
PORTFOLIO_RETURNS_CACHE: dict[int, dict[str, float]] = {}
PORTFOLIO_RETURNS_LAST_UPDATED: dict[int, float] = {}
PORTFOLIO_RETURNS_TTL_SECONDS = 60 * 60  # 60 minutes cache


class CustomMomentumRequest(BaseModel):
    symbols: List[str]
    baseline: Literal["portfolio", "spx", "dji", "iwm", "nasdaq"] = "portfolio"


def _sanitize_symbols_list(symbols: List[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for sym in symbols:
        if not isinstance(sym, str):
            continue
        normalized = sym.strip().upper()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(normalized)
    return cleaned


def _get_portfolio_equities():
    json_path = Path("portfolio_store.json")
    if not json_path.exists():
        return []
    with open(json_path, "r") as f:
        data = json.load(f)
        equities = data.get("equities", [])
        return [
            item for item in equities if isinstance(item, dict) and "ticker" in item
        ]


def _return_for_symbol(
    symbol: str, period_days: int, price_data: pd.DataFrame | None = None
) -> tuple[str, float | None]:
    try:
        df = price_data if price_data is not None else StockAnalyser.get_price_data(symbol)
        closes = df.get("Close") if df is not None else None
        if closes is None:
            return symbol, None
        if isinstance(closes, pd.DataFrame):
            closes = closes.iloc[:, 0]
        ret_value = period_return(closes, period_days)
        if ret_value is None:
            return symbol, None
        ret_value = float(ret_value)
        if math.isfinite(ret_value):
            return symbol, ret_value
    except Exception:
        return symbol, None
    return symbol, None


BENCHMARK_SYMBOLS = {
    "spx": SYMBOL_ALIASES.get("SPX", "^GSPC"),
    "dji": SYMBOL_ALIASES.get("DJI", "^DJI"),
    "iwm": "IWM",
    "nasdaq": SYMBOL_ALIASES.get("NASDAQ", "^IXIC"),
}


def _benchmark_daily_returns(baseline: str, period_days: int) -> list[float]:
    symbol = BENCHMARK_SYMBOLS.get(baseline)
    if not symbol:
        return []
    symbol = SYMBOL_ALIASES.get(symbol, symbol)
    try:
        df = StockAnalyser.get_price_data(symbol)
    except Exception:
        return []
    closes = df.get("Close") if df is not None else None
    if closes is None:
        return []
    if isinstance(closes, pd.DataFrame):
        closes = closes.iloc[:, 0]
    closes = closes.dropna()
    if closes.empty:
        return []
    daily_returns = closes.pct_change().dropna()
    if len(daily_returns) < period_days:
        return []
    window = daily_returns.iloc[-period_days:]
    return [float(val) for val in window.values if math.isfinite(val)]


def _scores_against_values(
    returns: dict[str, float], baseline_values: list[float]
) -> dict[str, float]:
    cleaned = [value for value in baseline_values if math.isfinite(value)]
    if len(cleaned) < 2:
        return {}

    scores: dict[str, float] = {}
    for symbol, value in returns.items():
        z_score = _z_score(value, cleaned)
        if z_score is not None:
            scores[symbol] = round(float(z_score), 4)
    return scores


def _scores_against_baseline(
    returns: dict[str, float],
    baseline: str,
    period_days: int,
    *,
    portfolio_baseline: dict[str, float] | None = None,
) -> dict[str, float]:
    if baseline == "portfolio":
        if portfolio_baseline is None:
            return portfolio_relative_momentum_zscores(returns)
        return _scores_against_values(returns, list(portfolio_baseline.values()))

    benchmark_returns = _benchmark_daily_returns(baseline, period_days)
    return _scores_against_values(returns, benchmark_returns)


def _portfolio_returns(period_days: int) -> dict[str, float]:
    global PORTFOLIO_RETURNS_CACHE, PORTFOLIO_RETURNS_LAST_UPDATED

    now = time()
    cached = PORTFOLIO_RETURNS_CACHE.get(period_days)
    last_updated = PORTFOLIO_RETURNS_LAST_UPDATED.get(period_days, 0.0)
    if cached and now - last_updated < PORTFOLIO_RETURNS_TTL_SECONDS:
        return cached

    equities = _get_portfolio_equities()
    symbols = [item["ticker"] for item in equities if isinstance(item.get("ticker"), str)]
    if not symbols:
        PORTFOLIO_RETURNS_CACHE[period_days] = {}
        PORTFOLIO_RETURNS_LAST_UPDATED[period_days] = now
        return PORTFOLIO_RETURNS_CACHE[period_days]

    price_data_map: dict[str, pd.DataFrame] = {}
    with ThreadPoolExecutor(max_workers=8) as executor:
        fetch_futures = {
            executor.submit(StockAnalyser.get_price_data, symbol): symbol for symbol in symbols
        }
        for future in as_completed(fetch_futures):
            symbol = fetch_futures[future]
            try:
                price_data_map[symbol] = future.result()
            except Exception:
                continue

    returns: dict[str, float] = {}
    for symbol, df in price_data_map.items():
        _, value = _return_for_symbol(symbol, period_days, price_data=df)
        if value is not None:
            returns[symbol] = value

    PORTFOLIO_RETURNS_CACHE[period_days] = returns
    PORTFOLIO_RETURNS_LAST_UPDATED[period_days] = now
    return PORTFOLIO_RETURNS_CACHE[period_days]

def _update_portfolio_returns_cache(returns: dict[str, float], period_days: int):
    """Persist precomputed portfolio returns to avoid redundant downloads."""

    global PORTFOLIO_RETURNS_CACHE, PORTFOLIO_RETURNS_LAST_UPDATED

    now = time()
    PORTFOLIO_RETURNS_CACHE[period_days] = returns
    PORTFOLIO_RETURNS_LAST_UPDATED[period_days] = now


@app.post("/custom_momentum")
def custom_momentum(payload: CustomMomentumRequest):
    symbols = _sanitize_symbols_list(payload.symbols)
    if not symbols:
        return {"momentum_weekly": {}, "momentum_monthly": {}}

    price_data_map: dict[str, pd.DataFrame] = {}
    with ThreadPoolExecutor(max_workers=8) as executor:
        fetch_futures = {
            executor.submit(StockAnalyser.get_price_data, symbol): symbol
            for symbol in symbols
        }
        for future in as_completed(fetch_futures):
            symbol = fetch_futures[future]
            try:
                price_data_map[symbol] = future.result()
            except Exception:
                continue

    weekly_returns: dict[str, float] = {}
    monthly_returns: dict[str, float] = {}
    for symbol, df in price_data_map.items():
        _, weekly_val = _return_for_symbol(symbol, 5, price_data=df)
        if weekly_val is not None:
            weekly_returns[symbol] = weekly_val

        _, monthly_val = _return_for_symbol(symbol, 21, price_data=df)
        if monthly_val is not None:
            monthly_returns[symbol] = monthly_val

    baseline = payload.baseline
    portfolio_weekly = _portfolio_returns(5)
    portfolio_monthly = _portfolio_returns(21)
    weekly_scores = _scores_against_baseline(
        weekly_returns,
        baseline,
        5,
        portfolio_baseline=portfolio_weekly,
    )
    monthly_scores = _scores_against_baseline(
        monthly_returns,
        baseline,
        21,
        portfolio_baseline=portfolio_monthly,
    )

    return {
        "momentum_weekly": weekly_scores,
        "momentum_monthly": monthly_scores,
    }


@app.post("/analyse", response_model=StockAnalysisResponse)
def analyse(stock_request: StockRequest):
    analyser = StockAnalyser(stock_request.symbol)
    change_amt, change_pct = analyser.get_daily_change()
    closes = analyser.df.get("Close")
    if closes is not None and isinstance(closes, pd.DataFrame):
        closes = closes.iloc[:, 0]

    peers_override = _sanitize_peers(stock_request.peers_override)
    peers_for_analysis = (
        peers_override if peers_override is not None else get_fmp_peers(stock_request.symbol)
    )

    weekly_return = period_return(closes, 5) if closes is not None else None
    monthly_return = period_return(closes, 21) if closes is not None else None

    peer_returns_map = _peer_returns(peers_for_analysis, (5, 21))

    weekly_momentum_score = (
        sector_relative_momentum_zscore(
            stock_request.symbol,
            closes,
            5,
            peers_override=peers_for_analysis,
            peer_returns=peer_returns_map.get(5),
            base_return=weekly_return,
        )
        if closes is not None
        else None
    )
    monthly_momentum_score = (
        sector_relative_momentum_zscore(
            stock_request.symbol,
            closes,
            21,
            peers_override=peers_for_analysis,
            peer_returns=peer_returns_map.get(21),
            base_return=monthly_return,
        )
        if closes is not None
        else None
    )
    peers = peers_for_analysis

    weekly_portfolio_momentum_score = None
    monthly_portfolio_momentum_score = None
    try:
        if weekly_return is not None and math.isfinite(float(weekly_return)):
            weekly_portfolio = _portfolio_returns(5)
            combined = {**weekly_portfolio, stock_request.symbol: float(weekly_return)}
            weekly_scores = portfolio_relative_momentum_zscores(combined)
            weekly_portfolio_momentum_score = weekly_scores.get(stock_request.symbol)

        if monthly_return is not None and math.isfinite(float(monthly_return)):
            monthly_portfolio = _portfolio_returns(21)
            combined_monthly = {
                **monthly_portfolio,
                stock_request.symbol: float(monthly_return),
            }
            monthly_scores = portfolio_relative_momentum_zscores(combined_monthly)
            monthly_portfolio_momentum_score = monthly_scores.get(stock_request.symbol)
    except Exception:
        weekly_portfolio_momentum_score = None
        monthly_portfolio_momentum_score = None

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
        sector_momentum_zscore_weekly=weekly_momentum_score,
        sector_momentum_zscore_monthly=monthly_momentum_score,
        sector_peers=peers,
        portfolio_momentum_zscore_weekly=weekly_portfolio_momentum_score,
        portfolio_momentum_zscore_monthly=monthly_portfolio_momentum_score,
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
    equities = _get_portfolio_equities()
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


def _status_for_holdings(
    holdings,
    price_direction: str,
    *,
    momentum_only: bool = False,
    baseline: Literal["portfolio", "spx", "dji", "iwm", "nasdaq"] = "portfolio",
):
    price_key_20 = "below_20dma" if price_direction == "below" else "above_20dma"
    price_key_200 = "below_200dma" if price_direction == "below" else "above_200dma"
    ma_prefix = "below" if price_direction == "below" else "above"
    ma40_key = f"{ma_prefix}_40wma"
    ma70_key = f"{ma_prefix}_70wma"
    ma3y_key = f"{ma_prefix}_3yma"

    results = (
        {
            "momentum_weekly": {},
            "momentum_monthly": {},
            "portfolio_momentum_weekly": {},
            "portfolio_momentum_monthly": {},
            "portfolio_values": {},
        }
        if momentum_only
        else {
            price_key_20: [],
            price_key_200: [],
            ma40_key: [],
            ma70_key: [],
            ma3y_key: [],
            "candle_signals": {},
            "extended_vol": {},
            "super_trend_daily": {},
            "mansfield_daily": {},
            "mace": {},
            "stage": {},
            "short_term_trend": {},
            "long_term_trend": {},
            "breach_hit": {},
            "ma_crossovers": {},
            "momentum_weekly": {},
            "momentum_monthly": {},
            "portfolio_momentum_weekly": {},
            "portfolio_momentum_monthly": {},
            "portfolio_values": {},
            "divergence": {},
        }
    )

    weekly_portfolio_returns: dict[str, float] = {}
    monthly_portfolio_returns: dict[str, float] = {}

    for holding in holdings:
        ticker = holding.get("ticker")
        if not ticker:
            continue
        try:
            analyser = StockAnalyser(ticker)
            flagged = False

            closes = analyser.df["Close"]
            if isinstance(closes, pd.DataFrame):
                closes = closes.iloc[:, 0]

            weekly_return = period_return(closes, 5)
            monthly_return = period_return(closes, 21)
            last_close = safe_value(closes, -1)

            shares = holding.get("shares")
            if isinstance(shares, (int, float)) and isinstance(
                last_close, (int, float)
            ):
                results["portfolio_values"][ticker] = float(shares) * float(
                    last_close
                )

            if not momentum_only:
                price = analyser.get_current_price()
                last_close = safe_value(closes, -1)
                prev_close = safe_value(closes, -2)

                def _latest_weekly_ma(period: int):
                    try:
                        weekly_close = analyser.weekly_df["Close"]
                    except Exception:
                        return None, None
                    if isinstance(weekly_close, pd.DataFrame):
                        weekly_close = weekly_close.iloc[:, 0]
                    ma_series = weekly_close.rolling(window=period).mean()
                    return safe_value(ma_series, -1), safe_value(ma_series, -2)

                ma_40, ma_40_prev = _latest_weekly_ma(40)
                ma_70, ma_70_prev = _latest_weekly_ma(70)
                ma_3y, ma_3y_prev = _latest_weekly_ma(156)

                ma20_series = closes.rolling(window=20).mean()
                ma200_series = closes.rolling(window=200).mean()
                twenty = safe_value(ma20_series, -1)
                ma20_prev = safe_value(ma20_series, -2)
                two_hundred = safe_value(ma200_series, -1)
                ma200_prev = safe_value(ma200_series, -2)

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

            if not momentum_only:
                peers_for_analysis = get_fmp_peers(ticker)
                peer_returns_map = _peer_returns(peers_for_analysis, (5, 21))

                weekly_momentum_score = sector_relative_momentum_zscore(
                    ticker,
                    closes,
                    5,
                    peers_override=peers_for_analysis,
                    peer_returns=peer_returns_map.get(5),
                    base_return=weekly_return,
                )
                if isinstance(weekly_momentum_score, (int, float)):
                    results["momentum_weekly"][ticker] = weekly_momentum_score

                monthly_momentum_score = sector_relative_momentum_zscore(
                    ticker,
                    closes,
                    21,
                    peers_override=peers_for_analysis,
                    peer_returns=peer_returns_map.get(21),
                    base_return=monthly_return,
                )
                if isinstance(monthly_momentum_score, (int, float)):
                    results["momentum_monthly"][ticker] = monthly_momentum_score

            if isinstance(weekly_return, (int, float)):
                weekly_portfolio_returns[ticker] = weekly_return

            if isinstance(monthly_return, (int, float)):
                monthly_portfolio_returns[ticker] = monthly_return

            if momentum_only:
                continue

            if isinstance(price, (int, float)) and isinstance(twenty, (int, float)):
                if price_direction == "below" and price < twenty:
                    results[price_key_20].append(ticker)
                    flagged = True
                if price_direction == "above" and price >= twenty:
                    results[price_key_20].append(ticker)
                    flagged = True

            if isinstance(price, (int, float)) and isinstance(two_hundred, (int, float)):
                if price_direction == "below" and price < two_hundred:
                    results[price_key_200].append(ticker)
                    flagged = True
                if price_direction == "above" and price >= two_hundred:
                    results[price_key_200].append(ticker)
                    flagged = True
            
            def _detect_cross(ma_current, ma_previous=None):
                if not (
                    isinstance(last_close, (int, float))
                    and isinstance(prev_close, (int, float))
                    and isinstance(ma_current, (int, float))
                ):
                    return None
                prev_ma_val = ma_previous if isinstance(ma_previous, (int, float)) else ma_current
                prev_diff = prev_close - prev_ma_val
                curr_diff = last_close - ma_current
                if prev_diff < 0 <= curr_diff:
                    return "above"
                if prev_diff >= 0 > curr_diff:
                    return "below"
                return None

            def _compare_price(ma_value, key):
                nonlocal flagged
                if not (
                    isinstance(price, (int, float)) and isinstance(ma_value, (int, float))
                ):
                    return
                if price_direction == "below" and price < ma_value:
                    results[key].append(ticker)
                    flagged = True
                if price_direction == "above" and price >= ma_value:
                    results[key].append(ticker)
                    flagged = True

            _compare_price(ma_40, ma40_key)
            _compare_price(ma_70, ma70_key)
            _compare_price(ma_3y, ma3y_key)

            ma_cross = {}
            for cross_key, current, previous in (
                ("20dma", twenty, ma20_prev),
                ("200dma", two_hundred, ma200_prev),
                ("40wma", ma_40, ma_40_prev),
                ("70wma", ma_70, ma_70_prev),
                ("3yma", ma_3y, ma_3y_prev),
            ):
                direction = _detect_cross(current, previous)
                if direction:
                    ma_cross[cross_key] = direction

            if ma_cross:
                results["ma_crossovers"][ticker] = ma_cross

            divergence = {
                "daily": analyser.simple_divergence_daily(),
                "weekly": analyser.simple_divergence_weekly(),
                "monthly": analyser.simple_divergence_monthly(),
            }
            if any(
                isinstance(val, str) and val != "No Divergence"
                for val in divergence.values()
            ):
                results["divergence"][ticker] = divergence
                flagged = True    

            timeframe_order = {"daily": 0, "weekly": 1, "monthly": 2}

            def _collect_patterns(
                name: str, patterns: dict | None, store: dict[tuple[str, str], set[str]]
            ):
                if not isinstance(patterns, dict):
                    return
                for timeframe, pattern in patterns.items():
                    if not isinstance(pattern, str):
                        continue
                    lower = pattern.lower()
                    pattern_type = None
                    if "bullish" in lower:
                        pattern_type = "bullish"
                    elif "bearish" in lower:
                        pattern_type = "bearish"
                    if not pattern_type:
                        continue
                    key = (name, pattern_type)
                    store.setdefault(key, set()).add(timeframe)

            candle_patterns: dict[tuple[str, str], set[str]] = {}
            _collect_patterns("engulfing", analyser.detect_engulfing(), candle_patterns)
            _collect_patterns("harami", analyser.detect_harami(), candle_patterns)

            if candle_patterns:
                summary = []
                for (pattern_name, pattern_type), frames in candle_patterns.items():
                    if not frames:
                        continue
                    ordered_frames = sorted(
                        frames, key=lambda tf: timeframe_order.get(tf, 99)
                    )
                    summary.append(
                        {
                            "pattern": pattern_name,
                            "type": pattern_type,
                            "timeframes": ordered_frames,
                        }
                    )
                if summary:
                    results["candle_signals"][ticker] = summary
                    flagged = True

            rsi_series = compute_wilder_rsi(analyser.df["Close"])
            rsi_val = safe_value(rsi_series, -1)
            if isinstance(rsi_val, (int, float)):
                if rsi_val >= 70:
                    results["extended_vol"][ticker] = "overbought"
                    flagged = True
                elif rsi_val <= 30:
                    results["extended_vol"][ticker] = "oversold"
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

    _update_portfolio_returns_cache(weekly_portfolio_returns, 5)
    _update_portfolio_returns_cache(monthly_portfolio_returns, 21)

    results["portfolio_momentum_weekly"] = _scores_against_baseline(
        weekly_portfolio_returns, baseline, 5
    )
    results["portfolio_momentum_monthly"] = _scores_against_baseline(
        monthly_portfolio_returns, baseline, 21
    )

    return results

@app.get("/portfolio_status")
def get_portfolio_status(
    direction: Literal["above", "below"] = Query("below"),
    scope: Literal["full", "momentum"] = Query("full"),
    baseline: Literal["portfolio", "spx", "dji", "iwm", "nasdaq"] = Query("portfolio"),
):
    json_path = Path("portfolio_store.json")
    price_key_20 = "below_20dma" if direction == "below" else "above_20dma"
    price_key_200 = "below_200dma" if direction == "below" else "above_200dma"
    ma_prefix = "below" if direction == "below" else "above"
    ma40_key = f"{ma_prefix}_40wma"
    ma70_key = f"{ma_prefix}_70wma"
    ma3y_key = f"{ma_prefix}_3yma"

    if not json_path.exists():
        base = {
            "momentum_weekly": {},
            "momentum_monthly": {},
            "portfolio_momentum_weekly": {},
            "portfolio_momentum_monthly": {},
            "portfolio_values": {},
        }

        if scope == "momentum":
            return base
        
        return {
            price_key_20: [],
            price_key_200: [],
            ma40_key: [],
            ma70_key: [],
            ma3y_key: [],
            "candle_signals": {},
            "extended_vol": {},
            "super_trend_daily": {},
            "mansfield_daily": {},
            "mace": {},
            "stage": {},
            "short_term_trend": {},
            "long_term_trend": {},
            "breach_hit": {},
            "ma_crossovers": {},
            **base,
            "divergence": {},
        }

    with open(json_path, "r") as f:
        data = json.load(f)
        equities = [
            item
            for item in data.get("equities", [])
            if isinstance(item, dict) and "ticker" in item
        ]

    return _status_for_holdings(
        equities,
        direction,
        momentum_only=scope == "momentum",
        baseline=baseline,
    )


@app.get("/fmp_financials/{symbol}", response_model=FinancialMetrics)
async def get_fmp_financials(symbol: str):
    try:
        now = time()
        cache_key = ("fmp", symbol)
        cached = _fundamentals_cache.get(cache_key)
        if cached:
            metrics, ts = cached
            if now - ts < _FUNDAMENTALS_TTL_SECONDS:
                metrics_dict = metrics.model_dump() if hasattr(metrics, "model_dump") else metrics.dict()
                return JSONResponse(metrics_dict)
            
        fundamentals = FMPFundamentals(symbol)
        metrics = fundamentals.get_financial_metrics()
        # Grab the latest quarterly income statement date (or use another source if you prefer)
        as_of_date = fundamentals.income_data[0].get("date") if fundamentals.income_data else None
        # Convert metrics to dict
        metrics_dict = metrics.model_dump() if hasattr(metrics, "model_dump") else metrics.dict()
        # Add the as_of_date field
        metrics_dict["as_of_date"] = as_of_date

        _fundamentals_cache[cache_key] = (metrics, now)

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
        now = time()
        cache_key = ("12data", symbol)
        cached = _fundamentals_cache.get(cache_key)
        if cached:
            metrics, ts = cached
            if now - ts < _FUNDAMENTALS_TTL_SECONDS:
                return metrics
            
        fundamentals = TwelveDataFundamentals(symbol)
        metrics = fundamentals.get_financial_metrics()
        _fundamentals_cache[cache_key] = (metrics, now)
        return metrics
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
            "above_40wma": [],
            "above_70wma": [],
            "above_3yma": [],
            "candle_signals": {},
            "extended_vol": {},
            "super_trend_daily": {},
            "mansfield_daily": {},
            "mace": {},
            "stage": {},
            "short_term_trend": {},
            "long_term_trend": {},
            "breach_hit": {},
            "ma_crossovers": {},
            "momentum_weekly": {},
            "momentum_monthly": {},
            "portfolio_momentum_weekly": {},
            "portfolio_momentum_monthly": {},
            "divergence": {},
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
    """Return peers from FMP's live API with peers_bulk.json as fallback."""

    from stock_analysis.sector_momentum import get_fmp_peers

    target = symbol.upper()
    try:
        return {"symbol": target, "peers": get_fmp_peers(target)}
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