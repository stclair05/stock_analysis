import React from "react";
import { GenericComponent } from "react-financial-charts";

// Define the props manually (only include what you use)
type GenericComponentProps = {
  chartId?: number;
  useCanvas?: boolean;
  canvasDraw?: (ctx: CanvasRenderingContext2D, moreProps: any) => void;
  drawOn?: string[];
  isHover?: () => boolean;
};

const GenericWrapper: React.FC<GenericComponentProps> = (props) => {
  // TypeScript doesn't like this, but react-financial-charts works fine
  // So we ignore the error here
  // @ts-ignore
  return <GenericComponent {...props} />;
};

export default GenericWrapper;
