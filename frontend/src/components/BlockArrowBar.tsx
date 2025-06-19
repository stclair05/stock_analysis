import React from "react";

type BlockArrowBarProps = {
  topColor: string;
  bottomColor: string;
  direction: "up" | "down" | "cross";
  size?: number;
  topLabel?: string;
  bottomLabel?: string;
};

export const BlockArrowBar: React.FC<BlockArrowBarProps> = ({
  topColor,
  bottomColor,
  direction,
  size = 24,
  topLabel,
  bottomLabel,
}) => {
  const arrowColor = direction === "up" ? "#4caf50" : "#e53935";

  const arrow =
    direction === "cross" ? null : (
      <svg
        width={12}
        height={10}
        style={direction === "up" ? { marginBottom: 2 } : { marginTop: 2 }}
      >
        {direction === "up" ? (
          <polygon points="6,0 12,10 0,10" fill={arrowColor} />
        ) : (
          <polygon points="0,0 12,0 6,10" fill={arrowColor} />
        )}
      </svg>
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
        {topLabel && (
          <text
            x="50%"
            y={size / 4}
            dominantBaseline="middle"
            textAnchor="middle"
            fill="white"
            style={{ fontSize: size / 5 }}
          >
            {topLabel}
          </text>
        )}
        {bottomLabel && (
          <text
            x="50%"
            y={(3 * size) / 4}
            dominantBaseline="middle"
            textAnchor="middle"
            fill="white"
            style={{ fontSize: size / 5 }}
          >
            {bottomLabel}
          </text>
        )}
      </svg>
    </div>
  );
};
