import { useSearchParams } from "react-router-dom";
import { useSearchMovies } from "@/features/search/useSearchMovies";
import MovieGrid from "@/features/movies/MovieGrid";
import MovieCard from "@/features/movies/MovieCard";
import Pagination from "@/components/Pagination";
import { IMG_URL } from "@/api/tmdb";

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const { movies, totalPages, totalResults, isLoading, error } = useSearchMovies(query, page);

  function handlePageChange(newPage: number) {
    setSearchParams({ q: query, page: String(newPage) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
    <div className="px-10 py-10">
      <h2 className="text-xl font-semibold mb-1">Results for "{query}"</h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-2)" }}>
        {totalResults} {totalResults === 1 ? "movie" : "movies"} found
      </p>

      {movies.length === 0 ? (
        <div
          className="flex items-center justify-center min-h-[40vh] text-sm"
          style={{ color: "var(--text-2)" }}
        >
          No results for "{query}"
        </div>
      ) : (
        <>
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

          <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
        </>
      )}
    </div>
  );
}

export default SearchPage;
