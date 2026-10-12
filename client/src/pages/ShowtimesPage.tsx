import { useParams } from "react-router-dom";
import MovieShowtimes from "@/features/movies/MovieShowtimes";

function ShowtimesPage() {
  const { id } = useParams();

  return (
    <div className="px-4 md:px-10 py-10">
      <h1
        className="text-3xl font-black mb-2"
        style={{ letterSpacing: "-0.03em" }}
      >
        Select a Cinema
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-2)" }}>
        Pick a date and time then book directly.
      </p>

      {id && <MovieShowtimes tmdbId={id} />}
    </div>
  );
}

export default ShowtimesPage;
