import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import DatePicker from "@/components/DatePicker";
import useCinema from "@/hooks/useCinema";
import type { Session } from "@/types/cinema";

const TZ = "Pacific/Auckland";
const getNZDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const getNZTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-NZ", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function CinemaDetailPage() {
  const { slug } = useParams();
  const { isFetching: isLoading, cinema, error } = useCinema(slug!);
  const [searchParams] = useSearchParams();
  const tmdbMovieId = searchParams.get("movieId"); // TMDb ID from query param

  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toLocaleDateString("en-CA", { timeZone: TZ }),
  );
  const [selectedTmdbId, setSelectedTmdbId] = useState(tmdbMovieId); // TMDb ID

  // step 4: use useMemo to build a grouped sessions object from cinema.sessions
  // shape: { [movieId]: { movie, [date]: [time, time, ...] } }
  // hint: use .reduce() over cinema.sessions
  // hint: startsAt is an ISO string — split on "T" to get date, slice(11,16) to get time
  // return {} if cinema is null
  const cinemaSessions = useMemo(() => {
    const cinemaSessions = cinema
      ? cinema.sessions.reduce(
          (acc, session) => {
            const tmdbId = session.movie.tmdbId.toString();
            const date = getNZDate(session.startsAt);
            const time = getNZTime(session.startsAt);
            if (!acc[tmdbId]) {
              acc[tmdbId] = { movie: session.movie, dates: { [date]: [time] } };
            } else if (!acc[tmdbId].dates[date]) {
              acc[tmdbId].dates[date] = [time];
            } else {
              acc[tmdbId].dates[date].push(time);
            }
            return acc;
          },
          {} as Record<
            string,
            { movie: Session["movie"]; dates: Record<string, string[]> }
          >,
        )
      : {};
    return cinemaSessions;
  }, [cinema]);

  const sortedEntries = useMemo(() => {
    const onDate = (d: Record<string, string[]>) => (d[selectedDate] ?? []).length;
    const total = (d: Record<string, string[]>) =>
      Object.values(d).reduce((sum, times) => sum + times.length, 0);
    return Object.entries(cinemaSessions).sort(([, a], [, b]) => {
      const byDate = onDate(b.dates) - onDate(a.dates);
      return byDate !== 0 ? byDate : total(b.dates) - total(a.dates);
    });
  }, [cinemaSessions, selectedDate]);

  // fall back to first movie (most sessions) if nothing is selected yet
  const effectiveTmdbId = selectedTmdbId ?? sortedEntries[0]?.[0] ?? null;

  // step 5: derive sessionTimes — sessions for selectedMovieId on selectedDate;
  // (or [] if nothing selected)
  const sessionTimes = useMemo(() => {
    if (!effectiveTmdbId || !cinema) return [];
    return cinema.sessions
      .filter((s) => s.movie.tmdbId.toString() === effectiveTmdbId)
      .filter((s) => getNZDate(s.startsAt) === selectedDate)
      .map((s) => ({ id: s.id, time: getNZTime(s.startsAt) }));
  }, [effectiveTmdbId, selectedDate, cinema]);

  // step 6: handle loading and error states
  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }
  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>;
  }
  if (!cinema) {
    return <div className="p-6 text-red-500">Cinema not found</div>;
  }

  const nextDate = Object.keys(
    effectiveTmdbId ? (cinemaSessions[effectiveTmdbId]?.dates ?? {}) : {},
  )
    .filter((date) => date > selectedDate)
    .sort()[0]; // earliest future date with sessions

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{cinema?.name}</h1>

      {/* Movie poster row — all movies at this cinema */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {sortedEntries.map(([tmdbId, data]) => (
          <div
            key={tmdbId}
            onClick={() => {
              setSelectedTmdbId(tmdbId);
              setSelectedDate(new Date().toLocaleDateString("en-CA", { timeZone: TZ }));
            }}
            className={`cursor-pointer rounded overflow-hidden border-2 ${
              tmdbId === effectiveTmdbId
                ? "border-red-500"
                : "border-transparent"
            }`}
          >
            {/* poster image — use IMG_URL from tmdb.ts + movies[tmdbId]?.poster_path */}
            {/* fallback if poster not loaded yet */}
            <img
              src={data.movie.posterUrl ?? "https://via.placeholder.com/200x300?text=No+Poster"}
              alt={data.movie.title}
              className="w-32 h-auto object-cover"
            />
          </div>
        ))}
      </div>

      {/* Date picker */}
      <DatePicker selected={selectedDate} onChange={setSelectedDate} />

      {/* Sessions */}
      <div className="mt-4">
        {!effectiveTmdbId ? (
          <p className="text-gray-400">Select a movie to see sessions</p>
        ) : sessionTimes.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {/* render each time as a button */}
            {sessionTimes.map((s) => (
              <button
                key={s.id}
                className="px-4 py-2 bg-green-500 text-white rounded"
              >
                {s.time}
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
