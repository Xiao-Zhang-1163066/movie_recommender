import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DatePicker from "@/components/DatePicker";

// Shape of one session from the API
type Session = {
  id: string;
  startsAt: string; // UTC ISO string
  bookingUrl: string | null;
  cinema: {
    id: string;
    name: string;
    slug: string;
    suburb: string;
  };
};

// Grouped structure: cinemaId → { cinema info, list of session times }
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
    // step 1: fetch /api/sessions?tmdbId=<id>&date=<selectedDate>
    // step 2: reduce the flat sessions array into grouped by cinemaId
    //   hint: for each session, extract time with  toLocaleTimeString("en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit", hour12: false })
    //   hint: acc[cinemaId] ??= { cinema: session.cinema, sessions:[] }
    //   hint: then push { id, time, bookingUrl } into acc[cinemaId].sessions
    // step 3: setGrouped(result), setIsLoading(false)
    //
    const fetchSessions = async () => {
      try {
        const response = await fetch(
          `/api/sessions?tmdbId=${id}&date=${selectedDate}`,
          {
            method: "GET",
            credentials: "include",
          },
        );
        if (!response.ok) {
          console.error("Failed to fetch sessions");
          setIsLoading(false);
          return;
        }
        const data = await response.json();
        const sessions: Session[] = data.data.sessions;

        // Group by cinemaId
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
            groupedResult[cinemaId] = {
              cinema: session.cinema,
              sessions: [],
            };
          }
          groupedResult[cinemaId].sessions.push({
            id: session.id,
            time,
            bookingUrl: session.bookingUrl,
          });
        });

        setGrouped(groupedResult);
        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching sessions:", error);
        setIsLoading(false);
      }
    };
    fetchSessions();
  }, [id, selectedDate]);

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Select a Cinema</h1>

      <DatePicker selected={selectedDate} onChange={setSelectedDate} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* step 4: Object.values(grouped).map(({ cinema, sessions }) => ... */}
        {/* render a div with cinema.name, cinema.suburb */}
        {/* and a span per session showing time — link to /cinemas/<cinema.slug> */}
        {Object.values(grouped).map(({ cinema, sessions }) => (
          <div
            key={cinema.id}
            className="border rounded p-4 cursor-pointer hover:shadow"
            onClick={() => navigate(`/cinemas/${cinema.slug}`)}
          >
            <h2 className="text-lg font-semibold">{cinema.name}</h2>
            <p className="text-sm text-gray-600">{cinema.suburb}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sessions.map((session) =>
                session.bookingUrl ? (
                  <a
                    key={session.id}
                    href={session.bookingUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 rounded text-sm  bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    {session.time}
                  </a>
                ) : (
                  <span
                    key={session.id}
                    className={`px-3 py-1 rounded text-sm bg-gray-400 cursor-not-allowed`}
                  >
                    {session.time}
                  </span>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ShowtimesPage;
