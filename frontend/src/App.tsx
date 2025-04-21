import Metrics from "./Metrics";
import { useState } from "react";

function App() {
  const [inputValue, setInputValue] = useState("");
  const [stockSymbol, setStockSymbol] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value.toUpperCase());
  };

  const handleSearch = () => {
    setStockSymbol(inputValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="container mt-5">
      <h1 className="mb-4 text-center fw-bold">📈 Stock Analysis app</h1>

      <div className="input-group mb-4">
        <input
          type="text"
          className="form-control"
          placeholder="Enter Stock Symbol (e.g., AAPL)"
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
        />
        <button className="btn btn-primary" onClick={handleSearch}>
          Search
        </button>
      </div>

      <Metrics stockSymbol={stockSymbol} />
    </div>
  );
}

export default App;
