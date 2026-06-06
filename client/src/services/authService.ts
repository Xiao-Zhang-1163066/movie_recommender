import { API_BASE } from "@/lib/config";
export async function getMe(): Promise<boolean> {
  // GET /api/auth/me with credentials: "include"
  // return true if response.ok, false otherwise
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    method: "GET",
    credentials: "include",
  });
  return res.ok;
}

export async function login(email: string, password: string): Promise<void> {
  // POST /api/auth/login, JSON body { email, password }, credentials: "include";
  // throw an Error with the server's error message if !response.ok
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Login failed");
  }
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<void> {
  // POST /api/auth/register, same pattern as login
  // throw an Error with the server's error message if !response.ok
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Registration failed");
  }
}

export async function logout(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  return res.ok;
}
