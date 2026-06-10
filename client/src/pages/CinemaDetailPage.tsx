import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import DatePicker from "@/components/DatePicker";
import useCinema from "@/hooks/useCinema";
import type { Session } from "@/features/cinemas/types";

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
  const tmdbMovieId = searchParams.get("movieId");

  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: TZ }),
  );
  const [selectedTmdbId, setSelectedTmdbId] = useState(tmdbMovieId);

  const cinemaSessions = useMemo(() => {
    return cinema
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
  }, [cinema]);

  const sortedEntries = useMemo(() => {
    const total = (d: Record<string, string[]>) =>
      Object.values(d).reduce((sum, times) => sum + times.length, 0);
    return Object.entries(cinemaSessions).sort(
      ([, a], [, b]) => total(b.dates) - total(a.dates),
    );
  }, [cinemaSessions]);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const effectiveTmdbId = selectedTmdbId ?? sortedEntries[0]?.[0] ?? null;

  const availableDates = useMemo(() => {
    if (!effectiveTmdbId || !cinemaSessions[effectiveTmdbId]) return [];
    return Object.keys(cinemaSessions[effectiveTmdbId].dates)
      .filter((d) => d >= today)
      .sort();
  }, [effectiveTmdbId, cinemaSessions, today]);

  const sessionTimes = useMemo(() => {
    if (!effectiveTmdbId || !cinema) return [];
    return cinema.sessions
      .filter((s) => s.movie.tmdbId.toString() === effectiveTmdbId)
      .filter((s) => getNZDate(s.startsAt) === selectedDate)
      .map((s) => ({
        id: s.id,
        time: getNZTime(s.startsAt),
        bookingUrl: s.bookingUrl,
      }));
  }, [effectiveTmdbId, selectedDate, cinema]);

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
  if (!cinema) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-sm text-destructive">
        Cinema not found
      </div>
    );
  }

  const nextDate = Object.keys(
    effectiveTmdbId ? (cinemaSessions[effectiveTmdbId]?.dates ?? {}) : {},
  )
    .filter((date) => date > selectedDate)
    .sort()[0];

  return (
    <div className="px-4 md:px-10 py-10">
      <h1
        className="text-3xl font-black mb-8"
        style={{ letterSpacing: "-0.03em" }}
      >
        {cinema.name}
      </h1>

      {/* Movie poster row */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
        {sortedEntries.map(([tmdbId, data]) => (
          <div
            key={tmdbId}
            onClick={() => {
              const firstDate = Object.keys(data.dates)
                .filter((d) => d >= today)
                .sort()[0];
              setSelectedTmdbId(tmdbId);
              setSelectedDate(firstDate ?? today);
            }}
            className="cursor-pointer shrink-0 overflow-hidden transition-all"
            style={{
              borderRadius: "12px",
              border:
                tmdbId === effectiveTmdbId
                  ? "2px solid var(--lime)"
                  : "2px solid transparent",
            }}
          >
            <img
              src={
                data.movie.posterUrl ??
                "https://via.placeholder.com/200x300?text=No+Poster"
              }
              alt={data.movie.title}
              className="w-28 h-auto object-cover"
            />
          </div>
        ))}
      </div>

      {/* Date picker */}
      <DatePicker
        selected={selectedDate}
        onChange={setSelectedDate}
        availableDates={availableDates}
      />

      {/* Sessions */}
      <div className="mt-5">
        {!effectiveTmdbId ? (
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Select a movie to see sessions.
          </p>
        ) : sessionTimes.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {sessionTimes.map((s) =>
              s.bookingUrl ? (
                <a
                  key={s.id}
                  href={s.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-xs font-bold rounded-full transition-opacity hover:opacity-80"
                  style={{ background: "var(--lime)", color: "#000" }}
                >
                  {s.time}
                </a>
              ) : (
                <span
                  key={s.id}
                  className="px-4 py-2 text-xs font-semibold rounded-full"
                  style={{ background: "var(--chip-bg)", color: "var(--text-2)" }}
                >
                  {s.time}
                </span>
              ),
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm mb-3" style={{ color: "var(--text-2)" }}>
              No sessions on this date.
            </p>
            {nextDate ? (
              <button
                onClick={() => setSelectedDate(nextDate)}
                className="px-4 py-2 text-sm font-bold rounded-full transition-opacity hover:opacity-85"
                style={{ background: "var(--lime)", color: "#000" }}
              >
                Check {nextDate}
              </button>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                No more sessions available.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CinemaDetailPage;
