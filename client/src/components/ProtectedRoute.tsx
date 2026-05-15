import { useAuth } from "@/context/AuthContext";
import { Navigate, Outlet } from "react-router-dom";

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />; // added replace to the <Navigate> so the login page doesn't get pushed onto the browser history stack
}

export default ProtectedRoute;
