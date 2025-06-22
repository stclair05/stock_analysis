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
    mean_rev_weekly: TimeSeriesMetric
    bollinger_band_width_percentile_daily: TimeSeriesMetric
    rsi_ma_weekly: TimeSeriesMetric
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
    as_of_date: Optional[str] = None
    
    # Revenue
    revenue_quarter: Optional[float]
    revenue_annual: Optional[float]

    # Net Income
    net_income_quarter: Optional[float]
    net_income_annual: Optional[float]

    # Dividend Yield
    dividend_yield_quarter: Optional[float]
    dividend_yield_annual: Optional[float]

    # PE Ratio
    pe_ratio_quarter: Optional[float]
    pe_ratio_annual: Optional[float]

    # PS Ratio
    ps_ratio_quarter: Optional[float]
    ps_ratio_annual: Optional[float]

    # FCF Margin
    fcf_margin_quarter: Optional[float]
    fcf_margin_annual: Optional[float]

    # FCF Yield
    fcf_yield_quarter: Optional[float]
    fcf_yield_annual: Optional[float]

    # FCF Growth (annual only, as discussed)
    fcf_growth_annual: Optional[float]

    # ROCE
    roce_quarter: Optional[float]
    roce_annual: Optional[float]

    # WACC
    wacc_quarter: Optional[float]
    wacc_annual: Optional[float]

    # ROCE - WACC
    roce_minus_wacc_quarter: Optional[float]
    roce_minus_wacc_annual: Optional[float]

    # Cash Conversion
    cash_conversion_quarter: Optional[float]
    cash_conversion_annual: Optional[float]

    # Rule of 40
    rule_of_40_quarter: Optional[float]
    rule_of_40_annual: Optional[float]

    # Gross Margin
    gross_margin_quarter: Optional[float]
    gross_margin_annual: Optional[float]