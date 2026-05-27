import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PendingChange } from "./types";

type Props = {
  pendingChange: PendingChange;
  pendingRating: number | "";
  onRatingChange: (rating: number | "") => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function StatusChangeDialog({ pendingChange, pendingRating, onRatingChange, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={pendingChange !== null} onOpenChange={onCancel}>
      <DialogContent style={{ background: "var(--surface-2)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <DialogHeader>
          <DialogTitle className="font-black" style={{ letterSpacing: "-0.02em" }}>
            Mark as {pendingChange?.newStatus.toLowerCase()}?
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm" style={{ color: "var(--text-2)" }}>{pendingChange?.movieTitle}</p>

        <div className="mt-2 flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--text-2)" }}>Rating (optional)</span>
          <select
            value={pendingRating}
            onChange={(e) => onRatingChange(e.target.value === "" ? "" : Number(e.target.value))}
            className="text-sm rounded-lg px-2 py-1"
            style={{ background: "var(--chip-bg)", color: "var(--text-2)", border: "none" }}
          >
            <option value="">No rating</option>
            {[...Array(10)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} / 10</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="muted" onClick={onCancel}>Cancel</Button>
          <Button variant="lime" onClick={onConfirm}>Confirm</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
