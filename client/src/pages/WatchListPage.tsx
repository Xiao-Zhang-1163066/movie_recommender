import { useEffect, useState } from "react";

type WatchlistItem = {
  id: string;
  status: "PLANNED" | "WATCHING" | "COMPLETED" | "DROPPED";
  rating: number | null;
  notes: string | null;
  movie: { id: string; title: string; genre: string | null };
};

function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My Watchlist</h1>

      {/* if items is empty, show a message: "Your watchlist is empty. Ask the AI to add some movies!" */}
      {items.length === 0 ? (
        <div className="text-gray-500">
          Your watchlist is empty. Ask the AI to add some movies!
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
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
              {item.rating !== null && (
                <span className="ml-4 text-sm text-yellow-500">
                  Rating: {item.rating}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WatchlistPage;
