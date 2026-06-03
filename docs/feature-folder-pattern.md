# Feature Folder Pattern

This document captures the refactoring pattern established during the MoviesPage refactor. Use it as a guide when refactoring other pages in this project.

---

## The core rule

Every page should answer one question: **what is on this page?**

If a page contains `useState`, `useEffect`, `fetch`, or business logic — those belong somewhere else.

```tsx
// target state for every page
function SomePage() {
  return (
    <div className="px-10 py-10">
      <SomeSection />
      <AnotherSection />
    </div>
  );
}
```

---

## The layers

Each layer has one job. It only knows about the layer below it.

### 1. `types.ts`
Defines the data shapes for the feature. No logic, no imports from React.

```ts
// features/movies/types.ts
export type MovieCardData = {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  voteAverage: number | null;
  releaseYear: number | null;
};
```

**Rule:** If a type is used only within one feature folder, define it there. If it's shared across features, define it in the feature that owns the data (e.g. `features/watchlist/types.ts` owns `WatchlistItem`).

---

### 2. `services/xxxService.ts`
Pure async fetch functions. No React, no hooks, no state. Just `fetch` + error throwing.

```ts
// services/movieService.ts
export async function getInTheaterMovies(): Promise<InTheaterMovie[]> {
  const res = await fetch("/api/movies?inTheaters=true", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch in-theater movies");
  const data = await res.json();
  return data.data.movies;
}
```

**Rule:** One function per API endpoint. Always throw on `!res.ok` so React Query can catch it. Lives in `services/` (not inside the feature folder) to mirror the existing `watchlistService.ts` convention.

---

### 3. `useXxx.ts` — Query hooks
Wrap service functions in `useQuery`. Return data with a safe default (`[]`, `new Set()`, etc.) so components never receive `undefined`.

```ts
// features/movies/useInTheaterMovies.ts
export function useInTheaterMovies() {
  const { data: inTheaterMovies = [], isLoading, error } = useQuery<InTheaterMovie[]>({
    queryKey: ["inTheaterMovies"],
    queryFn: getInTheaterMovies,
  });
  return { inTheaterMovies, isLoading, error };
}
```

**Rule:** Use `enabled` to skip queries that require authentication. Use `select` to transform cached data without firing a second request — this is the derived state pattern.

```ts
// reuses the ["watchlistItems"] cache, transforms to Set<number> via select
const { data: watchlistIds = new Set<number>() } = useQuery({
  queryKey: ["watchlistItems"],
  queryFn: getWatchlist,
  select: (items) => new Set(items.map((item) => item.movie.tmdbId).filter(Boolean) as number[]),
  enabled: isAuthenticated,
});
```

---

### 4. `useXxx.ts` — Mutation hooks
Wrap mutations in `useMutation`. Always call `invalidateQueries` on success to keep the cache fresh.

```ts
// features/movies/useAddToWatchlist.ts
export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  const { mutate: addToWatchlist, isPending } = useMutation({
    mutationFn: (movie: WatchlistPayload) => addToWatchlistApi(movie),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlistItems"] }),
    onError: (error) => console.error("Error adding to watchlist:", error),
  });
  return { addToWatchlist, isPending };
}
```

**Rule:** Use the v5 object syntax for `invalidateQueries`: `{ queryKey: [...] }`.

---

### 5. Presentational components
Only render logic — no hooks (except `useId` or similar), no data fetching, no side effects. Receive props, return JSX.

```tsx
// features/movies/MovieGrid.tsx
export default function MovieGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-14">
      {children}
    </div>
  );
}
```

**Rule:** If a component would be useful in Storybook with no app context, it's presentational. Keep it that way. Put genuinely reusable presentational components (like `SectionHeading`) in `components/` instead of a feature folder.

---

### 6. Self-contained (smart) components
Call their own hooks. Own everything needed to render themselves. The caller only provides data.

```tsx
// features/movies/MovieCard.tsx
export default function MovieCard({ movie }: { movie: MovieCardData }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { watchlistIds } = useWatchlistIds();
  const { addToWatchlist } = useAddToWatchlist();
  // ... renders itself completely
}
```

**Contract:** Give me data, I handle the rest.

**Trade-off:** Self-contained components are tightly coupled to app context. `MovieCard` will always try to show a watchlist button — you can't drop it into a context-free environment. That's acceptable when the component is always used in the same app context.

---

### 7. Section components
Call hooks, handle loading/error states, normalize data into the shape their child components expect, render a self-contained section of the page.

```tsx
// features/movies/InTheaterMovieGrid.tsx
export default function InTheaterMovieGrid() {
  const { inTheaterMovies, isLoading, error } = useInTheaterMovies();

  if (isLoading) return <LoadingDiv />;
  if (error) return <ErrorDiv error={error} />;

  return (
    <MovieGrid>
      {inTheaterMovies.map((movie) => (
        <MovieCard key={movie.tmdbId} movie={{ ...normalized fields... }} />
      ))}
    </MovieGrid>
  );
}
```

**Rule:** This is where data normalization happens. Raw API fields (`poster_path`, `vote_average`) get mapped to the shape the component expects (`posterUrl`, `voteAverage`). Never leak raw API field names past this layer.

---

## Folder structure

```
client/src/
  features/
    movies/
      types.ts
      useInTheaterMovies.ts
      useDiscoverMovies.ts
      useWatchlistIds.ts
      useAddToWatchlist.ts
      MovieCard.tsx           ← smart
      MovieGrid.tsx           ← presentational
      WatchlistButton.tsx     ← presentational
      InTheaterMovieGrid.tsx  ← section (smart)
      DiscoverMovieGrid.tsx   ← section (smart)
    watchlist/
      types.ts
      useWatchlistItems.ts
      useWatchlistMutations.ts
      useActiveTab.ts
      useDeleteModal.ts
      useStatusChangeModal.ts
      WatchlistCard.tsx       ← smart
      ItemList.tsx            ← section (smart)
      TabStrip.tsx            ← smart
      DeleteDialog.tsx
      StatusChangeDialog.tsx
  services/
    watchlistService.ts
    movieService.ts
  components/               ← reusable presentational components
    SectionHeading.tsx
    Layout.tsx
  pages/                    ← thin orchestrators only
    MoviesPage.tsx
    WatchListPage.tsx
```

---

## Checklist for refactoring a page

1. **Identify responsibilities** — list every concern in the current page (data fetching, mutations, types, UI sub-components)
2. **Extract types** → `features/xxx/types.ts`
3. **Extract service functions** → `services/xxxService.ts`
4. **Extract query hooks** → `useXxx.ts` per data source
5. **Extract mutation hooks** → `useXxx.ts` per mutation
6. **Extract presentational components** → own files, no hooks
7. **Make leaf components self-contained** — call their own hooks internally
8. **Build section components** — fetch, normalize, render
9. **Slim the page** — if it has any logic, move it down

**The test:** can a new developer open the page file and understand the full layout in under 10 seconds? If yes, you're done.
