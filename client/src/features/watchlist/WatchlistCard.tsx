import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash, Pencil } from "lucide-react";
import { statusStyle } from "./types";
import type { WatchlistItem } from "./types";
import { useDeleteModal } from "./useDeleteModal";
import { DeleteDialog } from "./DeleteDialog";
import { EditWatchlistDialog } from "./EditWatchlistDialog";
import { useNavigate } from "react-router-dom";

export function WatchlistCard({ item }: { item: WatchlistItem }) {
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();
  const {
    setPendingDelete: onDelete,
    pendingDelete,
    handleDelete,
    setPendingDelete,
  } = useDeleteModal();

  const s = statusStyle[item.status];
  const toDetail = () => {
    if (item.movie.tmdbId) navigate(`/movie/${item.movie.tmdbId}`);
  };

  return (
    <>
      <div
        className="flex items-start gap-3 p-3 cursor-pointer"
        style={{
          background: "var(--surface-2)",
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
        onClick={toDetail}
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
              <span
                className="shrink-0 inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: s.bg, color: s.color }}
              >
                {item.status}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="text-xs font-bold"
                style={{ color: "var(--lime)" }}
              >
                ★{" "}
                {item.movie.voteAverage != null
                  ? item.movie.voteAverage.toFixed(1)
                  : "N/A"}
              </span>
              <span className="text-xs" style={{ color: "var(--text-3)" }}>
                ·
              </span>
              <span
                className="text-xs font-bold"
                style={{ color: "#60A5FA" }}
              >
                ★ {item.rating != null ? `${item.rating}/10` : "--"}
              </span>
            </div>

            {item.notes && (
              <p
                className="text-xs mt-2 leading-relaxed"
                style={{ color: "var(--text-2)" }}
              >
                {item.notes}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1 shrink-0">
            <Button
              variant="secondary"
              size="icon"
              onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
              className="hover:text-lime-400 transition-colors"
            >
              <Pencil />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
              className="hover:text-red-400 transition-colors"
            >
              <Trash />
            </Button>
          </div>
        </div>
      </div>

      <EditWatchlistDialog
        open={editOpen}
        item={item}
        onClose={() => setEditOpen(false)}
      />
      <DeleteDialog
        open={pendingDelete !== null}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
