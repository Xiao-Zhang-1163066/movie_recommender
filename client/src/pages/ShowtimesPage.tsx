import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DatePicker from "@/components/DatePicker";
import { getSessions, type Session } from "@/services/sessionService";

type GroupedCinema = {
  cinema: Session["cinema"];
  sessions: { id: string; time: string; bookingUrl: string | null }[];
};

function ShowtimesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [grouped, setGrouped] = useState<Record<string, GroupedCinema>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchSessions = async () => {
      try {
        const sessions = await getSessions(id, selectedDate);
        const groupedResult: Record<string, GroupedCinema> = {};
        sessions.forEach((session) => {
          const cinemaId = session.cinema.id;
          const time = new Date(session.startsAt).toLocaleTimeString("en-NZ", {
            timeZone: "Pacific/Auckland",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          if (!groupedResult[cinemaId]) {
            groupedResult[cinemaId] = { cinema: session.cinema, sessions: [] };
          }
          groupedResult[cinemaId].sessions.push({
            id: session.id,
            time,
            bookingUrl: session.bookingUrl,
          });
        });
        setGrouped(groupedResult);
      } catch (error) {
        console.error("Error fetching sessions:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSessions();
  }, [id, selectedDate]);

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

  const cinemaList = Object.values(grouped);

  return (
    <div className="px-10 py-10">
      <h1
        className="text-3xl font-black mb-2"
        style={{ letterSpacing: "-0.03em" }}
      >
        Select a Cinema
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-2)" }}>
        Pick a date and time then book directly.
      </p>

      <DatePicker selected={selectedDate} onChange={setSelectedDate} />

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {cinemaList.length === 0 ? (
          <p className="text-sm col-span-2" style={{ color: "var(--text-2)" }}>
            No sessions available for this date.
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
              onClick={() => navigate(`/cinemas/${cinema.slug}`)}
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
    </div>
  );
}

export default ShowtimesPage;
