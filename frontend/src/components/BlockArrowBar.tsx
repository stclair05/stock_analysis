import React from "react";

type BlockArrowBarProps = {
  topColor: string;
  bottomColor: string;
  direction: "up" | "down";
  size?: number;
};

export const BlockArrowBar: React.FC<BlockArrowBarProps> = ({
  topColor,
  bottomColor,
  direction,
  size = 24,
}) => {
  const arrow =
    direction === "up" ? (
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderBottom: `10px solid ${bottomColor}`,
          marginBottom: 2,
        }}
      />
    ) : (
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: `10px solid ${topColor}`,
          marginTop: 2,
        }}
      />
    );

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      {arrow}
      <svg width={size / 2} height={size}>
        <rect x={0} y={0} width={size / 2} height={size / 2} fill={topColor} />
        <rect
          x={0}
          y={size / 2}
          width={size / 2}
          height={size / 2}
          fill={bottomColor}
        />
      </svg>
    </div>
  );
};
