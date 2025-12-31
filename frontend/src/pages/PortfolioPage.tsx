import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import OverviewTab from "./portfolio/OverviewTab";
import MarketPositionsTab from "./portfolio/MarketPositionsTab";
import RecentTradesTab from "./portfolio/RecentTradesTab";
import WhatIfAnalysisTab from "./portfolio/WhatIfAnalysisTab";
import BuySellSignalsTab from "./portfolio/BuySellSignalsTab";
import DailyTab from "./portfolio/DailyTab";
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
    daily: "Daily",
  };

  const tabToPath: Record<string, string> = {
    Overview: "overview",
    "Market Positions": "marketpositions",
    "Recent Trades": "recenttrades",
    "What-If Analysis": "whatifanalysis",
    "Buy/Sell Signals": "buy_sell_signals",
    Daily: "daily",
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
    "Daily",
  ];

  useEffect(() => {
    const activeIndex = tabs.indexOf(activeTab);
    const currentTab = tabRefs.current[activeIndex];

    if (currentTab && underlineRef.current) {
      underlineRef.current.style.width = `${currentTab.offsetWidth}px`;
      underlineRef.current.style.left = `${currentTab.offsetLeft}px`;
    }
  }, [activeTab]);

  useEffect(() => {
    if (tab && pathToTab[tab]) setActiveTab(pathToTab[tab]);

    if (
      listType === "watchlist" ||
      listType === "portfolio" ||
      listType === "buylist"
    ) {
      setSignalListType(listType);
    }
  }, [tab, listType]);

  return (
    // Use viewport height so Daily tab can be tall
    <div
      className="container-fluid px-4 px-md-5"
      style={{ height: "calc(100vh - 24px)" }}
    >
      {/* Header */}
      <div
        className="d-flex align-items-center justify-content-between"
        style={{ paddingTop: 16 }}
      >
        <h1 className="fw-bold text-dark mb-0">Portfolio</h1>
      </div>

      {/* Tab bar */}
      <div
        className="position-relative border-bottom custom-tabs"
        style={{ marginTop: 16 }}
      >
        {tabs.map((t, index) => (
          <button
            key={t}
            ref={(el: HTMLButtonElement | null) => {
              if (el) tabRefs.current[index] = el;
            }}
            className={`custom-tab-button ${activeTab === t ? "active" : ""}`}
            onClick={() => {
              if (t === "Buy/Sell Signals") {
                navigate(`/portfolio/buy_sell_signals/${signalListType}`);
              } else {
                navigate(`/portfolio/${tabToPath[t]}`);
              }
            }}
          >
            {t}
          </button>
        ))}
        <div className="tab-underline" ref={underlineRef} />
      </div>

      {/* Content area grows to fill remaining height */}
      <div style={{ height: "calc(100% - 110px)", marginTop: 16 }}>
        {activeTab === "Overview" && <OverviewTab />}
        {activeTab === "Market Positions" && <MarketPositionsTab />}
        {activeTab === "Recent Trades" && <RecentTradesTab />}
        {activeTab === "What-If Analysis" && <WhatIfAnalysisTab />}
        {activeTab === "Buy/Sell Signals" && (
          <BuySellSignalsTab
            initialListType={signalListType}
            onListTypeChange={(lt) => {
              setSignalListType(lt);
              navigate(`/portfolio/buy_sell_signals/${lt}`);
            }}
          />
        )}
        {/* Give Daily tab full height */}
        {activeTab === "Daily" && (
          <div style={{ height: "100%" }}>
            <DailyTab />
          </div>
        )}
      </div>
    </div>
  );
}

export default PortfolioPage;
