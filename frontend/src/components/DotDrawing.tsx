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
      
        const x = xAccessor(currentItem); // <-- data x value, not screen px
        const y = currentItem.close;
      
        console.log("Dot placed at:", x, y); // Should be something like 17097, not 521
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
