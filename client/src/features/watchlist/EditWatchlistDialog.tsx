import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/StarRating";
import type { WatchlistItem, WatchlistStatus } from "./types";
import { useWatchlistMutations } from "./useWatchlistMutations";

type Props = {
  open: boolean;
  item: WatchlistItem;
  onClose: () => void;
};

const STATUS_OPTIONS: { value: WatchlistStatus; label: string }[] = [
  { value: "PLANNED", label: "Planned" },
  { value: "WATCHING", label: "Watching" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DROPPED", label: "Dropped" },
];

export function EditWatchlistDialog({ open, item, onClose }: Props) {
  const [status, setStatus] = useState<WatchlistStatus>(item.status);
  const [rating, setRating] = useState<number | null>(item.rating ?? null);
  const [notes, setNotes] = useState<string>(item.notes ?? "");
  const { handleEdit } = useWatchlistMutations();

  useEffect(() => {
    if (open) {
      setStatus(item.status);
      setRating(item.rating ?? null);
      setNotes(item.notes ?? "");
    }
  }, [open, item]);

  function handleSave() {
    handleEdit(item.id, { status, rating, notes: notes.trim() || null });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        style={{
          background: "var(--surface-2)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="font-black"
            style={{ letterSpacing: "-0.02em" }}
          >
            {item.movie.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-1">
          <div className="flex items-center gap-3">
            <span
              className="text-sm w-14 shrink-0"
              style={{ color: "var(--text-2)" }}
            >
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WatchlistStatus)}
              className="text-sm rounded-lg px-2 py-1.5 font-semibold flex-1"
              style={{
                background: "var(--chip-bg)",
                color: "var(--text-2)",
                border: "none",
                outline: "none",
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-sm w-14 shrink-0"
              style={{ color: "var(--text-2)" }}
            >
              Rating
            </span>
            <StarRating value={rating} onChange={setRating} />
            {rating !== null && (
              <span className="text-xs" style={{ color: "var(--text-2)" }}>
                {rating}/10
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: "var(--text-2)" }}>
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note…"
              rows={3}
              className="text-sm rounded-lg px-3 py-2 resize-none"
              style={{
                background: "var(--chip-bg)",
                color: "var(--text-1)",
                border: "1px solid rgba(255,255,255,0.08)",
                outline: "none",
              }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="lime" onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
