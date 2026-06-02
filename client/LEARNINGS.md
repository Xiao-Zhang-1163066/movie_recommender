# Learnings — Frontend

## Phase 11 — Frontend Scaffold (Vite + React + Tailwind + shadcn/ui)

**What this module does**
Sets up a standalone React frontend in the `client/` folder, separate from the Express backend. Vite handles dev serving and bundling, Tailwind provides utility-first styling, and shadcn/ui copies accessible component source files directly into the project. A dev proxy forwards `/api/*` requests to the Express server so the browser never makes a cross-origin request.

**Key design decision**
The frontend lives in `client/` rather than being merged into the backend root. This separates concerns at the project level — different dependencies, different build tools, and the option to deploy frontend and backend independently (e.g. Vercel + Railway). The trade-off is two `package.json` files to maintain.

**One thing I found surprising**
shadcn's `init` command reads `tsconfig.json` directly and does not follow TypeScript `references` into `tsconfig.app.json`. Adding `paths` to `tsconfig.app.json` (correct for TypeScript) is not enough — shadcn won't see it. The fix is to set explicit `src/` paths in `components.json` so shadcn writes files to the right place without needing alias resolution.

**Interview Q&A**

Q: Why Vite instead of Create React App?
A: CRA is unmaintained and bundles everything upfront. Vite serves ES modules directly to the browser in dev — it only compiles what's actually requested, which is why cold starts are near-instant.

Q: What's the difference between shadcn/ui and a library like Material UI?
A: shadcn copies source files into your project — you own them and can modify anything. MUI ships a package you import and customize against its API. The trade-off with shadcn is that upstream updates aren't automatic; you'd need to manually re-add or patch components.

Q: How do you make API calls from a React dev server to an Express backend without CORS errors?
A: Configure a proxy in Vite's dev server. Requests to `/api/*` get forwarded to `localhost:3000` server-side, so the browser only ever sees one origin. No CORS because the browser never makes a cross-origin request.

## Phase 12 — React Router + Layout Route

**What this module does**
Sets up client-side routing for all eight pages using React Router v7. A pathless layout route wraps the six main pages, injecting a shared nav via `<Outlet />`. Auth pages (`/login`, `/register`) sit outside the layout so they render without the nav.

**Key design decision**
Auth pages are placed outside the layout route rather than inside it. This means they render with no nav, matching the standard UX pattern for auth flows (centered card, no distractions). Putting them inside would require conditionally hiding the nav, which is more fragile.

**One thing I found surprising**
`<Link>` and `<a href>` look similar but behave completely differently. `<a href>` triggers a full browser navigation — reloading `index.html` and re-booting React. `<Link>` uses the History API to swap the component client-side with no network request. Using `<a href>` for internal links is a common bug that kills SPA performance.

**Interview Q&A**

Q: What is a layout route and why use one?
A: A layout route wraps child routes with shared UI via `<Outlet />`. The nav stays mounted while only the outlet content swaps on navigation — no flicker, no re-mount. Without it you'd duplicate nav in every page component.

Q: Why are the login and register routes outside the layout route?
A: Auth pages have their own visual shell — a centered card with no nav. Placing them outside the layout route means they render independently with no inherited UI, which is the standard auth UX pattern.

Q: What's the difference between `<Link>` and `<a href>` in a React app?
A: `<Link>` uses the History API to update the URL client-side — React Router intercepts it and swaps the component without a network request. `<a href>` triggers a full browser navigation, reloading `index.html` and re-booting the entire React app.

## Phase 13 — Movies Page (TMDb API + data fetching)

**What this module does**
`MoviesPage` fetches now-playing movies from the TMDb API on mount and renders them in a responsive grid. `src/api/tmdb.ts` encapsulates all TMDb fetch logic — the component only calls named functions and doesn't know about URLs or API keys. The API key is stored in `client/.env` as `VITE_TMDB_API_KEY` and read via `import.meta.env`.

**Key design decision**
Data fetching lives in `src/api/tmdb.ts` rather than directly in the component. This separation means the component only handles rendering — if the TMDb URL or auth method changes, only the API file needs updating. It also makes the fetch logic reusable across multiple pages.

**One thing I found surprising**
`useEffect` callbacks cannot be `async`. React expects the callback to return either nothing or a cleanup function — an async function always returns a Promise, which React ignores and which breaks cleanup. The fix is to define an inner async function inside the effect and call it immediately.

**Interview Q&A**

Q: Why can't you make the `useEffect` callback itself async?
A: React expects `useEffect` to return either nothing or a cleanup function. An async function always returns a Promise — React doesn't know what to do with it, and cleanup breaks. The pattern is to define an inner async function inside the effect and call it immediately.

Q: Why use three separate `useState` calls instead of one state object?
A: Separate state means independent updates — setting `isLoading` doesn't risk stale data in `movies`. With one object you need `setState(prev => ({ ...prev, loading: false }))` every time, which is more verbose and easier to get wrong. Separate state is simpler at this scale.

