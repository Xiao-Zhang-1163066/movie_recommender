import { getMovieById, IMG_URL, type MovieDetail } from "@/api/tmdb";
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

  return (
    <div className="px-10 py-12 flex gap-12 max-w-5xl">
      {/* Poster */}
      {movie.poster_path && (
        <div className="shrink-0">
          <img
            src={IMG_URL + movie.poster_path}
            alt={movie.title}
            className="w-64 object-cover"
            style={{ borderRadius: "18px" }}
          />
        </div>
      )}

      {/* Info */}
      <div className="flex flex-col gap-5 pt-2">
        {/* Genre chips */}
        <div className="flex gap-2 flex-wrap">
          {movie.genres.map((g) => (
            <span
              key={g.id}
              className="px-3 py-1 text-xs font-semibold rounded-full"
              style={{ background: "var(--chip-bg)", color: "var(--text-2)" }}
            >
              {g.name}
            </span>
          ))}
        </div>

        <h1
          className="text-5xl font-black leading-none"
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

        {/* Synopsis */}
        <p
          className="text-sm leading-relaxed max-w-xl"
          style={{ color: "var(--text-2)" }}
        >
          {movie.overview}
        </p>

        {/* CTA */}
        <button
          onClick={() => navigate(`/movie/${id}/cinemas`)}
          className="self-start px-8 py-4 rounded-full font-bold text-sm transition-opacity hover:opacity-85"
          style={{ background: "var(--lime)", color: "#000" }}
        >
          Buy Tickets
        </button>
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
