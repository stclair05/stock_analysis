// src/components/Navbar.tsx
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const location = useLocation();
  return (
    <nav className="navbar shadow-sm py-2 px-4 mb-4 bg-white">
      <div className="d-flex align-items-center gap-4">
        <Link
          to="/"
          className={`nav-link ${
            location.pathname === "/" ||
            location.pathname.startsWith("/analyse")
              ? "active"
              : ""
          }`}
        >
          Search
        </Link>
        <Link
          to="/portfolio/buy_sell_signals/portfolio"
          className={`nav-link ${
            location.pathname.startsWith("/portfolio") ? "active" : ""
          }`}
        >
          Portfolio
        </Link>
        <Link
          to="/watchlist"
          className={`nav-link ${
            location.pathname === "/watchlist" ? "active" : ""
          }`}
        >
          Watchlist
        </Link>
        <Link
          to="/quadrant/portfolio"
          className={`nav-link ${
            location.pathname.startsWith("/quadrant") ? "active" : ""
          }`}
        >
          Quadrant
        </Link>
        <Link
          to="/momentum"
          className={`nav-link ${
            location.pathname === "/momentum" ? "active" : ""
          }`}
        >
          Momentum
        </Link>
        <Link
          to="/sma-momentum"
          className={`nav-link ${
            location.pathname === "/sma-momentum" ? "active" : ""
          }`}
        >
          SMA Momentum
        </Link>
        <Link
          to="/mace"
          className={`nav-link ${
            location.pathname === "/mace" ? "active" : ""
          }`}
        >
          MACE
        </Link>
        <Link
          to="/ratios"
          className={`nav-link ${
            location.pathname === "/ratios" ? "active" : ""
          }`}
        >
          Ratios
        </Link>
        <Link
          to="/status"
          className={`nav-link ${
            location.pathname === "/status" ? "active" : ""
          }`}
        >
          Status
        </Link>
        <Link
          to="/buy"
          className={`nav-link ${location.pathname === "/buy" ? "active" : ""}`}
        >
          Buy List
        </Link>
      </div>
    </nav>
  );
}
