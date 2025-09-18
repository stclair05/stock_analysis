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
  const orderedSymbols = [
    ...data.below_20dma,
    ...data.below_200dma,
    ...data.bearish_candle,
    ...data.extended_vol,
  ];

  orderedSymbols.forEach((sym) => {
    counts[sym] = (counts[sym] || 0) + 1;
  });

  const uniqueSymbols = Array.from(new Set(orderedSymbols));

  const below20Set = new Set(data.below_20dma);
  const below200Set = new Set(data.below_200dma);
  const bearishSet = new Set(data.bearish_candle);
  const extendedSet = new Set(data.extended_vol);

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
          {uniqueSymbols.map((symbol) => {
            const below20Symbol = below20Set.has(symbol) ? symbol : undefined;
            const below200Symbol = below200Set.has(symbol) ? symbol : undefined;
            const bearishSymbol = bearishSet.has(symbol) ? symbol : undefined;
            const extendedSymbol = extendedSet.has(symbol) ? symbol : undefined;

            return (
              <tr key={symbol}>
                <td className={getCellClass(below20Symbol)}>
                  {below20Symbol || ""}
                </td>
                <td className={getCellClass(below200Symbol)}>
                  {below200Symbol || ""}
                </td>
                <td className={getCellClass(bearishSymbol)}>
                  {bearishSymbol || ""}
                </td>
                <td className={getCellClass(extendedSymbol)}>
                  {extendedSymbol || ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
