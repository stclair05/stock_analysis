import React from "react";
import { GenericComponent } from "react-financial-charts";

// Fix JSX type
const TypedGenericComponent = GenericComponent as unknown as React.ComponentType<any>;

type Props = {
    enabled: boolean;
    onDotPlaced: (x: Date, y: number) => void;
  };
  

const DotDrawing: React.FC<Props> = ({ enabled, onDotPlaced }) => {
    const handleClick = (_: any, moreProps: any) => {
        if (!enabled) return;
      
        const {
          xAccessor,
          xScale,
          currentItem,
          mouseXY,
          chartConfigs,
          currentCharts,
        } = moreProps;
      
        const chartId = currentCharts?.[0] ?? 0;
        const chartConfig = chartConfigs?.find((c: any) => c.id === chartId);
      
        if (!currentItem || !chartConfig) {
          console.warn("⚠️ Missing currentItem or resolved chartConfig:", { currentItem, chartConfig });
          return;
        }
      
        const x = currentItem.date; // index or x domain value
        const yPixel = mouseXY?.[1];
        const y = chartConfig.yScale.invert(yPixel); // pixel Y to price
      
        console.log("📌 currentItem:", currentItem);
        console.log("📐 xAccessor(currentItem):", x);
        console.log("🖱️ mouseXY:", mouseXY);
        console.log("📊 chartId:", chartId);
        console.log("🔄 yScale.invert(mouseY):", y);
      
        onDotPlaced(x, y);
      };
      
      
      
      

  return (
    <TypedGenericComponent
      svgDraw={() => null}
      onClick={handleClick}
      drawOn={["mousemove", "pan", "click"]}
      canvasToDraw={(contextId: string) => contextId === "mouse"} // Optional
      isHover={() => false}
    />
  );
};

export default DotDrawing;
