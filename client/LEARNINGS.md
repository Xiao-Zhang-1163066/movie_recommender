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
