import { Link, Outlet, useLocation } from "react-router-dom";

const Layout = () => {
  const { pathname } = useLocation();
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
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
