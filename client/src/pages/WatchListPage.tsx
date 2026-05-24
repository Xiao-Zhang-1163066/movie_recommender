import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash } from "lucide-react";

type WatchlistItem = {
  id: string;
  status: "PLANNED" | "WATCHING" | "COMPLETED" | "DROPPED";
  rating: number | null;
  notes: string | null;
  movie: { id: string; title: string; genre: string | null };
};

type Tab = "watchlist" | "watched";

type PendingChange = {
  itemId: string;
  newStatus: WatchlistItem["status"];
  movieTitle: string;
} | null;

const statusStyle: Record<
  WatchlistItem["status"],
  { bg: string; color: string }
> = {
  PLANNED: { bg: "var(--chip-bg)", color: "var(--text-2)" },
  WATCHING: { bg: "rgba(198,244,50,0.12)", color: "var(--lime)" },
  COMPLETED: { bg: "rgba(50,200,100,0.12)", color: "#4CD964" },
  DROPPED: { bg: "rgba(255,80,80,0.12)", color: "#FF453A" },
};

function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("watchlist");
  const [pendingChange, setPendingChange] = useState<PendingChange>(null);
  const [pendingRating, setPendingRating] = useState<number | "">("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        const response = await fetch("/api/watchlist", {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to fetch watchlist");
        const data = await response.json();
        setItems(data.data.watchlist);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
      } finally {
        setIsLoading(false);
      }
    };
    fetchWatchlist();
  }, []);

  const wantToWatchItems = items.filter(
    (item) => item.status === "PLANNED" || item.status === "WATCHING",
  );
  const watchedItems = items.filter(
    (item) => item.status === "COMPLETED" || item.status === "DROPPED",
  );
  const displayedItems =
    activeTab === "watchlist" ? wantToWatchItems : watchedItems;

  async function handleRating(itemId: string, rating: number) {
    try {
      const response = await fetch(`/api/watchlist/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating }),
      });
      if (!response.ok) throw new Error("Failed to update rating");
      setItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, rating } : item)),
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleStatusChange(
    itemId: string,
    newStatus: WatchlistItem["status"],
    rating?: number,
  ) {
    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (rating !== undefined) body.rating = rating;
      const response = await fetch(`/api/watchlist/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Failed to update status");
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, status: newStatus, rating: rating ?? item.rating }
            : item,
        ),
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    // Snapshot current items
    // Optimistically remove the item from state
    const previousItems = items;
    setItems((prev) => prev.filter((item) => item.id !== pendingDelete));
    // Clear pending delete to close the confirmation modal
    setPendingDelete(null);
    try {
      const response = await fetch(`/api/watchlist/${pendingDelete}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete item");
    } catch (err) {
      // Rollback to snapshot
      setItems(previousItems);
      console.error(err);
    }
  }

  function openConfirmModal(
    item: WatchlistItem,
    newStatus: WatchlistItem["status"],
  ) {
    if (newStatus === "COMPLETED" || newStatus === "DROPPED") {
      setPendingChange({
        itemId: item.id,
        newStatus,
        movieTitle: item.movie.title,
      });
      setPendingRating("");
    } else {
      handleStatusChange(item.id, newStatus);
    }
  }

  async function handleConfirm() {
    if (!pendingChange) return;
    const { itemId, newStatus } = pendingChange;
    await handleStatusChange(
      itemId,
      newStatus,
      pendingRating === "" ? undefined : pendingRating,
    );
    setPendingChange(null);
    setPendingRating("");
  }

  function handleCancel() {
    setPendingChange(null);
    setPendingRating("");
  }

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-[60vh] text-sm"
        style={{ color: "var(--text-2)" }}
      >
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="px-10 py-10 max-w-2xl">
      <h1
        className="text-3xl font-black mb-6"
        style={{ letterSpacing: "-0.03em" }}
      >
        My Watchlist
      </h1>

      {/* Tab strip */}
      <div className="flex gap-2 mb-8">
        {(["watchlist", "watched"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 rounded-full text-sm font-semibold transition-colors"
            style={
              activeTab === tab
                ? { background: "var(--lime)", color: "#000" }
                : { background: "var(--chip-bg)", color: "var(--text-2)" }
            }
          >
            {tab === "watchlist" ? "Want to Watch" : "Watched"}
          </button>
        ))}
      </div>

      {displayedItems.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          {activeTab === "watchlist"
            ? "Nothing here yet. Browse movies and hit + Watchlist."
            : "No watched films yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedItems.map((item) => {
            const s = statusStyle[item.status];
            return (
              <div
                key={item.id}
                className="p-4 flex items-start gap-4"
                style={{
                  background: "var(--surface-2)",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="font-semibold text-sm"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {item.movie.title}
                  </p>
                  {item.movie.genre && (
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-2)" }}
                    >
                      {item.movie.genre}
                    </p>
                  )}
                  <span
                    className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold"
                    style={{ background: s.bg, color: s.color }}
                  >
                    {item.status}
                  </span>
                  {/* Render item.notes if it exists (a small muted paragraph) */}
                  {item.notes && (
                    <p
                      className="text-xs mt-2"
                      style={{ color: "var(--text-2)" }}
                    >
                      {item.notes}
                    </p>
                  )}
                  {activeTab === "watched" && (
                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-2)" }}
                      >
                        Rating
                      </span>
                      <select
                        value={item.rating ?? ""}
                        onChange={(e) =>
                          handleRating(item.id, Number(e.target.value))
                        }
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
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-2)" }}
                      >
                        Status
                      </span>
                      <select
                        value={item.status}
                        onChange={(e) =>
                          openConfirmModal(
                            item,
                            e.target.value as WatchlistItem["status"],
                          )
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
                {/* <Button
                  onClick={() => setPendingDelete(item.id)}
                  className="text-sm font-semibold rounded-full px-3 py-1"
                  style={{
                    background: "var(--chip-bg)",
                    color: "var(--text-2)",
                  }}
                >
                  Remove
                </Button> */}
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setPendingDelete(item.id)}
                  className="text-xs font-semibold rounded-full px-3 py-1 hover:text-red-400 
  transition-colors"
                >
                  <Trash />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation modal */}
      <Dialog open={pendingChange !== null} onOpenChange={handleCancel}>
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
              Mark as {pendingChange?.newStatus.toLowerCase()}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {pendingChange?.movieTitle}
          </p>

          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm" style={{ color: "var(--text-2)" }}>
              Rating (optional)
            </span>
            <select
              value={pendingRating}
              onChange={(e) =>
                setPendingRating(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              className="text-sm rounded-lg px-2 py-1"
              style={{
                background: "var(--chip-bg)",
                color: "var(--text-2)",
                border: "none",
              }}
            >
              <option value="">No rating</option>
              {[...Array(10)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} / 10
                </option>
              ))}
            </select>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-semibold rounded-full"
              style={{ background: "var(--chip-bg)", color: "var(--text-2)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm font-bold rounded-full"
              style={{ background: "var(--lime)", color: "#000" }}
            >
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={() => setPendingDelete(null)}
      >
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
              Remove from watchlist?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            This action cannot be undone.
          </p>

          <DialogFooter className="mt-4 gap-2">
            <button
              onClick={() => setPendingDelete(null)}
              className="px-4 py-2 text-sm font-semibold rounded-full"
              style={{ background: "var(--chip-bg)", color: "var(--text-2)" }}
            >
              Cancel
            </button>

            <Button
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-bold rounded-full"
              style={{ background: "var(--danger)", color: "#fff" }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WatchlistPage;
