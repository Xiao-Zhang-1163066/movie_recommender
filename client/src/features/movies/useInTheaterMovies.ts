import { useQuery } from "@tanstack/react-query";
import { getInTheaterMovies } from "@/services/movieService";
import type { InTheaterMovie } from "@/features/movies/types";

export function useInTheaterMovies() {
  const {
    data: inTheaterMovies = [],
    isLoading,
    error,
  } = useQuery<InTheaterMovie[]>({
    queryKey: ["inTheaterMovies"],
    queryFn: getInTheaterMovies,
  });
  return { inTheaterMovies, isLoading, error };
}
