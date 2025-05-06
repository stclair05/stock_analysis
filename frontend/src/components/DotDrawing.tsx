import React from "react";
import { GenericComponent } from "react-financial-charts";

// Fix JSX type
const TypedGenericComponent = GenericComponent as unknown as React.ComponentType<any>;

type Props = {
  enabled: boolean;
  onDotPlaced: (x: number, y: number) => void;
};

const DotDrawing: React.FC<Props> = ({ enabled, onDotPlaced }) => {
    const handleClick = (_: any, moreProps: any) => {
        if (!enabled) return;
      
        const { xAccessor, currentItem } = moreProps;
        if (!currentItem) return;

        // This gets actual data value on X (like 2023-12-01 or index)
        const x = xAccessor(currentItem);      // ✅ Data-space X
        if (typeof x !== "number" || x > 1_000_000) { // or use your known x range
          throw new Error(`🚫 xAccessor(currentItem) is giving invalid x: ${x}`);
        }
        const y = currentItem.close;           // ✅ Data-space Y
        console.log("📌 currentItem:", currentItem);
        console.log("📌 xAccessor(currentItem):", xAccessor(currentItem));


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
