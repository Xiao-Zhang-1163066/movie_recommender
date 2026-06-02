import { TabStrip } from "@/features/watchlist/TabStrip";
import { ItemList } from "@/features/watchlist/ItemList";

function WatchlistPage() {
  return (
    <div className="px-10 py-10 max-w-3xl">
      <h1
        className="text-3xl font-black mb-6"
        style={{ letterSpacing: "-0.03em" }}
      >
        My Watchlist
      </h1>
      <TabStrip />
      <ItemList />
    </div>
  );
}

export default WatchlistPage;
