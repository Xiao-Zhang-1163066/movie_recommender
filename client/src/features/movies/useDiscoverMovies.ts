import { useQuery } from "@tanstack/react-query";
import { fetchMovies, type Movie } from "@/api/tmdb";

export function useDiscoverMovies() {
  const {
    data: movies = [],
    isLoading,
    error,
  } = useQuery<Movie[]>({
    queryKey: ["discoverMovies"],
    queryFn: () => fetchMovies().then((r) => r.results),
  });
  return { movies, isLoading, error };
}
