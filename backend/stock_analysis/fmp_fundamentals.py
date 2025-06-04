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
        self.ratios_data = self._fetch_ratios()
        self.income_data = self._fetch_endpoint("income-statement")
        self.cashflow_data = self._fetch_endpoint("cash-flow-statement")
        self.balance_data = self._fetch_endpoint("balance-sheet-statement")
        self.profile_data = self._fetch_endpoint("profile")
        self.quote_data = self._fetch_endpoint("quote")
        # FMP returns most recent quarter at [0]
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
    def dividend_yield(self): return self.latest_ratios.get("dividendYield")
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
            pretax = income.get("incomeBeforeTax")
            tax = income.get("incomeTaxExpense") or 0
            tax_rate = tax / pretax if pretax and pretax != 0 else 0
            # Total capital
            total = market_cap + debt
            # WACC
            wacc = (market_cap / total) * cost_equity + (debt / total) * cost_debt * (1 - tax_rate)
            return round(wacc * 100, 2)
        except Exception as e:
            print("WACC error:", e)
            return None



    def fcf_yield(self) -> Optional[float]:
        # Try to use FMP's freeCashFlowYield if it exists, else calculate
        fcf_yield = self.latest_ratios.get("freeCashFlowYield")
        if fcf_yield is not None:
            return round(fcf_yield*100, 2)
        # else fallback to manual
        try:
            cf = self.latest_cashflow
            quote = self.quote_data[0] if self.quote_data else {}
            ocf = cf.get("operatingCashFlow")
            capex = cf.get("capitalExpenditure")
            mktcap = quote.get("marketCap")
            if None in (ocf, capex, mktcap) or mktcap == 0:
                return None
            fcf = ocf - abs(capex)
            return round((fcf / mktcap) * 100, 2)
        except:
            return None

    def fcf_growth(self, periods: int = 3) -> Optional[float]:
        """
        Compound annual growth rate for FCF over N periods (annual preferred).
        Returns None if not enough valid (positive, non-null) FCF values.
        """
        try:
            # Try annual first
            annual_url = f"{FMP_BASE_URL}/cash-flow-statement/{self.symbol}?period=annual&apikey={FMP_API_KEY}"
            annual_data = requests.get(annual_url, timeout=5).json()
            print("=== Annual FCFs ===", [entry.get("freeCashFlow") for entry in annual_data])
            fcf_list = [entry.get("freeCashFlow") for entry in annual_data if entry.get("freeCashFlow") is not None]
            if len(fcf_list) > periods:
                start, end = fcf_list[periods], fcf_list[0]
                print(f"Annual FCF start: {start}, end: {end}")
                if start is None or end is None or start <= 0 or end <= 0:
                    return None
                cagr = (end / start) ** (1 / periods) - 1
                return round(cagr * 100, 2)
            # Fallback to quarters
            fcf_list = [entry.get("freeCashFlow") for entry in self.cashflow_data if entry.get("freeCashFlow") is not None]
            print("=== Quarterly FCFs ===", fcf_list)
            if len(fcf_list) > periods:
                start, end = fcf_list[periods], fcf_list[0]
                print(f"Quarterly FCF start: {start}, end: {end}")
                if start is None or end is None or start <= 0 or end <= 0:
                    return None
                cagr = (end / start) ** (1 / periods) - 1
                annualized = ((1 + cagr) ** 4) - 1  # Annualize quarterly
                return round(annualized * 100, 2)
            return None
        except Exception as e:
            print("FCF growth error:", e)
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
            now, prev = self.income_data[0], self.income_data[1]
            rev_now, rev_prev = now.get("revenue"), prev.get("revenue")
            ni_now = now.get("netIncome")
            print(f"rule_of_40: rev_now={rev_now}, rev_prev={rev_prev}, ni_now={ni_now}")
            if None in (rev_now, rev_prev, ni_now) or rev_prev is None or rev_prev <= 0 or rev_now is None or rev_now == 0:
                return None
            growth = ((rev_now - rev_prev) / rev_prev) * 100
            margin = (ni_now / rev_now) * 100
            print(f"rule_of_40: growth={growth}, margin={margin}")
            return round(growth + margin, 2)
        except Exception as e:
            print("Rule of 40 error:", e)
            return None


        
    @staticmethod
    def compute_sortino_ratio(price_history, risk_free_rate=0.04, period='monthly'):
        """
        price_history: List of dicts with at least 'date' and 'close' keys.
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

    def sortino_ratio(self, risk_free_rate=0.04):
        price_hist = self.price_history(period='3y')
        return self.compute_sortino_ratio(price_hist, risk_free_rate=risk_free_rate)


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
            dividend_yield=round(self.dividend_yield(), 2) if self.dividend_yield() is not None else None,
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
            sortino_ratio=self.sortino_ratio()  # Implement as before
        )
