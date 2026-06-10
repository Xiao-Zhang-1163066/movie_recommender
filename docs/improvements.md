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

## Auth Migration

### Current problem
Safari (iOS) blocks the `jwt` httpOnly cookie on cross-origin requests (SWA → Container Apps on different domains). Every authenticated call on iPhone returns 401. Mac Chrome works because Chrome still allows `SameSite=None; Secure` cross-origin cookies; Safari's ITP does not.

### Phase 1 — Bearer token in localStorage (implement now)
Switch from cookie-based auth to a `Bearer` token sent in the `Authorization` header. Stored in `localStorage`.

**Why this fixes it:** `Authorization` headers are set deliberately by JS, never sent automatically by the browser — no cross-origin cookie restrictions apply.

**Trade-off:** `localStorage` is readable by JS (XSS risk). Mitigated by keeping token expiry short (7 days) and the fact that React JSX escapes output by default — XSS surface is small.

**Files to change (8):**
- `utils/generateToken.js` — remove `res.cookie()`, just return the token
- `middleware/authMiddleware.js` — read `Authorization: Bearer <token>` header instead of `req.cookies.jwt`
- `controller/authController.js` — update `logout` (no cookie to clear)
- `context/AuthContext.tsx` — init `isAuthenticated` from `localStorage` on mount; store/clear token on login/logout
- `services/authService.ts` — save token to `localStorage` after login/register; pass as `Bearer` on `getMe`
- `services/watchlistService.ts` — replace `credentials: "include"` with `Authorization: Bearer` header
- `services/movieService.ts` — same
- `services/chatService.ts` — same

### Phase 2 — Access token + refresh token with httpOnly cookie (future)
The proper long-term solution once SWA Standard tier is adopted (enables linked backend proxy — makes cookies first-party).

- **Access token** — 15 min expiry, stored in memory (React state). Gone on page refresh. XSS cannot steal it.
- **Refresh token** — 30 day expiry, stored in `httpOnly` cookie. XSS cannot steal it.
- **Silent refresh** — on 401, frontend calls `POST /api/auth/refresh`, gets a new access token, retries the original request transparently.
- **Token rotation** — each refresh issues a new refresh token and invalidates the old one (stored in DB).

**Why Phase 2 needs the proxy:** the refresh token cookie has the same cross-origin Safari problem. The SWA linked backend proxy makes all requests same-origin so the cookie is first-party.

**Extra backend work needed for Phase 2:**
- `POST /api/auth/refresh` endpoint
- `RefreshToken` table in Prisma schema (to support rotation + invalidation)
- Axios/fetch interceptor on frontend to handle silent refresh

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
