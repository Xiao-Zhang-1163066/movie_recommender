import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMovieById, IMG_URL, type MovieDetail } from "@/api/tmdb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Session = {
  id: string;
  startsAt: string;
  bookingUrl: string | null;
  cinema: { id: string; name: string; slug: string; suburb: string };
};

type GroupedCinema = {
  cinema: Session["cinema"];
  sessions: { id: string; time: string; bookingUrl: string | null }[];
};

export default function MovieDetailModal({
  tmdbId,
  onClose,
}: {
  tmdbId: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [grouped, setGrouped] = useState<GroupedCinema[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().split("T")[0];

    const load = async () => {
      setIsLoading(true);
      try {
        const [detail, sessionsRes] = await Promise.all([
          getMovieById(String(tmdbId)),
          fetch(`/api/sessions?tmdbId=${tmdbId}&date=${today}`, {
            method: "GET",
            credentials: "include",
          }),
        ]);

        // Group today's sessions by cinema (same shape as ShowtimesPage).
        const byCinema: Record<string, GroupedCinema> = {};
        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          const sessions: Session[] = data.data.sessions;
          sessions.forEach((s) => {
            const time = new Date(s.startsAt).toLocaleTimeString("en-NZ", {
              timeZone: "Pacific/Auckland",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
            if (!byCinema[s.cinema.id])
              byCinema[s.cinema.id] = { cinema: s.cinema, sessions: [] };
            byCinema[s.cinema.id].sessions.push({
              id: s.id,
              time,
              bookingUrl: s.bookingUrl,
            });
          });
        }

        if (!active) return;
        setMovie(detail);
        setGrouped(Object.values(byCinema));
      } catch (err) {
        console.error("Failed to load movie detail:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [tmdbId]);

  const rating = movie?.vote_average ? movie.vote_average.toFixed(1) : "N/A";
  const cast = movie?.credits?.cast.slice(0, 8) ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {isLoading ? (
          <>
            <DialogHeader>
              <DialogTitle>Loading…</DialogTitle>
              <DialogDescription className="sr-only">
                Loading movie details.
              </DialogDescription>
            </DialogHeader>
          </>
        ) : !movie ? (
          <>
            <DialogHeader>
              <DialogTitle>Movie unavailable</DialogTitle>
              <DialogDescription>
                Could not load this movie. Please try again.
              </DialogDescription>
            </DialogHeader>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <div className="flex gap-4">
                {movie.poster_path && (
                  <img
                    src={IMG_URL + movie.poster_path}
                    alt={movie.title}
                    className="w-28 shrink-0 object-cover"
                    style={{ borderRadius: "12px" }}
                  />
                )}
                <div className="flex flex-col gap-2 pt-1 text-left">
                  <DialogTitle className="text-2xl font-black leading-tight">
                    {movie.title}
                  </DialogTitle>
                  <div
                    className="flex items-center gap-2 text-xs flex-wrap"
                    style={{ color: "var(--text-2)" }}
                  >
                    <span className="font-bold" style={{ color: "var(--lime)" }}>
                      ★ {rating}
                    </span>
                    {movie.runtime ? <span>· {movie.runtime} min</span> : null}
                    {movie.release_date ? (
                      <span>· {movie.release_date.slice(0, 4)}</span>
                    ) : null}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {movie.genres.map((g) => (
                      <span
                        key={g.id}
                        className="px-2 py-0.5 text-xs font-semibold rounded-full"
                        style={{ background: "var(--chip-bg)", color: "var(--text-2)" }}
                      >
                        {g.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Synopsis */}
            <DialogDescription className="text-sm leading-relaxed">
              {movie.overview}
            </DialogDescription>

            {/* Cast */}
            {cast.length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-2">Cast</h3>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {cast.map((c) => (
                    <div key={c.id} className="shrink-0 w-16 text-center">
                      <div
                        className="w-16 h-16 rounded-full overflow-hidden mb-1 flex items-center justify-center text-lg"
                        style={{ background: "var(--surface-2)" }}
                      >
                        {c.profile_path ? (
                          <img
                            src={IMG_URL + c.profile_path}
                            alt={c.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          "🎭"
                        )}
                      </div>
                      <p className="text-[10px] font-semibold truncate">{c.name}</p>
                      <p
                        className="text-[10px] truncate"
                        style={{ color: "var(--text-2)" }}
                      >
                        {c.character}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Showtimes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold">Showtimes today</h3>
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/movies/${tmdbId}/cinemas`);
                  }}
                  className="text-xs font-bold"
                  style={{ color: "var(--lime)" }}
                >
                  All showtimes →
                </button>
              </div>
              {grouped.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-2)" }}>
                  No sessions today.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {grouped.map(({ cinema, sessions }) => (
                    <div key={cinema.id}>
                      <p className="text-xs font-bold">{cinema.name}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {sessions.map((s) =>
                          s.bookingUrl ? (
                            <a
                              key={s.id}
                              href={s.bookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs font-bold rounded-full transition-opacity hover:opacity-80"
                              style={{ background: "var(--lime)", color: "#000" }}
                            >
                              {s.time}
                            </a>
                          ) : (
                            <span
                              key={s.id}
                              className="px-3 py-1.5 text-xs font-semibold rounded-full"
                              style={{ background: "var(--chip-bg)", color: "var(--text-2)" }}
                            >
                              {s.time}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
