import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useWatchlistIds } from "@/features/movies/useWatchlistIds";
import { useAddToWatchlist } from "@/features/movies/useAddToWatchlist";
import WatchlistButton from "@/features/movies/WatchlistButton";
import type { ChatMovie } from "./types";

export default function ChatMovieCard({
  movie,
  onOpen,
}: {
  movie: ChatMovie;
  onOpen: (tmdbId: number) => void;
}) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { watchlistIds, watchlistIdMap } = useWatchlistIds();
  const { addToWatchlist, removeFromWatchlist } = useAddToWatchlist();
  const {
    tmdbId,
    title,
    posterUrl,
    voteAverage,
    overview,
    releaseYear,
    runtime,
    reason,
    inTheatre,
  } = movie;

  const rating = voteAverage ? voteAverage.toFixed(1) : "N/A";

  return (
    <div className="cursor-pointer group" onClick={() => onOpen(tmdbId)}>
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
        {/* "NOW SHOWING" badge */}
        {inTheatre && (
          <div
            className="absolute top-2 left-2 text-xs font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: "#c6f432", color: "#121212" }}
          >
            NOW SHOWING
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
      <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
        {[releaseYear, runtime ? `${runtime} min` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p
        className="mt-1 text-xs"
        style={{
          color: "var(--text-2)",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {reason}
      </p>

      <WatchlistButton
        inList={watchlistIds.has(tmdbId)}
        size="xs"
        className="mt-2 w-full"
        onClick={(e) => {
          e.stopPropagation();
          if (!isAuthenticated) {
            navigate("/login");
            return;
          }
          if (watchlistIds.has(tmdbId)) {
            const itemId = watchlistIdMap.get(tmdbId);
            if (itemId) removeFromWatchlist(itemId);
          } else {
            addToWatchlist({ tmdbId, title, posterUrl, overview, releaseYear, voteAverage });
          }
        }}
      />
    </div>
  );
}
