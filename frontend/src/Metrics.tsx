import { useEffect, useState } from "react";

type MetricsProps = {
    stockSymbol: string;
  };
  
  function Metrics({ stockSymbol }: MetricsProps) {
    
    const [metrics, setMetrics] = useState<any>(null);

    useEffect(() => {

        if (!stockSymbol) return;

        const fetchMetrics = async () => {
            try {
                const response = await fetch("http://localhost:8000/analyse", {
                    method: "POST", 
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ symbol: stockSymbol }),
                });
                const data = await response.json();
                setMetrics(data);
            } catch (error) {
                console.error("Error fetching metrics: ", error)
            }
        };

        fetchMetrics();
    }, [stockSymbol]);
    
    

    return (
        <div className="card shadow-sm p-4">
          <h2 className="mb-3">Metrics for <strong>{stockSymbol || "..."}</strong></h2>
      
          {!metrics ? (
            <p>Loading metrics...</p>
          ) : (
            <ul className="list-group list-group-flush">
              <li className="list-group-item">📊 3-Year Moving Average: {metrics["three_year_ma"]}</li>
              <li className="list-group-item">☁️ Weekly Ichimoku Cloud: in progress</li>
              <li className="list-group-item">📈 200-Day Moving Average: {metrics["two_hundred_dma"]}</li>
              <li className="list-group-item">📉 Super Trend (Weekly): in progress</li>
              <li className="list-group-item">📍 ADX (Weekly): in progress</li>
              <li className="list-group-item">⚖️ MACE Neutral: in progress</li>
              <li className="list-group-item">🗓️ 40-Week Status: in progress</li>
            </ul>
          )}
        </div>
      );
      
  }
  
  export default Metrics;
  