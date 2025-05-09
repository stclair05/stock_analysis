from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from stock_analysis.stock_analyser import StockAnalyser
from stock_analysis.models import StockRequest, StockAnalysisResponse, ElliottWaveResponse, FinancialMetrics
from stock_analysis.elliott_wave import calculate_elliott_wave
from stock_analysis.fundamentals import Fundamentals
from stock_analysis.utils import sortino_ratio as compute_sortino_ratio
from fastapi.responses import JSONResponse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from aliases import SYMBOL_ALIASES
import yfinance as yf
import asyncio
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyse", response_model=StockAnalysisResponse)
def analyse(stock_request: StockRequest):
    analyser = StockAnalyser(stock_request.symbol)
    return StockAnalysisResponse(
        current_price=analyser.get_current_price(),
        three_year_ma=analyser.calculate_3year_ma(),
        two_hundred_dma=analyser.calculate_200dma(),
        weekly_ichimoku=analyser.ichimoku_cloud(),
        super_trend=analyser.super_trend(),
        adx=analyser.adx(),
        mace=analyser.mace(),
        forty_week_status=analyser.forty_week_status(),
        fifty_dma_and_150_dma=analyser.fifty_dma_and_150_dma(),
        twenty_dma=analyser.calculate_20dma(),
        fifty_dma=analyser.calculate_50dma(),
        mean_rev_50dma=analyser.mean_reversion_50dma(),
        mean_rev_200dma=analyser.mean_reversion_200dma(),
        mean_rev_3yma=analyser.mean_reversion_3yma(),
        rsi_and_ma_daily=analyser.rsi_and_ma_daily(),
        rsi_divergence_daily=analyser.rsi_divergence_daily(),
        bollinger_band_width_percentile_daily=analyser.bollinger_band_width_percentile_daily(),
        rsi_ma_weekly=analyser.rsi_ma_weekly(),
        rsi_divergence_weekly=analyser.rsi_divergence_weekly(),
        rsi_ma_monthly=analyser.rsi_ma_monthly(),
        rsi_divergence_monthly=analyser.rsi_divergence_monthly(),
        chaikin_money_flow=analyser.chaikin_money_flow(),
    )

@app.post("/elliott", response_model=ElliottWaveResponse)
def elliott(stock_request: StockRequest):
    analyser = StockAnalyser(stock_request.symbol)
    df = analyser.df

    elliott_result = calculate_elliott_wave(df)

    if "error" in elliott_result:
        return JSONResponse(status_code=400, content={"detail": elliott_result["error"]})

    return elliott_result

@app.get("/portfolio_live_data")
def get_portfolio_live_data():
    try:
        json_path = Path("portfolio_store.json")
        if not json_path.exists():
            return {"error": "Portfolio JSON file not found."}

        with open(json_path, "r") as f:
            portfolio_data = json.load(f)

        # Fetch GBPUSD once if needed
        fx_rate = None
        if any(item["ticker"].endswith(".L") for item in portfolio_data):
            try:
                fx_data = yf.Ticker("GBPUSD=X").history(period="1d")
                fx_rate = fx_data["Close"].iloc[-1]
            except Exception:
                fx_rate = 1  # fallback to 1 if error

        def process_item(item):
            try:
                ticker = item["ticker"]
                shares = item["shares"]
                invested_capital = item["invested_capital"]
                average_cost = item["average_cost"]

                yf_ticker = yf.Ticker(ticker)
                price_data = yf_ticker.history(period="1d")
                current_price = None

                if not price_data.empty:
                    current_price = price_data["Close"].iloc[-1]
                else:
                    try:
                        info = yf_ticker.info
                        current_price = info.get("previousClose", None)
                    except Exception:
                        current_price = None

                if ticker.endswith(".L") and current_price is not None and fx_rate:
                    current_price *= fx_rate

                # If still no price, treat as static asset
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
                        "static_asset": True
                    }

                market_value = shares * current_price
                pnl = market_value - invested_capital
                pnl_percent = pnl / invested_capital if invested_capital != 0 else 0

                return {
                    "ticker": ticker,
                    "shares": shares,
                    "average_cost": round(average_cost, 2),
                    "current_price": round(current_price, 2),
                    "market_value": round(market_value, 2),
                    "invested_capital": round(invested_capital, 2),
                    "pnl": round(pnl, 2),
                    "pnl_percent": round(pnl_percent * 100, 2),
                    "static_asset": False
                }
            except Exception:
                return None

        results = []
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(process_item, item) for item in portfolio_data]
            for future in as_completed(futures):
                result = future.result()
                if result:
                    results.append(result)

        return results

    except Exception as e:
        return {"error": str(e)}
    

@app.get("/financials/{symbol}", response_model=FinancialMetrics)
def get_financials(symbol: str):
    f = Fundamentals(symbol)
    fcf_yield = f.fcf_yield()
    fcf_growth = f.fcf_growth()
    yield_plus_growth = (
        round(fcf_yield + fcf_growth, 2)
        if fcf_yield is not None and fcf_growth is not None
        else None
    )
    roce = f.roce()
    wacc = f.wacc()
    roce_minus_wacc = (
        round(roce - wacc, 2)
        if roce is not None and wacc is not None
        else None
    )
    cash_conversion = f.cash_conversion()
    rule_of_40 = f.rule_of_40()
    gross_margin = f.gross_margin()
    sortino_ratio = compute_sortino_ratio(symbol)

    return FinancialMetrics(
        ticker=symbol.upper(),
        revenue=f.revenue(),
        net_income=f.net_income(),
        dividend_yield=f.dividend_yield(),
        pe_ratio=f.pe_ratio(),
        ps_ratio=f.ps_ratio(),
        beta=f.beta(),
        fcf_yield=fcf_yield,
        fcf_growth=fcf_growth,
        yield_plus_growth=yield_plus_growth,
        roce=roce,
        wacc=wacc,
        roce_minus_wacc=roce_minus_wacc,
        cash_conversion=cash_conversion,
        rule_of_40=rule_of_40,
        gross_margin=gross_margin,
        sortino_ratio=sortino_ratio,
    )


@app.websocket("/ws/chart_data_weekly/{symbol}")
async def websocket_chart_data(websocket: WebSocket, symbol: str):
    await websocket.accept()
    try:
        raw_symbol = symbol.upper()
        symbol = SYMBOL_ALIASES.get(raw_symbol, raw_symbol)

        hist_df = yf.download(tickers=symbol, period='10y', interval='1wk', progress=False)
        if hist_df.empty:
            await websocket.send_json({"error": f"No data found for symbol {symbol}"})
            await websocket.close()
            return

        history = [
            {
                "time": int(ts.timestamp()),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": round(float(row["Volume"]), 2)
            }
            for ts, row in hist_df.iterrows()
        ]

        await websocket.send_json({"history": history})

        last_ts = hist_df.index[-1]

        while True:
            new_df = yf.download(tickers=symbol, period='1d', interval='1m', progress=False)
            new_rows = new_df[new_df.index > last_ts]
            for ts, row in new_rows.iterrows():
                await websocket.send_json({
                    "live": {
                        "time": int(ts.timestamp()),
                        "value": round(float(row['Close']), 2)
                    }
                })
                last_ts = ts
            await asyncio.sleep(5)

    except WebSocketDisconnect:
        print(f"Client disconnected for {symbol}")
    except Exception as e:
        print(f"WebSocket error for {symbol}: {e}")
        await websocket.close()