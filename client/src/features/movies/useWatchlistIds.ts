import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { getWatchlist } from "@/services/watchlistService";

export function useWatchlistIds() {
  const { isAuthenticated } = useAuth();

  const { data: watchlistIds = new Set<number>() } = useQuery({
    queryKey: ["watchlistItems"],
    queryFn: getWatchlist, // same queryFn as useWatchlistItems
    // transform only for THIS hook
    select: (items) =>
      new Set(
        items.map((item) => item.movie.tmdbId).filter(Boolean) as number[],
      ),
    // only run this query when the user is authenticated
    enabled: isAuthenticated,
  });

  return { watchlistIds };
}
