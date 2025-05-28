import { UTCTimestamp } from "lightweight-charts";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface DrawingLine {
  type: "line";
  points: { time: UTCTimestamp; value: number }[];
}

export interface DrawingHorizontal {
  type: "horizontal";
  price: number;
  time: UTCTimestamp;
}

export interface DrawingSixPoint {
  type: "sixpoint";
  points: { time: UTCTimestamp; value: number }[];
}

export type Drawing = DrawingLine | DrawingHorizontal | DrawingSixPoint;

export interface StockChartProps {
  stockSymbol: string;
}

export type Point = { time: UTCTimestamp; value: number };

export type CopyTrendlineBuffer = {
  dx: number;
  dy: number;
  original?: [Point, Point];
};
