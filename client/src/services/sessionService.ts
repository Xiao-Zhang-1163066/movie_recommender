import { API_BASE } from "@/lib/config";

export type Session = {
  id: string;
  startsAt: string;
  bookingUrl: string | null;
  cinema: { id: string; name: string; slug: string; suburb: string };
};

export async function getSessions(
  tmdbId: string | number,
  date: string,
): Promise<Session[]> {
  const res = await fetch(
    `${API_BASE}/api/sessions?tmdbId=${tmdbId}&date=${date}`,
    { method: "GET" },
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Failed to fetch sessions");
  }
  const data = await res.json();
  return data.data.sessions;
}
