import { useDiscoverMovies } from "./useDiscoverMovies";
import { IMG_URL } from "@/api/tmdb";
import MovieGrid from "./MovieGrid";
import MovieCard from "./MovieCard";

export default function DiscoverMovieGrid() {
  const { movies, isLoading, error } = useDiscoverMovies();

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
      <div
        className="flex items-center justify-center min-h-[60vh] text-sm 
  text-destructive"
      >
        {error instanceof Error ? error.message : "An error occurred"}
      </div>
    );
  }

  return (
    <MovieGrid>
      {movies.map((movie) => (
        <MovieCard
          key={movie.id}
          movie={{
            tmdbId: movie.id,
            title: movie.title,
            posterUrl: movie.poster_path ? IMG_URL + movie.poster_path : null,
            overview: movie.overview,
            voteAverage: movie.vote_average,
            releaseYear: movie.release_date
              ? parseInt(movie.release_date.split("-")[0])
              : null,
          }}
        />
      ))}
    </MovieGrid>
  );
}
