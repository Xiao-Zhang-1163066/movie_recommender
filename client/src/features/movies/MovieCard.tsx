import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { MovieCardData } from "./types";
import { useWatchlistIds } from "./useWatchlistIds";
import WatchlistButton from "./WatchlistButton";
import { useAddToWatchlist } from "./useAddToWatchlist";

export default function MovieCard({ movie }: { movie: MovieCardData }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { watchlistIds, watchlistIdMap } = useWatchlistIds();
  const { addToWatchlist, removeFromWatchlist } = useAddToWatchlist();
  const { tmdbId, title, posterUrl, voteAverage, overview, releaseYear } = movie;
  const rating = voteAverage ? voteAverage.toFixed(1) : "N/A";
  const inList = watchlistIds.has(tmdbId);

  function handleWatchlistClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (inList) {
      const itemId = watchlistIdMap.get(tmdbId);
      if (itemId) removeFromWatchlist(itemId);
    } else {
      addToWatchlist({ tmdbId, title, posterUrl, overview, releaseYear, voteAverage });
    }
  }

  return (
    <div
      className="cursor-pointer group"
      onClick={() => navigate(`/movie/${tmdbId}`)}
    >
      <div
        className="relative overflow-hidden"
        style={{ borderRadius: "14px", background: "var(--surface-2)" }}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="w-full aspect-2/3 object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full aspect-2/3 flex items-center justify-center text-4xl"
            style={{ background: "var(--surface-3)" }}
          >
            🎬
          </div>
        )}
        <div
          className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: "rgba(0,0,0,0.75)", color: "var(--lime)" }}
        >
          ★ {rating}
        </div>
      </div>
      <p
        className="mt-2 text-sm font-semibold truncate"
        style={{ letterSpacing: "-0.01em" }}
      >
        {title}
      </p>
      <WatchlistButton
        inList={inList}
        onClick={handleWatchlistClick}
        size="xs"
        className="mt-2 w-full rounded-full"
      />
    </div>
  );
}
