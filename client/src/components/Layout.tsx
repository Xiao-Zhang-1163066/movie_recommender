import { useAuth } from "@/context/AuthContext";
import SearchBar from "@/features/search/SearchBar";
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
  return (
    <div className="min-h-screen bg-background">
      <nav
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-10 gap-10"
        style={{
          background: "rgba(10,10,10,0.92)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <Link
          to="/movies"
          className="text-xl font-black whitespace-nowrap shrink-0"
          style={{ letterSpacing: "-0.04em" }}
        >
          Movie<span className="text-primary">Mate</span>
        </Link>

        <div className="flex gap-1 flex-1">
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

        <div className="flex items-center gap-3 shrink-0">
          <SearchBar />
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
      </nav>

      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
