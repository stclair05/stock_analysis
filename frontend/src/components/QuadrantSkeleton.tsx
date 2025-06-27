import React from "react";

export default function QuadrantSkeleton() {
  const rows = Array.from({ length: 4 });
  const cols = Array.from({ length: 6 });

  return (
    <div className="quadrant-table-container">
      <table className="quadrant-table">
        <thead>
          <tr>
            <th className="corner-cell"></th>
            {cols.map((_, i) => (
              <th key={i}></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((_, ri) => (
            <tr key={ri}>
              <td className="fw-label"></td>
              {cols.map((_, ci) => (
                <td key={ci}>
                  <div className="skeleton-cell"></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
