import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import "./App.css";
import HomePage from "./pages/HomePage.tsx";
import PortfolioPage from "./pages/PortfolioPage.tsx";
import WatchlistPage from "./pages/WatchlistPage.tsx";
import QuadrantPage from "./pages/QuandrantPage.tsx";
import RatioPage from "./pages/RatioPage";
import StatusPage from "./pages/StatusPage";
import BuyPage from "./pages/BuyPage";
import Navbar from "./components/Navbar";
import MomentumPage from "./pages/MomentumPage";
import MacePage from "./pages/MacePage";
import SmaMomentumPage from "./pages/SmaMomentumPage";

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/analyse/:symbol" element={<HomePage />} />

        <Route
          path="/portfolio"
          element={
            <Navigate to="/portfolio/buy_sell_signals/portfolio" replace />
          }
        />
        <Route path="/portfolio/:tab" element={<PortfolioPage />} />
        <Route path="/portfolio/:tab/:listType" element={<PortfolioPage />} />

        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route
          path="/quadrant"
          element={<Navigate to="/quadrant/portfolio" replace />}
        />
        <Route path="/quadrant/:listType" element={<QuadrantPage />} />
        <Route path="/momentum" element={<MomentumPage />} />
        <Route path="/sma-momentum" element={<SmaMomentumPage />} />
        <Route path="/mace" element={<MacePage />} />
        <Route path="/ratios" element={<RatioPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/buy" element={<BuyPage />} />
      </Routes>
    </Router>
  );
}

export default App;

// Saving for future feature: Graph configs for dark mode:
// layout: { background: { color: "#191d29" }, textColor: "#ffffff" },
// grid: { vertLines: { color: "#2d3140" }, horzLines: { color: "#2d3140" } },
