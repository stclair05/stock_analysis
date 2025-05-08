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
            xScale,
            mouseXY,
            chartConfigs,
            currentCharts,
          } = moreProps;
          
          const chartId = currentCharts?.[0] ?? 0;
          const chartConfig = chartConfigs?.find((c: any) => c.id === chartId);
          
          if (!mouseXY || !chartConfig) return;
          
          const [originX, originY] = chartConfig.origin;
            const xPixel = mouseXY[0] - originX;
            const yPixel = mouseXY[1] - originY;

            console.log("🖱️ Raw mouseXY:", mouseXY);
            console.log("🗺️ Chart origin:", chartConfig.origin);
            console.log("🧮 xPixel:", xPixel);

            const plotData = moreProps.plotData as { date: Date }[];
            const xAccessor = moreProps.xAccessor;

            // Type-safe nearest match
            const closestItem = plotData.reduce((prev: { date: Date }, curr: { date: Date }) => {
            const prevDist = Math.abs(xScale(xAccessor(prev)) - xPixel);
            const currDist = Math.abs(xScale(xAccessor(curr)) - xPixel);
            return currDist < prevDist ? curr : prev;
            });
            const x = closestItem.date; // ✅ now this is 100% a real Date


            const y = chartConfig.yScale.invert(yPixel);

            console.log("🕒 Inverted x (Date?):", x);
            console.log("💵 Inverted y (Price):", y);

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
