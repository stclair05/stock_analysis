import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
import yfinance as yf

from aliases import SYMBOL_ALIASES
from .stock_analyser import StockAnalyser

class PortfolioAnalyser:
    def __init__(self, json_path: str = "portfolio_store.json"):
        self.json_path = Path(json_path)
        self.fx_rate = None
        self.portfolio_data = self._load_portfolio()

    def _load_portfolio(self):
        if not self.json_path.exists():
            raise FileNotFoundError("Portfolio JSON file not found.")
        with open(self.json_path, "r") as f:
            data = json.load(f)
        # flatten all positions into a list, but keep asset class in each item
        flattened = []
        for category, items in data.items():
            for item in items:
                item = dict(item)  # shallow copy
                item["category"] = category  # tag with asset class
                flattened.append(item)
        return flattened

    def _fetch_fx_rate(self):
        try:
            fx_data = yf.Ticker("GBPUSD=X").history(period="1d")
            if not fx_data.empty:
                self.fx_rate = fx_data["Close"].iloc[-1]
            else:
                self.fx_rate = 1.0
        except Exception:
            self.fx_rate = 1.0

    def _compute_period_change(self, closes: Optional[pd.Series], period: int) -> Optional[float]:
        if closes is None or closes.empty:
            return None

        series = closes if not isinstance(closes, pd.DataFrame) else closes.iloc[:, 0]
        if len(series) < period:
            return None

        latest = series.iloc[-1]
        prior = series.iloc[-period]
        if prior is None or prior == 0:
            return None

        try:
            return round(((float(latest) - float(prior)) / float(prior)) * 100, 2)
        except Exception:
            return None

    def _get_price_and_change(
        self, ticker: str
    ) -> tuple[
        Optional[float],
        Optional[float],
        Optional[float],
        Optional[pd.Series],
        dict[str, Optional[float]],
    ]:
        """Return price, daily change, % change, close history, and period changes."""

        raw_symbol = ticker.upper().strip()
        symbol = SYMBOL_ALIASES.get(raw_symbol, raw_symbol)

        if symbol in {"XAUUSD", "XAGUSD", "PAUSD", "PLUSD"}:
            price, prev_close = self._get_fmp_price(symbol)
            period_changes = self._get_fmp_price_change(ticker)
            if price is not None:
                change = price - prev_close if prev_close else None
                change_pct = (change / prev_close * 100) if prev_close else None
                return price, change, change_pct, None, period_changes
            
        try:
            yf_ticker = yf.Ticker(symbol)
            hist = yf_ticker.history(period="2mo")

            close_today: Optional[float] = None
            close_prev: Optional[float] = None
            closes_series = hist["Close"] if not hist.empty else None
            if not hist.empty:
                close_today = hist["Close"].iloc[-1]
                if len(hist) > 1:
                    close_prev = hist["Close"].iloc[-2]

            if close_today is None:
                info = yf_ticker.info
                close_today = info.get("currentPrice") or info.get("regularMarketPrice")
                close_prev = info.get("previousClose")
                closes_series = None

            if close_today is None:
                try:
                    df = StockAnalyser.get_price_data(symbol)
                    if not df.empty:
                        close_today = df["Close"].iloc[-1]
                        close_prev = df["Close"].iloc[-2] if len(df) > 1 else None
                        closes_series = df["Close"]
                except Exception:
                    close_today = None

            if close_today is None:
                return None, None, None, None, {}

            change = None
            change_pct = None

            if close_prev:
                change = float(close_today) - float(close_prev)
                change_pct = (change / float(close_prev)) * 100 if close_prev else None

            return float(close_today), change, change_pct, closes_series, {}
        
        except Exception:
            return None, None, None, None, {}

    def _get_fmp_price(self, ticker: str) -> tuple[Optional[float], Optional[float]]:
        base_url = os.getenv("FMP_BASE_URL")
        api_key = os.getenv("FMP_API_KEY")

        if not base_url or not api_key:
            return None, None

        url = f"{base_url}/quote/{ticker}?apikey={api_key}"

        try:
            resp = requests.get(url, timeout=8)
            resp.raise_for_status()
            data = resp.json()

            if isinstance(data, list) and data:
                quote = data[0]
                price = quote.get("price")
                prev_close = quote.get("previousClose") or quote.get("previousPrice")

                if price is not None:
                    return float(price), float(prev_close) if prev_close is not None else None
        except Exception:
            return None, None

        return None, None
    
    def _get_fmp_price_change(self, ticker: str) -> dict[str, Optional[float]]:
        api_key = os.getenv("FMP_API_KEY")
        if not api_key:
            return {}

        url = f"https://financialmodelingprep.com/stable/stock-price-change?symbol={ticker}&apikey={api_key}"

        try:
            resp = requests.get(url, timeout=8)
            resp.raise_for_status()
            data = resp.json()

            if isinstance(data, list) and data:
                change_data = data[0]
                results: dict[str, Optional[float]] = {}

                five_day = change_data.get("5D")
                twenty_one_day = change_data.get("21D") or change_data.get("1M")

                if five_day is not None:
                    results["5D"] = float(five_day)
                if twenty_one_day is not None:
                    # FMP does not offer a 21D field; fall back to 1M if present.
                    results["21D"] = float(twenty_one_day)

                return results
        except Exception:
            return {}

        return {}

    def _process_single_item(self, item: dict) -> Optional[dict]:
        try:
            ticker = item["ticker"]
            shares = item["shares"]
            average_cost = item["average_cost"]
            invested_capital = shares * average_cost
            category = item.get("category", "Other") 

            (
                current_price,
                change,
                change_pct,
                closes,
                period_changes,
            ) = self._get_price_and_change(ticker)

            if ticker.endswith(".L"):
                if current_price is not None:
                    current_price /= 100  # Convert GBp to GBP
                if change is not None:
                    change /= 100
                if closes is not None:
                    closes = closes / 100

                if self.fx_rate:
                    current_price *= self.fx_rate
                    if change is not None:
                        change *= self.fx_rate
                    if closes is not None:
                        closes = closes * self.fx_rate

            if current_price is None:
                return {
                    "ticker": ticker,
                    "shares": shares,
                    "average_cost": round(average_cost, 2),
                    "current_price": None,
                    "market_value": round(invested_capital, 2),
                    "invested_capital": round(invested_capital, 2),
                    "pnl": 0.0,
                    "pnl_percent": 0.0,
                    "daily_change": None,
                    "daily_change_percent": None,
                    "five_day_change_percent": None,
                    "twenty_one_day_change_percent": None,
                    "static_asset": True,
                    "category": category, 
                    "sector": item.get("sector", "Other"),
                }

            market_value = shares * current_price
            pnl = market_value - invested_capital
            pnl_percent = pnl / invested_capital if invested_capital else 0.0

            five_day_change_pct = period_changes.get("5D") if period_changes else None
            twenty_one_day_change_pct = period_changes.get("21D") if period_changes else None

            if five_day_change_pct is None:
                five_day_change_pct = self._compute_period_change(closes, 5)
            if twenty_one_day_change_pct is None:
                twenty_one_day_change_pct = self._compute_period_change(closes, 21)

            if five_day_change_pct is not None:
                five_day_change_pct = round(five_day_change_pct, 2)
            if twenty_one_day_change_pct is not None:
                twenty_one_day_change_pct = round(twenty_one_day_change_pct, 2)

            if change is not None:
                change = round(change, 2)
            if change_pct is not None:
                change_pct = round(change_pct, 2)

            return {
                "ticker": ticker,
                "shares": shares,
                "average_cost": round(average_cost, 2),
                "current_price": round(current_price, 2),
                "market_value": round(market_value, 2),
                "invested_capital": round(invested_capital, 2),
                "pnl": round(pnl, 2),
                "pnl_percent": round(pnl_percent * 100, 2),
                "daily_change": change,
                "daily_change_percent": change_pct,
                "five_day_change_percent": five_day_change_pct,
                "twenty_one_day_change_percent": twenty_one_day_change_pct,
                "static_asset": False,
                "category": category,
                "sector": item.get("sector", "Other"),
            }
        except Exception:
            return None

    def analyse(self) -> list[dict]:
        if any(item["ticker"].endswith(".L") for item in self.portfolio_data):
            self._fetch_fx_rate()

        results = []
        with ThreadPoolExecutor(max_workers=16) as executor:
            futures = [executor.submit(self._process_single_item, item) for item in self.portfolio_data]
            for future in as_completed(futures):
                result = future.result()
                if result:
                    results.append(result)
        return results
