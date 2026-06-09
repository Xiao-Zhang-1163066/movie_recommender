import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addToWatchlist as addToWatchlistApi } from "@/services/movieService";
import { deleteWatchlistItem } from "@/services/watchlistService";
import type { WatchlistPayload } from "./types";

export function useAddToWatchlist() {
  const queryClient = useQueryClient();

  const { mutate: addToWatchlist, isPending } = useMutation({
    mutationFn: (movie: WatchlistPayload) => addToWatchlistApi(movie),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlistItems"] });
    },
    onError: (error) => {
      console.error("Error adding to watchlist:", error);
    },
  });

  const { mutate: removeFromWatchlist } = useMutation({
    mutationFn: (itemId: string) => deleteWatchlistItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlistItems"] });
    },
    onError: (error) => {
      console.error("Error removing from watchlist:", error);
    },
  });

  return { addToWatchlist, removeFromWatchlist, isPending };
}
