import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addToWatchlist as addToWatchlistApi } from "@/services/movieService";
import type { WatchlistPayload } from "./types";

export function useAddToWatchlist() {
  const queryClient = useQueryClient();

  const { mutate: addToWatchlist, isPending } = useMutation({
    // step 1: mutationFn — call addToWatchlist with the payload
    mutationFn: (movie: WatchlistPayload) => addToWatchlistApi(movie),

    // step 2: onSuccess — invalidate ["watchlistItems"] so both hooks refresh,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlistItems"] });
    },
    // step 3: onError — console.error is fine for now
    onError: (error) => {
      console.error("Error adding to watchlist:", error);
    },
  });

  return {
    // step 4: expose addToWatchlist (rename mutate) and isPending
    addToWatchlist,
    isPending,
  };
}
