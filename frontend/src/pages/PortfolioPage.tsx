import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import OverviewTab from "./portfolio/OverviewTab";
import MarketPositionsTab from "./portfolio/MarketPositionsTab";
import RecentTradesTab from "./portfolio/RecentTradesTab";
import WhatIfAnalysisTab from "./portfolio/WhatIfAnalysisTab";
import BuySellSignalsTab from "./portfolio/BuySellSignalsTab";
import "./PortfolioPage.css";

function PortfolioPage() {
  const navigate = useNavigate();
  const { tab, listType } = useParams<{
    tab?: string;
    listType?: string;
  }>();

  const pathToTab: Record<string, string> = {
    overview: "Overview",
    marketpositions: "Market Positions",
    recenttrades: "Recent Trades",
    whatifanalysis: "What-If Analysis",
    buy_sell_signals: "Buy/Sell Signals",
  };

  const tabToPath: Record<string, string> = {
    Overview: "overview",
    "Market Positions": "marketpositions",
    "Recent Trades": "recenttrades",
    "What-If Analysis": "whatifanalysis",
    "Buy/Sell Signals": "buy_sell_signals",
  };

  const [activeTab, setActiveTab] = useState(
    pathToTab[tab ?? ""] || "Buy/Sell Signals"
  );
  const [signalListType, setSignalListType] = useState<
    "portfolio" | "watchlist" | "buylist"
  >(
    listType === "watchlist" || listType === "buylist" ? listType : "portfolio"
  );

  const underlineRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabs = [
    "Overview",
    "Market Positions",
    "Recent Trades",
    "What-If Analysis",
    "Buy/Sell Signals",
  ];

  useEffect(() => {
    const activeIndex = tabs.indexOf(activeTab);
    const currentTab = tabRefs.current[activeIndex];

    if (currentTab && underlineRef.current) {
      underlineRef.current.style.width = `${currentTab.offsetWidth}px`;
      underlineRef.current.style.left = `${currentTab.offsetLeft}px`;
    }
  }, [activeTab]);

  // Update state when route params change
  useEffect(() => {
    if (tab && pathToTab[tab]) {
      setActiveTab(pathToTab[tab]);
    }
    if (
      listType === "watchlist" ||
      listType === "portfolio" ||
      listType === "buylist"
    ) {
      setSignalListType(listType);
    }
  }, [tab, listType]);

  return (
    <div
      className="container-fluid mt-4"
      style={{ maxWidth: "70%", margin: "0 auto" }}
    >
      <h1 className="fw-bold text-dark mb-4">Portfolio</h1>

      {/* Tab bar */}
      <div className="position-relative border-bottom mb-4 custom-tabs">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            ref={(el: HTMLButtonElement | null) => {
              if (el) tabRefs.current[index] = el;
            }}
            className={`custom-tab-button ${activeTab === tab ? "active" : ""}`}
            onClick={() => {
              if (tab === "Buy/Sell Signals") {
                navigate(`/portfolio/buy_sell_signals/${signalListType}`);
              } else {
                navigate(`/portfolio/${tabToPath[tab]}`);
              }
            }}
          >
            {tab}
          </button>
        ))}
        <div className="tab-underline" ref={underlineRef} />
      </div>

      {/* Content */}
      <div>
        <div style={{ display: activeTab === "Overview" ? "block" : "none" }}>
          <OverviewTab />
        </div>
        <div
          style={{
            display: activeTab === "Market Positions" ? "block" : "none",
          }}
        >
          <MarketPositionsTab />
        </div>
        <div
          style={{ display: activeTab === "Recent Trades" ? "block" : "none" }}
        >
          <RecentTradesTab />
        </div>
        <div
          style={{
            display: activeTab === "What-If Analysis" ? "block" : "none",
          }}
        >
          <WhatIfAnalysisTab />
        </div>
        <div
          style={{
            display: activeTab === "Buy/Sell Signals" ? "block" : "none",
          }}
        >
          <BuySellSignalsTab
            initialListType={signalListType}
            onListTypeChange={(lt) => {
              setSignalListType(lt);
              navigate(`/portfolio/buy_sell_signals/${lt}`);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default PortfolioPage;
