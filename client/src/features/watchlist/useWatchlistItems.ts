import { useEffect, useState } from "react";
import { getWatchlist } from "@/services/watchlistService";
import type { WatchlistItem, Tab } from "./types";

export function useWatchlistItems() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("watchlist");

  useEffect(() => {
    getWatchlist()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "An unknown error occurred"))
      .finally(() => setIsLoading(false));
  }, []);

  const displayedItems = items.filter((item) =>
    activeTab === "watchlist"
      ? item.status === "PLANNED" || item.status === "WATCHING"
      : item.status === "COMPLETED" || item.status === "DROPPED",
  );

  return { items, setItems, isLoading, error, activeTab, setActiveTab, displayedItems };
}
