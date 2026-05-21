import { useEffect, useState } from "react";
import { getNowPlaying, IMG_URL, type Movie } from "@/api/tmdb";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set()); // Store TMDB IDs of movies in watchlist
  const { isAuthenticated } = useAuth();

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

  async function handleAddToWatchlist(movie: Movie) {
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          tmdbId: movie.id,
          title: movie.title,
          posterUrl: movie.poster_path ? IMG_URL + movie.poster_path : null,
          overview: movie.overview,
          releaseYear: movie.release_date
            ? parseInt(movie.release_date.split("-")[0])
            : null,
        }),
      });
      if (response.ok) {
        setWatchlistIds((prev) => new Set(prev).add(movie.id)); // Add to local watchlist IDs
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
      <h1 className="text-2xl font-bold mb-6">Now Playing</h1>
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
                  handleAddToWatchlist(movie);
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
