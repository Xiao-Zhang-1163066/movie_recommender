import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login as loginApi } from "@/services/authService";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await loginApi(email, password);
      login(); // update auth context
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--background)" }}
    >
      <div
        className="w-full max-w-sm p-8 flex flex-col gap-6"
        style={{
          background: "var(--surface-2)",
          borderRadius: "20px",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div>
          <p
            className="text-2xl font-black mb-1"
            style={{ letterSpacing: "-0.03em" }}
          >
            Welcome back
          </p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Sign in to your MovieMate account.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 text-sm rounded-xl outline-none"
            style={{
              background: "var(--chip-bg)",
              color: "var(--foreground)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 text-sm rounded-xl outline-none"
            style={{
              background: "var(--chip-bg)",
              color: "var(--foreground)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
            required
          />
          <button
            type="submit"
            className="w-full py-3.5 text-sm font-bold rounded-full mt-1 transition-opacity hover:opacity-85"
            style={{ background: "var(--lime)", color: "#000" }}
          >
            Sign In
          </button>
        </form>

        <p className="text-sm text-center" style={{ color: "var(--text-2)" }}>
          Don't have an account?{" "}
          <Link
            to="/register"
            className="font-semibold"
            style={{ color: "var(--lime)" }}
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
