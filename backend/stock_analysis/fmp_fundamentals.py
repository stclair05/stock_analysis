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
FMP_API_KEY = os.getenv("FMP_API_KEY", "DjcoHwCSKT4sHqpSVdLNBoxhaZTXTR0Q")
FMP_BASE_URL = os.getenv("FMP_BASE_URL", "https://financialmodelingprep.com/api/v3")

class FMPFundamentals:
    def __init__(self, symbol: str):
        self.symbol = symbol.upper()
        endpoints = {
            'ratios': f"{FMP_BASE_URL}/ratios/{self.symbol}?period=quarter&apikey={FMP_API_KEY}",
            'ratios_annual': f"{FMP_BASE_URL}/ratios/{self.symbol}?period=annual&apikey={FMP_API_KEY}",
            'income': f"{FMP_BASE_URL}/income-statement/{self.symbol}?period=quarter&apikey={FMP_API_KEY}",
            'income_annual': f"{FMP_BASE_URL}/income-statement/{self.symbol}?period=annual&apikey={FMP_API_KEY}",
            'cashflow': f"{FMP_BASE_URL}/cash-flow-statement/{self.symbol}?period=quarter&apikey={FMP_API_KEY}",
            'balance': f"{FMP_BASE_URL}/balance-sheet-statement/{self.symbol}?period=quarter&apikey={FMP_API_KEY}",
            'profile': f"{FMP_BASE_URL}/profile/{self.symbol}?apikey={FMP_API_KEY}",
            'quote': f"{FMP_BASE_URL}/quote/{self.symbol}?apikey={FMP_API_KEY}",
        }
        results = {}
        with ThreadPoolExecutor() as executor:
            future_map = {executor.submit(requests.get, url, timeout=5): key for key, url in endpoints.items()}
            for future in as_completed(future_map):
                key = future_map[future]
                try:
                    resp = future.result()
                    resp.raise_for_status()
                    results[key] = resp.json()
                except Exception as e:
                    print(f"Error fetching {key}: {e}")
                    results[key] = []
        # Assign all the results
        self.ratios_data = results['ratios']
        self.ratios_annual = results['ratios_annual']
        self.income_data = results['income']
        self.income_annual = results['income_annual']
        self.cashflow_data = results['cashflow']
        self.balance_data = results['balance']
        self.profile_data = results['profile']
        self.quote_data = results['quote']

        self.latest_ratios = self.ratios_data[0] if self.ratios_data else {}
        self.latest_income = self.income_data[0] if self.income_data else {}
        self.latest_cashflow = self.cashflow_data[0] if self.cashflow_data else {}
        self.latest_balance = self.balance_data[0] if self.balance_data else {}


        print("=== Raw ratios_data[0] ===")
        print(self.latest_ratios)
        print("=== Raw income_data[0] ===")
        print(self.latest_income)
        print("=== Raw cashflow_data[0] ===")
        print(self.latest_cashflow)
        print("=== Raw balance_data[0] ===")
        print(self.latest_balance)
        print("=== Raw profile_data[0] ===")
        print(self.profile_data[0] if self.profile_data else {})


    def _fetch_endpoint(self, endpoint: str):
        url = f"{FMP_BASE_URL}/{endpoint}/{self.symbol}?period=quarter&apikey={FMP_API_KEY}"
        try:
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json()
            return data if data else []
        except Exception as e:
            print(f"Error fetching {endpoint}: {e}")
            return []

    def _fetch_ratios(self):
        url = f"{FMP_BASE_URL}/ratios/{self.symbol}?period=quarter&apikey={FMP_API_KEY}"
        try:
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json()
            return data if data else []
        except Exception as e:
            print(f"Error fetching ratios: {e}")
            return []

    # --- Direct from ratios ---
    def revenue(self): return self.latest_income.get("revenue")
    def net_income(self): return self.latest_income.get("netIncome")
    def dividend_yield(self):
        dy = self.latest_ratios.get("dividendYield")
        return round(dy * 100, 2) if dy is not None else None

    def pe_ratio(self): return self.latest_ratios.get("priceEarningsRatio")
    def ps_ratio(self): return self.latest_ratios.get("priceToSalesRatio")
    def gross_margin(self): 
        gm = self.latest_ratios.get("grossProfitMargin")
        return round(gm*100, 2) if gm is not None else None
    
    def fcf_margin(self):
        fcfm = self.latest_ratios.get("freeCashFlowMargin")
        print(f"fcf_margin - FMP value: {fcfm}")
        if fcfm is not None:
            return round(fcfm * 100, 2)
        try:
            ocf = self.latest_cashflow.get("operatingCashFlow")
            capex = self.latest_cashflow.get("capitalExpenditure")
            revenue = self.latest_income.get("revenue")
            print(f"fcf_margin - Manual: OCF={ocf}, CapEx={capex}, Revenue={revenue}")
            if None in (ocf, capex, revenue) or revenue == 0:
                return None
            fcf = ocf - abs(capex)
            return round((fcf / revenue) * 100, 2)
        except Exception as e:
            print("fcf_margin error:", e)
            return None


    def roce(self):
        roce = self.latest_ratios.get("returnOnCapitalEmployed")
        return round(roce*100, 2) if roce is not None else None
    def beta(self):
        if self.profile_data:
            return self.profile_data[0].get("beta")
        return None

    def wacc(self, rf: float = 0.04, erp: float = 0.05) -> Optional[float]:
        try:
            # Equity (market cap)
            profile = self.profile_data[0] if self.profile_data else {}
            market_cap = profile.get("mktCap") or profile.get("marketCap")
            if not market_cap or market_cap <= 0:
                return None
            # Debt (short + long)
            balance = self.latest_balance
            debt = (balance.get("shortTermDebt") or 0) + (balance.get("longTermDebt") or 0)
            # Beta
            beta = profile.get("beta", self.beta())
            if beta is None:
                return None
            # Cost of equity (CAPM)
            cost_equity = rf + beta * erp
            # Cost of debt (interest expense / total debt)
            income = self.latest_income
            interest = income.get("interestExpense") or 0
            cost_debt = (abs(interest) / debt) if debt > 0 else 0
            # Tax rate (income tax / pre-tax income)
            # Try effective tax rate from ratios first
            tax_rate = self.latest_ratios.get("effectiveTaxRate")

            # If not available or invalid, fallback to manual calc
            if tax_rate is None:
                pretax = income.get("incomeBeforeTax")
                tax = income.get("incomeTaxExpense") or 0
                tax_rate = tax / pretax if pretax and pretax != 0 else 0

            # Clamp to [0, 1] to avoid bad inputs (e.g. negative taxes)
            tax_rate = max(0, min(tax_rate, 1))
            # Total capital
            total = market_cap + debt
            # WACC
            wacc = (market_cap / total) * cost_equity + (debt / total) * cost_debt * (1 - tax_rate)
            return round(wacc * 100, 2)
        except Exception as e:
            print("WACC error:", e)
            return None



    def fcf_yield(self) -> Optional[float]:
        try:
            fcf_per_share = self.latest_ratios.get("freeCashFlowPerShare")
            price = self.profile_data[0].get("price") if self.profile_data else None
            if fcf_per_share is None or price in (None, 0):
                return None
            return round((fcf_per_share / price) * 100, 2)
        except Exception as e:
            print("fcf_yield error:", e)
            return None


    def fcf_growth(self, periods: int = 3) -> Optional[float]:
        """
        Calculates CAGR of FCF per Share over N annual periods, using pre-fetched annual ratios.
        """
        try:
            data = self.ratios_annual
            if not isinstance(data, list):
                print(f"[FCF GROWTH DEBUG] Unexpected annual ratios: {data}")
                return None
            fcfps_list = [entry.get("freeCashFlowPerShare") for entry in data if entry.get("freeCashFlowPerShare") is not None]
            print(f"[FCF GROWTH DEBUG] FCFPS Raw List: {fcfps_list}")
            if len(fcfps_list) <= periods:
                print(f"[FCF GROWTH DEBUG] Not enough data points: found {len(fcfps_list)} needed {periods+1}")
                return None
            start, end = fcfps_list[periods], fcfps_list[0]
            if start <= 0 or end <= 0:
                print(f"[FCF GROWTH DEBUG] Invalid start/end values: start={start}, end={end}")
                return None
            cagr = (end / start) ** (1 / periods) - 1
            print(f"[FCF GROWTH DEBUG] CAGR: {cagr:.4f}")
            return round(cagr * 100, 2)
        except Exception as e:
            print("fcf_growth error:", e)
            return None


    def cash_conversion(self) -> Optional[float]:
        try:
            ocf = self.latest_cashflow.get("operatingCashFlow")
            ni = self.latest_income.get("netIncome")
            if ocf is None or ni in (None, 0): return None
            return round(ocf / ni, 2)
        except:
            return None

    def rule_of_40(self) -> Optional[float]:
        try:
            annual_data = self.income_annual
            if len(annual_data) < 2:
                return None
            rev_now = annual_data[0].get("revenue")
            rev_prev = annual_data[1].get("revenue")
            if None in (rev_now, rev_prev) or rev_prev <= 0:
                return None
            growth = ((rev_now - rev_prev) / rev_prev) * 100
            fcf_margin = self.fcf_margin()
            if fcf_margin is None:
                return None
            print(f"[Rule of 40] rev_now={rev_now}, rev_prev={rev_prev}, growth={growth}, fcf_margin={fcf_margin}")
            return round(growth + fcf_margin, 2)
        except Exception as e:
            print("Rule of 40 error:", e)
            return None


        
    @staticmethod
    def compute_sortino_ratio(price_history, risk_free_rate=0.04, period='monthly'):
        """
        price_history: List of dicts with at least 'date' andç 'close' keys.
        """
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

    def price_history(self, period='1y'):
        url = f"{FMP_BASE_URL}/historical-price-full/{self.symbol}?serietype=line&apikey={FMP_API_KEY}"
        try:
            data = requests.get(url, timeout=5).json()
            return data.get('historical', [])
        except Exception as e:
            print(f"Error fetching price history: {e}")
            return []

    @property
    def sortino_ratio(self):
        if not hasattr(self, "_sortino"):
            price_hist = self.price_history(period='3y')
            self._sortino = self.compute_sortino_ratio(price_hist)
        return self._sortino



    # --- Sortino and other custom metrics can stay as before ---

    def get_financial_metrics(self) -> FinancialMetrics:
        fcf_yield = self.fcf_yield()
        fcf_growth = self.fcf_growth()
        roce = self.roce()
        wacc = self.wacc()

        return FinancialMetrics(
            ticker=self.symbol,
            revenue=self.revenue(),
            net_income=self.net_income(),
            dividend_yield=self.dividend_yield(),
            pe_ratio=round(self.pe_ratio(),2),
            ps_ratio=round(self.ps_ratio(), 2) if self.ps_ratio() is not None else None,
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
            sortino_ratio=self.sortino_ratio # Implement as before
        )
