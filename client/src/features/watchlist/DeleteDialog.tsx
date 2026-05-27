import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteDialog({ open, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent style={{ background: "var(--surface-2)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <DialogHeader>
          <DialogTitle className="font-black" style={{ letterSpacing: "-0.02em" }}>
            Remove from watchlist?
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm" style={{ color: "var(--text-2)" }}>This action cannot be undone.</p>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="muted" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
