import { useEffect, useState } from "react";
import { getNowPlaying, IMG_URL, type Movie } from "@/api/tmdb";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

type InTheaterMovie = {
  id: string;
  tmdbId: number | null;
  title: string;
  posterUrl: string | null;
  voteAverage: number | null;
  overview: string | null;
  releaseYear: number;
};

type WatchlistPayload = {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  releaseYear: number | null;
};

function MovieCard({
  posterSrc,
  title,
  rating,
  onClick,
  watchlistButton,
}: {
  posterSrc: string | null;
  title: string;
  rating: string;
  onClick: () => void;
  watchlistButton?: React.ReactNode;
}) {
  return (
    <div className="cursor-pointer group" onClick={onClick}>
      <div
        className="relative overflow-hidden"
        style={{ borderRadius: "14px", background: "var(--surface-2)" }}
      >
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={title}
            className="w-full aspect-2/3 object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full aspect-2/3 flex items-center justify-center text-4xl"
            style={{ background: "var(--surface-3)" }}
          >
            🎬
          </div>
        )}
        <div
          className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: "rgba(0,0,0,0.75)", color: "var(--lime)" }}
        >
          ★ {rating}
        </div>
      </div>
      <p
        className="mt-2 text-sm font-semibold truncate"
        style={{ letterSpacing: "-0.01em" }}
      >
        {title}
      </p>
      {watchlistButton}
    </div>
  );
}

function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [inTheaterMovies, setInTheaterMovies] = useState<InTheaterMovie[]>([]);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    async function fetchInTheaterMovies() {
      try {
        const response = await fetch("/api/movies?inTheaters=true", {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          const body = await response.json();
          setError(body.message ?? "Failed to fetch in-theater movies");
          return;
        }
        const data = await response.json();
        setInTheaterMovies(data.data.movies);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch in-theater movies",
        );
      }
    }
    fetchInTheaterMovies();
  }, []);

  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        if (!isAuthenticated) {
          setWatchlistIds(new Set());
          return;
        }
        const response = await fetch("/api/watchlist", {
          method: "GET",
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          const ids = new Set<number>(
            data.data.watchlist.map(
              (item: { movie: { tmdbId: number } }) => item.movie.tmdbId,
            ),
          );
          setWatchlistIds(ids);
        }
      } catch (error) {
        console.error("Error fetching watchlist:", error);
      }
    };
    fetchWatchlist();
  }, [isAuthenticated]);

  async function handleAddToWatchlist(payload: WatchlistPayload) {
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setWatchlistIds((prev) => new Set(prev).add(payload.tmdbId));
      }
    } catch (error) {
      console.error("Error adding to watchlist:", error);
    }
  }

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        setIsLoading(true);
        const results = await getNowPlaying();
        setMovies(results);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setIsLoading(false);
      }
    };
    fetchMovies();
  }, []);

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

  return (
    <div className="px-10 py-10">
      <SectionHeading title="In Theatres Now" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-14">
        {inTheaterMovies.map((movie) => (
          <MovieCard
            key={movie.id}
            posterSrc={movie.posterUrl}
            title={movie.title}
            rating={movie.voteAverage?.toFixed(1) ?? "N/A"}
            onClick={() => navigate(`/movies/${movie.tmdbId}`)}
            watchlistButton={
              isAuthenticated ? (
                <WatchlistButton
                  inList={watchlistIds.has(movie.tmdbId!)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToWatchlist({
                      tmdbId: movie.tmdbId!,
                      title: movie.title,
                      posterUrl: movie.posterUrl,
                      overview: movie.overview,
                      releaseYear: movie.releaseYear,
                    });
                  }}
                />
              ) : undefined
            }
          />
        ))}
      </div>

      <SectionHeading title="Discover" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            posterSrc={movie.poster_path ? IMG_URL + movie.poster_path : null}
            title={movie.title}
            rating={movie.vote_average?.toFixed(1) ?? "N/A"}
            onClick={() => navigate(`/movies/${movie.id}`)}
            watchlistButton={
              isAuthenticated ? (
                <WatchlistButton
                  inList={watchlistIds.has(movie.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToWatchlist({
                      tmdbId: movie.id,
                      title: movie.title,
                      posterUrl: movie.poster_path
                        ? IMG_URL + movie.poster_path
                        : null,
                      overview: movie.overview,
                      releaseYear: movie.release_date
                        ? parseInt(movie.release_date.split("-")[0])
                        : null,
                    });
                  }}
                />
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2
      className="text-2xl font-black mb-6"
      style={{ letterSpacing: "-0.03em" }}
    >
      {title}
    </h2>
  );
}

function WatchlistButton({
  inList,
  onClick,
}: {
  inList: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={inList}
      className="mt-2 w-full py-1.5 text-xs font-bold rounded-full transition-opacity"
      style={
        inList
          ? { background: "var(--chip-bg)", color: "var(--text-2)", cursor: "not-allowed" }
          : { background: "var(--lime)", color: "#000" }
      }
    >
      {inList ? "In Watchlist" : "+ Watchlist"}
    </button>
  );
}

export default MoviesPage;
