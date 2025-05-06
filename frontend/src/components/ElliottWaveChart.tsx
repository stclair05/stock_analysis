import React, {
    useEffect,
    useRef,
    useState,
    useLayoutEffect,
    useMemo,
  } from "react";
  import {
    ChartCanvas,
    Chart,
    CandlestickSeries,
    XAxis,
    YAxis,
    CrossHairCursor,
    MouseCoordinateX,
    MouseCoordinateY,
    discontinuousTimeScaleProviderBuilder,
    EdgeIndicator,
    TrendLine,
  } from "react-financial-charts";
  import DrawingToolbar from "./DrawingToolbar"; // adjust the path if needed
  import { timeFormat } from "d3-time-format";

  
  type ChartData = {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  
  type Props = {
    stockSymbol: string;
  };
  
  const ElliottWaveChart: React.FC<Props> = ({ stockSymbol }) => {
    const [data, setData] = useState<ChartData[]>([]);
    const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

    const [trendLines, setTrendLines] = useState<any[]>([]);
    const [drawingEnabled, setDrawingEnabled] = useState<boolean>(false);


    const [selectedColor, setSelectedColor] = useState('#000000');

  
    const chartMargin = useMemo(
      () => ({ left: 60, right: 120, top: 10, bottom: 20 }),
      []
    );
      
  
    // ✅ Responsive resizing
    useLayoutEffect(() => {
      const resizeObserver = new ResizeObserver((entries) => {
        if (!entries.length) return;
        const container = entries[0].target as HTMLDivElement;
        const styles = getComputedStyle(container);
        const paddingLeft = parseFloat(styles.paddingLeft || "0");
        const paddingRight = parseFloat(styles.paddingRight || "0");
        const titleHeight = 40;
        const effectiveWidth =
          container.clientWidth - paddingLeft - paddingRight - chartMargin.right;
        const effectiveHeight = container.clientHeight - titleHeight;
  
        setDimensions({
          width: effectiveWidth,
          height: effectiveHeight,
        });
      });
  
      if (containerRef.current) resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }, [chartMargin.right]);
  
    // ✅ WebSocket data loading
    useEffect(() => {
      const ws = new WebSocket(
        `ws://localhost:8000/ws/chart_data_weekly/${stockSymbol}`
      );
  
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
  
        if (message.history) {
          const candles = message.history.map((d: any) => ({
            date: new Date(d.time * 1000),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
          }));
          if (candles.length > 10) setData(candles);
        }
  
        if (message.live && Date.now() - lastUpdate > 1000) {
          setLastUpdate(Date.now());
  
          const last = {
            date: new Date(message.live.time * 1000),
            open: message.live.value,
            high: message.live.value,
            low: message.live.value,
            close: message.live.value,
            volume: 0,
          };
          setData((prev) => [...prev.slice(1), last]);
        }
      };
  
      return () => ws.close();
    }, [stockSymbol, lastUpdate]);
  
    // ✅ xScaleProvider (memoized)
    const xScaleProvider = useMemo(
      () =>
        discontinuousTimeScaleProviderBuilder().inputDateAccessor(
          (d: ChartData) => d.date
        ),
      []
    );
  
    const { data: chartData, xScale, xAccessor, displayXAccessor } = useMemo(
      () => xScaleProvider(data),
      [xScaleProvider, data]
    );
  
    if (chartData.length === 0) return <div>Loading chart...</div>;
  
    const start = xAccessor(
      chartData[Math.max(0, chartData.length - 100)]
    );
    const end = xAccessor(chartData[chartData.length - 1]);
    const xExtents = [start, end];
  
    return (
        <div
            ref={containerRef}
            className="bg-white shadow-sm rounded border p-3 w-full h-100 d-flex flex-column"
            style={{
            fontFamily: "Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            borderRadius: "12px",
            border: "1px solid #e0e0e0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
        >
        <h5 className="fw-bold mb-3">📈 Elliott Wave Candlestick Chart</h5>
        {dimensions.width > 0 && dimensions.height > 0 && (
            <>
                <DrawingToolbar
                        drawingEnabled={drawingEnabled}
                        setDrawingEnabled={setDrawingEnabled}
                        clearTrendLines={() => setTrendLines([])}
                        selectedColor={selectedColor}
                        setSelectedColor={setSelectedColor}
                />
                <ChartCanvas
                    key={stockSymbol}
                    seriesName={stockSymbol}
                    height={dimensions.height}
                    width={dimensions.width}
                    margin={chartMargin}
                    ratio={1}
                    data={chartData}
                    xScale={xScale}
                    xAccessor={xAccessor}
                    displayXAccessor={displayXAccessor}
                    xExtents={xExtents}
                >
                    <Chart id={0} yExtents={(d: ChartData) => [d.high, d.low]}>
                        <XAxis showGridLines />
                        <YAxis showGridLines tickFormat={(d) => `$${d}`} />

                        <CandlestickSeries
                            wickStroke="#aaa"
                            fill={(d) => (d.close > d.open ? "#26a69a" : "#ef5350")}
                            stroke={(d) => (d.close > d.open ? "#26a69a" : "#ef5350")}
                        />


                        <MouseCoordinateX displayFormat={timeFormat("%Y-%m-%d")} />
                        <MouseCoordinateY displayFormat={(d) => `$${d.toFixed(2)}`} />

                        <EdgeIndicator
                            itemType="last"
                            orient="right"
                            edgeAt="right"
                            yAccessor={(d) => d.close}
                            displayFormat={(n) => `$${n.toFixed(2)}`}
                        />

                        <TrendLine
                        enabled={drawingEnabled}
                        trends={trendLines}
                        onComplete={(e, newTrends) => {
                            setTrendLines(newTrends);
                            setDrawingEnabled(false); // Auto-exit after one line
                        }}
                        snap={false}
                        shouldDisableSnap={() => true}
                        hoverText={{ enable: false }}
                        appearance={{
                            strokeStyle: selectedColor,
                            strokeWidth: 2,
                            strokeDasharray: "Solid", // or "ShortDash", "Dot", etc.
                            edgeStrokeWidth: 1,
                            edgeFill: selectedColor,
                            edgeStroke: "#000000",
                        }}
                        />




                    </Chart>
                    <CrossHairCursor strokeStyle="#888"/>
                </ChartCanvas>
            </>
        )}
      </div>
    );
  };
  
  export default ElliottWaveChart;
  