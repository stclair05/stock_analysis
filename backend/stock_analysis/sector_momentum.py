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
_MAX_PEERS = 15


def _sanitize_symbol(symbol: str) -> str:
    return symbol.upper().strip()


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


@lru_cache(maxsize=512)
def get_fmp_peers(symbol: str) -> list[str]:
    """Return peers for *symbol*, preferring live API data."""
    cleaned = _sanitize_symbol(symbol)
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
    symbol: str, closes: pd.Series | None = None
) -> float | None:
    """Compute the z-score of a symbol's blended returns vs. its FMP peers."""
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

    base_return = _blended_return(closes)
    if base_return is None:
        return None

    peer_returns: list[float] = []
    peers = get_fmp_peers(cleaned)
    for peer in peers[:_MAX_PEERS]:
        try:
            peer_closes = StockAnalyser.get_price_data(peer)["Close"]
        except Exception:
            continue
        if isinstance(peer_closes, pd.DataFrame):
            peer_closes = peer_closes.iloc[:, 0]
        peer_closes = peer_closes.dropna()
        if peer_closes.empty:
            continue
        value = _blended_return(peer_closes)
        if value is not None and math.isfinite(value):
            peer_returns.append(value)

    if not peer_returns:
        return None

    z_score = _z_score(base_return, [base_return, *peer_returns])
    if z_score is None:
        return None
    # Limit to a reasonable precision for display purposes
    return round(float(z_score), 4)


__all__ = ["sector_relative_momentum_zscore", "get_fmp_peers"]