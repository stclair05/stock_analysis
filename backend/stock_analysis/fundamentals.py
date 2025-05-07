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

class Fundamentals:
    def __init__(self, symbol: str):
        self.symbol = symbol.upper()
        self.ticker_obj = yf.Ticker(self.symbol)
        self.info = self.ticker_obj.info

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
        print(f"🧮 Checking FCF yield for {self.symbol}...")

        cashflow_url = f"{FMP_BASE_URL}/api/v3/cash-flow-statement/{self.symbol}?limit=1&apikey={FMP_API_KEY}"
        quote_url = f"{FMP_BASE_URL}/api/v3/quote/{self.symbol}?apikey={FMP_API_KEY}"

        try:
            with ThreadPoolExecutor() as executor:
                cashflow_future = executor.submit(requests.get, cashflow_url)
                quote_future = executor.submit(requests.get, quote_url)

                cashflow_response = cashflow_future.result()
                quote_response = quote_future.result()

            cashflow_data = cashflow_response.json()
            quote_data = quote_response.json()

            if not cashflow_data or not quote_data:
                print("❌ Missing FCF or market cap data.")
                return None

            cf_entry = {k.lower(): v for k, v in cashflow_data[0].items()}
            ocf = cf_entry.get("operatingcashflow")
            capex = cf_entry.get("capitalexpenditure")

            if ocf is None or capex is None:
                print("❌ Missing operating cash flow or capex.")
                return None

            fcf = ocf - abs(capex)
            market_cap = quote_data[0].get("marketCap", 0)

            if not market_cap:
                print("❌ Market cap is zero.")
                return None

            fcf_yield_value = (fcf / market_cap) * 100
            print(f"✅ FCF Yield: {fcf_yield_value:.2f}%")
            return round(fcf_yield_value, 2)

        except Exception as e:
            print(f"❌ Error calculating FCF yield: {e}")
            return None

    def fcf_growth(self, years: int = 3) -> Optional[float]:
        print(f"📈 Calculating FCF growth (CAGR) for {self.symbol}...")

        url = f"{FMP_BASE_URL}/api/v3/cash-flow-statement/{self.symbol}?limit={years + 1}&apikey={FMP_API_KEY}"

        try:
            response = requests.get(url)
            data = response.json()

            if len(data) < years + 1:
                print("❌ Not enough FCF data.")
                return None

            fcf_values = []
            for entry in data:
                entry = {k.lower(): v for k, v in entry.items()}
                fcf = entry.get("freecashflow")
                if fcf is None:
                    print("❌ Missing FCF in one of the years.")
                    return None
                fcf_values.append(fcf)

            fcf_latest = fcf_values[0]
            fcf_oldest = fcf_values[-1]

            if fcf_oldest <= 0 or fcf_latest <= 0:
                print("❌ Invalid FCF values for CAGR.")
                return None

            cagr = (fcf_latest / fcf_oldest) ** (1 / years) - 1
            print(f"✅ FCF Growth (CAGR): {cagr * 100:.2f}%")
            return round(cagr * 100, 2)

        except Exception as e:
            print(f"❌ Error calculating FCF growth: {e}")
            return None

    def roce(self) -> Optional[float]:
        print(f"🧾 Calculating ROCE for {self.symbol}...")

        income_url = f"{FMP_BASE_URL}/api/v3/income-statement/{self.symbol}?limit=1&apikey={FMP_API_KEY}"
        balance_url = f"{FMP_BASE_URL}/api/v3/balance-sheet-statement/{self.symbol}?limit=1&apikey={FMP_API_KEY}"

        try:
            with ThreadPoolExecutor() as executor:
                income_future = executor.submit(requests.get, income_url)
                balance_future = executor.submit(requests.get, balance_url)

                income_resp = income_future.result()
                balance_resp = balance_future.result()

            income_data = income_resp.json()
            balance_data = balance_resp.json()

            print("🔍 Raw Income Statement:", income_data)
            print("🔍 Raw Balance Sheet:", balance_data)

            if not income_data or not balance_data:
                print("❌ Missing income or balance sheet data.")
                return None

            income_entry = {k.lower(): v for k, v in income_data[0].items()}
            balance_entry = {k.lower(): v for k, v in balance_data[0].items()}

            # Try EBIT, fallback to operatingIncome if needed
            ebit = income_entry.get("ebit") or income_entry.get("operatingincome")
            total_assets = balance_entry.get("totalassets")
            current_liabilities = balance_entry.get("totalcurrentliabilities")

            print(f"EBIT (fallback OK): {ebit}, Total Assets: {total_assets}, Current Liabilities: {current_liabilities}")

            if None in (ebit, total_assets, current_liabilities):
                print("❌ Missing required fields.")
                return None

            capital_employed = total_assets - current_liabilities
            if capital_employed == 0:
                print("❌ Capital employed is zero.")
                return None

            roce = (ebit / capital_employed) * 100
            print(f"✅ ROCE: {roce:.2f}%")
            return round(roce, 2)

        except Exception as e:
            print(f"❌ Error calculating ROCE: {e}")
            return None
        
    def wacc(self) -> Optional[float]:
        print(f"🧮 Calculating WACC (institutional-style) for {self.symbol}...")

        try:
            # Fetch Rf and ERP
            risk_free_rate = get_risk_free_rate()
            equity_risk_premium = get_equity_risk_premium()

            # API calls
            profile_url = f"{FMP_BASE_URL}/api/v3/profile/{self.symbol}?apikey={FMP_API_KEY}"
            income_url = f"{FMP_BASE_URL}/api/v3/income-statement/{self.symbol}?limit=1&apikey={FMP_API_KEY}"
            balance_url = f"{FMP_BASE_URL}/api/v3/balance-sheet-statement/{self.symbol}?limit=1&apikey={FMP_API_KEY}"

            with ThreadPoolExecutor() as executor:
                profile_future = executor.submit(requests.get, profile_url)
                income_future = executor.submit(requests.get, income_url)
                balance_future = executor.submit(requests.get, balance_url)

                profile_resp = profile_future.result().json()
                income_resp = income_future.result().json()
                balance_resp = balance_future.result().json()

            if not profile_resp or not income_resp or not balance_resp:
                print("❌ Missing profile/income/balance data.")
                return None

            profile = {k.lower(): v for k, v in profile_resp[0].items()}
            income = {k.lower(): v for k, v in income_resp[0].items()}
            balance = {k.lower(): v for k, v in balance_resp[0].items()}

            market_cap = profile.get("mktcap")
            beta = profile.get("beta", self.beta())
            interest_expense = income.get("interestexpense")
            income_before_tax = income.get("incomebeforetax")
            income_tax_expense = income.get("incometaxexpense")
            short_term_debt = balance.get("shorttermdebt", 0)
            long_term_debt = balance.get("longtermdebt", 0)

            total_debt = short_term_debt + long_term_debt

            if None in (market_cap, beta, interest_expense, income_before_tax, income_tax_expense):
                print("❌ Missing required fields for WACC.")
                return None

            # 📈 Cost of equity (CAPM)
            cost_of_equity = risk_free_rate + beta * equity_risk_premium

            # 📉 Cost of debt (estimated)
            cost_of_debt = abs(interest_expense) / total_debt if total_debt > 0 else 0

            # 🧾 Tax rate
            tax_rate = income_tax_expense / income_before_tax if income_before_tax else 0

            # 🧮 Capital structure weights
            e = market_cap
            d = total_debt
            v = e + d

            wacc = (e / v) * cost_of_equity + (d / v) * cost_of_debt * (1 - tax_rate)
            print(f"✅ Dynamic WACC: {wacc * 100:.2f}%")

            return round(wacc * 100, 2)

        except Exception as e:
            print(f"❌ Error calculating WACC: {e}")
            return None

    def cash_conversion(self) -> Optional[float]:
        print(f"💵 Calculating Cash Conversion Ratio for {self.symbol}...")

        try:
            cashflow_url = f"{FMP_BASE_URL}/api/v3/cash-flow-statement/{self.symbol}?limit=1&apikey={FMP_API_KEY}"
            income_url = f"{FMP_BASE_URL}/api/v3/income-statement/{self.symbol}?limit=1&apikey={FMP_API_KEY}"

            with ThreadPoolExecutor() as executor:
                cashflow_future = executor.submit(requests.get, cashflow_url)
                income_future = executor.submit(requests.get, income_url)

                cashflow_resp = cashflow_future.result().json()
                income_resp = income_future.result().json()

            if not cashflow_resp or not income_resp:
                print("❌ Missing cash flow or income data.")
                return None

            cashflow_entry = {k.lower(): v for k, v in cashflow_resp[0].items()}
            income_entry = {k.lower(): v for k, v in income_resp[0].items()}

            ocf = cashflow_entry.get("operatingcashflow")
            net_income = income_entry.get("netincome")

            print(f"Operating Cash Flow: {ocf}, Net Income: {net_income}")

            if ocf is None or net_income is None or net_income == 0:
                print("❌ Missing or zero net income.")
                return None

            ratio = ocf / net_income
            print(f"✅ Cash Conversion Ratio: {ratio:.2f}x")

            return round(ratio, 2)

        except Exception as e:
            print(f"❌ Error calculating cash conversion ratio: {e}")
            return None

    def rule_of_40(self) -> Optional[float]:
        '''
        Flag if rule_of_40_value >= 40 with "Pass" or "Fail"
        
        '''
        print(f"📊 Calculating Rule of 40 for {self.symbol}...")

        url = f"{FMP_BASE_URL}/api/v3/income-statement/{self.symbol}?limit=2&apikey={FMP_API_KEY}"

        try:
            response = requests.get(url)
            data = response.json()

            if len(data) < 2:
                print("❌ Not enough data to compute YoY growth.")
                return None

            # Normalize keys
            current = {k.lower(): v for k, v in data[0].items()}
            previous = {k.lower(): v for k, v in data[1].items()}

            revenue_now = current.get("revenue")
            revenue_prev = previous.get("revenue")
            net_income_now = current.get("netincome")

            if None in (revenue_now, revenue_prev, net_income_now) or revenue_now == 0 or revenue_prev == 0:
                print("❌ Missing or invalid revenue/net income values.")
                return None

            # Calculate growth rate and profit margin
            revenue_growth = ((revenue_now - revenue_prev) / revenue_prev) * 100
            profit_margin = (net_income_now / revenue_now) * 100

            rule_of_40_value = revenue_growth + profit_margin

            print(f"📈 Revenue Growth: {revenue_growth:.2f}%")
            print(f"💰 Profit Margin: {profit_margin:.2f}%")
            print(f"✅ Rule of 40 Score: {rule_of_40_value:.2f}%")

            return round(rule_of_40_value, 2)

        except Exception as e:
            print(f"❌ Error calculating Rule of 40: {e}")
            return None
        
    def gross_margin(self) -> Optional[float]:
        '''
        We are looking at gross_margin > 45%
        '''
        print(f"🧾 Calculating Gross Margin for {self.symbol}...")

        url = f"{FMP_BASE_URL}/api/v3/income-statement/{self.symbol}?limit=1&apikey={FMP_API_KEY}"

        try:
            response = requests.get(url)
            data = response.json()

            if not data:
                print("❌ No income statement data available.")
                return None

            entry = {k.lower(): v for k, v in data[0].items()}
            revenue = entry.get("revenue")
            cogs = entry.get("costofrevenue") or entry.get("costofgoodsold")

            print(f"Revenue: {revenue}, COGS: {cogs}")

            if revenue is None or cogs is None or revenue == 0:
                print("❌ Missing or invalid revenue or COGS.")
                return None

            gross_margin = ((revenue - cogs) / revenue) * 100
            print(f"✅ Gross Margin: {gross_margin:.2f}%")

            return round(gross_margin, 2)

        except Exception as e:
            print(f"❌ Error calculating gross margin: {e}")
            return None