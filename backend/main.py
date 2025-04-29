from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from stock_analysis.stock_analyser import StockAnalyser
from stock_analysis.models import StockRequest, StockAnalysisResponse, ElliottWaveResponse
from stock_analysis.elliott_wave import calculate_elliott_wave
from fastapi.responses import JSONResponse
from aliases import SYMBOL_ALIASES
import yfinance as yf
import asyncio

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
            {"time": int(ts.timestamp()), "value": round(float(row["Close"]), 2)}
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