from pydantic import BaseModel
from typing import Optional

# === Models ===
class TimeSeriesMetric(BaseModel):
    current: float | str | None
    seven_days_ago: float | str | None
    fourteen_days_ago: float | str | None
    twentyone_days_ago: float | str | None

class StockRequest(BaseModel):
    symbol: str

class StockAnalysisResponse(BaseModel):
    current_price: float | None
    three_year_ma: TimeSeriesMetric
    two_hundred_dma: TimeSeriesMetric
    weekly_ichimoku: TimeSeriesMetric
    super_trend: TimeSeriesMetric
    adx: TimeSeriesMetric
    mace: TimeSeriesMetric
    forty_week_status: TimeSeriesMetric
    fifty_dma_and_150_dma: TimeSeriesMetric
    twenty_dma: TimeSeriesMetric
    fifty_dma: TimeSeriesMetric
    mean_rev_50dma: TimeSeriesMetric
    mean_rev_200dma: TimeSeriesMetric
    mean_rev_3yma: TimeSeriesMetric
    rsi_and_ma_daily: TimeSeriesMetric
    rsi_divergence_daily: TimeSeriesMetric
    bollinger_band_width_percentile_daily: TimeSeriesMetric
    rsi_ma_weekly: TimeSeriesMetric
    rsi_divergence_weekly: TimeSeriesMetric
    rsi_ma_monthly: TimeSeriesMetric
    rsi_divergence_monthly: TimeSeriesMetric
    chaikin_money_flow: TimeSeriesMetric

class ElliottWaveResponse(BaseModel):
    current_wave: str
    wave_type: Optional[str] = None
    wave_start_price: float
    current_price: float
    wave_end_projection: float
    invalidation_level: float
    buy_1: float
    buy_2: float
    buy_3: float
    sell_price: float
    arrow_target: float
    rsi_divergence: Optional[str] = None
    volume_confirmation: Optional[str] = None
    wave_a: Optional[float] = None
    wave_b: Optional[float] = None
    wave_c: Optional[float] = None

class FinancialMetrics(BaseModel):
    ticker: str
    revenue: Optional[float]
    net_income: Optional[float]
    dividend_yield: Optional[float]
    pe_ratio: Optional[float]
    ps_ratio: Optional[float]
    beta: Optional[float]