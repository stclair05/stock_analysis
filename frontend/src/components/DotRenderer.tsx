import React from "react";
import { GenericComponent } from "react-financial-charts";

type Dot = {
  x: Date;
  y: number;
  color?: string;
};

export function DotRenderer(dots: Dot[]) {
  console.log("📍 DotRenderer called with dots:", dots);

  const canvasDraw = (
    ctx: CanvasRenderingContext2D,
    moreProps: any
  ) => {
    console.log("🎨 canvasDraw fired with moreProps:", moreProps);
  
    if (!moreProps || !dots.length) {
      console.warn("❗️ No moreProps or empty dots array");
      return;
    }
  
    const { xScale, chartConfigs, currentCharts } = moreProps;
    const chartId = currentCharts?.[0] ?? 0;
    const chartConfig = chartConfigs?.find((c: any) => c.id === chartId);
  
    if (!chartConfig) {
      console.error("🚫 Cannot find chartConfig for chartId:", chartId);
      return;
    }
  
    const yScale = chartConfig.yScale;
    if (typeof yScale !== "function") {
      console.error("🚫 Invalid yScale:", yScale);
      return;
    }
  
    ctx.save();

    ctx.beginPath();
    ctx.strokeStyle = "purple";
    ctx.lineWidth = 1;
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.stroke();

    for (const dot of dots) {
        let xValue = dot.x;
        if (!(xValue instanceof Date)) {
          try {
            xValue = new Date(xValue);
          } catch {
            console.warn("⚠️ Invalid x:", dot.x);
            continue;
          }
        }
      
        const matchingDatum = moreProps.plotData.find(
          (d: any) => d.date.getTime() === xValue.getTime()
        );
      
        if (!matchingDatum) {
          console.warn("❗ Could not find matching x in plotData:", xValue);
          continue;
        }
      
        const xAccessor = moreProps.xAccessor;
        const cx = xScale(xAccessor(matchingDatum));
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
  

  // ⛑ Force TS to accept GenericComponent as a valid React component
  const GenericHack = GenericComponent as unknown as React.ComponentType<any>;

  return React.createElement(GenericHack, {
    useCanvas: true,
    canvasDraw,
    drawOn: ["mousemove", "pan", "click"],
    isHover: () => false,
  });
}
