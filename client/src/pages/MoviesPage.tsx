import { useEffect, useState } from "react";
import { getNowPlaying, IMG_URL, type Movie } from "@/api/tmdb";
import { useNavigate } from "react-router-dom";

function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
          </div>
        ))}
      </div>
    </div>
  );
}

export default MoviesPage;
