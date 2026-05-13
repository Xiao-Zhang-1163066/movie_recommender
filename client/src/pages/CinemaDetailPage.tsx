import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { cinemas } from "@/data/cinemas";
import { sessions } from "@/data/sessions";
import { getMovieById, IMG_URL } from "@/api/tmdb";
import DatePicker from "@/components/DatePicker";
import type { Movie } from "@/api/tmdb";

const today = new Date().toISOString().split("T")[0];

function CinemaDetailPage() {
  const { id: cinemaId } = useParams(); // our mock ID, e.g "c1"
  const [searchParams] = useSearchParams();
  const tmdbMovieId = searchParams.get("movieId"); // TMDb ID from query param

  const cinema = cinemas.find((c) => c.id === cinemaId);

  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedTmdbId, setSelectedTmdbId] = useState(tmdbMovieId); // TMDb ID
  const [movies, setMovies] = useState<Record<string, Movie>>({}); // keyed by TMDb ID

  const cinemaSessions = sessions[cinemaId!] ?? {};
  const sessionTimes = selectedTmdbId
    ? (cinemaSessions[selectedTmdbId]?.[selectedDate] ?? [])
    : [];
  const allTmdbIds = Object.keys(cinemaSessions);

  const nextDate = Object.keys(
    selectedTmdbId ? (cinemaSessions[selectedTmdbId] ?? {}) : {},
  )
    .filter((date) => date > selectedDate)
    .sort()[0]; // earliest future date with sessions

  // step 10: when cinemaId changes, fetch details for all movies that have sessions at this cinema (regardless of date)
  useEffect(() => {
    const fetchMovies = async () => {
      const tmdbIds = Object.keys(cinemaSessions);
      const results = await Promise.all(
        tmdbIds.map((tmdbId) => getMovieById(tmdbId)),
      );

      const movieMap: Record<string, Movie> = {};
      results.forEach((movie, i) => {
        movieMap[tmdbIds[i]] = movie; // keyed by TMDb ID
      });
      setMovies(movieMap);
    };
    fetchMovies();
  }, [cinemaId]); // cinemaSessions is derived directly from sessions (static import) and cinemaId (already in the array), so it can never change independently of cinemaId
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{cinema?.name}</h1>

      {/* Movie poster row — all movies at this cinema */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {allTmdbIds.map((tmdbId) => (
          <div
            key={tmdbId}
            onClick={() => {
              setSelectedTmdbId(tmdbId);
              setSelectedDate(today);
            }}
            className={`cursor-pointer rounded overflow-hidden border-2 ${
              tmdbId === selectedTmdbId
                ? "border-red-500"
                : "border-transparent"
            }`}
          >
            {/* poster image — use IMG_URL from tmdb.ts + movies[tmdbId]?.poster_path */}
            {/* fallback if poster not loaded yet */}
            <img
              src={
                movies[tmdbId]
                  ? `${IMG_URL}${movies[tmdbId].poster_path}`
                  : "https://via.placeholder.com/200x300?text=Loading..."
              }
              alt={movies[tmdbId]?.title ?? "Loading..."}
              className="w-32 h-auto object-cover"
            />
          </div>
        ))}
      </div>

      {/* Date picker */}
      <DatePicker selected={selectedDate} onChange={setSelectedDate} />

      {/* Sessions */}
      <div className="mt-4">
        {!selectedTmdbId ? (
          <p className="text-gray-400">Select a movie to see sessions</p>
        ) : sessionTimes.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {/* render each time as a button */}
            {sessionTimes.map((time) => (
              <button
                key={time}
                className="px-4 py-2 bg-green-500 text-white rounded"
              >
                {time}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <p className="text-gray-400 mb-2">No sessions on this date</p>
            {/* "Check another date" button — calls setSelectedDate(nextDate) if nextDate exists */}
            {/* if no nextDate, show "No more sessions available" */}
            {nextDate ? (
              <button
                onClick={() => setSelectedDate(nextDate)}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                Check {nextDate}
              </button>
            ) : (
              <p className="text-gray-400">No more sessions available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CinemaDetailPage;
