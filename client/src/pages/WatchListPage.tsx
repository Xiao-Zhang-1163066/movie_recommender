import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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

function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("watchlist");
  const [pendingChange, setPendingChange] = useState<PendingChange>(null);
  const [pendingRating, setPendingRating] = useState<number | "">("");

  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        // step 1: GET /api/watchlist with credentials: "include"
        // step 2: if response is not ok, throw an error
        // step 3: parse JSON and setItems with the result
        const response = await fetch("/api/watchlist", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Failed to fetch watchlist");
        }
        const data = await response.json();
        setItems(data.data.watchlist);
      } catch (err) {
        // step 4: setError with the error message
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        // step 5: setIsLoading(false)
        setIsLoading(false);
      }
    };
    fetchWatchlist();
  }, []);

  const wantToWatchItems = items.filter(
    (item) => item.status === "PLANNED" || item.status === "WATCHING",
  );

  // TODO: derive watchedItems — filter items where status is COMPLETED or DROPPED
  const watchedItems = items.filter(
    (item) => item.status === "COMPLETED" || item.status === "DROPPED",
  );
  const displayedItems =
    activeTab === "watchlist" ? wantToWatchItems : watchedItems;

  async function handleRating(itemId: string, rating: number) {
    // TODO: call PATCH /api/watchlist/:itemId with body { rating: newRating } and credentials: "include"
    // TODO: if response is ok, update the item in state using the immutable .map() pattern
    // (if it fails, you can ignore the error for now)
    try {
      const response = await fetch(`/api/watchlist/${itemId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ rating }),
      });
      if (!response.ok) {
        throw new Error("Failed to update rating");
      }
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.id === itemId ? { ...item, rating } : item,
        ),
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
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error("Failed to update status");
      }
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.id === itemId
            ? { ...item, status: newStatus, rating: rating ?? item.rating }
            : item,
        ),
      );
    } catch (err) {
      console.error(err);
    }
  }

  function openConfirmModal(
    item: WatchlistItem,
    newStatus: WatchlistItem["status"],
  ) {
    // TODO: if newStatus is COMPLETED or DROPPED, set pendingChange and reset pendingRating
    // TODO: otherwise call handleStatusChange directly (no modal needed for PLANNED/WATCHING)
    if (newStatus === "COMPLETED" || newStatus === "DROPPED") {
      setPendingChange({ itemId: item.id, newStatus });
      setPendingRating("");
    } else {
      handleStatusChange(item.id, newStatus);
    }
  }

  async function handleConfirm() {
    // TODO: if pendingChange is null, return early
    // TODO: call handleStatusChange with pendingChange.itemId, pendingChange.newStatus,
    //       and pendingRating (only pass it if pendingRating !== "")
    // TODO: close the modal (set pendingChange to null, reset pendingRating)
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
    // TODO: close the modal without doing anything
    setPendingChange(null);
    setPendingRating("");
  }

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My Watchlist</h1>
      {/* TODO: render two tab buttons — "Want to Watch" and "Watched"
             Each button sets activeTab on click.
             The active tab should look visually different (e.g. font-bold or
  underline). */}
      <div className="mb-4">
        <button
          className={`mr-4 ${
            activeTab === "watchlist" ? "font-bold underline" : ""
          }`}
          onClick={() => setActiveTab("watchlist")}
        >
          Want to Watch
        </button>
        <button
          className={`${activeTab === "watched" ? "font-bold underline" : ""}`}
          onClick={() => setActiveTab("watched")}
        >
          Watched
        </button>
      </div>

      {/* if items is empty, show a message: "Your watchlist is empty. Ask the AI to add some movies!" */}
      {displayedItems.length === 0 ? (
        <div className="text-gray-500">
          Your watchlist is empty. Ask the AI to add some movies!
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedItems.map((item) => (
            <div key={item.id} className="border rounded p-4">
              {/* movie title */}
              {/* status badge */}
              {/* rating — only show if item.rating is not null */}
              {item.movie.title}{" "}
              <span
                className={`ml-2 px-2 py-1 text-xs rounded ${
                  item.status === "PLANNED"
                    ? "bg-gray-200 text-gray-800"
                    : item.status === "WATCHING"
                      ? "bg-blue-200 text-blue-800"
                      : item.status === "COMPLETED"
                        ? "bg-green-200 text-green-800"
                        : "bg-red-200 text-red-800"
                }`}
              >
                {item.status}
              </span>
              {activeTab === "watched" && (
                <div className="mt-2">
                  <label htmlFor={`rating-${item.id}`} className="mr-2">
                    Your Rating:
                  </label>
                  <select
                    id={`rating-${item.id}`}
                    value={item.rating ?? ""}
                    onChange={(e) =>
                      handleRating(item.id, Number(e.target.value))
                    }
                    className="border rounded p-1"
                  >
                    <option value="">Rate...</option>
                    {[...Array(10)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {activeTab === "watchlist" && (
                <div className="mt-2">
                  <label htmlFor={`status-${item.id}`} className="mr-2">
                    Update Status:
                  </label>
                  <select
                    id={`status-${item.id}`}
                    value={item.status}
                    onChange={(e) =>
                      openConfirmModal(
                        item,
                        e.target.value as WatchlistItem["status"],
                      )
                    }
                    className="border rounded p-1"
                  >
                    <option value="PLANNED">PLANNED</option>
                    <option value="WATCHING">WATCHING</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="DROPPED">DROPPED</option>
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={pendingChange !== null} onOpenChange={handleCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark{" "}
              {pendingChange
                ? items.find((item) => item.id === pendingChange.itemId)?.movie
                    .title
                : ""}{" "}
              as watched?
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            <label htmlFor="pending-rating" className="mr-2">
              Your Rating:
            </label>
            <select
              id="pending-rating"
              value={pendingRating}
              onChange={(e) =>
                setPendingRating(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              className="border rounded p-1"
            >
              <option value="">Rate...</option>
              {[...Array(10)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <button
              onClick={handleCancel}
              className="mr-2 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WatchlistPage;
