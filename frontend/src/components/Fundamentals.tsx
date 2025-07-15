import React, { useEffect, useState } from "react";
import "./Metrics.css";

// 🎯 Industrial Benchmarks
const thresholds = {
  fcf_yield: 5,
  fcf_growth: 10,
  yield_plus_growth: 14,
  roce: 37,
  wacc: 0, // Lower is better
  roce_minus_wacc: 15,
  cash_conversion: 100,
  rule_of_40: 0, // Informational only
  gross_margin: 45,
  sortino_ratio: 0.5, // >0.5 acceptable, >1 good
  beta: 1, // 1 = market average
};

function getColor(label: string, value: number | null): string {
  if (value === null || isNaN(value)) return "text-secondary";

  switch (label) {
    case "FCF Yield":
      return value >= thresholds.fcf_yield
        ? "text-success fw-bold"
        : "text-danger fw-bold";
    case "FCF Growth":
      return value >= thresholds.fcf_growth
        ? "text-success fw-bold"
        : "text-danger";
    case "Yield + Growth":
      return value >= thresholds.yield_plus_growth
        ? "text-success fw-bold"
        : "text-danger";
    case "ROCE":
      return value >= thresholds.roce ? "text-success fw-bold" : "text-warning";
    case "WACC":
      return value < 7
        ? "text-success"
        : value < 10
        ? "text-warning"
        : "text-danger";
    case "ROCE – WACC":
      return value >= thresholds.roce_minus_wacc
        ? "text-success fw-bold"
        : "text-danger";
    case "Cash Conversion Ratio":
      return value >= thresholds.cash_conversion
        ? "text-success"
        : "text-danger";
    case "Rule of 40 Score":
      return value >= 40 ? "text-success fw-bold" : "text-warning";
    case "Gross Margin":
      return value >= thresholds.gross_margin
        ? "text-success fw-bold"
        : "text-danger";
    case "Sortino Ratio":
      return value > 1
        ? "text-success fw-bold"
        : value > 0.5
        ? "text-warning"
        : "text-danger";
    case "Beta":
      return value < 1
        ? "text-success"
        : value === 1
        ? "text-warning"
        : "text-danger";
    case "FCF Margin":
      return value >= 15
        ? "text-success fw-bold"
        : value >= 5
        ? "text-warning"
        : "text-danger";
    default:
      return "";
  }
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "N/A";
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absValue >= 1_000_000_000)
    return `${sign}$${(absValue / 1_000_000_000).toFixed(1)}B`;
  if (absValue >= 1_000_000)
    return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
  if (absValue >= 1_000) return `${sign}$${(absValue / 1_000).toFixed(1)}K`;
  // For smaller values, add commas
  return `${sign}$${absValue.toLocaleString()}`;
}

const formatPercent = (value: number | null | undefined) =>
  value != null ? `${Number(value).toFixed(2)}%` : "N/A";

const greyed = (text: string) => (
  <span className="text-secondary" style={{ opacity: 0.5 }}>
    {text}
  </span>
);

type FinancialMetrics = {
  ticker: string;
  as_of_date?: string;
  revenue_quarter: number | null;
  revenue_annual: number | null;
  net_income_quarter: number | null;
  net_income_annual: number | null;
  dividend_yield_quarter: number | null;
  dividend_yield_annual: number | null;
  pe_ratio_quarter: number | null;
  pe_ratio_annual: number | null;
  ps_ratio_quarter: number | null;
  ps_ratio_annual: number | null;
  fcf_margin_quarter: number | null;
  fcf_margin_annual: number | null;
  fcf_yield_quarter: number | null;
  fcf_yield_annual: number | null;
  fcf_growth_annual: number | null;
  roce_quarter: number | null;
  roce_annual: number | null;
  wacc_quarter: number | null;
  wacc_annual: number | null;
  roce_minus_wacc_quarter: number | null;
  roce_minus_wacc_annual: number | null;
  cash_conversion_quarter: number | null;
  cash_conversion_annual: number | null;
  rule_of_40_quarter: number | null;
  rule_of_40_annual: number | null;
  gross_margin_quarter: number | null;
  gross_margin_annual: number | null;
};

type Props = {
  stockSymbol: string;
};

