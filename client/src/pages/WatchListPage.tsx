import { useWatchlistItems } from "@/features/watchlist/useWatchlistItems";
import { useWatchlistMutations } from "@/features/watchlist/useWatchlistMutations";
import { useStatusChangeModal } from "@/features/watchlist/useStatusChangeModal";
import { useDeleteModal } from "@/features/watchlist/useDeleteModal";
import { TabStrip } from "@/features/watchlist/TabStrip";
import { ItemList } from "@/features/watchlist/ItemList";
import { StatusChangeDialog } from "@/features/watchlist/StatusChangeDialog";
import { DeleteDialog } from "@/features/watchlist/DeleteDialog";

function WatchlistPage() {
  const { items, setItems, isLoading, error, activeTab, setActiveTab, displayedItems } =
    useWatchlistItems();
  const { handleRating, handleStatusChange } = useWatchlistMutations(setItems);
  const statusModal = useStatusChangeModal(handleStatusChange);
  const deleteModal = useDeleteModal(items, setItems);

  return (
    <div className="px-10 py-10 max-w-3xl">
      <h1 className="text-3xl font-black mb-6" style={{ letterSpacing: "-0.03em" }}>
        My Watchlist
      </h1>
      <TabStrip activeTab={activeTab} onTabChange={setActiveTab} />
      <ItemList
        isLoading={isLoading}
        error={error}
        activeTab={activeTab}
        displayedItems={displayedItems}
        onStatusChange={statusModal.openConfirmModal}
        onRating={handleRating}
        onDelete={deleteModal.setPendingDelete}
      />
      <StatusChangeDialog
        pendingChange={statusModal.pendingChange}
        pendingRating={statusModal.pendingRating}
        onRatingChange={statusModal.setPendingRating}
        onConfirm={statusModal.handleConfirm}
        onCancel={statusModal.handleCancel}
      />
      <DeleteDialog
        open={deleteModal.pendingDelete !== null}
        onConfirm={deleteModal.handleDelete}
        onCancel={() => deleteModal.setPendingDelete(null)}
      />
    </div>
  );
}

export default WatchlistPage;
