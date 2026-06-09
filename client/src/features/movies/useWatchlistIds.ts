import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { getWatchlist } from "@/services/watchlistService";

export function useWatchlistIds() {
  const { isAuthenticated } = useAuth();

  const { data } = useQuery({
    queryKey: ["watchlistItems"],
    queryFn: getWatchlist,
    select: (items) => ({
      ids: new Set(
        items.map((item) => item.movie.tmdbId).filter(Boolean) as number[],
      ),
      idMap: new Map(
        items
          .filter((item) => item.movie.tmdbId != null)
          .map((item) => [item.movie.tmdbId as number, item.id]),
      ),
    }),
    enabled: isAuthenticated,
  });

  return {
    watchlistIds: data?.ids ?? new Set<number>(),
    watchlistIdMap: data?.idMap ?? new Map<number, string>(),
  };
}
