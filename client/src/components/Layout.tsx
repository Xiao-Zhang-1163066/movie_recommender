import { useAuth } from "@/context/AuthContext";
import SearchBar from "@/features/search/SearchBar";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const navLinks = [
  { to: "/movies", label: "Movies" },
  { to: "/cinemas", label: "Cinemas" },
  { to: "/chat", label: "Chat" },
  { to: "/watchlist", label: "Watchlist" },
];

const Layout = () => {
  const { pathname } = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen bg-background">
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "rgba(10,10,10,0.92)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Desktop / mobile top bar */}
        <div className="h-16 flex items-center px-6 md:px-10 gap-6 md:gap-10">
          <Link
            to="/movies"
            className="text-xl font-black whitespace-nowrap shrink-0"
            style={{ letterSpacing: "-0.04em" }}
            onClick={closeMenu}
          >
            Movie<span className="text-primary">Mate</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex gap-1 flex-1">
            {navLinks.map(({ to, label }) => {
              const active = pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary text-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <div className="w-64">
              <SearchBar />
            </div>
            {isAuthenticated ? (
              <button
                onClick={logout}
                className="px-4 py-2 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 rounded-full bg-primary text-black text-sm font-bold hover:opacity-85 transition-opacity"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile: hamburger only */}
          <div className="flex md:hidden items-center ml-auto">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile search row — always visible */}
        <div
          className="md:hidden px-4 py-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <SearchBar />
        </div>

        {/* Mobile dropdown menu — absolutely positioned to overlay the search bar */}
        {menuOpen && (
          <div
            className="md:hidden absolute top-16 left-0 right-0 flex flex-col px-4 pb-4 gap-1 z-40"
            style={{
              background: "rgba(10,10,10,0.97)",
              backdropFilter: "blur(16px)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {navLinks.map(({ to, label }) => {
              const active = pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={closeMenu}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary text-black"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {isAuthenticated ? (
                <button
                  onClick={() => { logout(); closeMenu(); }}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  Logout
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={closeMenu}
                  className="block px-4 py-3 rounded-xl bg-primary text-black text-sm font-bold text-center hover:opacity-85 transition-opacity"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      <main className="pt-29 md:pt-16">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
