import { API_BASE } from "@/lib/config";
import { getAuthHeaders } from "@/services/authService";
import type { InTheaterMovie, WatchlistPayload } from "@/features/movies/types";

export async function getInTheaterMovies(): Promise<InTheaterMovie[]> {
  // Public route — no auth needed, but keep the pattern consistent.
  const res = await fetch(`${API_BASE}/api/movies?inTheaters=true`, {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch in-theater movies");
  }
  const data = await res.json();
  return data.data.movies;
}

export async function addToWatchlist(movie: WatchlistPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/api/watchlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(movie),
  });
  if (!res.ok) {
    throw new Error("Failed to add movie to watchlist");
  }
}
