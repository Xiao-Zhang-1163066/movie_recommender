import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    // step 1: prevent the default browser form submission
    // step 2: clear any previous error
    // step 3: POST to /api/auth/login with { email, password } as JSON body
    //         include credentials: "include" so the browser stores the cookie
    // step 4: if response is not ok, read the error message from the JSON body and set it
    // step 5: if successful, navigate to "/movies"
    e.preventDefault();
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Login failed");
    } else {
      login();
      navigate("/movies");
    }
  }

  return (
    <div
      className="min-h-screen flex items-center
justify-center"
    >
      <div
        className="w-full max-w-sm p-6 flex flex-col
  gap-4"
      >
        <h1 className="text-2xl font-bold">Login</h1>

        {/* error message — only render if error is non-empty */}
        {error && <p className="text-red-500">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded px-3 py-2"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded px-3 py-2"
            required
          />
          <button
            type="submit"
            className="bg-blue-500 text-white rounded px-4 py-2"
          >
            Login
          </button>
        </form>

        {/* link to register page — "Don't have an
account? Register" */}
        <p className="text-sm">
          Don't have an account?{" "}
          <Link to="/register" className="text-blue-500">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