Q: What's the difference between `(err as Error).message` and `err instanceof Error ? err.message : 'fallback'`?
A: `as Error` is a TypeScript cast — it tells the compiler to trust you, but if the thrown value isn't actually an Error (e.g. a string), you get a runtime crash. `instanceof Error` is a real runtime check that's safe regardless of what was thrown. Always prefer `instanceof`.

## Phase 14 — Movie Detail Page

**What this module does**
`MovieDetailPage` reads the `:id` URL param via `useParams`, fetches that specific movie from TMDb's `/movie/:id` endpoint, and displays the poster, title, genres, runtime, rating, overview, and a "Buy Tickets" button that navigates to the showtime picker.

**Key design decision**
`MovieDetail` extends the `Movie` interface rather than duplicating fields. The detail endpoint returns a superset of the list endpoint's data — `extends` makes the relationship explicit and keeps the type definitions DRY.

**One thing I found surprising**
Removing the `if (!movie) return null` guard doesn't cause a loading state — it causes a runtime crash. `movie` starts as `null`, and JSX immediately tries to access `movie.title`, throwing `Cannot read properties of null`. The guard order also matters: error check must come before the null check, otherwise an error state silently returns null instead of showing the error message.

**Interview Q&A**

Q: What does the `!` non-null assertion do and when is it unsafe?
A: `id!` tells TypeScript the value is definitely not undefined — it silences the type error without a runtime check. It's unsafe if you're wrong. Here it's safe because the route definition `/movies/:id` guarantees `id` is always present, but the explicit guard `if (!id) return null` is the safer production pattern.

Q: Why does the useEffect dependency array contain `[id]` instead of `[]`?
A: With `[]`, the effect only runs once on mount. If the user navigates from `/movies/550` to `/movies/680` without unmounting the component, the effect won't re-run and the old movie stays on screen. `[id]` re-runs the fetch whenever the id changes.

Q: What happens if you remove the `if (!movie) return null` guard?
A: The JSX immediately tries to access properties on `null` (e.g. `movie.title`), throwing a runtime error — not a loading state. React catches it and renders a blank screen or triggers an error boundary.

## Phase 15 — Showtime Picker

**What this module does**
`ShowtimesPage` reads the movie ID from the URL param, shows a `DatePicker` component (a row of day buttons), and filters the mock cinema list to show only cinemas that have sessions for that movie on the selected date. Clicking a session time navigates to the Cinema Detail page with the movie ID passed as a query param.

**Key design decision**
Session times are derived state — computed from `sessions[cinemaId][movieId][date]` on every render rather than stored in `useState`. This means they can never be stale. The `.filter().map()` chain keeps filtering and rendering as separate concerns, though computing `times` twice is a known trade-off. At scale, `flatMap` into `{ cinema, times }` objects avoids the double computation.

**One thing I found surprising**
After filtering cinemas to only those with sessions, the `times.length === 0` check inside `.map()` becomes dead code — the filter already guarantees times exist. Leaving it in is misleading; removing it makes the intent clearer.

**Interview Q&A**

Q: Why store selected date in `useState` but derive session times from it rather than storing them too?
A: Storing derived data creates a sync problem — two sources of truth that can get out of step. Computing times directly from the selected date means they can never be stale: one source of truth, always correct.

Q: You compute `times` twice — once in `.filter()` and once in `.map()`. How would you fix this at scale?
A: Use `flatMap` to build `{ cinema, times }` objects in one pass, filtering out empty times in the same step. Then `.map()` over the result — each entry already has `times` computed with no double lookup.

Q: What does optional chaining (`?.`) do in `sessions[cinema.id]?.[id!]?.[selectedDate]`?
A: It short-circuits and returns `undefined` if any key in the chain is missing, instead of throwing `Cannot read properties of undefined`. Without it, a cinema or movie ID missing from the sessions object crashes the page.

## Phase 16 — Cinemas Page

**What this module does**
`CinemasPage` imports a local mock array from `src/data/cinemas.ts` and renders it as a responsive card grid. Each `CinemaCard` wraps a shadcn `Card` in a React Router `<Link>`, navigating to `/cinemas/:id` on click. No async, no loading state — the data is static and available immediately.

**Key design decision**
Cinema data comes from a local mock array rather than a database fetch. No free global cinema API exists, and seeding a real cinema database is out of scope for an MVP. The mock data shape (`id`, `name`, `suburb`, `screens`) mirrors the Prisma `Cinema` model exactly — swapping in a real API call later is a one-component change.

**One thing I found surprising**
TypeScript interfaces are erased at compile time — they don't exist in the JavaScript the browser receives. Vite compiles files in isolation using esbuild, so a plain `import { Cinema }` can cause a runtime error even though the TypeScript editor shows no warning. The fix is `import type { Cinema }`, which explicitly marks the import as type-only so both TypeScript and Vite know to erase it safely.

**Interview Q&A**

