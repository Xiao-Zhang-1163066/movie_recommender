# MoviesPage Refactor Roadmap

Migrating `MoviesPage.tsx` from a monolithic component to the feature-folder pattern used by WatchlistPage.

## Target structure

```
client/src/features/movies/
  types.ts                  — InTheaterMovie, WatchlistPayload
  movieService.ts           — (lives in services/movieService.ts to match watchlistService.ts)
  useInTheaterMovies.ts     — useQuery wrapping the backend
  useDiscoverMovies.ts      — useQuery wrapping the TMDB call
  useWatchlistIds.ts        — useQuery: which tmdbIds are already saved
  useAddToWatchlist.ts      — useMutation: POST /api/watchlist
  MovieCard.tsx             — the card component
  WatchlistButton.tsx       — the button component
  SectionHeading.tsx        — (lives in components/SectionHeading.tsx — reusable across pages)
  MovieGrid.tsx             — renders a labeled grid of MovieCards

client/src/pages/MoviesPage.tsx — slimmed down to ~20 lines
```

## Progress

- [x] `types.ts` — InTheaterMovie, WatchlistPayload
- [x] `services/movieService.ts` — getInTheaterMovies, addToWatchlist
- [x] `useInTheaterMovies.ts` — useQuery
- [x] `useDiscoverMovies.ts` — useQuery
- [x] `useWatchlistIds.ts` — useQuery
- [x] `useAddToWatchlist.ts` — useMutation
- [x] `MovieCard.tsx`
- [x] `WatchlistButton.tsx`
- [x] `components/SectionHeading.tsx`
- [x] `MovieGrid.tsx`
- [x] `MoviesPage.tsx` — slim orchestrator
