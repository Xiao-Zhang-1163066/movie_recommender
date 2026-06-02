import { useInTheaterMovies } from "./useInTheaterMovies";
import MovieGrid from "./MovieGrid";
import MovieCard from "./MovieCard";

export default function InTheaterMovieGrid() {
  const { inTheaterMovies, isLoading, error } = useInTheaterMovies();
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-[60vh] text-sm"
        style={{ color: "var(--text-2)" }}
      >
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-sm text-destructive">
        {error instanceof Error ? error.message : "An error occurred"}
      </div>
    );
  }

  return (
    <MovieGrid>
      {inTheaterMovies.map((movie) => (
        <MovieCard
          key={movie.id}
          movie={{
            tmdbId: movie.tmdbId!,
            title: movie.title,
            posterUrl: movie.posterUrl,
            overview: movie.overview,
            voteAverage: movie.voteAverage,
            releaseYear: movie.releaseYear,
          }}
        />
      ))}
    </MovieGrid>
  );
}
