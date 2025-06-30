import React, { useRef, useLayoutEffect, useState } from "react";
import "./Quadrant.css";

export type StatusKey = "U1" | "U2" | "U3" | "D1" | "D2" | "D3";
export type FortyWeekKey = "++" | "+-" | "-+" | "--";

export type TickerInfo = {
  symbol: string;
  arrow?: "up" | "down" | "left" | "right" | null;
  below20dma?: boolean;
  nearTarget?: boolean;
};

export type TableData = {
  [forty in FortyWeekKey]: {
    [mace in StatusKey]: {
      tickers: TickerInfo[];
    };
  };
};

const statusLabels: StatusKey[] = ["U1", "U2", "U3", "D1", "D2", "D3"];
const fortyLabels: FortyWeekKey[] = ["++", "+-", "-+", "--"];

const arrowSymbols: Record<string, string> = {
  up: "\u2191",
  down: "\u2193",
  left: "\u2190",
  right: "\u2192",
};

const arrowColors: Record<string, string> = {
  up: "green",
  down: "red",
  left: "red",
  right: "green",
};

export default function Quadrant({ data }: { data: TableData }) {
  const d1Ref = useRef<HTMLTableCellElement>(null);
  const u1Ref = useRef<HTMLTableCellElement>(null);
  const highlightStartRef = useRef<HTMLTableCellElement>(null);
  const highlightEndRef = useRef<HTMLTableCellElement>(null);
  const bearStartRef = useRef<HTMLTableCellElement>(null);
  const bearEndRef = useRef<HTMLTableCellElement>(null);
  const [positions, setPositions] = useState({ d1Left: 0, u1Left: 0 });
  const [highlightRect, setHighlightRect] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [bearRect, setBearRect] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    if (
      d1Ref.current &&
      u1Ref.current &&
      highlightStartRef.current &&
      highlightEndRef.current &&
      bearStartRef.current &&
      bearEndRef.current
    ) {
      const containerBox = d1Ref.current
        .closest(".quadrant-table-container")!
        .getBoundingClientRect();

      const d1Box = d1Ref.current.getBoundingClientRect();
      const u1Box = u1Ref.current.getBoundingClientRect();
      const startBox = highlightStartRef.current.getBoundingClientRect();
      const endBox = highlightEndRef.current.getBoundingClientRect();
      const bearStartBox = bearStartRef.current.getBoundingClientRect();
      const bearEndBox = bearEndRef.current.getBoundingClientRect();

      setPositions({
        d1Left: d1Box.left - containerBox.left + d1Box.width / 2,
        u1Left: u1Box.left - containerBox.left + u1Box.width / 2,
      });

      setHighlightRect({
        left: startBox.left - containerBox.left,
        top: startBox.top - containerBox.top,
        width: endBox.right - startBox.left,
        height: endBox.bottom - startBox.top,
      });
      setBearRect({
        left: bearStartBox.left - containerBox.left,
        top: bearStartBox.top - containerBox.top,
        width: bearEndBox.right - bearStartBox.left,
        height: bearEndBox.bottom - bearStartBox.top,
      });
    }
  }, []);

  return (
    <div className="quadrant-table-container">
      <div className="label-uptrend" style={{ left: `${positions.u1Left}px` }}>
        Uptrend
      </div>
      <div
        className="label-downtrend"
        style={{ left: `${positions.d1Left}px` }}
      >
        Downtrend
      </div>
      <div className="label-40w">40-Week Status</div>
      <div
        className="quadrant-highlight bullish"
        style={{
          left: `${highlightRect.left}px`,
          top: `${highlightRect.top}px`,
          width: `${highlightRect.width}px`,
          height: `${highlightRect.height}px`,
        }}
      ></div>
      <div
        className="quadrant-highlight bearish"
        style={{
          left: `${bearRect.left}px`,
          top: `${bearRect.top}px`,
          width: `${bearRect.width}px`,
          height: `${bearRect.height}px`,
        }}
      ></div>

      <table className="quadrant-table">
        <thead>
          <tr>
            <th className="corner-cell"></th>
            {statusLabels.map((s) => (
              <th
                key={s}
                ref={s === "D1" ? d1Ref : s === "U1" ? u1Ref : undefined}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fortyLabels.map((fw, i) => (
            <tr key={fw}>
              <td className="fw-label">{fw}</td>
              {statusLabels.map((s, j) => (
                <td
                  key={s}
                  ref={
                    i === 0 && j === 1
                      ? highlightStartRef
                      : i === 1 && j === 2
                      ? highlightEndRef
                      : i === 2 && j === 4
                      ? bearStartRef
                      : i === 3 && j === 5
                      ? bearEndRef
                      : undefined
                  }
                >
                  {data[fw][s].tickers.map((t) => (
                    <div
                      className={`ticker-tag${
                        t.below20dma ? " below-ma20" : ""
                      }${t.nearTarget ? " near-target" : ""}`}
                      key={t.symbol}
                    >
                      {t.symbol}
                      {t.arrow && (
                        <span
                          className="ticker-arrow"
                          style={{ color: arrowColors[t.arrow] }}
                        >
                          {arrowSymbols[t.arrow]}
                        </span>
                      )}
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="arrow-legend">
        <div>
          <strong>40WK Status:</strong>{" "}
          <span style={{ color: arrowColors.up }}>{arrowSymbols.up}</span>
          <span style={{ color: arrowColors.down }}>
            {arrowSymbols.down}
          </span>{" "}
          Risen Above / Fallen Below 40 Week MA This Week
        </div>
        <div>
          <strong>MACE:</strong>{" "}
          <span style={{ color: arrowColors.right }}>{arrowSymbols.right}</span>
          <span style={{ color: arrowColors.left }}>
            {arrowSymbols.left}
          </span>{" "}
          Progression / Regression
        </div>
      </div>
    </div>
  );
}
