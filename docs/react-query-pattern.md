# React Query Pattern

The goal: every component calls its own data-fetching hook. No prop drilling, no context. Shared state is handled by React Query's cache — multiple components calling the same `queryKey` get the same data automatically.

---

## 1. Install and wire up

```bash
npm install @tanstack/react-query
```

Wrap the app in `main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
```

---

## 2. Services — pure API calls, no React

`src/services/watchlistService.ts` stays unchanged. Services are just async functions that call the API and return data. No hooks, no state.

```ts
export async function getWatchlist(): Promise<WatchlistItem[]> { ... }
export async function updateWatchlistItem(id, body) { ... }
export async function deleteWatchlistItem(id) { ... }
```

---

## 3. Query hook — fetch and cache

`useWatchlistItems.ts` uses `useQuery`. Any component that calls this hook gets the same cached data — React Query deduplicates the request automatically.

```ts
import { useQuery } from "@tanstack/react-query";
import { getWatchlist } from "@/services/watchlistService";

export function useWatchlistItems() {
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
  });

  return { items, isLoading, error: error?.message ?? "" };
}
```

---

## 4. Mutation hooks — update and invalidate

Each mutation calls `queryClient.invalidateQueries` on success. This tells React Query the cached `"watchlist"` data is stale, which triggers a refetch in every component using that key.

```ts
// useDeleteWatchlistItem.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteWatchlistItem } from "@/services/watchlistService";

export function useDeleteWatchlistItem() {
  const queryClient = useQueryClient();

  const { mutate: deleteItem, isPending } = useMutation({
    mutationFn: deleteWatchlistItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
    onError: (err) => console.error(err),
  });

  return { deleteItem, isPending };
}
```

```ts
// useUpdateWatchlistItem.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateWatchlistItem } from "@/services/watchlistService";

export function useUpdateWatchlistItem() {
  const queryClient = useQueryClient();

  const { mutate: updateItem } = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status?: WatchlistStatus; rating?: number } }) =>
      updateWatchlistItem(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
    onError: (err) => console.error(err),
  });

  return { updateItem };
}
```

---

## 5. Components call their own hooks

Each component imports exactly the hooks it needs. No props for data, no context.

```tsx
// ItemList.tsx
function ItemList() {
  const { items, isLoading, error } = useWatchlistItems();
  // renders WatchlistCard per item
}

// WatchlistCard.tsx
function WatchlistCard({ item }: { item: WatchlistItem }) {
  const { updateItem } = useUpdateWatchlistItem();
  const { deleteItem } = useDeleteWatchlistItem();
  // handles its own status change and delete
}

// StatusChangeDialog.tsx
function StatusChangeDialog() {
  const { updateItem } = useUpdateWatchlistItem();
  // owns modal open/close state locally with useState
}
```

---

## 6. Page is return-only

```tsx
function WatchlistPage() {
  return (
    <div className="px-10 py-10 max-w-3xl">
      <h1>My Watchlist</h1>
      <TabStrip />
      <ItemList />
      <StatusChangeDialog />
      <DeleteDialog />
    </div>
  );
}
```

---

## Key concepts

| Concept | How it works |
|---|---|
| Shared data | Same `queryKey` → same cache entry → same data in every component |
| Refetch trigger | `invalidateQueries({ queryKey: ["watchlist"] })` marks cache stale → all subscribers refetch |
| Local UI state | Modal open/close, pending rating — plain `useState` inside the component or hook |
| No prop drilling | Components read from the cache directly via their own hook call |
| No context needed | The `QueryClientProvider` at the root IS the context, but you never write one yourself |
