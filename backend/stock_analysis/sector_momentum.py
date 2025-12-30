"""Sector-relative momentum helper utilities."""
from __future__ import annotations

from functools import lru_cache
import json
import math
import os
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import requests

from .stock_analyser import StockAnalyser

FMP_API_KEY = os.getenv("FMP_API_KEY")
_FMP_PEERS_URL = "https://financialmodelingprep.com/api/v4/stock_peers"
_PEERS_BULK_PATH = Path(__file__).resolve().parent.parent / "peers_bulk.json"
_PORTFOLIO_STORE_PATH = Path(__file__).resolve().parent.parent / "portfolio_store.json"
_MAX_PEERS = 15


def _sanitize_symbol(symbol: str) -> str:
    return symbol.upper().strip()


def _sanitize_peers(peers: list[str] | None) -> list[str] | None:
    """Normalize a user-provided peer list.

    Returns ``None`` if no override was provided, otherwise returns a list that may
    be empty if the input had no valid symbols.
    """

    if peers is None:
        return None

    cleaned = []
    for peer in peers:
        if isinstance(peer, str):
            symbol = _sanitize_symbol(peer)
            if symbol:
                cleaned.append(symbol)

    # Preserve order but drop duplicates
    deduped: list[str] = []
    for peer in cleaned:
        if peer not in deduped:
            deduped.append(peer)

    return deduped


def _peer_returns(peers: list[str] | None, periods: tuple[int, ...]) -> dict[int, list[float]]:
    """Fetch peer price data once and compute returns for each requested period."""

    if not peers:
        return {period: [] for period in periods}

    cleaned_peers = [_sanitize_symbol(p) for p in peers if isinstance(p, str)]
    unique_peers: tuple[str, ...] = tuple(
        dict.fromkeys([p for p in cleaned_peers if p][:_MAX_PEERS])
    )

    return _peer_returns_cached(unique_peers, tuple(periods))


@lru_cache(maxsize=512)
def _peer_returns_cached(
    peers_key: tuple[str, ...], periods: tuple[int, ...]
) -> dict[int, list[float]]:
    """Cached peer return calculation keyed by peer set and requested periods."""

    returns_by_period: dict[int, list[float]] = {period: [] for period in periods}
    if not peers_key:
        return returns_by_period

    for peer in peers_key:
        try:
            peer_closes = StockAnalyser.get_price_data(peer)["Close"]
        except Exception:
            continue

        if isinstance(peer_closes, pd.DataFrame):
            peer_closes = peer_closes.iloc[:, 0]

        peer_closes = peer_closes.dropna()
        if peer_closes.empty:
            continue

        for period in periods:
            value = period_return(peer_closes, period)
            if value is not None and math.isfinite(value):
                returns_by_period.setdefault(period, []).append(value)

    return returns_by_period


