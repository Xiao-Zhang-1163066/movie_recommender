import { useQuery } from "@tanstack/react-query";
import { fetchMovies, type MoviesResponse } from "@/api/tmdb";

export function useSearchMovies(query: string = "", page: number = 1) {
  const { data, isLoading, error } = useQuery<MoviesResponse>({
    queryKey: ["searchMovies", query, page],
    queryFn: () => fetchMovies(query, page),
    enabled: query.trim().length > 0,
  });
  return {
    movies: data?.results ?? [],
    totalPages: data?.totalPages ?? 0,
    totalResults: data?.totalResults ?? 0,
    isLoading,
    error,
  };
}
