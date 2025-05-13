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

class WaveLabel(BaseModel):
    index: int
    price: float
    label: str

class Scenario(BaseModel):
    wave_type: str
    current_wave: str
    wave_start_price: float
    current_price: float
    wave_end_projection: Optional[float] = None
    invalidation_level: float
    buy_1: float
    buy_2: float
    buy_3: float
    sell_price: float
    arrow_target: Optional[float] = None
    rsi_divergence: str
    volume_confirmation: str
    confidence: float
    entry_signal: bool
    entry_type: str
    entry_price: float
    stop_loss: float
    take_profit: float
    wave_labels: list[WaveLabel]
    wave_a: Optional[float] = None
    wave_b: Optional[float] = None
    wave_c: Optional[float] = None
    pivot_count: Optional[int] = None

class ElliottWaveScenariosResponse(BaseModel):
    scenarios: list[Scenario]


class FinancialMetrics(BaseModel):
    ticker: str
    revenue: Optional[float]
    net_income: Optional[float]
    dividend_yield: Optional[float]
    pe_ratio: Optional[float]
    ps_ratio: Optional[float]
    beta: Optional[float]
    fcf_yield: Optional[float]
    fcf_growth: Optional[float]
    yield_plus_growth: Optional[float]
    roce: Optional[float]
    wacc: Optional[float]
    roce_minus_wacc: Optional[float]
    cash_conversion: Optional[float]
    rule_of_40: Optional[float]
    gross_margin: Optional[float]
    sortino_ratio: Optional[float]