@lru_cache(maxsize=256)
def _fetch_peers_via_api(symbol: str) -> list[str]:
    """Query FMP's stock_peers endpoint for the latest peer list."""
    if not FMP_API_KEY:
        return []

    params = {"symbol": _sanitize_symbol(symbol), "apikey": FMP_API_KEY}
    try:
        resp = requests.get(_FMP_PEERS_URL, params=params, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            peer_list = data.get("peersList") or data.get("peers")
            if isinstance(peer_list, list):
                return [p for p in peer_list if isinstance(p, str)]
        if isinstance(data, list) and data:
            entry = data[0]
            if isinstance(entry, dict):
                peer_list = entry.get("peersList") or entry.get("peers")
                if isinstance(peer_list, list):
                    return [p for p in peer_list if isinstance(p, str)]
    except Exception as exc:
        print(f"[momentum] Peer API fetch failed for {symbol}: {exc}")
    return []


@lru_cache(maxsize=1)
def _load_bulk_peers() -> dict[str, list[str]]:
    if not _PEERS_BULK_PATH.exists():
        return {}
    try:
        with open(_PEERS_BULK_PATH, "r") as handle:
            data = json.load(handle)
    except Exception as exc:
        print(f"[momentum] Failed to load peers_bulk.json: {exc}")
        return {}
    lookup: dict[str, list[str]] = {}
    for entry in data:
        if not isinstance(entry, dict):
            continue
        symbol = entry.get("symbol")
        peers = entry.get("peers")
        if isinstance(symbol, str) and isinstance(peers, list):
            lookup[_sanitize_symbol(symbol)] = [
                p for p in peers if isinstance(p, str)
            ]
    return lookup


@lru_cache(maxsize=1)
def _load_portfolio_peers() -> dict[str, list[str]]:
    if not _PORTFOLIO_STORE_PATH.exists():
        return {}
    try:
        with open(_PORTFOLIO_STORE_PATH, "r") as handle:
            data = json.load(handle)
    except Exception as exc:
        print(f"[momentum] Failed to load portfolio_store.json: {exc}")
        return {}

    equities = data.get("equities") if isinstance(data, dict) else None
    if not isinstance(equities, list):
        return {}

    lookup: dict[str, list[str]] = {}
    for entry in equities:
        if not isinstance(entry, dict):
            continue
        symbol = entry.get("ticker")
        peers = entry.get("peers")
        if isinstance(symbol, str) and isinstance(peers, list):
            cleaned_symbol = _sanitize_symbol(symbol)
            cleaned_peers = [p for p in peers if isinstance(p, str)]
            if cleaned_peers:
                lookup[cleaned_symbol] = cleaned_peers
    return lookup


@lru_cache(maxsize=512)
def get_fmp_peers(symbol: str) -> list[str]:
    """Return peers for *symbol*, preferring custom list, then FMP data."""
    cleaned = _sanitize_symbol(symbol)
    portfolio_peers = _load_portfolio_peers().get(cleaned)
    if portfolio_peers:
        return portfolio_peers
    peers = _fetch_peers_via_api(cleaned)
    if peers:
        return peers
    return _load_bulk_peers().get(cleaned, [])


def _pct_change(series: pd.Series, periods: int) -> float | None:
    if not isinstance(series, pd.Series) or len(series) <= periods:
        return None
    try:
        current = float(series.iloc[-1])
        reference = float(series.iloc[-(periods + 1)])
    except Exception:
        return None
    if reference == 0:
        return None
    return (current / reference) - 1


def _blended_return(series: pd.Series) -> float | None:
    """Combine 1D/1W/1M returns into a single score."""
    weights = {1: 0.5, 5: 0.3, 21: 0.2}
    total = 0.0
    weight_sum = 0.0
    for period, weight in weights.items():
        change = _pct_change(series, period)
        if change is None:
            continue
        total += change * weight
        weight_sum += weight
    if weight_sum == 0:
        return None
    return total / weight_sum


def period_return(series: pd.Series | None, periods: int) -> float | None:
    """Return a blended daily return over the last ``periods`` sessions.

    Instead of a single point-to-point percentage change, this computes a
    weighted average of the most recent ``periods`` daily percentage changes,
    emphasizing the latest session. This preserves the "blended" feel while
    focusing the score on the requested window (e.g., 5 or 21 trading days).
    """

    if series is None:
        return None

    if isinstance(series, pd.DataFrame):
        series = series.iloc[:, 0]

    series = series.dropna()
    if series.empty:
        return None

    daily_returns = series.pct_change().dropna()
    if len(daily_returns) < periods:
        return None

    window = daily_returns.iloc[-periods:]

    # Linearly increasing weights so the most recent sessions count more.
    weights = np.linspace(1.0, float(periods), num=periods)
    weights = weights / weights.sum()

    blended = float(np.dot(window.values, weights))
    if not math.isfinite(blended):
        return None

    return blended


def _z_score(value: float, samples: Iterable[float]) -> float | None:
    arr = np.array([s for s in samples if isinstance(s, (int, float))], dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size < 2:
        return None
    mean = float(arr.mean())
    std = float(arr.std(ddof=0))
    if std == 0:
        return 0.0
    return (value - mean) / std


def sector_relative_momentum_zscore(
    symbol: str,
    closes: pd.Series | None = None,
    period_days: int = 5,
    peers_override: list[str] | None = None,
    peer_returns: list[float] | None = None,
    base_return: float | None = None,
) -> float | None:
    """Compute the z-score of a symbol's return over a given period vs. peers."""
    cleaned = _sanitize_symbol(symbol)
    if closes is None:
        try:
            closes = StockAnalyser.get_price_data(cleaned)["Close"]
        except Exception as exc:
            print(f"[momentum] Failed to load price data for {symbol}: {exc}")
            return None
    if isinstance(closes, pd.DataFrame):
        closes = closes.iloc[:, 0]
    closes = closes.dropna()
    if closes.empty:
        return None

    if base_return is None:
        base_return = period_return(closes, period_days)
    if base_return is None:
        return None

    peers = _sanitize_peers(peers_override)
    if peer_returns is None:
        if peers is None:
            peers = get_fmp_peers(cleaned)
        peer_returns = _peer_returns(peers, (period_days,)).get(period_days, [])

    if not peer_returns:
        return None

    z_score = _z_score(base_return, [base_return, *peer_returns])
    if z_score is None:
        return None
    # Limit to a reasonable precision for display purposes
    return round(float(z_score), 4)


def portfolio_relative_momentum_zscores(
    returns_map: dict[str, float]
) -> dict[str, float]:
    """Calculate z-scores of blended returns against the entire portfolio.

    Args:
        returns_map: Mapping of ticker → blended return value.

    Returns:
        Mapping of ticker → z-score (rounded to 4 decimals). Symbols without a
        valid return are excluded.
    """

    values = [value for value in returns_map.values() if math.isfinite(value)]
    if len(values) < 2:
        return {}

    zscores: dict[str, float] = {}
    for symbol, value in returns_map.items():
        z_score = _z_score(value, values)
        if z_score is not None:
            zscores[symbol] = round(float(z_score), 4)
    return zscores


__all__ = [
    "get_fmp_peers",
    "period_return",
    "portfolio_relative_momentum_zscores",
    "sector_relative_momentum_zscore",
]