import { createContext, useContext, useState } from "react";
import { logout as logoutService } from "@/services/authService";
type AuthContextType = {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextType | null>(null);
function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialise synchronously from localStorage — no async /me check needed.
  // Expired tokens are caught on the first API call (401 → redirect to login).
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem("jwt"));
  const isLoading = false;

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
