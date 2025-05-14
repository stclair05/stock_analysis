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
      return value >= thresholds.fcf_yield ? "text-success fw-bold" : "text-danger fw-bold";
    case "FCF Growth":
      return value >= thresholds.fcf_growth ? "text-success fw-bold" : "text-danger";
    case "Yield + Growth":
      return value >= thresholds.yield_plus_growth ? "text-success fw-bold" : "text-danger";
    case "ROCE":
      return value >= thresholds.roce ? "text-success fw-bold" : "text-warning";
    case "WACC":
      return value < 7 ? "text-success" : value < 10 ? "text-warning" : "text-danger";
    case "ROCE – WACC":
      return value >= thresholds.roce_minus_wacc ? "text-success fw-bold" : "text-danger";
    case "Cash Conversion Ratio":
      return value >= thresholds.cash_conversion ? "text-success" : "text-danger";
    case "Rule of 40 Score":
      return value >= 40 ? "text-success fw-bold" : "text-warning";
    case "Gross Margin":
      return value >= thresholds.gross_margin ? "text-success fw-bold" : "text-danger";
    case "Sortino Ratio":
      return value > 1 ? "text-success fw-bold" : value > 0.5 ? "text-warning" : "text-danger";
    case "Beta":
      return value < 1 ? "text-success" : value === 1 ? "text-warning" : "text-danger";
    default:
      return "";
  }
}

type FinancialMetrics = {
  ticker: string;
  revenue: number | null;
  net_income: number | null;
  dividend_yield: number | null;
  pe_ratio: number | null;
  ps_ratio: number | null;
  beta: number | null;
  fcf_yield: number | null;
  fcf_growth: number | null;
  yield_plus_growth: number | null;
  roce: number | null;
  wacc: number | null;
  roce_minus_wacc: number | null;
  cash_conversion: number | null;
  rule_of_40: number | null;
  gross_margin: number | null;
  sortino_ratio: number | null;
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
            setLoading(true); // Start loading
            const res = await fetch(`http://localhost:8000/financials/${stockSymbol}`);
            if (!res.ok) throw new Error("Failed to fetch financials.");
            const json = await res.json();
            setData(json);
          } catch (err: any) {
            setError(err.message || "Unexpected error");
          } finally {
            setLoading(false); // Stop loading
          }
    };

    fetchData();
  }, [stockSymbol]);

  const renderRow = (label: string, value: number | string | null, suffix = "") => {
    const display = value !== null && value !== undefined ? `${value}${suffix}` : "N/A";
    const className = typeof value === "number" ? getColor(label, value) : "text-secondary";
    return (
      <tr>
        <td>{label}</td>
        <td className={className}>{display}</td>
      </tr>
    );
  };

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (loading) return <div className="placeholder">Loading fundamentals...</div>;
  if (!data) return <div className="placeholder">Loading fundamentals...</div>;

  return (
    <div className="table-responsive fade-in" style={{ width: "100%" }}>
      <h2 className="mb-3">Fundamentals for <strong>{data.ticker}</strong></h2>
      <table className="table table-striped metrics-table">
        <tbody>
          {renderRow("Revenue", data.revenue ? `$${(data.revenue / 1_000_000_000).toFixed(1)}B` : "N/A")}
          {renderRow("Net Income", data.net_income ? `$${(data.net_income / 1_000_000_000).toFixed(1)}B` : "N/A")}
          {renderRow("Dividend Yield", data.dividend_yield, "%")}
          {renderRow("P/E Ratio", data.pe_ratio)}
          {renderRow("P/S Ratio", data.ps_ratio)}
          {renderRow("Beta", data.beta)}
          {renderRow("FCF Yield", data.fcf_yield, "%")}
          {renderRow("FCF Growth", data.fcf_growth, "%")}
          {renderRow("Yield + Growth", data.yield_plus_growth, "%")}
          {renderRow("ROCE", data.roce, "%")}
          {renderRow("WACC", data.wacc, "%")}
          {renderRow("ROCE – WACC", data.roce_minus_wacc, "%")}
          {renderRow("Cash Conversion Ratio", data.cash_conversion)}
          {renderRow("Rule of 40 Score", data.rule_of_40, "%")}
          {renderRow("Gross Margin", data.gross_margin, "%")}
          {renderRow("Sortino Ratio", data.sortino_ratio)}
        </tbody>
      </table>
    </div>
  );
};

export default Fundamentals;
