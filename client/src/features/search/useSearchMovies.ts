import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchMovies, type MoviesResponse } from "@/api/tmdb";

export function useSearchMovies(query: string = "", page: number = 1) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<MoviesResponse>({
    queryKey: ["searchMovies", query, page],
    queryFn: () => fetchMovies(query, page),
    enabled: query.trim().length > 0,
  });

  const totalPages = data?.totalPages ?? 0;

  useEffect(() => {
    if (!query.trim() || page >= totalPages) return;
    queryClient.prefetchQuery({
      queryKey: ["searchMovies", query, page + 1],
      queryFn: () => fetchMovies(query, page + 1),
    });
  }, [query, page, totalPages, queryClient]);

  return {
    movies: data?.results ?? [],
    totalPages,
    totalResults: data?.totalResults ?? 0,
    isLoading,
    error,
  };
}
