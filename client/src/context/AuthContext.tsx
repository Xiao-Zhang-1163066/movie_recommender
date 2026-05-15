import { createContext, useContext, useEffect, useState } from "react";
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
  useEffect(() => {
    // step 1: on mount, make a GET request to /api/auth/me with credentials: "include"
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "include",
        });
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
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
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      setIsAuthenticated(false);
    } else {
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

export { AuthProvider, useAuth };
