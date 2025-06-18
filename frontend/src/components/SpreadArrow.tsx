// components/SpreadArrow.tsx

interface SpreadArrowProps {
  now: number;
  prev: number;
  colorTop: string;
  colorBottom: string;
  size?: number;
}

export function SpreadArrow({
  now,
  prev,
  colorTop,
  colorBottom,
  size = 12,
}: SpreadArrowProps) {
  const isWidening = now > prev;
  const direction = isWidening ? "↑" : "↓";

  const arrowStyle: React.CSSProperties = {
    display: "inline-block",
    fontSize: size,
    lineHeight: 1,
    position: "relative",
    fontWeight: 700,
    marginRight: 4,
  };

  const halfStyle = (
    color: string,
    pos: "top" | "bottom"
  ): React.CSSProperties => ({
    content: "''",
    position: "absolute",
    width: "100%",
    height: "50%",
    background: color,
    [pos]: 0,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  });

  return (
    <span style={arrowStyle}>
      {direction}
      <span style={halfStyle(colorTop, "top")}></span>
      <span style={halfStyle(colorBottom, "bottom")}></span>
    </span>
  );
}
