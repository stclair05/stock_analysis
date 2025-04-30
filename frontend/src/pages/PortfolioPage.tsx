import { useState, useRef, useEffect } from "react";
import OverviewTab from "./portfolio/OverviewTab";
import MarketPositionsTab from "./portfolio/MarketPositionsTab";
import RecentTradesTab from "./portfolio/RecentTradesTab";
import WhatIfAnalysisTab from "./portfolio/WhatIfAnalysisTab";
import "./PortfolioPage.css";

function PortfolioPage() {
  const [activeTab, setActiveTab] = useState("Overview");
  const underlineRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabs = ["Overview", "Market Positions", "Recent Trades", "What-If Analysis"];

  useEffect(() => {
    const activeIndex = tabs.indexOf(activeTab);
    const currentTab = tabRefs.current[activeIndex];

    if (currentTab && underlineRef.current) {
      underlineRef.current.style.width = `${currentTab.offsetWidth}px`;
      underlineRef.current.style.left = `${currentTab.offsetLeft}px`;
    }
  }, [activeTab]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "Overview":
        return <OverviewTab />;
      case "Market Positions":
        return <MarketPositionsTab />;
      case "Recent Trades":
        return <RecentTradesTab />;
      case "What-If Analysis":
        return <WhatIfAnalysisTab />;
      default:
        return null;
    }
  };

  return (
    <div className="container mt-4">
      <h1 className="fw-bold text-dark mb-4">Main Dashboard</h1>

      {/* Tab bar */}
      <div className="position-relative border-bottom mb-4 custom-tabs">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            ref={(el: HTMLButtonElement | null) => {
                if (el) tabRefs.current[index] = el;
              }}
            className={`custom-tab-button ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        <div className="tab-underline" ref={underlineRef} />
      </div>

      {/* Content */}
      {renderTabContent()}
    </div>
  );
}

export default PortfolioPage;
