import { WatchlistCard } from "./WatchlistCard";
import type { WatchlistItem, WatchlistStatus, Tab } from "./types";

type Props = {
  isLoading: boolean;
  error: string;
  activeTab: Tab;
  displayedItems: WatchlistItem[];
  onStatusChange: (item: WatchlistItem, newStatus: WatchlistStatus) => void;
  onRating: (itemId: string, rating: number) => void;
  onDelete: (itemId: string) => void;
};

export function ItemList({ isLoading, error, activeTab, displayedItems, onStatusChange, onRating, onDelete }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-sm" style={{ color: "var(--text-2)" }}>
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
        <WatchlistCard
          key={item.id}
          item={item}
          activeTab={activeTab}
          onStatusChange={onStatusChange}
          onRating={onRating}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