const Fundamentals = ({ stockSymbol }: Props) => {
  const [data, setData] = useState<FinancialMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stockSymbol) return;

    const fetchData = async () => {
      try {
        setError(null);
        setLoading(true);
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/fmp_financials/${stockSymbol}`
        );
        if (!res.ok) throw new Error("Failed to fetch financials.");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "Unexpected error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [stockSymbol]);

  const renderRow = (
    label: string,
    qValue: number | null,
    aValue: number | null,
    formatter: (v: number | null | undefined) => string = (v) => String(v),
    greyOutQuarter: boolean = false
  ) => {
    // FCF Growth: grey out quarter
    const qDisplay = greyOutQuarter ? greyed("N/A") : formatter(qValue);
    const aDisplay = formatter(aValue);
    // Coloring for annual by default (you can also add quarterly coloring)
    const aClass =
      typeof aValue === "number" ? getColor(label, aValue) : "text-secondary";
    const qClass =
      greyOutQuarter || qValue == null
        ? "text-secondary"
        : typeof qValue === "number"
        ? getColor(label, qValue)
        : "text-secondary";
    return (
      <tr>
        <td>{label}</td>
        <td className={qClass} style={{ minWidth: 90, textAlign: "center" }}>
          {qDisplay}
        </td>
        <td className={aClass} style={{ minWidth: 90, textAlign: "center" }}>
          {aDisplay}
        </td>
      </tr>
    );
  };

  if (error)
    return <div className="no-fundamentals">No fundamental data available</div>;
  if (loading)
    return <div className="placeholder">Loading fundamentals...</div>;
  if (!data) return <div className="placeholder">Loading fundamentals...</div>;

  return (
    <div className="table-responsive fade-in" style={{ width: "100%" }}>
      {data.as_of_date && (
        <div
          style={{
            fontStyle: "italic",
            fontSize: "1em",
            opacity: 0.6,
            marginBottom: 8,
          }}
        >
          as of {data.as_of_date}
        </div>
      )}
      <h2 className="mb-3">
        Fundamentals for <strong>{data.ticker}</strong>
      </h2>
      <table className="table table-striped metrics-table">
        <thead>
          <tr>
            <th></th>
            <th>Quarterly</th>
            <th>Annual</th>
          </tr>
        </thead>
        <tbody>
          {renderRow(
            "Revenue",
            data.revenue_quarter,
            data.revenue_annual,
            formatNumber
          )}
          {renderRow(
            "Net Income",
            data.net_income_quarter,
            data.net_income_annual,
            formatNumber
          )}
          {renderRow(
            "Dividend Yield",
            data.dividend_yield_quarter,
            data.dividend_yield_annual,
            formatPercent
          )}
          {renderRow("P/E Ratio", data.pe_ratio_quarter, data.pe_ratio_annual)}
          {renderRow("P/S Ratio", data.ps_ratio_quarter, data.ps_ratio_annual)}
          {renderRow(
            "FCF Yield",
            data.fcf_yield_quarter,
            data.fcf_yield_annual,
            formatPercent
          )}
          {renderRow(
            "FCF Growth",
            null,
            data.fcf_growth_annual,
            formatPercent,
            true
          )}
          {renderRow(
            "FCF Margin",
            data.fcf_margin_quarter,
            data.fcf_margin_annual,
            formatPercent
          )}
          {renderRow(
            "ROCE",
            data.roce_quarter,
            data.roce_annual,
            formatPercent
          )}
          {renderRow(
            "WACC",
            data.wacc_quarter,
            data.wacc_annual,
            formatPercent
          )}
          {renderRow(
            "ROCE – WACC",
            data.roce_minus_wacc_quarter,
            data.roce_minus_wacc_annual,
            formatPercent
          )}
          {renderRow(
            "Cash Conversion Ratio",
            data.cash_conversion_quarter,
            data.cash_conversion_annual,
            formatNumber
          )}
          {renderRow(
            "Rule of 40 Score",
            data.rule_of_40_quarter,
            data.rule_of_40_annual,
            formatPercent
          )}
          {renderRow(
            "Gross Margin",
            data.gross_margin_quarter,
            data.gross_margin_annual,
            formatPercent
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Fundamentals;
