// src/components/Navbar.tsx
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const location = useLocation();
  return (
    <nav className="navbar shadow-sm py-2 px-4 mb-4 bg-white">
      <div className="d-flex align-items-center gap-4">
        <Link
          to="/"
          className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
        >
          Search
        </Link>
        <Link
          to="/portfolio"
          className={`nav-link ${location.pathname === "/portfolio" ? "active" : ""}`}
        >
          Portfolio
        </Link>
        <Link
          to="/watchlist"
          className={`nav-link ${location.pathname === "/watchlist" ? "active" : ""}`}
        >
          Watchlist
        </Link>
      </div>
    </nav>
  );
}
