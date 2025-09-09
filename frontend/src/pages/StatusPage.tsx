import { useEffect, useState } from "react";

type StatusResponse = {
  below_20dma: string[];
  below_200dma: string[];
  bearish_candle: string[];
  extended_vol: string[];
};

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/portfolio_status")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch(() =>
        setData({
          below_20dma: [],
          below_200dma: [],
          bearish_candle: [],
          extended_vol: [],
        })
      );
  }, []);

  if (!data) {
    return <div className="container mt-4">Loading...</div>;
  }

  const counts: Record<string, number> = {};
  [
    ...data.below_20dma,
    ...data.below_200dma,
    ...data.bearish_candle,
    ...data.extended_vol,
  ].forEach((sym) => {
    counts[sym] = (counts[sym] || 0) + 1;
  });

  const maxRows = Math.max(
    data.below_20dma.length,
    data.below_200dma.length,
    data.bearish_candle.length,
    data.extended_vol.length
  );

  const getCellClass = (symbol?: string) =>
    symbol && counts[symbol] >= 2 ? "table-danger" : undefined;

  return (
    <div className="container mt-4" style={{ maxWidth: "60%" }}>
      <h1 className="fw-bold mb-4">Status</h1>
      <table className="table text-center excel-table">
        <thead>
          <tr>
            <th>{data.below_20dma.length}</th>
            <th>{data.below_200dma.length}</th>
            <th>{data.bearish_candle.length}</th>
            <th>{data.extended_vol.length}</th>
          </tr>
          <tr>
            <th>Below 20 DMA</th>
            <th>Below 200 DMA</th>
            <th>Bearish Candle</th>
            <th>Extended / Vol</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, idx) => {
            const b20 = data.below_20dma[idx];
            const b200 = data.below_200dma[idx];
            const bc = data.bearish_candle[idx];
            const ext = data.extended_vol[idx];

            return (
              <tr key={idx}>
                <td className={getCellClass(b20)}>{b20 || ""}</td>
                <td className={getCellClass(b200)}>{b200 || ""}</td>
                <td className={getCellClass(bc)}>{bc || ""}</td>
                <td className={getCellClass(ext)}>{ext || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
