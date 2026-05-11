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
