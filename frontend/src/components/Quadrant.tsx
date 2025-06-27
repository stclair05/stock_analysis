import React, { useRef, useLayoutEffect, useState } from "react";
import "./Quadrant.css";

export type StatusKey = "U1" | "U2" | "U3" | "D1" | "D2" | "D3";
export type FortyWeekKey = "++" | "+-" | "-+" | "--";

export type TableData = {
  [forty in FortyWeekKey]: {
    [mace in StatusKey]: {
      tickers: string[];
    };
  };
};

const statusLabels: StatusKey[] = ["U1", "U2", "U3", "D1", "D2", "D3"];
const fortyLabels: FortyWeekKey[] = ["++", "+-", "-+", "--"];

export default function Quadrant({ data }: { data: TableData }) {
  const d1Ref = useRef<HTMLTableCellElement>(null);
  const u1Ref = useRef<HTMLTableCellElement>(null);
  const [positions, setPositions] = useState({ d1Left: 0, u1Left: 0 });

  useLayoutEffect(() => {
    if (d1Ref.current && u1Ref.current) {
      const d1Box = d1Ref.current.getBoundingClientRect();
      const u1Box = u1Ref.current.getBoundingClientRect();
      const containerBox = d1Ref.current
        .closest(".quadrant-table-container")!
        .getBoundingClientRect();

      setPositions({
        d1Left: d1Box.left - containerBox.left + d1Box.width / 2,
        u1Left: u1Box.left - containerBox.left + u1Box.width / 2,
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
          {fortyLabels.map((fw) => (
            <tr key={fw}>
              <td className="fw-label">{fw}</td>
              {statusLabels.map((s) => (
                <td key={s}>
                  {data[fw][s].tickers.map((t) => (
                    <div className="ticker-tag" key={t}>
                      {t}
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
