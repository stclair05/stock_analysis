import React, { useEffect, useState } from "react";
import "./Metrics.css"; // reuse table styling

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

  useEffect(() => {
    if (!stockSymbol) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`http://localhost:8000/financials/${stockSymbol}`);
        if (!res.ok) throw new Error("Failed to fetch financials.");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "Unexpected error");
      }
    };

    fetchData();
  }, [stockSymbol]);

  const renderRow = (label: string, value: number | string | null, suffix = "") => (
    <tr>
      <td>{label}</td>
      <td>{value !== null && value !== undefined ? `${value}${suffix}` : "N/A"}</td>
    </tr>
  );

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className="placeholder">Loading fundamentals...</div>;

  return (
    <div className="table-responsive fade-in fundamental-card">
      <h2 className="mb-3">📘 Fundamentals for <strong>{data.ticker}</strong></h2>
      <table className="table table-striped metrics-table">
        <tbody>
          {renderRow("Revenue", data.revenue)}
          {renderRow("Net Income", data.net_income)}
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
