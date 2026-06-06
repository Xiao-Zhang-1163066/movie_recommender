import { createContext, useContext, useEffect, useState } from "react";
import { getMe, logout as logoutService } from "@/services/authService";
type AuthContextType = {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextType | null>(null);
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await getMe();
        setIsAuthenticated(res);
      } catch (error) {
        console.error("Error checking auth:", error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false); // always runs, success or failure
      }
    };
    checkAuth();
  }, []);

  function login() {
    setIsAuthenticated(true);
  }

  async function logout() {
    const res = await logoutService();
    setIsAuthenticated(false);
    if (!res) {
      console.error("Logout failed");
    }
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
// eslint-disable-next-line react-refresh/only-export-components
export { AuthProvider, useAuth };
