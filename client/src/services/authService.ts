import { API_BASE } from "@/lib/config";

// Shared helper — import this in any service that calls a protected endpoint.
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("jwt");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getMe(): Promise<boolean> {
  // GET /api/auth/me — returns true if token is valid, false otherwise
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  return res.ok;
}

export async function login(email: string, password: string): Promise<void> {
  // POST /api/auth/login — saves token to localStorage on success
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Login failed");
  }
  const data = await res.json();
  localStorage.setItem("jwt", data.data.token);
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<void> {
  // POST /api/auth/register — saves token to localStorage on success
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Registration failed");
  }
  const data = await res.json();
  localStorage.setItem("jwt", data.data.token);
}

export async function logout(): Promise<boolean> {
  localStorage.removeItem("jwt");
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
  });
  return res.ok;
}
