import { useEffect, useState } from "react";
import { getNowPlaying, IMG_URL, type Movie } from "@/api/tmdb";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// new type — our DB shape
type InTheaterMovie = {
  id: string;
  tmdbId: number | null;
  title: string;
  posterUrl: string | null;
  voteAverage: number | null;
  overview: string | null; // add
  releaseYear: number;
};

type WatchlistPayload = {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  releaseYear: number | null;
};

function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [inTheaterMovies, setInTheaterMovies] = useState<InTheaterMovie[]>([]);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set()); // Store TMDB IDs of movies in watchlist
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
          setWatchlistIds(new Set()); // Clear watchlist IDs when user logs out
          return;
        } else {
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
          } else {
            console.error("Failed to fetch watchlist");
          }
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
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setWatchlistIds((prev) => new Set(prev).add(payload.tmdbId)); // Add to local watchlist IDs
      } else {
        console.error("Failed to add to watchlist");
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
    return <div className="p-6">Loading...</div>;
  }
  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>;
  }
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">In Theaters Now</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {inTheaterMovies.map((movie) => (
          <div
            key={movie.id}
            className="cursor-pointer"
            onClick={() => navigate(`/movies/${movie.tmdbId}`)}
          >
            {movie.posterUrl && (
              <img
                src={movie.posterUrl}
                alt={movie.title}
                className="w-full rounded-md"
              />
            )}

            <p className="mt-2 text-center">{movie.title}</p>

            <p className="text-center text-sm text-gray-500">
              Rating: {movie.voteAverage ?? "N/A"}
            </p>
            {isAuthenticated && (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent navigating to movie details
                  handleAddToWatchlist({
                    tmdbId: movie.tmdbId!,
                    title: movie.title,
                    posterUrl: movie.posterUrl,
                    overview: movie.overview,
                    releaseYear: movie.releaseYear,
                  });
                }}
                disabled={watchlistIds.has(movie.tmdbId!)} // Disable if already in watchlist
                className={`mt-2 w-full px-2 py-1 text-sm rounded ${
                  watchlistIds.has(movie.tmdbId!)
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                {watchlistIds.has(movie.tmdbId!)
                  ? "In Watchlist"
                  : "Add to Watchlist"}
              </button>
            )}
          </div>
        ))}
      </div>
      <h1 className="text-2xl font-bold mb-6">Discover</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {movies.map((movie) => (
          <div
            key={movie.id}
            className="cursor-pointer"
            onClick={() => navigate(`/movies/${movie.id}`)}
          >
            {movie.poster_path && (
              <img
                src={IMG_URL + movie.poster_path}
                alt={movie.title}
                className="w-full rounded-md"
              />
            )}

            <p className="mt-2 text-center">{movie.title}</p>

            <p className="text-center text-sm text-gray-500">
              Rating: {movie.vote_average}
            </p>
            {isAuthenticated && (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent navigating to movie details
                  handleAddToWatchlist(
                    {
                      tmdbId: movie.id,
                      title: movie.title,
                      posterUrl: movie.poster_path
                        ? IMG_URL + movie.poster_path
                        : null,
                      overview: movie.overview,
                      releaseYear: movie.release_date
                        ? parseInt(movie.release_date.split("-")[0])
                        : null,
                    },
                    // movie, --- IGNORE ---
                  );
                }}
                disabled={watchlistIds.has(movie.id)} // Disable if already in watchlist
                className={`mt-2 w-full px-2 py-1 text-sm rounded ${
                  watchlistIds.has(movie.id)
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                {watchlistIds.has(movie.id)
                  ? "In Watchlist"
                  : "Add to Watchlist"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MoviesPage;
