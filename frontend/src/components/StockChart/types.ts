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

export type Timeframe = "daily" | "weekly" | "monthly";
export type SignalSide = "BUY" | "SELL" | ""; // "" for no signal

export type SignalSummary = {
  [strategy in
    | "trendinvestorpro"
    | "stclair"
    | "northstar"
    | "stclairlongterm"
    | "mace_40w"
    | "mansfield"]: {
    [T in Timeframe]: SignalSide;
  };
};

export interface GraphingChartProps {
  stockSymbol: string;
  onClose: () => void; // To close the popup
}
