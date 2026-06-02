import { useState } from "react";
import type { WatchlistItem, WatchlistStatus, PendingChange } from "./types";
import { useWatchlistMutations } from "./useWatchlistMutations";

export function useStatusChangeModal() {
  const [pendingChange, setPendingChange] = useState<PendingChange>(null);
  const [pendingRating, setPendingRating] = useState<number | "">("");

  const { handleStatusChange } = useWatchlistMutations();

  function openConfirmModal(item: WatchlistItem, newStatus: WatchlistStatus) {
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
    await handleStatusChange(
      pendingChange.itemId,
      pendingChange.newStatus,
      pendingRating === "" ? undefined : pendingRating,
    );
    setPendingChange(null);
    setPendingRating("");
  }

  function handleCancel() {
    setPendingChange(null);
    setPendingRating("");
  }

  return {
    pendingChange,
    pendingRating,
    setPendingRating,
    openConfirmModal,
    handleConfirm,
    handleCancel,
  };
}
