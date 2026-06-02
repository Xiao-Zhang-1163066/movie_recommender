import { WatchlistCard } from "./WatchlistCard";
import { useActiveTab } from "./useActiveTab";
import { useWatchlistItems } from "./useWatchlistItems";

export function ItemList() {
  const { isLoading, error, displayedItems } = useWatchlistItems();
  const { activeTab } = useActiveTab();
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
        {error instanceof Error ? error.message : "Something went wrong"}
      </div>
    );
  }

  if (displayedItems.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-2)" }}>
        {activeTab === "watchlist"
          ? "Nothing here yet. Browse movies and hit + Watchlist."
          : "No watched films yet."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {displayedItems.map((item) => (
        <WatchlistCard key={item.id} item={item} />
      ))}
    </div>
  );
}
