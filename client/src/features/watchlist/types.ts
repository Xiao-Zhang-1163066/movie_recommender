export type WatchlistStatus = "PLANNED" | "WATCHING" | "COMPLETED" | "DROPPED";

export type WatchlistItem = {
  id: string;
  status: WatchlistStatus;
  rating: number | null;
  notes: string | null;
  movie: {
    id: string;
    tmdbId: number | null;
    title: string;
    genre: string | null;
    posterUrl: string | null;
    voteAverage: number | null;
  };
};

export type Tab = "watchlist" | "watched";

export type PendingChange = {
  itemId: string;
  newStatus: WatchlistStatus;
  movieTitle: string;
} | null;

export const statusStyle: Record<
  WatchlistStatus,
  { bg: string; color: string }
> = {
  PLANNED: { bg: "var(--chip-bg)", color: "var(--text-2)" },
  WATCHING: { bg: "rgba(198,244,50,0.12)", color: "var(--lime)" },
  COMPLETED: { bg: "rgba(50,200,100,0.12)", color: "#4CD964" },
  DROPPED: { bg: "rgba(255,80,80,0.12)", color: "#FF453A" },
};
