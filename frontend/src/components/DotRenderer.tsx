import React from "react";
// @ts-ignore: TypeScript doesn't recognize 'chartId', but it's required at runtime
import { GenericComponent } from "react-financial-charts";

type Dot = {
  x: number;
  y: number;
  color?: string;
};

type Props = {
  dots: Dot[];
};

const DotRenderer: React.FC<Props> = ({ dots }) => {
  const canvasDraw = (ctx: CanvasRenderingContext2D, moreProps: any) => {
    console.log("🎨 canvasDraw fired");

    if (!moreProps || !dots.length) return;

    const { xScale, chartConfig, chartId } = moreProps;
    console.log("📊 chartId:", chartId, "🧩 chartConfig:", chartConfig);

    const yScale = chartConfig?.yScale;
    if (typeof yScale !== "function") {
      console.warn("❌ yScale not valid:", yScale);
      return;
    }

    ctx.save();
    for (const dot of dots) {
      const cx = xScale(dot.x);
      const cy = yScale(dot.y);

      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
      ctx.fillStyle = dot.color || "blue";
      ctx.fill();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  };

  return (
    // @ts-expect-error: 'chartId' is required at runtime but not defined in types
    <GenericComponent
      useCanvas={true}
      canvasDraw={canvasDraw}
      drawOn={["click", "mousemove", "pan"]}
      isHover={() => false}
    />
  );
};

export default DotRenderer;
