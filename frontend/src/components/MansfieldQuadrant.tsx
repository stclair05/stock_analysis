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
        <tbody>
          <tr>
            <td>
              <div className="stage-label">Sell</div>
              {renderTickers("SELL")}
            </td>
            <td>
              <div className="stage-label">Neutral</div>
              {renderTickers("NEUTRAL")}
            </td>
            <td>
              <div className="stage-label">Buy</div>
              {renderTickers("BUY")}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