Q: Why use `import type` instead of a regular `import` for a TypeScript interface?
A: TypeScript interfaces don't exist at runtime — they're erased during compilation. Vite compiles files in isolation and can't always tell a plain import is type-only. `import type` makes it explicit: the compiler and bundler both know to erase it, preventing a runtime "module does not provide an export" error.

Q: `CinemaCard` accepts `cinema: Cinema` as a single prop. When would you pass fields individually instead?
A: Individual props make sense when a component is general-purpose and could receive data from multiple different types — it documents exactly what the component needs. A single object prop is better when the component is always tied to one specific type, as it's less verbose at the call site and the interface is the single source of truth. The performance difference is negligible either way.

## Phase 17 — Cinema Detail Page

**What this module does**
`CinemaDetailPage` fetches all movies showing at a cinema using `Promise.all`, displays them as a clickable poster row, and shows session times for the selected movie on the selected date. Selecting a new movie resets the date to today. If no sessions exist on the selected date, a "Check another date" button jumps to the next available date derived from the sessions data.

**Key design decision**
`cinemaSessions`, `sessionTimes`, `allTmdbIds`, and `nextDate` are all computed directly in the component body rather than stored in `useState`. These are derived state — values that can be computed from existing state and static data. Storing them in state would create two sources of truth that could fall out of sync. Recomputing them on every render is correct and fast because the input arrays are tiny (2–4 items).

**One thing I found surprising**
`useState(initialValue)` only reads its initial value once — on first mount. Query param changes via React Router client-side navigation do not remount the component if the route's `:id` param stays the same, so `useState` won't re-initialise. The robust fix is a `useEffect` that syncs the query param to state: `useEffect(() => { setSelectedTmdbId(tmdbMovieId); }, [tmdbMovieId])`.

**Interview Q&A**

Q: When would you use `useMemo` for derived values like `sessionTimes` or `nextDate`?
A: Only when the computation is measurably expensive or when the result is passed as a prop to a memoized child and referential stability matters. `useMemo` has its own overhead — storing and comparing previous results. For O(n) operations on 2–4 items it can be slower than just recomputing. The React team's guidance: don't memoize until you can measure a problem.

Q: `useState(tmdbMovieId)` initialises selected movie from the query param. What breaks if the component stays mounted and the query param changes?
A: `useState` ignores the new initial value — it only reads it on first mount. If React Router keeps the component mounted (same `:id` param, different query param), `selectedTmdbId` stays at the old value and the pre-selection silently breaks. The fix is `useEffect(() => { setSelectedTmdbId(tmdbMovieId); }, [tmdbMovieId])` to re-sync whenever the param changes.

Q: Why use `Promise.all` instead of sequential awaits to fetch movie details?
A: Sequential awaits fetch one movie, wait for it, then fetch the next — total time is the sum of all requests. `Promise.all` fires all fetches in parallel and resolves when the last one completes — total time is the slowest single request. For 4 movies, `Promise.all` is roughly 4x faster.

## Phase 18 — React Query + Self-Contained Components Refactor

**What this module does**
The watchlist feature was refactored to use React Query for server state and URL params for shared UI state. Each component now owns its data and logic via custom hooks — `WatchlistCard` calls its own mutation hooks and renders its own dialogs inline. `WatchlistPage` is reduced to a layout shell with no hooks or props.

**Key design decision**
`activeTab` is stored in the URL (`?tab=watchlist`) via `useSearchParams` rather than in a shared `useState` or context. Both `TabStrip` and `ItemList` call `useActiveTab()` independently and stay in sync because they read from the same URL — no parent needed to coordinate them. This is the URL-as-state pattern: it also makes the active tab bookmarkable and shareable for free.

**One thing I found surprising**
Calling `useWatchlistMutations()` inside every `WatchlistCard` does not create 10 conflicting mutation instances. Each `useMutation` call is independent, but they all invalidate the same `["watchlistItems"]` query key on success. React Query deduplicates the refetch — only one network request fires regardless of how many cards triggered invalidation.

**Interview Q&A**

Q: What's the difference between server state and UI state? Give an example of each.
A: Server state is data that lives on the backend — it's fetched async, can be stale, and is shared across the app. `watchlistItems` is server state, managed by React Query. UI state lives only in the browser, is synchronous, and is local to a feature — `activeTab`, `pendingChange`, and `pendingRating` are UI state managed by `useState` or URL params.

Q: Why did you move `StatusChangeDialog` and `DeleteDialog` inside `WatchlistCard`?
A: Co-location — keep logic as close as possible to where it's used. The card now brings everything it needs with it. You can drop it onto any page without the parent needing to know about delete confirmations or status change modals. The pattern is called co-location and it's what makes components reusable.

Q: You call `useActiveTab()` in both `TabStrip` and `ItemList`. Could they get out of sync?
A: No. Both hooks read from `useSearchParams` — the same URL. When `TabStrip` calls `setSearchParams`, React Router updates the URL and re-renders every component reading that param. There's one source of truth and it's the URL.
