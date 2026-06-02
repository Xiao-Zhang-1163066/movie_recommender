import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteWatchlistItem as deleteWatchlistItemApi } from "@/services/watchlistService";
import toast from "react-hot-toast";

export function useDeleteModal() {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { mutate: deleteWatchlistItem } = useMutation({
    mutationFn: (id: string) => deleteWatchlistItemApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlistItems"] });
      setPendingDelete(null);
    },
    onError: () => {
      setPendingDelete(null);
      toast.error("Failed to delete item");
    },
  });

  function handleDelete() {
    if (pendingDelete) {
      deleteWatchlistItem(pendingDelete);
    }
  }

  return { pendingDelete, setPendingDelete, handleDelete };

  // async function handleDelete() {
  //   if (!pendingDelete) return;
  //   const previousItems = items;
  //   setItems((prev) => prev.filter((item) => item.id !== pendingDelete));
  //   setPendingDelete(null);
  //   try {
  //     await deleteWatchlistItem(pendingDelete);
  //   } catch (err) {
  //     setItems(previousItems);
  //     console.error(err);
  //   }
  // }

  // return { pendingDelete, setPendingDelete, handleDelete };
}
