import { useAuth } from "@/context/AuthContext";
import { Link, Outlet, useLocation } from "react-router-dom";

const Layout = () => {
  const { pathname } = useLocation();
  const { isAuthenticated, logout } = useAuth();
  return (
    <div>
      <nav>
        <Link
          to="/"
          className={pathname === "/movies" ? "font-bold" : "text-gray-500"}
        >
          Movies
        </Link>
        <Link
          to="/cinemas"
          className={pathname === "/cinemas" ? "font-bold" : "text-gray-500"}
        >
          Cinemas
        </Link>
        <Link
          to="/chat"
          className={pathname === "/chat" ? "font-bold" : "text-gray-500"}
        >
          Chat
        </Link>
        {isAuthenticated ? (
          <button onClick={logout}>Logout</button>
        ) : (
          <Link
            to="/login"
            className={pathname === "/login" ? "font-bold" : "text-gray-500"}
          >
            Login
          </Link>
        )}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
