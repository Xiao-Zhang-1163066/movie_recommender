# UX & Robustness Improvements

## UX Gaps (Frontend)

### Quick wins — backend already exists, just UI missing

- [ ] **Remove from Watchlist button** — `DELETE /api/watchlist/:id` is wired up but there's no button in `WatchListPage.tsx`
- [ ] **Notes field** — `WatchlistItem.notes` exists in the schema and is returned by the API, but there's no UI to read/edit it
- [ ] **Movie posters + metadata on Watchlist** — each card only shows title and status; the `movie` relation includes `posterUrl` but it's not rendered

### Medium effort

- [ ] **Search/filter on MoviesPage** — no way to search the movie list; everything is fetched at once with no filter
- [ ] **Add to Watchlist on MovieDetailPage** — `MoviesPage` has the button but `MovieDetailPage` doesn't; users expect it there
- [ ] **Skeleton loaders** — every page shows plain "Loading..." text; shadcn has a `Skeleton` component you could drop in

---

## Robustness Gaps (Backend)

- [ ] **Rate limiting on `/api/chat`** — calls Gemini on every request with no throttle; one user could burn the quota (`express-rate-limit`)
- [ ] **Pagination on `GET /movies`** — works fine now but will break as the DB grows; add `?page=` and `?limit=` query params
- [ ] **Unguarded async in some controllers** — `movieController.js` `getAllMovies` / `getMovieById` have no try-catch (Express 5 auto-catches, but explicit error shaping is missing)
- [ ] **No global React error boundary** — an unhandled throw in any component crashes the whole page with a blank white screen
- [ ] **JWT expiry not handled on the frontend** — when the cookie expires, API calls silently return 401 and the UI shows an error string instead of redirecting to login

---

## Priority Order

| # | Task | Effort |
|---|------|--------|
| 1 | Remove button + notes UI on WatchlistPage | ~1 hr |
| 2 | Rate limiting on `/api/chat` | ~30 min |
| 3 | Pagination on `GET /movies` | ~1 hr |
| 4 | Add to Watchlist on MovieDetailPage | ~30 min |
| 5 | React error boundary | ~30 min |
| 6 | 401 → redirect to login | ~30 min |
| 7 | Skeleton loaders | ~1 hr |
