import { useQuery } from "@tanstack/react-query";
import { useActiveTab } from "./useActiveTab";
import { getWatchlist } from "@/services/watchlistService";
import type { WatchlistItem } from "./types";

export function useWatchlistItems() {
  const { activeTab } = useActiveTab();
  const {
    data: watchlistItems = [],
    isLoading,
    error,
  } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlistItems"],
    queryFn: getWatchlist,
  });

  const displayedItems = watchlistItems.filter((watchlistItem) =>
    activeTab === "watchlist"
      ? watchlistItem.status === "PLANNED" ||
        watchlistItem.status === "WATCHING"
      : watchlistItem.status === "COMPLETED" ||
        watchlistItem.status === "DROPPED",
  );
  return {
    isLoading,
    error,
    displayedItems,
  };
}
