import { useQuery } from "@tanstack/react-query";
import { getNowPlaying, type Movie } from "@/api/tmdb";

export function useDiscoverMovies() {
  const {
    data: movies = [],
    isLoading,
    error,
  } = useQuery<Movie[]>({
    queryKey: ["discoverMovies"],
    queryFn: getNowPlaying,
  });
  return { movies, isLoading, error };
}
