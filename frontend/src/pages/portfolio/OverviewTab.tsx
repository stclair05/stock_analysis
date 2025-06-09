import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Holding = {
  ticker: string;
  shares: number;
  average_cost: number;
  current_price: number | null;
  market_value: number;
  invested_capital: number;
  pnl: number;
  pnl_percent: number;
  static_asset?: boolean;
  category?: string;
};

const formatMoney = (value: number): string => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
};

const categoryDisplayName: Record<string, string> = {
  equities: "Equities",
  fixed_income: "Fixed Income",
  alt_debt: "Alt Debt",
  private_equity: "Private Equity",
};

const OverviewTab = () => {
  const [portfolio, setPortfolio] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true; // flag to track if component is still mounted

    const fetchPortfolio = async () => {
      try {
        const res = await fetch("http://localhost:8000/portfolio_live_data");
        const data = await res.json();
        if (mounted) setPortfolio(data); // only update if still mounted
      } catch (err) {
        console.error("Failed to load portfolio", err);
      } finally {
        if (mounted) setLoading(false); // only update if still mounted
      }
    };

    fetchPortfolio();

    return () => {
      mounted = false; // cleanup when component unmounts
    };
  }, []);

  const getSum = (field: keyof Holding): string => {
    const sum = portfolio.reduce(
      (acc, item) => acc + ((item[field] as number) ?? 0),
      0
    );
    return `$${sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const getPnlPercent = (): string => {
    const invested = portfolio.reduce(
      (acc, item) => acc + item.invested_capital,
      0
    );
    const pnl = portfolio.reduce((acc, item) => acc + item.pnl, 0);
    if (invested === 0) return "0.00";
    return ((pnl / invested) * 100).toFixed(2);
  };

  const getAllocationData = () => {
    const groups: Record<string, number> = {};
    portfolio.forEach((item) => {
      const cat = item.category || "Other";
      groups[cat] = (groups[cat] ?? 0) + item.invested_capital;
    });
    return Object.entries(groups).map(([name, value]) => ({
      name: categoryDisplayName[name] || name,
      value: parseFloat(value.toFixed(2)),
    }));
  };

  const StatCard = ({
    title,
    value,
    colored = false,
  }: {
    title: string;
    value: string;
    colored?: boolean;
  }) => {
    const isNegative = value.includes("-");

    return (
      <div className="col-md-3">
        <div
          className={`p-4 rounded shadow-sm h-100 ${
            colored
              ? isNegative
                ? "bg-danger-subtle text-danger"
                : "bg-success-subtle text-success"
              : "bg-white"
          }`}
        >
          <div className="fw-semibold text-muted small mb-1">{title}</div>
          <div className="h4 fw-bold">{value}</div>
        </div>
      </div>
    );
  };

  const COLORS = ["#3366CC", "#FF9900", "#109618", "#990099"];

  return (
    <div>
      {loading ? (
        <div>
          <div className="row g-4 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <div className="col-md-3" key={i}>
                <div className="p-4 rounded bg-light shadow-sm placeholder-glow h-100">
                  <div className="placeholder col-6 mb-2"></div>
                  <div className="placeholder col-8"></div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-light rounded shadow-sm p-4">
            <div className="placeholder col-4 mb-3"></div>
            <div
              className="placeholder col-12"
              style={{ height: "160px" }}
            ></div>
          </div>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="row g-4 mb-4">
            <StatCard
              title="Total Invested"
              value={getSum("invested_capital")}
            />
            <StatCard title="Current Value" value={getSum("market_value")} />
            <StatCard title="Total PnL" value={getSum("pnl")} colored />
            <StatCard title="PnL %" value={`${getPnlPercent()}%`} colored />
          </div>

          {/* Pie Chart */}
          <div className="row">
            <div className="col-md-6">
              <div className="p-4 bg-white rounded shadow-sm">
                <h5 className="fw-bold mb-3">Portfolio Allocation</h5>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={getAllocationData()}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ value }) => formatMoney(value)}
                    >
                      {getAllocationData().map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `$${value.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}`,
                        name,
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Graph */}
          <div className="col-md-6">
            <div className="p-4 bg-light rounded shadow-sm h-100 d-flex justify-content-center align-items-center">
              <div className="text-muted fw-semibold">Chart coming soon...</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OverviewTab;
