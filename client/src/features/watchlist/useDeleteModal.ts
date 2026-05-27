import { useState } from "react";
import { deleteWatchlistItem } from "@/services/watchlistService";
import type { WatchlistItem } from "./types";

export function useDeleteModal(
  items: WatchlistItem[],
  setItems: React.Dispatch<React.SetStateAction<WatchlistItem[]>>,
) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function handleDelete() {
    if (!pendingDelete) return;
    const previousItems = items;
    setItems((prev) => prev.filter((item) => item.id !== pendingDelete));
    setPendingDelete(null);
    try {
      await deleteWatchlistItem(pendingDelete);
    } catch (err) {
      setItems(previousItems);
      console.error(err);
    }
  }

  return { pendingDelete, setPendingDelete, handleDelete };
}
