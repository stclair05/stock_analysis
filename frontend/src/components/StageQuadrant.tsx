import React from "react";
import "./Quadrant.css";

export type StageTickerInfo = {
  symbol: string;
  below20dma?: boolean;
};

export type StageTableData = {
  [stage in 1 | 2 | 3 | 4]: {
    tickers: StageTickerInfo[];
  };
};

export default function StageQuadrant({ data }: { data: StageTableData }) {
  const renderTickers = (stage: 1 | 2 | 3 | 4) => {
    return data[stage].tickers.map((t) => (
      <div
        key={t.symbol}
        className={`ticker-tag${t.below20dma ? " below-ma20" : ""}`}
      >
        {t.symbol}
      </div>
    ));
  };

  return (
    <div className="quadrant-table-container" style={{ marginTop: 40 }}>
      <table className="quadrant-table">
        <tbody>
          <tr>
            <td>
              <div className="stage-label">Stage 2</div>
              {renderTickers(2)}
            </td>
            <td>
              <div className="stage-label">Stage 3</div>
              {renderTickers(3)}
            </td>
          </tr>
          <tr>
            <td>
              <div className="stage-label">Stage 1</div>
              {renderTickers(1)}
            </td>
            <td>
              <div className="stage-label">Stage 4</div>
              {renderTickers(4)}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="arrow-legend">
        <div>
          <span className="ticker-tag below-ma20">ABC</span> Below 20 Day MA
        </div>
      </div>
    </div>
  );
}
