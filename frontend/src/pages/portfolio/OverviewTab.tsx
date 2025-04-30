import { useEffect, useState } from "react";

type Holding = {
  ticker: string;
  shares: number;
  average_cost: number;
  current_price: number;
  market_value: number;
  invested_capital: number;
  pnl: number;
  pnl_percent: number;
};

const OverviewTab = () => {
  const [portfolio, setPortfolio] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const res = await fetch("http://localhost:8000/portfolio_live_data");
        const data = await res.json();
        setPortfolio(data);
      } catch (err) {
        console.error("Failed to load portfolio", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();
  }, []);

  const getSum = (field: keyof Holding): string => {
    const sum = portfolio.reduce((acc, item) => acc + ((item[field] as number) ?? 0), 0);
    return `$${sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const getPnlPercent = (): string => {
    const invested = portfolio.reduce((acc, item) => acc + item.invested_capital, 0);
    const pnl = portfolio.reduce((acc, item) => acc + item.pnl, 0);
    if (invested === 0) return "0.00";
    return (pnl / invested * 100).toFixed(2);
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
           <div className="placeholder col-12" style={{ height: "160px" }}></div>
         </div>
       </div>
      ) : (
        <div>
          {/* Stat Cards */}
          <div className="row g-4 mb-4">
            <StatCard title="Total Invested" value={getSum("invested_capital")} />
            <StatCard title="Current Value" value={getSum("market_value")} />
            <StatCard title="Total PnL" value={getSum("pnl")} colored />
            <StatCard title="PnL %" value={`${getPnlPercent()}%`} colored />
          </div>

          {/* Placeholder Chart Section */}
          <div className="bg-light rounded shadow-sm p-4">
            <h5 className="fw-bold mb-3">Performance Chart</h5>
            <div
              style={{ height: "200px" }}
              className="d-flex align-items-center justify-content-center text-muted"
            >
              (Chart coming soon...)
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewTab;
