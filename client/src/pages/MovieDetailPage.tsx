import {
  getMovieById,
  BACKDROP_URL,
  IMG_URL,
  type MovieDetail,
} from "@/api/tmdb";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useWatchlistIds } from "@/features/movies/useWatchlistIds";
import { useAddToWatchlist } from "@/features/movies/useAddToWatchlist";
import { useInTheaterMovies } from "@/features/movies/useInTheaterMovies";
import WatchlistButton from "@/features/movies/WatchlistButton";
import MovieShowtimes from "@/features/movies/MovieShowtimes";
import { cn } from "@/lib/utils";

function MovieDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { watchlistIds, watchlistIdMap } = useWatchlistIds();
  const { addToWatchlist, removeFromWatchlist } = useAddToWatchlist();
  const { inTheaterMovies } = useInTheaterMovies();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovie = async () => {
      try {
        setIsLoading(true);
        const res = await getMovieById(id!);
        setMovie(res);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setIsLoading(false);
      }
    };
    fetchMovie();
  }, [id]);

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
        {error}
      </div>
    );
  }
  if (!movie) return null;

  const ratingStr = movie.vote_average?.toFixed(1) ?? "N/A";
  const inList = watchlistIds.has(movie.id);
  const isInTheatre = inTheaterMovies.some((m) => m.tmdbId === movie.id);

  function handleWatchlistClick(e: React.MouseEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!movie) return;
    if (inList) {
      const itemId = watchlistIdMap.get(movie.id);
      if (itemId) removeFromWatchlist(itemId);
    } else {
      addToWatchlist({
        tmdbId: movie.id,
        title: movie.title,
        posterUrl: movie.poster_path ? IMG_URL + movie.poster_path : null,
        overview: movie.overview ?? null,
        releaseYear: movie.release_date
          ? parseInt(movie.release_date.slice(0, 4))
          : null,
        voteAverage: movie.vote_average ?? null,
      });
    }
  }

  return (
    <div className="relative">
      {movie.backdrop_path && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[70vh] max-h-[640px] overflow-hidden"
        >
          <img
            src={BACKDROP_URL + movie.backdrop_path}
            alt=""
            className="w-full h-full object-cover object-top opacity-60"
          />
          {/* Fade into the page so the title and synopsis on top stay legible.
              Desktop text sits on the left, so darkening the left is enough. */}
          <div
            className="absolute inset-0 hidden md:block"
            style={{
              background:
                "linear-gradient(to top, var(--background) 0%, transparent 60%), linear-gradient(to right, var(--background) 20%, transparent 85%)",
            }}
          />
          {/* On a phone the title sits right of the poster, over the brightest
              part of the image, so dim all of it and fade to solid lower down. */}
          <div
            className="absolute inset-0 md:hidden"
            style={{
              background:
                "linear-gradient(to bottom, color-mix(in srgb, var(--background) 55%, transparent) 0%, var(--background) 80%)",
            }}
          />
        </div>
      )}

      <div className="relative px-4 py-6 md:px-10 md:py-12 max-w-5xl">
        {/* A grid, so one tree serves both layouts. Phone: small poster beside
            the title, synopsis and button full width beneath. Desktop: poster
            spans both rows on the left, everything else stacks on the right. */}
        <div className="grid grid-cols-[7rem_1fr] md:grid-cols-[16rem_1fr] md:grid-rows-[auto_1fr] gap-x-4 gap-y-5 md:gap-x-12">
          {/* Poster */}
          {movie.poster_path && (
            <img
              src={IMG_URL + movie.poster_path}
              alt={movie.title}
              className="w-full object-cover rounded-xl md:rounded-[18px] md:row-span-2"
            />
          )}

          {/* Title block */}
          <div
            className={cn(
              "flex flex-col gap-3 md:gap-5 self-end md:self-start md:pt-2",
              !movie.poster_path && "col-span-2 md:col-span-1 md:col-start-2",
            )}
          >
            {/* Genre chips */}
            <div className="flex gap-2 flex-wrap">
              {movie.genres.map((g) => (
                <span
                  key={g.id}
                  className="px-3 py-1 text-xs font-semibold rounded-full"
                  style={{
                    background: "var(--chip-bg)",
                    color: "var(--text-2)",
                  }}
                >
                  {g.name}
                </span>
              ))}
            </div>

            <h1
              className="text-3xl md:text-5xl font-black leading-none"
              style={{ letterSpacing: "-0.04em" }}
            >
              {movie.title}
            </h1>

            {/* Meta row */}
            <div
              className="flex items-center gap-3 text-sm"
              style={{ color: "var(--text-2)" }}
            >
              <span className="font-bold" style={{ color: "var(--lime)" }}>
                ★ {ratingStr}
              </span>
              <Dot />
              <span>{movie.runtime} min</span>
              {movie.release_date && (
                <>
                  <Dot />
                  <span>{movie.release_date.slice(0, 4)}</span>
                </>
              )}
            </div>
          </div>

          {/* Synopsis + CTAs: full width on a phone, right column on desktop */}
          <div className="col-span-2 md:col-span-1 md:col-start-2 flex flex-col gap-5">
            <p
              className="text-sm leading-relaxed max-w-xl"
              style={{ color: "var(--text-2)" }}
            >
              {movie.overview}
            </p>

            <div className="flex items-center gap-2">
              <WatchlistButton
                inList={inList}
                onClick={handleWatchlistClick}
                size="lg"
                className="px-8 w-full md:w-auto"
              />
            </div>
          </div>
        </div>

        {isInTheatre && (
          <section className="mt-10 md:mt-12">
            <h2
              className="text-2xl font-black mb-4"
              style={{ letterSpacing: "-0.03em" }}
            >
              Showtimes
            </h2>
            {/* Keyed so the picked date resets when moving to another film. */}
            <MovieShowtimes key={movie.id} tmdbId={movie.id} />
          </section>
        )}
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span
      className="inline-block w-1 h-1 rounded-full"
      style={{ background: "var(--text-3)" }}
    />
  );
}

export default MovieDetailPage;
