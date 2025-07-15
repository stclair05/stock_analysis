import os
from time import time
import requests
import numpy as np
from dotenv import load_dotenv
from typing import Optional
from datetime import datetime, timedelta
from .models import FinancialMetrics
from functools import lru_cache


load_dotenv()
TWELVE_DATA_API_KEY = os.getenv("TWELVE_DATA_API_KEY")
TWELVE_BASE_URL = "https://api.twelvedata.com"

class TwelveDataFundamentals:
    def __init__(self, symbol: str):
        self.symbol = symbol.upper()

    @staticmethod
    @lru_cache(maxsize=128)
    def _get_statistics_cached(symbol: str, date: Optional[str]) -> dict:
        """Cached call to /statistics for a given symbol and optional date."""
        params = {"symbol": symbol, "apikey": TWELVE_DATA_API_KEY}
        if date:
            params["date"] = date
        resp = requests.get(f"{TWELVE_BASE_URL}/statistics", params=params)
        resp.raise_for_status()
        return resp.json()
    
    def get_statistics(self, date: Optional[str] = None) -> dict:
        return self._get_statistics_cached(self.symbol, date).get("statistics", {})


    @staticmethod
    @lru_cache(maxsize=128)
    def _get_income_statement_cached(symbol: str) -> dict:
        params = {
            "symbol": symbol,
            "apikey": TWELVE_DATA_API_KEY,
            "format": "JSON",
            "statement_type": "annual",
        }
        resp = requests.get(f"{TWELVE_BASE_URL}/income_statement", params=params)
        resp.raise_for_status()
        return resp.json()

    def get_income_statement(self) -> list[dict]:
        return self._get_income_statement_cached(self.symbol).get("income_statement", [])
    
    @staticmethod
    @lru_cache(maxsize=128)
    def _get_cash_flow_cached(symbol: str) -> dict:
        params = {
            "symbol": symbol,
            "apikey": TWELVE_DATA_API_KEY,
            "format": "JSON",
            "statement_type": "annual",
        }
        resp = requests.get(f"{TWELVE_BASE_URL}/cash_flow", params=params)
        resp.raise_for_status()
        return resp.json()
    
    @staticmethod
    @lru_cache(maxsize=128)
    def _get_daily_prices_cached(symbol: str) -> dict:
        params = {
            "symbol": symbol,
            "interval": "1day",
            "outputsize": 365,
            "apikey": TWELVE_DATA_API_KEY,
            "format": "JSON"
        }
        resp = requests.get(f"{TWELVE_BASE_URL}/time_series", params=params)
        resp.raise_for_status()
        return resp.json()

    def get_daily_prices(self) -> list[dict]:
        return self._get_daily_prices_cached(self.symbol).get("values", [])


    def get_cash_flow(self) -> list[dict]:
        return self._get_cash_flow_cached(self.symbol).get("cash_flow", [])


    def get_fcf_growth_from_cashflow(self) -> Optional[float]:
        """Calculate YoY Free Cash Flow growth from annual cash flow statements."""
        try:
            statements = self.get_cash_flow()  # ✅ use the cached version!

            if len(statements) < 2:
                return None

            statements = sorted(statements, key=lambda x: x.get("fiscal_date", ""), reverse=True)
            fcf_curr = statements[0].get("free_cash_flow")
            fcf_prev = statements[1].get("free_cash_flow")

            if fcf_curr is None or fcf_prev in (None, 0):
                return None

            return ((float(fcf_curr) - float(fcf_prev)) / float(fcf_prev)) * 100

        except Exception as e:
            print("Error calculating FCF growth from cash flow:", e)
            return None

        
    def get_roce_from_statistics(self) -> Optional[float]:
        """Calculate ROCE using statistics and fallback to income_statement for depreciation."""
        try:
            stats = self.get_statistics()

            fin = stats.get("financials", {})
            balance = fin.get("balance_sheet", {})
            income = fin.get("income_statement", {})

            ebitda = income.get("ebitda")
            total_debt = balance.get("total_debt_mrq")
            total_cash = balance.get("total_cash_mrq")
            debt_to_equity = balance.get("total_debt_to_equity_mrq")

            # Fallback to raw income statement for depreciation
            income_statements = self.get_income_statement()
            depreciation = None
            if income_statements:
                latest_income = income_statements[0]
                depreciation = latest_income.get("depreciation")

            if ebitda is None:
                return None

            ebitda = float(ebitda)
            depreciation = float(depreciation) if depreciation is not None else 0.0  # Assume 0 if missing

            ebit = ebitda - depreciation

            if None in (total_debt, total_cash, debt_to_equity):
                return None

            total_debt = float(total_debt)
            total_cash = float(total_cash)
            debt_to_equity = float(debt_to_equity)

            total_equity = total_debt / (debt_to_equity / 100)
            capital_employed = total_equity + total_debt - total_cash

            if capital_employed == 0:
                return None

            roce = (ebit / capital_employed) * 100
            return roce

        except Exception as e:
            print("Error calculating ROCE:", e)
            return None

    def get_wacc(self) -> Optional[float]:
        """Calculate WACC using CAPM and financial metrics."""
        try:
            stats = self.get_statistics()
            cash_flow = self.get_cash_flow()
            income_stmt = self.get_income_statement()

            # 1. Market Cap (E)
            market_cap = stats.get("valuations_metrics", {}).get("market_capitalization")
            beta = stats.get("stock_price_summary", {}).get("beta")

            # 2. Total Debt (D)
            total_debt = stats.get("financials", {}).get("balance_sheet", {}).get("total_debt_mrq")

            # 3. Cost of Equity (Re) = Rf + Beta * (Rm - Rf)
            rf = 0.04  # 10Y Treasury
            rm = 0.09  # expected market return
            if beta is None:
                return None
            cost_of_equity = rf + float(beta) * (rm - rf)

            # 4. Cost of Debt (Rd) = interest_paid / total_debt
            interest_paid = None
            for year in cash_flow:
                if "interest_paid" in year and year["interest_paid"] is not None:
                    interest_paid = float(year["interest_paid"])
                    break

            if interest_paid is None or total_debt in (None, 0):
                return None
            cost_of_debt = interest_paid / float(total_debt)

            # 5. Tax Rate ≈ income_tax_paid / net_income
            tax_paid = None
            net_income = None
            for year in cash_flow:
                if "income_tax_paid" in year:
                    tax_paid = float(year["income_tax_paid"])
                    break
            for year in income_stmt:
                if "net_income" in year:
                    net_income = float(year["net_income"])
                    break

            tax_rate = tax_paid / net_income if tax_paid and net_income else 0.21  # fallback to default

            # Convert all to float
            e = float(market_cap)
            d = float(total_debt)

            wacc = ((e / (e + d)) * cost_of_equity) + ((d / (e + d)) * cost_of_debt * (1 - tax_rate))
            return wacc * 100  # as %
        except Exception as e:
            print("Error calculating WACC:", e)
            return None
        
    def get_cash_conversion(self) -> Optional[float]:
        """Calculate Cash Conversion Ratio = Operating Cash Flow / Net Income."""
        try:
            cash_flow = self.get_cash_flow()
            income_stmt = self.get_income_statement()

            print("\n📦 Debug: Raw Cash Flow:", cash_flow[:1])
            print("📄 Debug: Raw Income Statement:", income_stmt[:1])

            ocf = None
            net_income = None

            for year in cash_flow:
                ocf_raw = year.get("operating_activities", {}).get("operating_cash_flow")
                print("🔍 Found OCF:", ocf_raw)
                if ocf_raw is not None:
                    ocf = float(ocf_raw)
                    break

            for year in income_stmt:
                net_income_raw = year.get("net_income_to_common_ttm") or year.get("net_income")
                print("🔍 Found Net Income:", net_income_raw)
                if net_income_raw is not None:
                    net_income = float(net_income_raw)
                    break

            if ocf is None:
                print("⚠️ OCF is None")
            if net_income is None:
                print("⚠️ Net Income is None or zero")

            if ocf is None or net_income in (None, 0):
                return None

            result = ocf / net_income
            print(f"✅ Cash Conversion = {result:.3f}")
            return result

        except Exception as e:
            print("❌ Error calculating cash conversion:", e)
            return None

    def get_rule_of_40(self) -> Optional[float]:
        """Calculate Rule of 40 = Revenue Growth + Operating Margin."""
        try:
            stats = self.get_statistics()
            financials = stats.get("financials", {})
            income = financials.get("income_statement", {})

            revenue_growth = income.get("quarterly_revenue_growth")  # Already %
            operating_margin = financials.get("operating_margin")  # Already %

            if revenue_growth is None or operating_margin is None:
                return None

            return (float(revenue_growth) + float(operating_margin)) * 100  # return as %
        except Exception as e:
            print("Error calculating Rule of 40:", e)
            return None

    def get_sortino_ratio(self) -> Optional[float]:
        """Calculate Sortino Ratio using daily adjusted close prices."""
        try:
            prices = self.get_daily_prices()

            # Ensure we have enough data
            if len(prices) < 30:
                return None

            # Sort by date (Twelve Data returns newest first)
            prices = sorted(prices, key=lambda x: x["datetime"])

            # Extract adjusted closes
            closes = [float(p["close"]) for p in prices]

            # Compute daily returns
            returns = np.diff(closes) / closes[:-1]

            # Constants
            rf_daily = 0.04 / 252  # Assume 4% annual risk-free rate

            # Excess returns
            excess_returns = returns - rf_daily

            # Downside deviation
            downside_returns = excess_returns[excess_returns < 0]
            if len(downside_returns) == 0:
                return None  # no downside = undefined ratio

            downside_std = np.std(downside_returns)

            # Mean of excess returns
            mean_excess_return = np.mean(excess_returns)

            sortino = mean_excess_return / downside_std
            return sortino

        except Exception as e:
            print("❌ Error calculating Sortino Ratio:", e)
            return None

    
    def get_financial_metrics(self) -> FinancialMetrics:
        income_data = self.get_income_statement()
        stats_data = self.get_statistics()

        # Get statistics from exactly 1 year ago
        one_year_ago = (datetime.today() - timedelta(days=365)).strftime("%Y-%m-%d")
        stats_data_prev = self.get_statistics(date=one_year_ago)

        def parse_float(d: dict, key: str) -> Optional[float]:
            try:
                val = d.get(key)
                return float(val) if val is not None else None
            except (TypeError, ValueError):
                return None

        latest_income = income_data[0] if income_data else {}

        # Extract FCF values
        fcf = parse_float(stats_data.get("financials", {}).get("cash_flow", {}), "levered_free_cash_flow_ttm")
    
        # Compute derived metrics
        market_cap = parse_float(stats_data.get("valuations_metrics", {}), "market_capitalization")
        dividend_yield = parse_float(stats_data.get("dividends_and_splits", {}), "forward_annual_dividend_yield")

        fcf_yield = (fcf / market_cap * 100) if fcf is not None and market_cap else None
        fcf_growth = self.get_fcf_growth_from_cashflow()
        yield_plus_growth = (fcf_yield + fcf_growth) if dividend_yield is not None and fcf_growth is not None else None
        roce = self.get_roce_from_statistics()
        wacc=self.get_wacc()
        roce_minus_wacc=(roce - wacc) if roce is not None and wacc is not None else None
        cash_conversion = self.get_cash_conversion()
        rule_of_40 = self.get_rule_of_40()
        sortino_ratio = self.get_sortino_ratio()

        return FinancialMetrics(
            ticker=self.symbol,
            revenue=parse_float(latest_income, "sales"),
            net_income=parse_float(latest_income, "net_income"),
            dividend_yield=dividend_yield,
            pe_ratio=parse_float(stats_data.get("valuations_metrics", {}), "trailing_pe"),
            ps_ratio=parse_float(stats_data.get("valuations_metrics", {}), "price_to_sales_ttm"),
            beta=parse_float(stats_data.get("stock_price_summary", {}), "beta"),
            fcf_yield=fcf_yield,
            fcf_growth=fcf_growth,
            yield_plus_growth=yield_plus_growth,
            roce=roce,
            wacc=wacc,
            roce_minus_wacc=roce_minus_wacc,
            cash_conversion=cash_conversion,
            rule_of_40=rule_of_40,
            gross_margin=parse_float(stats_data.get("financials", {}), "gross_margin"),
            sortino_ratio=sortino_ratio,
        )
