import yfinance as yf
from typing import Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import json

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

    def _get_price_and_change(self, ticker: str) -> tuple[Optional[float], Optional[float], Optional[float]]:
        """Return the latest close, absolute change, and percentage change."""
        try:
            yf_ticker = yf.Ticker(ticker)
            hist = yf_ticker.history(period="2d")

            close_today: Optional[float] = None
            close_prev: Optional[float] = None
            if not hist.empty:
                close_today = hist["Close"].iloc[-1]
                if len(hist) > 1:
                    close_prev = hist["Close"].iloc[-2]

            if close_today is None:
                info = yf_ticker.info
                close_today = info.get("currentPrice") or info.get("regularMarketPrice")
                close_prev = info.get("previousClose")

            if close_today is None:
                return None, None, None

            change = None
            change_pct = None

            if close_prev:
                change = float(close_today) - float(close_prev)
                change_pct = (change / float(close_prev)) * 100 if close_prev else None

            return float(close_today), change, change_pct
        
        except Exception:
            return None, None, None

    def _process_single_item(self, item: dict) -> Optional[dict]:
        try:
            ticker = item["ticker"]
            shares = item["shares"]
            average_cost = item["average_cost"]
            invested_capital = shares * average_cost
            category = item.get("category", "Other") 

            current_price, change, change_pct = self._get_price_and_change(ticker)

            if ticker.endswith(".L") and current_price and self.fx_rate:
                current_price *= self.fx_rate
                if change is not None:
                    change *= self.fx_rate

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
                    "static_asset": True,
                    "category": category, 
                    "sector": item.get("sector", "Other"),
                }

            market_value = shares * current_price
            pnl = market_value - invested_capital
            pnl_percent = pnl / invested_capital if invested_capital else 0.0

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
