import type { WatchlistItem, WatchlistStatus } from "@/features/watchlist/types";

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const res = await fetch("/api/watchlist", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch watchlist");
  const data = await res.json();
  return data.data.watchlist;
}

export async function updateWatchlistItem(
  id: string,
  body: { status?: WatchlistStatus; rating?: number },
): Promise<void> {
  const res = await fetch(`/api/watchlist/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update watchlist item");
}

export async function deleteWatchlistItem(id: string): Promise<void> {
  const res = await fetch(`/api/watchlist/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete watchlist item");
}
