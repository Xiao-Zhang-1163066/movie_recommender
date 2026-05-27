import { updateWatchlistItem } from "@/services/watchlistService";
import type { WatchlistItem, WatchlistStatus } from "./types";

export function useWatchlistMutations(setItems: React.Dispatch<React.SetStateAction<WatchlistItem[]>>) {
  async function handleRating(itemId: string, rating: number) {
    try {
      await updateWatchlistItem(itemId, { rating });
      setItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, rating } : item)),
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleStatusChange(itemId: string, newStatus: WatchlistStatus, rating?: number) {
    try {
      await updateWatchlistItem(itemId, { status: newStatus, ...(rating !== undefined && { rating }) });
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, status: newStatus, rating: rating ?? item.rating }
            : item,
        ),
      );
    } catch (err) {
      console.error(err);
    }
  }

  return { handleRating, handleStatusChange };
}
