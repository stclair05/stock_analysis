import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import HomePage from "./pages/HomePage.tsx";
import PortfolioPage from "./pages/PortfolioPage.tsx";
import WatchlistPage from "./pages/WatchlistPage.tsx";
import Navbar from "./components/Navbar";

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
      </Routes>
    </Router>
  );
}

export default App;

// Saving for future feature: Graph configs for dark mode:
// layout: { background: { color: "#191d29" }, textColor: "#ffffff" },
// grid: { vertLines: { color: "#2d3140" }, horzLines: { color: "#2d3140" } },
