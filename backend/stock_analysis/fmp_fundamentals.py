import os
import requests
import numpy as np
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from stock_analysis.models import FinancialMetrics

load_dotenv()
FMP_API_KEY = os.getenv("FMP_API_KEY")
FMP_BASE_URL = os.getenv("FMP_BASE_URL")


class FMPFundamentals:
    def __init__(self, symbol: str):
        self.symbol = symbol.upper()
        self.data = {}
        self._load_all_data()

    def _fetch(self, endpoint: str) -> list[dict]:
        quarterly_endpoints = {
            "income-statement",
            "balance-sheet-statement",
            "cash-flow-statement",
            "ratios"
        }

        def try_fetch(url: str) -> list[dict]:
            try:
                response = requests.get(url, timeout=5)
                response.raise_for_status()
                data = response.json()
                return [{k.lower(): v for k, v in d.items()} for d in data] if data else []
            except requests.HTTPError as e:
                if e.response.status_code == 403:
                    print(f"⚠️  403 Forbidden for {url} — trying fallback")
                    return None  # fallback will handle this
                else:
                    print(f"❌ Error fetching {url}: {e}")
                    return []
            except Exception as e:
                print(f"❌ General error fetching {url}: {e}")
                return []

        # Step 1: try quarterly
        if endpoint in quarterly_endpoints:
            quarterly_url = f"{FMP_BASE_URL}/{endpoint}/{self.symbol}?period=quarter&apikey={FMP_API_KEY}"
            data = try_fetch(quarterly_url)
            if data is not None:
                return data

        # Step 2: fallback to annual
        fallback_url = f"{FMP_BASE_URL}/{endpoint}/{self.symbol}?apikey={FMP_API_KEY}"
        return try_fetch(fallback_url)


    def price_history(self, period='1y'):
        """Fetches daily historical prices from FMP (adjust as needed for your API limits)."""
        url = f"{FMP_BASE_URL}/historical-price-full/{self.symbol}?serietype=line&apikey={FMP_API_KEY}"
        try:
            data = requests.get(url, timeout=5).json()
            # You may need to slice or process to get last N years/months
            return data.get('historical', [])
        except Exception as e:
            print(f"❌ Error fetching price history: {e}")
            return []

    def _load_all_data(self):
        endpoints = {
            "income_data": "income-statement",
            "balance_data": "balance-sheet-statement",
            "cashflow_data": "cash-flow-statement",
            "profile_data": "profile",
            "quote_data": "quote",
            "ratios_data": "ratios"
        }

        # Define which ones should use period=quarter
        quarterly = {"income_data", "balance_data", "cashflow_data", "ratios_data"}
        
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = {
                executor.submit(self._fetch, ep): key
                for key, ep in endpoints.items()
            }

            for future in as_completed(futures):
                key = futures[future]
                self.data[key] = future.result()

    def income_data(self): return self.data.get("income_data", [])
    def balance_data(self): return self.data.get("balance_data", [])
    def cashflow_data(self): return self.data.get("cashflow_data", [])
    def profile_data(self): return self.data.get("profile_data", [])
    def quote_data(self): return self.data.get("quote_data", [])
    def ratios_data(self): return self.data.get("ratios_data", [])

    # === Metrics ===
    def revenue(self) -> Optional[float]:
        return self.income_data()[0].get("revenue") if self.income_data() else None

    def net_income(self) -> Optional[float]:
        return self.income_data()[0].get("netincome") if self.income_data() else None

    def dividend_yield(self) -> Optional[float]:
        return self.ratios_data()[0].get("dividendyield") if self.ratios_data() else None

    def pe_ratio(self) -> Optional[float]:
        return self.quote_data()[0].get("pe") if self.quote_data() else None

    def ps_ratio(self) -> Optional[float]:
        return self.ratios_data()[0].get("pricetosalesratio") if self.ratios_data() else None

    def beta(self) -> Optional[float]:
        return self.profile_data()[0].get("beta") if self.profile_data() else None

    def fcf_yield(self) -> Optional[float]:
        try:
            cf = self.cashflow_data()[0]
            quote = self.quote_data()[0]
            ocf = cf.get("operatingcashflow")
            capex = cf.get("capitalexpenditure")
            mktcap = quote.get("marketcap")
            if None in (ocf, capex, mktcap) or mktcap == 0:
                return None
            fcf = ocf - abs(capex)
            return round((fcf / mktcap) * 100, 2)
        except:
            return None

    def fcf_growth(self, years: int = 3) -> Optional[float]:
        try:
            fcf_list = [entry.get("freecashflow") for entry in self.cashflow_data()[:years + 1] if entry.get("freecashflow") is not None]
            if len(fcf_list) < years + 1: return None
            start, end = fcf_list[-1], fcf_list[0]
            if start <= 0 or end <= 0: return None
            cagr = (end / start) ** (1 / years) - 1
            return round(cagr * 100, 2)
        except:
            return None

    def roce(self) -> Optional[float]:
        try:
            income = self.income_data()[0]
            balance = self.balance_data()[0]
            ebit = income.get("ebit") or income.get("operatingincome")
            assets = balance.get("totalassets")
            liabilities = balance.get("totalcurrentliabilities")
            if None in (ebit, assets, liabilities): return None
            capital = assets - liabilities
            return round((ebit / capital) * 100, 2) if capital != 0 else None
        except:
            return None

    def wacc(self, rf: float = 0.04, erp: float = 0.05) -> Optional[float]:
        try:
            profile = self.profile_data()[0]
            income = self.income_data()[0]
            balance = self.balance_data()[0]
            market_cap = profile.get("mktcap")
            beta = profile.get("beta", self.beta())
            interest = income.get("interestexpense")
            pretax = income.get("incomebeforetax")
            tax = income.get("incometaxexpense")
            debt = (balance.get("shorttermdebt") or 0) + (balance.get("longtermdebt") or 0)
            if None in (market_cap, beta, interest, pretax, tax): return None
            cost_equity = rf + beta * erp
            cost_debt = abs(interest) / debt if debt > 0 else 0
            tax_rate = tax / pretax if pretax else 0
            total = market_cap + debt
            wacc = (market_cap / total) * cost_equity + (debt / total) * cost_debt * (1 - tax_rate)
            return round(wacc * 100, 2)
        except:
            return None

    def cash_conversion(self) -> Optional[float]:
        try:
            ocf = self.cashflow_data()[0].get("operatingcashflow")
            ni = self.income_data()[0].get("netincome")
            if ocf is None or ni in (None, 0): return None
            return round(ocf / ni, 2)
        except:
            return None

    def rule_of_40(self) -> Optional[float]:
        try:
            now, prev = self.income_data()[0], self.income_data()[1]
            rev_now, rev_prev = now.get("revenue"), prev.get("revenue")
            ni_now = now.get("netincome")
            if None in (rev_now, rev_prev, ni_now) or rev_prev == 0: return None
            growth = ((rev_now - rev_prev) / rev_prev) * 100
            margin = (ni_now / rev_now) * 100
            return round(growth + margin, 2)
        except:
            return None

    def gross_margin(self) -> Optional[float]:
        try:
            income = self.income_data()[0]
            rev = income.get("revenue")
            cogs = income.get("costofrevenue") or income.get("costofgoodsold")
            if None in (rev, cogs) or rev == 0: return None
            return round(((rev - cogs) / rev) * 100, 2)
        except:
            return None
        
    @staticmethod
    def compute_sortino_ratio(price_history, risk_free_rate=0.04, period='monthly'):
        """
        price_history: List of dicts with at least 'date' and 'close' keys.
        """
        # Convert to DataFrame for easier resampling
        if not price_history or len(price_history) < 13:
            return None
        df = pd.DataFrame(price_history)
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        df = df.sort_index()

        # Resample to month-end closes
        monthly_closes = df['close'].resample('M').last().dropna()
        if len(monthly_closes) < 13:
            return None

        returns = monthly_closes.pct_change().dropna()
        if returns.empty:
            return None

        # Convert risk-free rate to monthly
        rf_period = (1 + risk_free_rate) ** (1/12) - 1
        excess_returns = returns - rf_period
        annualized_return = (1 + returns.mean()) ** 12 - 1

        # Downside deviation (below rf)
        downside_returns = excess_returns[excess_returns < 0]
        downside_deviation = np.sqrt((downside_returns ** 2).mean()) * np.sqrt(12)
        if downside_deviation == 0 or np.isnan(downside_deviation):
            return None

        sortino = (annualized_return - risk_free_rate) / downside_deviation
        return round(sortino, 3)
    
    def sortino_ratio(self, risk_free_rate=0.04):
        price_hist = self.price_history(period='3y')  # At least 3y preferred
        return self.compute_sortino_ratio(price_hist, risk_free_rate=risk_free_rate)
    
    def fcf_margin(self) -> Optional[float]:
        """
        Calculates the most recent quarterly FCF margin: (Operating Cash Flow - CapEx) / Revenue
        Returns as a percentage, or None if data is missing.
        """
        try:
            # Get the latest cash flow and income data
            cf = self.cashflow_data()[0]
            income = self.income_data()[0]
            ocf = cf.get("operatingcashflow")
            capex = cf.get("capitalexpenditure")
            revenue = income.get("revenue")
            if None in (ocf, capex, revenue) or revenue == 0:
                return None
            fcf = ocf - abs(capex)
            return round((fcf / revenue) * 100, 2)
        except Exception as e:
            return None



    def get_financial_metrics(self) -> FinancialMetrics:
        fcf_yield = self.fcf_yield()
        fcf_growth = self.fcf_growth()
        roce = self.roce()
        wacc = self.wacc()

        return FinancialMetrics(
            ticker=self.symbol,
            revenue=self.revenue(),
            net_income=self.net_income(),
            dividend_yield=round(self.dividend_yield(), 2),
            pe_ratio=self.pe_ratio(),
            ps_ratio=round(self.ps_ratio(), 2),
            beta=self.beta(),
            fcf_yield=fcf_yield,
            fcf_growth=fcf_growth,
            yield_plus_growth=round(fcf_yield + fcf_growth, 2)
                if fcf_yield and fcf_growth else None,
            fcf_margin=self.fcf_margin(),
            roce=roce,
            wacc=wacc,
            roce_minus_wacc=round(roce - wacc, 2)
                if roce and wacc else None,
            cash_conversion=self.cash_conversion(),
            rule_of_40=self.rule_of_40(),
            gross_margin=self.gross_margin(),
            sortino_ratio=self.sortino_ratio()
        )
