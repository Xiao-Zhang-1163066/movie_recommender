import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateWatchlistItem } from "@/services/watchlistService";
import toast from "react-hot-toast";
import type { WatchlistStatus } from "./types";

export function useWatchlistMutations() {
  const queryClient = useQueryClient();
  const { mutate: handleRating, isPending: isRating } = useMutation({
    mutationFn: ({ itemId, rating }: { itemId: string; rating: number }) =>
      updateWatchlistItem(itemId, { rating }),
    onSuccess: () => {
      toast.success("Rating updated");
      queryClient.invalidateQueries({ queryKey: ["watchlistItems"] });
    },
    onError: () => toast.error("Failed to update rating"),
  });

  const { mutate: handleStatusChange, isPending: isStatusChanging } =
    useMutation({
      mutationFn: ({
        itemId,
        newStatus,
        rating,
      }: {
        itemId: string;
        newStatus: WatchlistStatus;
        rating?: number;
      }) =>
        updateWatchlistItem(itemId, {
          status: newStatus,
          ...(rating !== undefined && { rating }),
        }),
      onSuccess: () => {
        toast.success("Status updated");
        queryClient.invalidateQueries({ queryKey: ["watchlistItems"] });
      },
      onError: () => toast.error("Failed to update status"),
    });

  return {
    handleRating: (itemId: string, rating: number) =>
      handleRating({ itemId, rating }),
    handleStatusChange: (
      itemId: string,
      newStatus: WatchlistStatus,
      rating?: number,
    ) => handleStatusChange({ itemId, newStatus, rating }),
    isRating,
    isStatusChanging,
  };
}
