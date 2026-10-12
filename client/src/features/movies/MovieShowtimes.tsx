import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "@/components/DatePicker";
import { getSessions, type Session } from "@/services/sessionService";

type GroupedCinema = {
  cinema: Session["cinema"];
  sessions: { id: string; time: string; bookingUrl: string | null }[];
};

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

// Every upcoming showtime for one film, by date then cinema. Shared by the
// movie detail page and the standalone tickets page.
export default function MovieShowtimes({ tmdbId }: { tmdbId: string | number }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch every upcoming session once and bucket by NZ date here: a fixed
  // "today + 7 days" window hid films whose only sessions were further out.
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setSessions(await getSessions(tmdbId));
      } catch (error) {
        console.error("Error fetching sessions:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSessions();
  }, [tmdbId]);

  const availableDates = useMemo(
    () => [...new Set(sessions.map((s) => getNZDate(s.startsAt)))].sort(),
    [sessions],
  );
  const selectedDate = pickedDate ?? availableDates[0] ?? "";

  const grouped = useMemo(() => {
    const byCinema: Record<string, GroupedCinema> = {};
    sessions
      .filter((s) => getNZDate(s.startsAt) === selectedDate)
      .forEach((s) => {
        if (!byCinema[s.cinema.id]) {
          byCinema[s.cinema.id] = { cinema: s.cinema, sessions: [] };
        }
        byCinema[s.cinema.id].sessions.push({
          id: s.id,
          time: getNZTime(s.startsAt),
          bookingUrl: s.bookingUrl,
        });
      });
    return byCinema;
  }, [sessions, selectedDate]);

  if (isLoading) {
    return (
      <p className="text-sm" style={{ color: "var(--text-2)" }}>
        Loading showtimes…
      </p>
    );
  }

  const cinemaList = Object.values(grouped);

  return (
    <>
      {availableDates.length > 0 && (
        <DatePicker
          selected={selectedDate}
          onChange={setPickedDate}
          availableDates={availableDates}
        />
      )}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {cinemaList.length === 0 ? (
          <p className="text-sm col-span-2" style={{ color: "var(--text-2)" }}>
            No upcoming sessions for this movie.
          </p>
        ) : (
          cinemaList.map(({ cinema, sessions }) => (
            <div
              key={cinema.id}
              className="p-5 cursor-pointer transition-colors"
              style={{
                background: "var(--surface-2)",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
              // Land on this film and this day, not the cinema's default view.
              onClick={() =>
                navigate(
                  `/cinemas/${cinema.slug}?${new URLSearchParams({
                    movieId: String(tmdbId),
                    date: selectedDate,
                  })}`,
                )
              }
            >
              <p className="font-bold text-sm" style={{ letterSpacing: "-0.01em" }}>
                {cinema.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
                {cinema.suburb}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sessions.map((session) =>
                  session.bookingUrl ? (
                    <a
                      key={session.id}
                      href={session.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 text-xs font-bold rounded-full transition-opacity hover:opacity-80"
                      style={{ background: "var(--lime)", color: "#000" }}
                    >
                      {session.time}
                    </a>
                  ) : (
                    <span
                      key={session.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-full"
                      style={{ background: "var(--chip-bg)", color: "var(--text-2)" }}
                    >
                      {session.time}
                    </span>
                  ),
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
