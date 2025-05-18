import yfinance as yf
import requests
import os
import pandas as pd
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
from .utils import get_risk_free_rate, get_equity_risk_premium

load_dotenv()
FMP_API_KEY = os.getenv("FMP_API_KEY")
FMP_BASE_URL = os.getenv("FMP_BASE_URL")

class FMPFundamentals:
    def __init__(self, symbol: str):
        self.symbol = symbol.upper()
        self.ticker_obj = yf.Ticker(self.symbol)
        self.info = self.ticker_obj.info

        # Preload all FMP data
        endpoints = [
            ("income", "income-statement"),
            ("balance", "balance-sheet-statement"),
            ("cashflow", "cash-flow-statement"),
            ("profile", "profile"),
            ("quote", "quote"),
        ]
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {
                executor.submit(self._fetch_statement, endpoint): name
                for name, endpoint in endpoints
            }
            for future in futures:
                name = futures[future]
                setattr(self, f"{name}_data", future.result())

    def _fetch_statement(self, endpoint: str, limit: int = 5):
        url = f"{FMP_BASE_URL}/{endpoint}/{self.symbol}?apikey={FMP_API_KEY}"
        try:
            response = requests.get(url)
            data = response.json()
            return [{k.lower(): v for k, v in d.items()} for d in data] if data else []
        except Exception as e:
            print(f"❌ Error fetching {endpoint}: {e}")
            return []

    def revenue(self) -> Optional[float]:
        return self.info.get("totalRevenue")

    def net_income(self) -> Optional[float]:
        return self.info.get("netIncomeToCommon")

    def dividend_yield(self) -> Optional[float]:
        return self.info.get("dividendYield")

    def pe_ratio(self) -> Optional[float]:
        return self.info.get("trailingPE")

    def ps_ratio(self) -> Optional[float]:
        return self.info.get("priceToSalesTrailing12Months")

    def beta(self) -> Optional[float]:
        return self.info.get("beta")

    def fcf_yield(self) -> Optional[float]:
        try:
            cf_entry = self.cashflow_data[0] if self.cashflow_data else {}
            quote = self.quote_data[0] if self.quote_data else {}

            ocf = cf_entry.get("operatingcashflow")
            capex = cf_entry.get("capitalexpenditure")
            market_cap = quote.get("marketcap")

            if None in (ocf, capex, market_cap) or market_cap == 0:
                return None

            fcf = ocf - abs(capex)
            return round((fcf / market_cap) * 100, 2)
        except:
            return None

    def fcf_growth(self, years: int = 3) -> Optional[float]:
        try:
            fcf_values = [
                entry.get("freecashflow")
                for entry in self.cashflow_data[:years + 1]
                if entry.get("freecashflow") is not None
            ]

            if len(fcf_values) < years + 1:
                print("⚠️ Not enough FCF data:", fcf_values)
                return None

            start, end = fcf_values[-1], fcf_values[0]
            if start <= 0 or end <= 0:
                print("❌ Invalid FCF values for CAGR:", fcf_values)
                return None

            cagr = (end / start) ** (1 / years) - 1
            print(f"✅ FCF CAGR for {self.symbol}: {round(cagr * 100, 2)}% using {fcf_values}")
            return round(cagr * 100, 2)
        except Exception as e:
            print(f"❌ Exception in fcf_growth for {self.symbol}: {e}")
            return None


    def roce(self) -> Optional[float]:
        try:
            income = self.income_data[0] if self.income_data else {}
            balance = self.balance_data[0] if self.balance_data else {}
            ebit = income.get("ebit") or income.get("operatingincome")
            total_assets = balance.get("totalassets")
            current_liabilities = balance.get("totalcurrentliabilities")
            if None in (ebit, total_assets, current_liabilities):
                return None
            capital_employed = total_assets - current_liabilities
            return round((ebit / capital_employed) * 100, 2) if capital_employed != 0 else None
        except:
            return None

    def wacc(self) -> Optional[float]:
        try:
            profile = self.profile_data[0] if self.profile_data else {}
            income = self.income_data[0] if self.income_data else {}
            balance = self.balance_data[0] if self.balance_data else {}

            market_cap = profile.get("mktcap")
            beta = profile.get("beta", self.beta())
            interest_expense = income.get("interestexpense")
            income_before_tax = income.get("incomebeforetax")
            income_tax_expense = income.get("incometaxexpense")
            short_term_debt = balance.get("shorttermdebt", 0)
            long_term_debt = balance.get("longtermdebt", 0)
            total_debt = short_term_debt + long_term_debt

            if None in (market_cap, beta, interest_expense, income_before_tax, income_tax_expense):
                return None

            cost_of_equity = get_risk_free_rate() + beta * get_equity_risk_premium()
            cost_of_debt = abs(interest_expense) / total_debt if total_debt > 0 else 0
            tax_rate = income_tax_expense / income_before_tax if income_before_tax else 0
            v = market_cap + total_debt

            wacc = (market_cap / v) * cost_of_equity + (total_debt / v) * cost_of_debt * (1 - tax_rate)
            return round(wacc * 100, 2)
        except:
            return None

    def cash_conversion(self) -> Optional[float]:
        try:
            cashflow = self.cashflow_data[0] if self.cashflow_data else {}
            income = self.income_data[0] if self.income_data else {}
            ocf = cashflow.get("operatingcashflow")
            net_income = income.get("netincome")
            if ocf is None or net_income in (None, 0):
                return None
            return round(ocf / net_income, 2)
        except:
            return None

    def rule_of_40(self) -> Optional[float]:
        try:
            if len(self.income_data) < 2:
                return None
            current = self.income_data[0]
            previous = self.income_data[1]
            revenue_now = current.get("revenue")
            revenue_prev = previous.get("revenue")
            net_income_now = current.get("netincome")
            if None in (revenue_now, revenue_prev, net_income_now) or revenue_prev == 0:
                return None
            growth = ((revenue_now - revenue_prev) / revenue_prev) * 100
            margin = (net_income_now / revenue_now) * 100
            return round(growth + margin, 2)
        except:
            return None

    def gross_margin(self) -> Optional[float]:
        try:
            income = self.income_data[0] if self.income_data else {}
            revenue = income.get("revenue")
            cogs = income.get("costofrevenue") or income.get("costofgoodsold")
            if None in (revenue, cogs) or revenue == 0:
                return None
            return round(((revenue - cogs) / revenue) * 100, 2)
        except:
            return None
