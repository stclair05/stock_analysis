import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
from dotenv import load_dotenv
from stock_analysis.models import FinancialMetrics

load_dotenv()
FMP_API_KEY = os.getenv("FMP_API_KEY", "YOUR_KEY_HERE")
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
            'cashflow_annual': f"{FMP_BASE_URL}/cash-flow-statement/{self.symbol}?period=annual&apikey={FMP_API_KEY}",
            'balance': f"{FMP_BASE_URL}/balance-sheet-statement/{self.symbol}?period=quarter&apikey={FMP_API_KEY}",
            'balance_annual': f"{FMP_BASE_URL}/balance-sheet-statement/{self.symbol}?period=annual&apikey={FMP_API_KEY}",
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
        # Store results for quarterly and annual
        self.ratios_data = results['ratios']
        self.ratios_annual = results['ratios_annual']
        self.income_data = results['income']
        self.income_annual = results['income_annual']
        self.cashflow_data = results['cashflow']
        self.cashflow_annual = results['cashflow_annual']
        self.balance_data = results['balance']
        self.balance_annual = results['balance_annual']
        self.profile_data = results['profile']
        self.quote_data = results['quote']
        print("============ Ratios data (quarterly) ============")
        print(self.ratios_data[:2])
        print("============ Ratios data (annual) ===============")
        print(self.ratios_annual[:2])

        print("============ Income statement (quarterly) =======")
        print(self.income_data[:2])
        print("============ Income statement (annual) ==========")
        print(self.income_annual[:2])

        print("============ Cashflow statement (quarterly) =====")
        print(self.cashflow_data[:2])
        print("============ Cashflow statement (annual) ========")
        print(self.cashflow_annual[:2])

        print("============ Balance sheet (quarterly) ==========")
        print(self.balance_data[:2])
        print("============ Balance sheet (annual) =============")
        print(self.balance_annual[:2])

        print("============ Profile data =======================")
        print(self.profile_data[0] if self.profile_data else {})
        print("============ Quote data =========================")
        print(self.quote_data[0] if self.quote_data else {})


    def _select(self, data, annual):
        return data['annual'][0] if annual and data['annual'] else data['quarter'][0] if data['quarter'] else {}

    # ----- Periodized Metrics -----

    def revenue(self, annual=False):
        if annual:
            return self.income_annual[0].get("revenue") if self.income_annual else None
        else:
            return self.income_data[0].get("revenue") if self.income_data else None

    def net_income(self, annual=False):
        if annual:
            return self.income_annual[0].get("netIncome") if self.income_annual else None
        else:
            return self.income_data[0].get("netIncome") if self.income_data else None

    def dividend_yield(self, annual=False):
        ratios = self.ratios_annual[0] if annual and self.ratios_annual else self.ratios_data[0] if self.ratios_data else {}
        dy = ratios.get("dividendYield")
        return round(dy * 100, 2) if dy is not None else None

    def pe_ratio(self, annual=False):
        # Use FMP's computed ratio (mainstream value)
        ratios = (
            self.ratios_annual[0] if annual and self.ratios_annual else
            self.ratios_data[0] if self.ratios_data else {}
        )
        pe = ratios.get("priceEarningsRatio")
        if pe is not None:
            return round(pe, 2)
        
        # Fallback: use quote EPS (from FMP /quote endpoint)
        price = self.profile_data[0].get("price") if self.profile_data else None
        eps = self.quote_data[0].get("eps") if self.quote_data else None
        if price is not None and eps not in (None, 0):
            return round(price / eps, 2)
        return None


    def ps_ratio(self, annual=False):
        ratios = self.ratios_annual[0] if annual and self.ratios_annual else self.ratios_data[0] if self.ratios_data else {}
        ps = ratios.get("priceToSalesRatio")
        if ps is not None:
            return round(ps, 2)
        # Fallback manual
        price = self.profile_data[0].get("price") if self.profile_data else None
        income = self.income_annual[0] if annual and self.income_annual else self.income_data[0] if self.income_data else {}
        revenue = income.get("revenue")
        shares_out = income.get("weightedAverageShsOut")
        if None in (price, revenue, shares_out) or shares_out == 0:
            return None
        revenue_per_share = revenue / shares_out
        return round(price / revenue_per_share, 2)

    def gross_margin(self, annual=False):
        ratios = self.ratios_annual[0] if annual and self.ratios_annual else self.ratios_data[0] if self.ratios_data else {}
        gm = ratios.get("grossProfitMargin")
        return round(gm * 100, 2) if gm is not None else None

    def fcf_margin(self, annual=False):
        ratios = self.ratios_annual[0] if annual and self.ratios_annual else self.ratios_data[0] if self.ratios_data else {}
        fcfm = ratios.get("freeCashFlowMargin")
        if fcfm is not None:
            return round(fcfm * 100, 2)
        # Manual fallback
        cashflow = self.cashflow_annual[0] if annual and self.cashflow_annual else self.cashflow_data[0] if self.cashflow_data else {}
        income = self.income_annual[0] if annual and self.income_annual else self.income_data[0] if self.income_data else {}
        ocf = cashflow.get("operatingCashFlow")
        capex = cashflow.get("capitalExpenditure")
        revenue = income.get("revenue")
        if None in (ocf, capex, revenue) or revenue == 0:
            return None
        fcf = ocf - abs(capex)
        return round((fcf / revenue) * 100, 2)

    def roce(self, annual=False):
        ratios = self.ratios_annual[0] if annual and self.ratios_annual else self.ratios_data[0] if self.ratios_data else {}
        roce = ratios.get("returnOnCapitalEmployed")
        return round(roce * 100, 2) if roce is not None else None

    def wacc(self, annual=False, rf: float = 0.04, erp: float = 0.05):
        profile = self.profile_data[0] if self.profile_data else {}
        market_cap = profile.get("mktCap") or profile.get("marketCap")
        if not market_cap or market_cap <= 0:
            return None
        # Debt (short + long)
        balance = self.balance_annual[0] if annual and self.balance_annual else self.balance_data[0] if self.balance_data else {}
        debt = (balance.get("shortTermDebt") or 0) + (balance.get("longTermDebt") or 0)
        beta = profile.get("beta")
        if beta is None:
            return None
        cost_equity = rf + beta * erp
        # Cost of debt (interest expense / total debt)
        income = self.income_annual[0] if annual and self.income_annual else self.income_data[0] if self.income_data else {}
        interest = income.get("interestExpense") or 0
        cost_debt = (abs(interest) / debt) if debt > 0 else 0
        # Tax rate (income tax / pre-tax income)
        ratios = self.ratios_annual[0] if annual and self.ratios_annual else self.ratios_data[0] if self.ratios_data else {}
        tax_rate = ratios.get("effectiveTaxRate")
        if tax_rate is None:
            pretax = income.get("incomeBeforeTax")
            tax = income.get("incomeTaxExpense") or 0
            tax_rate = tax / pretax if pretax and pretax != 0 else 0
        tax_rate = max(0, min(tax_rate, 1))
        total = market_cap + debt
        wacc = (market_cap / total) * cost_equity + (debt / total) * cost_debt * (1 - tax_rate)
        return round(wacc * 100, 2)

    def fcf_yield(self, annual=False):
        ratios = self.ratios_annual[0] if annual and self.ratios_annual else self.ratios_data[0] if self.ratios_data else {}
        fcf_per_share = ratios.get("freeCashFlowPerShare")
        price = self.profile_data[0].get("price") if self.profile_data else None
        if fcf_per_share is None or price in (None, 0):
            return None
        return round((fcf_per_share / price) * 100, 2)

    def fcf_growth(self, periods: int = 3, annual=True):
        # Always use annual for growth
        data = self.ratios_annual
        if not isinstance(data, list):
            return None
        fcfps_list = [entry.get("freeCashFlowPerShare") for entry in data if entry.get("freeCashFlowPerShare") is not None]
        if len(fcfps_list) <= periods:
            return None
        start, end = fcfps_list[periods], fcfps_list[0]
        if start <= 0 or end <= 0:
            return None
        cagr = (end / start) ** (1 / periods) - 1
        return round(cagr * 100, 2)

    def cash_conversion(self, annual=False):
        cashflow = self.cashflow_annual[0] if annual and self.cashflow_annual else self.cashflow_data[0] if self.cashflow_data else {}
        income = self.income_annual[0] if annual and self.income_annual else self.income_data[0] if self.income_data else {}
        ocf = cashflow.get("operatingCashFlow")
        ni = income.get("netIncome")
        if ocf is None or ni in (None, 0):
            return None
        return round(ocf / ni, 2)

    def rule_of_40(self, annual=False):
        # Rule of 40 is only meaningful annually, but we provide a quarterly version too if wanted
        if annual:
            if len(self.income_annual) < 2:
                return None
            rev_now = self.income_annual[0].get("revenue")
            rev_prev = self.income_annual[1].get("revenue")
            if None in (rev_now, rev_prev) or rev_prev <= 0:
                return None
            growth = ((rev_now - rev_prev) / rev_prev) * 100
            fcf_margin = self.fcf_margin(annual=True)
        else:
            if len(self.income_data) < 2:
                return None
            rev_now = self.income_data[0].get("revenue")
            rev_prev = self.income_data[1].get("revenue")
            if None in (rev_now, rev_prev) or rev_prev <= 0:
                return None
            growth = ((rev_now - rev_prev) / rev_prev) * 100
            fcf_margin = self.fcf_margin(annual=False)
        if fcf_margin is None:
            return None
        return round(growth + fcf_margin, 2)

    # ----- API Output Aggregator -----
    def get_financial_metrics(self) -> FinancialMetrics:
        # For each metric, provide both quarterly and annual versions
        return FinancialMetrics(
            ticker=self.symbol,
            revenue_quarter=self.revenue(False),
            revenue_annual=self.revenue(True),
            net_income_quarter=self.net_income(False),
            net_income_annual=self.net_income(True),
            dividend_yield_quarter=self.dividend_yield(False),
            dividend_yield_annual=self.dividend_yield(True),
            pe_ratio_quarter=self.pe_ratio(False),
            pe_ratio_annual=self.pe_ratio(True),
            ps_ratio_quarter=self.ps_ratio(False),
            ps_ratio_annual=self.ps_ratio(True),
            fcf_margin_quarter=self.fcf_margin(False),
            fcf_margin_annual=self.fcf_margin(True),
            fcf_yield_quarter=self.fcf_yield(False),
            fcf_yield_annual=self.fcf_yield(True),
            fcf_growth_annual=self.fcf_growth(annual=True), # only annual meaningful
            roce_quarter=self.roce(False),
            roce_annual=self.roce(True),
            wacc_quarter=self.wacc(False),
            wacc_annual=self.wacc(True),
            roce_minus_wacc_quarter=(self.roce(False) - self.wacc(False)) if self.roce(False) and self.wacc(False) else None,
            roce_minus_wacc_annual=(self.roce(True) - self.wacc(True)) if self.roce(True) and self.wacc(True) else None,
            cash_conversion_quarter=self.cash_conversion(False),
            cash_conversion_annual=self.cash_conversion(True),
            rule_of_40_quarter=self.rule_of_40(False),
            rule_of_40_annual=self.rule_of_40(True),
            gross_margin_quarter=self.gross_margin(False),
            gross_margin_annual=self.gross_margin(True)
        )
