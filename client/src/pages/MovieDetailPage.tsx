import { getMovieById, IMG_URL, type MovieDetail } from "@/api/tmdb";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
function MovieDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
    return <div className="p-6">Loading...</div>;
  }
  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>;
  }
  if (!movie) return null;
  return (
    <div className="p-6 flex gap-8">
      {movie.poster_path && (
        <img
          src={IMG_URL + movie.poster_path}
          alt={movie.title}
          className="w-64 rounded-md"
        />
      )}
      <div>
        <h1 className="text-3xl font-bold">{movie.title}</h1>

        <p>{movie.genres.map((g) => g.name).join(", ")}</p>

        <p>{movie.runtime} minutes</p>

        <p>Rating: {movie.vote_average}</p>

        <p className="mt-4">{movie.overview}</p>

        <Button onClick={() => navigate(`/movies/${id}/cinemas`)}>
          Buy Tickets
        </Button>
      </div>
    </div>
  );
}

export default MovieDetailPage;
