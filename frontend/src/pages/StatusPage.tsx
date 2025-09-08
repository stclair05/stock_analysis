import { useEffect, useState } from "react";

type StatusResponse = {
  below_20dma: string[];
  below_200dma: string[];
  bearish_candle: string[];
  extended_vol: string[];
};

interface RowData {
  symbol: string;
  below20: boolean;
  below200: boolean;
  bearish: boolean;
  extended: boolean;
  count: number;
}

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

  const uniqueSymbols = Array.from(
    new Set([
      ...data.below_20dma,
      ...data.below_200dma,
      ...data.bearish_candle,
      ...data.extended_vol,
    ])
  );

  const rows: RowData[] = uniqueSymbols
    .map((symbol) => {
      const row = {
        symbol,
        below20: data.below_20dma.includes(symbol),
        below200: data.below_200dma.includes(symbol),
        bearish: data.bearish_candle.includes(symbol),
        extended: data.extended_vol.includes(symbol),
      } as RowData;
      row.count = [row.below20, row.below200, row.bearish, row.extended].filter(
        Boolean
      ).length;
      return row;
    })
    .sort((a, b) => b.count - a.count);

  return (
    <div className="container mt-4" style={{ maxWidth: "60%" }}>
      <h1 className="fw-bold mb-4">Status</h1>
      <table className="table table-bordered text-center">
        <thead className="table-light">
          <tr>
            <th>Below 20 DMA</th>
            <th>Below 200 DMA</th>
            <th>Bearish Candle</th>
            <th>Extended / Vol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.symbol}
              style={{
                backgroundColor:
                  row.count >= 3
                    ? "#f8d7da"
                    : row.count === 2
                    ? "#fff3cd"
                    : "transparent",
                color:
                  row.count >= 3
                    ? "#dc3545"
                    : row.count === 2
                    ? "#fd7e14"
                    : "inherit",
              }}
            >
              <td>{row.below20 ? row.symbol : ""}</td>
              <td>{row.below200 ? row.symbol : ""}</td>
              <td>{row.bearish ? row.symbol : ""}</td>
              <td>{row.extended ? row.symbol : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
