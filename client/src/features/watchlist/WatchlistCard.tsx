import { Button } from "@/components/ui/button";
import { Trash } from "lucide-react";
import { statusStyle } from "./types";
import type { WatchlistItem, WatchlistStatus } from "./types";
import { useWatchlistMutations } from "./useWatchlistMutations";
import { useStatusChangeModal } from "./useStatusChangeModal";
import { useDeleteModal } from "./useDeleteModal";
import { useActiveTab } from "./useActiveTab";
import { StatusChangeDialog } from "./StatusChangeDialog";
import { DeleteDialog } from "./DeleteDialog";

export function WatchlistCard({ item }: { item: WatchlistItem }) {
  const { activeTab } = useActiveTab();
  const { handleRating: onRating } = useWatchlistMutations();
  const {
    openConfirmModal: onStatusChange,
    pendingChange,
    pendingRating,
    setPendingRating,
    handleConfirm,
    handleCancel,
  } = useStatusChangeModal();
  const {
    setPendingDelete: onDelete,
    pendingDelete,
    handleDelete,
    setPendingDelete,
  } = useDeleteModal();

  const s = statusStyle[item.status];

  return (
    <>
      <div
        className="flex items-start gap-3 p-3"
        style={{
          background: "var(--surface-2)",
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          className="shrink-0 w-14 overflow-hidden"
          style={{
            aspectRatio: "2/3",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          {item.movie.posterUrl ? (
            <img
              src={item.movie.posterUrl}
              alt={item.movie.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xl"
              style={{ background: "var(--surface-3)" }}
            >
              🎬
            </div>
          )}
        </div>

        <div className="flex flex-1 items-start gap-3 pt-1 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className="font-semibold text-sm leading-tight"
                style={{ letterSpacing: "-0.01em" }}
              >
                {item.movie.title}
              </p>
              {item.movie.voteAverage != null && (
                <span
                  className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-md"
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    color: "var(--lime)",
                  }}
                >
                  ★ {item.movie.voteAverage.toFixed(1)}
                </span>
              )}
            </div>

            <span
              className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: s.bg, color: s.color }}
            >
              {item.status}
            </span>

            {item.notes && (
              <p
                className="text-xs mt-2 leading-relaxed"
                style={{ color: "var(--text-2)" }}
              >
                {item.notes}
              </p>
            )}

            {activeTab === "watched" && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--text-2)" }}>
                  Rating
                </span>
                <select
                  value={item.rating ?? ""}
                  onChange={(e) => onRating(item.id, Number(e.target.value))}
                  className="text-xs rounded-lg px-2 py-1 font-semibold"
                  style={{
                    background: "var(--chip-bg)",
                    color: "var(--text-2)",
                    border: "none",
                  }}
                >
                  <option value="">Rate…</option>
                  {[...Array(10)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} / 10
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeTab === "watchlist" && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--text-2)" }}>
                  Status
                </span>
                <select
                  value={item.status}
                  onChange={(e) =>
                    onStatusChange(item, e.target.value as WatchlistStatus)
                  }
                  className="text-xs rounded-lg px-2 py-1 font-semibold"
                  style={{
                    background: "var(--chip-bg)",
                    color: "var(--text-2)",
                    border: "none",
                  }}
                >
                  <option value="PLANNED">Planned</option>
                  <option value="WATCHING">Watching</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="DROPPED">Dropped</option>
                </select>
              </div>
            )}
          </div>

          <Button
            variant="secondary"
            size="icon"
            onClick={() => onDelete(item.id)}
            className="shrink-0 hover:text-red-400 transition-colors"
          >
            <Trash />
          </Button>
        </div>
      </div>
      <StatusChangeDialog
        pendingChange={pendingChange}
        pendingRating={pendingRating}
        onRatingChange={setPendingRating}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <DeleteDialog
        open={pendingDelete !== null}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
