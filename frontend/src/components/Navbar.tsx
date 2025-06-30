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
          to="/ratios"
          className={`nav-link ${
            location.pathname === "/ratios" ? "active" : ""
          }`}
        >
          Ratios
        </Link>
      </div>
    </nav>
  );
}
