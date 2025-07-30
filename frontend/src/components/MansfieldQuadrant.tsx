import "./Quadrant.css";

export type MansfieldTickerInfo = {
  symbol: string;
  below20dma?: boolean;
  newBuy?: boolean;
};

export type MansfieldTableData = {
  BUY: { tickers: MansfieldTickerInfo[] };
  NEUTRAL: { tickers: MansfieldTickerInfo[] };
  SELL: { tickers: MansfieldTickerInfo[] };
};

export default function MansfieldQuadrant({
  data,
}: {
  data: MansfieldTableData;
}) {
  const renderTickers = (key: "BUY" | "NEUTRAL" | "SELL") => {
    return data[key].tickers.map((t) => (
      <div
        key={t.symbol}
        className={`ticker-tag${t.below20dma ? " below-ma20" : ""}${
          t.newBuy ? " new-buy" : ""
        }`}
      >
        {t.symbol}
      </div>
    ));
  };

  return (
    <div className="quadrant-table-container" style={{ marginTop: 40 }}>
      <table className="quadrant-table">
        <thead>
          <tr>
            <th>Sell</th>
            <th>Neutral</th>
            <th>Buy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{renderTickers("SELL")}</td>
            <td>{renderTickers("NEUTRAL")}</td>
            <td>{renderTickers("BUY")}</td>
          </tr>
        </tbody>
      </table>
      <div className="arrow-legend">
        <div>
          <span className="ticker-tag below-ma20">ABC</span> Below 20 Day MA
        </div>
        <div>
          <span className="ticker-tag new-buy">XYZ</span> Just Turned Buy
        </div>
      </div>
    </div>
  );
}
