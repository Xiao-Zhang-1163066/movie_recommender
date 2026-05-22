# Learnings

## Phase 1 — Auth Middleware

**What this module does**
A middleware function that runs before protected route handlers. It reads a JWT from the request cookie, verifies it, looks up the user in the database, and attaches them to `req.user` so route handlers know who is making the request.

**Key design decision**
Middleware is used instead of putting auth logic in every route handler. This keeps routes clean and makes it easy to protect any route by just adding `protect` as a parameter.

**One thing I found surprising**
`req.cookies` is undefined by default in Express — you need the `cookie-parser` package and `app.use(cookieParser())` in `server.js` before cookies are accessible.

**Interview Q&A**

Q: What's the difference between authentication and authorization?
A: Authentication is verifying who you are (checking the JWT). Authorization is verifying what you're allowed to do (checking if you own the resource). Middleware handles authentication; the controller handles authorization.

---

## Phase 2 — Movie Controller

**What this module does**
Handles all movie CRUD operations (list, get, create, update, delete) by talking to the database through Prisma. Protected routes use `req.user` (set by auth middleware) to enforce that only the creator of a movie can update or delete it.

**Key design decision**
For update and delete, we fetch the movie first, then check ownership — rather than querying `WHERE id = ? AND createdBy = ?`. This lets us return a proper 404 (movie doesn't exist) vs 403 (movie exists but you don't own it), which gives the client more useful information.

**One thing I found surprising**
Movie IDs are UUIDs (strings like `"a1b2-c3d4-..."`), not integers. Calling `parseInt()` on a UUID returns `NaN`, which causes a silent Prisma error. Always check your schema's ID type before parsing params.

**Interview Q&A**

Q: What's the difference between a 401 and a 403 response?
A: 401 means the user isn't authenticated — we don't know who they are (missing or invalid token). 403 means the user is authenticated but not allowed to perform this action — we know who they are, but they don't have permission.

Q: Why fetch the movie first and then check ownership, instead of querying WHERE id = ? AND createdBy = ??
A: Fetching first lets you distinguish between two different failure cases — 404 (movie doesn't exist) vs 403 (movie exists but you don't own it). A combined query just returns nothing, and you can't tell the client why it failed.

Q: How would you check that the logged-in user is the creator of a movie before letting them delete it?
A: Fetch the movie by ID first, then compare `movie.createdBy` with `req.user.id`. If they don't match, return 403.

---

## Phase 3 — Movie Routes

**What this module does**
Maps HTTP methods and URL patterns to controller functions. Applies the `protect` middleware to routes that require a logged-in user.

**Key design decision**
Middleware is passed as an argument between the route path and the handler — `router.post("/", protect, createMovie)`. Express runs them in order, so `protect` can block the request before `createMovie` ever runs.

**One thing I found surprising**
Order of middleware arguments is critical. Reversing `protect` and `createMovie` would mean the handler runs before auth is checked — the middleware chain goes strictly left to right.

**Interview Q&A**

Q: What is middleware doing in `router.post("/", protect, createMovie)` and why does order matter?
A: `protect` is an auth middleware that verifies the JWT and attaches `req.user`. Express runs arguments left to right, so `protect` runs first. If the token is invalid it returns 401 and the chain stops — `createMovie` never runs. Reversing the order would let anyone call the handler before being authenticated.

Q: What does `next()` do inside a middleware function?
A: After the middleware finishes its work with `req` and `res`, calling `next()` passes control to the next function in the chain — either another middleware or the final route handler.

Q: What happens if middleware never calls `next()` and never sends a response?
A: The request hangs forever. The app keeps running but that specific request never resolves — the client just waits until it times out. This is called a "hanging request" and is a common bug from a missing `return` or forgotten `next()` call.

---

## Phase 4 — Watchlist Controller

**What this module does**
Handles all watchlist operations for the logged-in user — get their list, add a movie, update status/rating/notes, and remove an item. Each item links a user to a movie with extra metadata (status, rating, notes). All routes are protected and scoped to `req.user.id`.

**Key design decision**
Before creating a watchlist item, we verify the movie exists first and return 404 if not. This gives the client a meaningful error instead of a cryptic database foreign key violation. The duplicate check is handled by catching Prisma's `P2002` unique constraint error.

**One thing I found surprising**
The Prisma model name is `WatchlistItem` in the schema, but Prisma generates it as `prisma.watchlistItem` (camelCase) in the client. Using `prisma.watchlist` silently fails — always match the exact camelCase model name.

**Interview Q&A**

Q: What happens if the client adds the same movie to their watchlist twice?
A: Prisma throws an error with code `P2002` (unique constraint violation) because of the `@@unique([userId, movieId])` constraint in the schema. We catch that specific error and return a 400 instead of letting it crash.

Q: What is `include: { movie: true }` doing in `getWatchlist`?
A: It tells Prisma to JOIN the related movie record and nest it inside each watchlist item. Without it, the response only contains the `movieId` field and the client would need a separate request to get movie details — inefficient. It's Prisma's equivalent of a SQL JOIN.

Q: When should you use `findUnique` vs `findFirst`?
A: `findUnique` is for fields marked `@id` or `@unique` in the schema — it's faster because the database uses an index. `findFirst` works on any field but scans the table. When searching by ID, always prefer `findUnique`.

Q: Why check if the movie exists before creating the watchlist item instead of just letting the DB throw an error?
A: A missing movie would cause a foreign key violation — a cryptic database error. Checking first lets you return a clean 404 with a useful message. Same "fetch first" pattern as the movie controller's ownership check.

---

## Phase 5 — Watchlist Routes

**What this module does**
Maps HTTP methods and URL patterns to the watchlist controller functions. All four routes are protected — the watchlist is fully private, unlike movies where GET was public.

**Key design decision**
Every route applies `protect` middleware because watchlist data is personal. There's no public access — you must be logged in to view or modify any watchlist.

**One thing I found surprising**
The route file just wires things up — no logic lives here. All the real decisions (auth checks, DB queries, error handling) are in the controller. Routes are intentionally thin.

**Interview Q&A**

Q: Why are all watchlist routes protected when some movie routes are public?
A: A movie is shared content anyone can browse. A watchlist is personal data — it only makes sense in the context of a specific user. There's no use case for reading someone else's watchlist anonymously.

Q: What's the role of a route file vs a controller file?
A: The route file maps URLs and HTTP methods to handler functions and decides which middleware applies. The controller contains the actual business logic — DB queries, validation, response formatting. Keeping them separate makes the code easier to read and test.

---

## Phase 6 — Input Validation with Zod

**What this module does**
Validates incoming request bodies before they reach the controller. A reusable `validate` middleware factory takes a Zod schema, runs `schema.parse(req.body)`, and returns a 400 with clear error messages if validation fails. Schemas are defined per-resource in the `validators/` folder.

**Key design decision**
`validate` is a middleware factory — a function that returns a function — so it can be reused with different schemas across routes. This is the closure pattern: the inner middleware function remembers the `schema` argument passed to the outer function.

**One thing I found surprising**
`updateMovieSchema` doesn't need to be written from scratch — `createMovieSchema.partial()` makes all fields optional while keeping all the same validation rules. Similarly, `updateWatchlistSchema` uses `.omit({ movieId: true }).partial()` to remove a field and make the rest optional in one line.

**Interview Q&A**

Q: Walk me through what happens when a request hits `router.post("/movies", protect, validate(createMovieSchema), createMovie)`.
A: Express runs middleware left to right. First `protect` checks the JWT — if invalid it returns 401 and stops. If valid, `validate(createMovieSchema)` runs `schema.parse(req.body)` — if the body is invalid it returns 400 with error messages and stops. If both pass, `createMovie` runs and hits the database.

Q: What's the difference between `schema.parse()` and `schema.safeParse()`?
A: `parse()` throws a ZodError on failure — you need try/catch. `safeParse()` never throws; it returns `{ success: true, data }` or `{ success: false, error }`. Use `parse()` inside try/catch blocks. Use `safeParse()` when you want to handle the result inline without exceptions.

Q: How would you extend the `validate` middleware to also validate `req.params` or `req.query`?
A: Add a second `target` argument defaulting to `"body"`, then use `schema.parse(req[target])`. Since `req.body`, `req.params`, and `req.query` are all properties on `req`, passing the key as a string lets you point the validator at any of them: `validate(idSchema, "params")` or `validate(querySchema, "query")`.

Q: Why is `validate` a factory function (a function that returns a function) instead of a regular middleware?
A: Regular middleware always does the same thing — it can't accept configuration. A factory lets you pass a schema in and get back a middleware with that schema baked in via closure. This makes `validate` reusable across all routes with different schemas.

---

## Phase 7 — Housekeeping & Project Rename

**What this phase does**
Renames the project from "movie_recommender" to "AI Movie Mate", fixes the session duration from 1 hour to 30 days, and adds CORS middleware so the future React frontend can call the API.

**Key design decision**
CORS must be added before the first feature phase because a frontend running on `localhost:5173` calling an API on `localhost:3000` is cross-origin — the browser will block those requests by default. Fixing this now means Phase 5 (frontend) has no blockers on day one.

**One thing I found surprising**
`credentials: true` is required in the CORS config alongside the `origin` setting. Without it, the browser strips cookies from cross-origin requests — meaning the JWT cookie would never be sent, breaking auth for every protected route.

**Interview Q&A**

Q: Why do we keep a CLAUDE.md file in a project?
A: It gives Claude Code a persistent understanding of the codebase at the start of every session — architecture, commands, known gotchas. Without it, you'd have to re-explain the project every time. It also saves tokens because a concise CLAUDE.md is much shorter than a full codebase walkthrough.

Q: Why does the Epic 4 redesign use one `WatchlistItem` table for both "Want to Watch" and "Watched" lists instead of two separate tables?
A: One table keeps writes simple and avoids a data migration problem — when a movie moves from PLANNED to COMPLETED you just update the `status` field. Two tables would require deleting from one and inserting into the other, with risk of data loss if one step fails. Filtering by `status` at query time gives you the two list views without extra complexity.

Q: What problem does CORS solve, and why is it relevant when building a separate frontend and backend?
A: Browsers block cross-origin requests by default — a page on `localhost:5173` cannot call an API on `localhost:3000` without the server's permission. CORS headers tell the browser which origins are allowed. Without it, every API call from the React frontend would be rejected before it even reached the server.

---

## Phase 8 — Cinema & Session Schema + Sessions Route

**What this module does**
Adds two new Prisma models (`Cinema` and `Session`) to the database schema and scaffolds a public `GET /sessions` endpoint. Sessions represent individual screenings of a movie at a cinema. The endpoint accepts optional `movieId`, `cinemaId`, and `date` query params to filter results. The table is empty until the Python scraper populates it in a later phase.

**Key design decision**
The `Session` model has two composite indexes: `@@index([movieId, startsAt])` and `@@index([cinemaId, startsAt])`. Without them, queries like "all sessions for this movie today" do a full table scan. With them, Postgres uses a B-tree index to jump directly to the matching rows, already sorted by time — the difference between 2ms and 2 seconds at real data volumes.

**One thing I found surprising**
When the Prisma schema uses a custom `output` path (`output = "../generated/prisma"`), `prisma generate` writes the client there — not to the default `@prisma/client` location. Importing from `"@prisma/client"` gives you the old client with no new models. You must import from the custom output path: `"../generated/prisma/index.js"`.

**Interview Q&A**

Q: Why does `GET /sessions` return 200 with an empty array instead of 404 when there's no data?
A: 404 means the resource doesn't exist. The `/sessions` endpoint exists — it just has no data yet. An empty array is a successful response. 404 is for a specific resource that can't be found (e.g. `GET /sessions/:id` with an unknown ID). Collection endpoints always return 200; the collection is real, it's just empty.

Q: What is a composite index and why does `Session` need one?
A: A composite index covers two columns together. `@@index([movieId, startsAt])` lets Postgres answer "give me all sessions for movie X ordered by start time" using an index rather than a full table scan. It works because the query always filters by the first column (`movieId`) and range-filters or sorts by the second (`startsAt`). At 100,000 session rows the difference is milliseconds vs seconds.

Q: What's the difference between a relation field and a foreign key field in Prisma?
A: A foreign key field like `cinemaId String` is a real database column — it stores the UUID of the related cinema. A relation field like `sessions Session[]` on `Cinema` is virtual — it exists only in Prisma's type layer, creates no column, and is just a convenience handle that tells Prisma how to JOIN when you use `include: { sessions: true }`.

---

## Phase 9 — Basic /chat endpoint

**What this module does**
A protected `POST /chat` endpoint that accepts a conversation history (`messages` array) from the client, forwards it to Gemini via the Vercel AI SDK, and returns the model's response as JSON. It is the foundation for the agentic loop added in Phase 4.

**Key design decision**
The client sends the full conversation history on every request rather than the server storing it. LLMs are stateless — Gemini has no memory between calls, so context must be included in each request. Keeping history on the client keeps the server simple and avoids a session storage layer. Server-side persistence is a valid production pattern but adds complexity (session IDs, a storage layer, cleanup logic) that isn't needed yet.

**One thing I found surprising**
The Vercel AI SDK returns an object from `generateText`, not a string. The response text lives at `result.text`. A cleaner pattern is to destructure it directly: `const { text } = await generateText(...)` — then `res.json({ text })` works without an intermediate variable.

**Interview Q&A**

Q: Why does `createGoogleGenerativeAI` live outside the controller function instead of inside it?
A: It initialises the provider once at module load rather than on every request. Creating a new provider instance per request is wasteful — it re-reads the API key and allocates objects unnecessarily. This is the module-level singleton pattern: expensive setup happens once, and the result is reused across all calls.

Q: Why does the client send the full conversation history on every request instead of the server remembering it?
A: LLMs are stateless — each call to `generateText` is independent and the model has no memory of prior requests. The only way it gets context is if you include it in the current call. The client owns the conversation array, appends each new turn, and sends the whole thing every time. Server-side history storage is a real pattern but requires session IDs, a storage layer, and cleanup logic — not worth the complexity at this stage.

Q: What is the difference between `generateText` and `streamText`, and why use `generateText` here?
A: `generateText` waits for the full response and returns it all at once — simple request/response. `streamText` sends the response token by token via SSE so the client sees words appearing in real time. We use `generateText` for Phase 3 because it is simpler to test and reason about. `streamText` becomes important in Phase 4 when the agentic loop adds tool calls that can take several seconds — streaming prevents the UI from appearing frozen.

---

## Phase 10 — Agentic loop + streaming

**What this module does**
Upgrades the `/chat` endpoint from a simple passthrough into a full agentic loop. The model can now call 6 tools — `get_user_watchlist`, `get_taste_profile`, `mark_watched`, `search_movies`, `get_movie_details`, `get_showtimes` — and loop through multiple steps before producing a final text response. Responses stream token by token via SSE so the client sees output immediately.

**Key design decision**
Database tools (`get_user_watchlist`, `get_taste_profile`, `mark_watched`) are defined inside the `chat` function rather than at module level. This is the closure pattern — the `execute` functions close over `userId` extracted from `req.user`, so they always query for the correct user without needing access to `req`. Module-level tools can't do this because `userId` is per-request, not static.

**One thing I found surprising**
Tool use creates two different ID spaces for movies. `search_movies` returns TMDB integer IDs (e.g. `27205`), but our `Session` table stores `movieId` as a UUID referencing our own database. Passing a TMDB ID to `get_showtimes` would silently return no results. The fix is a mapping layer — a `tmdbId` field on the `Movie` model so you can resolve the local UUID from the TMDB ID before querying sessions.

**Interview Q&A**

Q: Who actually executes a tool when the model "calls" it — Gemini/Llama or your server?
A: Your server. The model returns structured JSON describing which tool to call and with what arguments. The Vercel AI SDK reads that JSON, finds the matching function you defined, runs it on your server, and feeds the result back to the model as a new message. The model never touches your code or your database directly.

Q: Why are the database tools defined inside the `chat` function rather than at module level?
A: They need `userId` to scope queries to the logged-in user, and `userId` comes from `req.user` which is per-request. By defining the tools inside `chat`, the `execute` functions close over `userId` — they capture the variable from the outer scope and remember it. This is the closure pattern. Module-level tools have no access to request state.

Q: What does `stopWhen: stepCountIs(5)` protect against?
A: An infinite tool-calling loop. Without a limit, a model that keeps calling tools (due to a bug, a bad prompt, or a confused reasoning loop) would run forever, burning API credits and never responding. `stopWhen: stepCountIs(5)` caps the loop at 5 steps and forces a final response.

Q: `search_movies` returns TMDB IDs but `get_showtimes` queries our database by UUID. What problem does this cause and how would you fix it?
A: The agent would pass a TMDB integer ID to `get_showtimes`, which queries `Session.movieId` — a UUID referencing our own `Movie` table. The query silently returns nothing. The fix is to add a `tmdbId` field to the `Movie` model so `get_showtimes` can first look up the local UUID from the TMDB ID before querying sessions.

---

## Phase 18 — Chat UI with SSE Streaming

**What this module does**
A React page that drives the agentic chat experience. It owns the conversation history in state, POSTs the full message array to `/api/chat` on every send, and reads the server's streaming response chunk by chunk via `response.body.getReader()`. As chunks arrive, a temporary "streaming" bubble updates in real time; when the stream closes, the completed text moves into the permanent message list.

**Key design decision**
Two pieces of state for one piece of content: `streamingText` (a growing string while the response is in flight) and `messages` (the array of completed turns). The streaming bubble and the message list render the same content but at different lifecycle stages — one is temporary, one is permanent. When the stream ends, the same render cycle pushes the completed text into `messages` and clears `streamingText`, so the temporary bubble vanishes and the permanent message appears seamlessly. Trying to manage this with a single state would require either rewriting the last message in place on every chunk (more re-renders, more complexity) or buffering everything until done (no live streaming effect).

**One thing I found surprising**
The Vite proxy does **not** strip the matching prefix by default. `{ "/api": "http://localhost:3000" }` forwards `/api/chat` to `http://localhost:3000/api/chat` — including the `/api` prefix — so a backend mounted at `/chat` returns 404. You need an explicit `rewrite: (path) => path.replace(/^\/api/, "")` to strip it. This is the opposite of how the Next.js `rewrites` config works, which is why people get caught out.

**Interview Q&A**

Q: Why use `fetch` + `response.body.getReader()` instead of `axios` for the streaming response?
A: `axios` buffers the entire response before resolving the promise — fine for JSON, but it destroys the streaming effect because the user sees nothing until the full response arrives. Streaming requires access to the raw `ReadableStream` on `response.body`, which only the native `fetch` API exposes. The reader's `read()` loop yields chunks as they arrive over the wire, which is what enables the token-by-token "typewriter" UX.

Q: Why does `sendMessage` build `updatedMessages` as a local variable instead of calling `setMessages` and then reading `messages` directly in the `fetch` body?
A: `setMessages` is asynchronous — it schedules a re-render rather than updating immediately. Within the same function call, `messages` is still the old array (a stale closure). If you read it in the `fetch` body, you'd send the conversation history without the user's most recent message, and the AI would have no idea what was just asked. Building `updatedMessages` as a local variable and passing it both to `setMessages` and to `fetch` ensures both see the same complete array.

Q: Why is `assistantMessage` declared with `let`, and what's the difference between mutating the variable and mutating the string?
A: `let` allows reassignment, which is required because `assistantMessage += chunkText` reassigns the variable on every chunk. The string itself isn't mutated — strings in JavaScript are immutable — each `+=` creates a brand new string and points the variable at it. `const` would block the reassignment and crash on the first chunk. The general rule: `const` by default, `let` only when reassignment is required (accumulators, counters, loop-mutated state).

Q: While streaming, the user sees the response building up word by word. When the stream finishes, the words don't flicker or disappear — they stay on screen and move into the message list. Walk through the exact state changes that make this transition seamless.
A: During streaming, `streamingText` grows chunk by chunk and the JSX renders `{streamingText && <div>...</div>}` as a temporary bubble. `messages` does not yet contain the assistant turn. When `reader.read()` returns `done: true`, two `setState` calls happen synchronously: `setMessages(prev => [...prev, { role: "assistant", content: assistantMessage }])` and `setStreamingText("")`. React batches them into a single re-render. After that render, `messages` contains the completed turn (rendered as a normal message) and `streamingText` is empty (so the conditional bubble renders nothing). The temporary bubble disappears and the permanent message appears in the same frame, with identical text and styling — so visually nothing jumps.

---

## Phase 19 — Login & Register Pages

**What this module does**
Two form pages that let users create an account and sign in. Each POSTs credentials to the backend auth routes. On success the server sets an httpOnly `jwt` cookie via `Set-Cookie` and the page redirects to `/movies`. On failure the server's error message is displayed inline. The pages are outside the `<Layout />` route so they render full-screen without the nav bar.

**Key design decision**
Auth is handled via httpOnly cookies rather than storing the JWT in `localStorage`. The frontend never reads or touches the token — the browser stores it and attaches it automatically to every subsequent request. This is safer than `localStorage` because JavaScript cannot access httpOnly cookies, so an XSS attack cannot steal the token. The tradeoff is that `credentials: "include"` must be set on every `fetch` call, and the backend must configure CORS with `credentials: true` and a specific origin (not a wildcard).

**One thing I found surprising**
`fetch` does not send or accept cookies by default on cross-origin requests. Without `credentials: "include"`, the browser silently ignores the `Set-Cookie` header in the login response — the cookie is never stored and every protected route returns 401. This is the single most common reason auth "doesn't work" after login.

**Interview Q&A**

Q: What does `credentials: "include"` do, and what happens if you leave it out?
A: It tells the browser to include cookies in the request and to store any `Set-Cookie` headers from the response. Without it, `fetch` ignores `Set-Cookie` entirely — the JWT cookie is never stored and every subsequent request to a protected route returns 401. It's required even when Vite proxies the request in dev, because in production the frontend and backend often live on different origins.

Q: Your login form uses `type="email"` and `required` on its inputs. What's the advantage over validating in JavaScript, and why isn't it enough on its own?
A: HTML5 attributes give free validation with built-in UX — the browser shows its own error tooltip, blocks form submission, and `handleSubmit` never runs. Zero validation code required. The limit is that browser validation is trivially bypassed via devtools, so it's a convenience for honest users, not a security guarantee. The real safety net is server-side Zod validation, which can't be bypassed from the client.

Q: After a successful login, `navigate("/movies")` switches pages without a full page reload. How does React Router make that work?
A: React Router listens to the browser's History API (`window.history.pushState`). Calling `navigate("/movies")` updates the URL in the address bar without a network request, then React Router looks up which component matches `/movies` in the `<Routes>` tree and re-renders it inside `<Outlet />`. No HTML is fetched from the server — it's a local JavaScript re-render triggered by a URL change.

Q: Why store the JWT in an httpOnly cookie instead of localStorage?
A: localStorage is readable by any JavaScript on the page — an XSS attack can steal the token with one line of code. httpOnly cookies are invisible to JavaScript (`document.cookie` doesn't show them), so even if an attacker injects a script, they can't read the token. The browser also attaches cookies automatically on every request, so you don't have to manually add an `Authorization` header everywhere. The tradeoff is CSRF — cookies are sent automatically on cross-site requests too, which an attacker can exploit. The fix is the `SameSite=Strict` or `SameSite=Lax` cookie attribute, which tells the browser not to send the cookie on requests initiated from other sites.

---

## Phase 20 — Auth Context + Protected Routes

**What this module does**
A React Context (`AuthContext`) that makes auth state — `isAuthenticated`, `login`, `logout` — available to every component in the tree without prop drilling. On mount, the provider calls `GET /api/auth/me` to check if a valid JWT cookie exists. `login()` and `logout()` update the state immediately so the UI reacts without a page reload. A `ProtectedRoute` component uses the context to guard routes — rendering `<Outlet />` for authenticated users or redirecting to `/login` for everyone else.

**Key design decision**
Auth state lives in React Context rather than in a parent component or global store like Redux. Context is the right tool here because auth state is genuinely global — the nav bar, protected routes, and individual pages all need it — but it doesn't change frequently, so the performance cost of context re-renders is negligible. A global store would add boilerplate (actions, reducers, selectors) with no real benefit for a single boolean flag.

**One thing I found surprising**
The frontend can't read the JWT to check auth status because httpOnly cookies are invisible to JavaScript — `document.cookie` doesn't list them. The only way to check if the user is logged in is to ask the server via `GET /api/auth/me`. If the cookie is present and valid, the server returns 200; otherwise 401. The 401 on page load (when not logged in) is expected behaviour, not an error.

**Interview Q&A**

Q: Why does `AuthProvider` call `GET /api/auth/me` on mount instead of just reading `document.cookie` to check if the JWT exists?
A: httpOnly cookies are intentionally hidden from JavaScript — `document.cookie` doesn't list them. That's the security point: even if an attacker injects a script via XSS, they can't read the token. The only way to verify auth status is to ask the server, which can read the cookie directly from the request headers.

Q: The `checkAuth` `useEffect` has an empty dependency array `[]`. What does that mean, and what would happen if you left it out?
A: An empty array means "run once on mount, never again." Without the array, React runs the effect after every render — `checkAuth` would fire every time any state changes anywhere in the app, sending continuous auth requests to the backend in an infinite loop.

Q: `ProtectedRoute` uses `<Navigate to="/login" replace />` instead of just `<Navigate to="/login" />`. What does `replace` prevent?
A: Without `replace`, React Router pushes the protected route (e.g. `/chat`) onto the browser history stack before redirecting to `/login`. When the user hits the back button they'd go back to `/chat`, which immediately redirects to `/login` again — a confusing loop. `replace` swaps `/chat` out of the history stack entirely, so the back button skips it cleanly.

---

## Phase 21 — Auth Loading State

**What this module does**
Adds an `isLoading` boolean to `AuthContext` to prevent `ProtectedRoute` from redirecting to `/login` before the `checkAuth` request has settled. While `isLoading` is `true`, `ProtectedRoute` renders a loading indicator instead of making an allow/deny decision. Once `checkAuth` completes — success or failure — `isLoading` becomes `false` and the route renders correctly.

**Key design decision**
`isLoading` starts as `true`, not `false`. If it started `false`, `ProtectedRoute` would see `isAuthenticated: false` on the very first render (before `checkAuth` gets a response) and redirect to `/login` — even for logged-in users. Starting at `true` forces the route to wait. This is the standard pattern for async state initialisation: assume "not ready" until the async operation settles.

**One thing I found surprising**
Setting `isLoading(false)` in both the `if` and `else` branches looks complete, but misses the `catch` branch — a network failure leaves `isLoading` stuck at `true` forever. A `finally` block is the correct fix: it always runs regardless of which path the code took, so you can't miss a branch.

**Interview Q&A**

Q: Why does `isLoading` start as `true` instead of `false`?
A: The auth check is already running the moment `AuthProvider` mounts. Starting at `false` would let `ProtectedRoute` see `isLoading: false, isAuthenticated: false` on the first render and redirect to `/login` before the result is known. Starting at `true` forces `ProtectedRoute` to wait until `checkAuth` settles before making a decision.

Q: `ProtectedRoute` renders `<div>Loading...</div>` while `isLoading` is true. A teammate suggests returning `null` instead. What's the difference?
A: Both prevent a premature redirect — they just differ in UX. `null` renders nothing (blank screen) while the check runs. `<div>Loading...</div>` shows visible feedback. For a fast auth check on localhost the difference is imperceptible, but in production with real latency a spinner or skeleton is better UX. The key requirement is that neither renders `<Navigate>` — you're just buying time for the async check to settle.

Q: Why use `finally` to call `setIsLoading(false)` instead of putting it in both the `if` and `else` branches?
A: `finally` always runs regardless of which code path was taken — success, expected failure, or thrown exception. Without it you have to remember to set `isLoading(false)` in every branch manually, and it's easy to miss one. A missing `setIsLoading(false)` in the `catch` block means a network failure leaves the app showing "Loading..." forever. One `finally` line is safer and less code than three separate assignments.

---

## Phase 22 — Watchlist Page

**What this module does**
A protected page that fetches the logged-in user's watchlist from `GET /api/watchlist` and displays each item with its movie title, status badge, and optional rating. The page handles three states: loading, error, and empty list. It is protected by `ProtectedRoute` so only authenticated users can access it.

**Key design decision**
The frontend sends no user ID in the request — it relies entirely on the `jwt` cookie being attached automatically by the browser. The `protect` middleware reads the cookie, verifies the JWT, and populates `req.user`. The controller reads `req.user.id` to scope the query. This is the cookie-based auth pattern in action: identity is proven by the cookie, not by anything the frontend explicitly sends.

**One thing I found surprising**
The backend wraps the array in `{ status: "success", data: { watchlist: [...] } }` rather than returning the array directly. This means `setItems(data)` silently sets items to an object — `items.map` throws because objects don't have a `map` method. You have to destructure to the correct path: `data.data.watchlist`. Always log the raw response shape when a `.map is not a function` error appears — the data is there, just nested differently than expected.

**Interview Q&A**

Q: The watchlist fetch doesn't include a user ID anywhere. How does the backend know whose watchlist to return?
A: The browser automatically sends the `jwt` cookie with every request to the same domain. The `protect` middleware reads it, verifies the JWT, and attaches the decoded user to `req.user`. The controller reads `req.user.id` to filter results. The frontend never identifies the user explicitly — the cookie proves identity automatically.

Q: The backend returns `{ status, data: { watchlist } }` instead of a plain array. What's the advantage and the cost?
A: The envelope pattern gives every endpoint a consistent shape — easier to handle errors uniformly and add fields like pagination later without breaking consumers. The cost is that the frontend must know the nesting path to reach the actual data, which is easy to get wrong and adds destructuring boilerplate.

Q: Why check `err instanceof Error` before reading `err.message` instead of just writing `setError(err.message)` directly?
A: In JavaScript you can throw anything — a string, a number, a plain object. TypeScript types `catch (err)` as `unknown` for this reason. If the thrown value isn't an `Error` instance, `.message` is `undefined` and you'd display nothing. The `instanceof Error` check narrows the type so `.message` is guaranteed to exist. The fallback handles anything that isn't an `Error`.

---

## Phase 23 — Python Scraper (Alice Cinema)

**What this module does**
A Python scraping service in `scraper/` that fetches session times from Alice Cinema's website and writes Cinema and Session rows into the shared PostgreSQL database. It runs independently of the Node.js backend. The pipeline: fetch homepage → find movie slugs → fetch each movie page → parse date/time/booking URL → resolve movie via TMDB API → write sessions to DB.

**Key design decision**
The scraper connects directly to Postgres instead of calling the Express API. The API is built for external clients (browsers) and enforces user auth and rate limits. The scraper is a trusted internal service that needs bulk writes and bypasses those layers legitimately. Direct DB access is faster, simpler, and the right call for infrastructure-level services.

**One thing I found surprising**
Prisma generates UUIDs and timestamps client-side, not in the database. The `id` column in the Prisma migration has no `DEFAULT` — so raw SQL inserts must provide the UUID manually using Python's `uuid.uuid4()`. The same applies to `updatedAt`. Without checking the migration SQL, you'd assume the DB handles these automatically.

**Interview Q&A**

Q: Why does the scraper write directly to Postgres instead of calling the Express API?
A: The API is designed for external consumers — it enforces JWT auth, rate limiting, and user-scoped validation. The scraper is a trusted internal service running on the same infrastructure. Making it fake a login to call its own API adds complexity with no security benefit. Direct DB access is the right pattern for internal data pipeline services.

Q: What is an idempotent write and why does the scraper use it?
A: An idempotent operation produces the same result no matter how many times it runs. The cinema seed uses `INSERT ... ON CONFLICT (slug) DO UPDATE` — running it twice leaves one cinema row, not two. This matters for scrapers because they run on a schedule and must handle restarts, retries, and re-runs without creating duplicates or crashing.

Q: The scraper stores datetimes in UTC even though Alice Cinema's times are in NZ time. Why?
A: The database stores UTC as a neutral reference point. If you stored NZ local time, any query comparing timestamps across timezones would be wrong. UTC lets the frontend convert to the user's local timezone at display time. The rule: always store UTC, always convert at the display layer.

Q: Why does `run.py` cache TMDB lookups in a `seen` dict instead of calling TMDB once per session?
A: Multiple sessions can share the same movie. Without caching, a movie with 5 sessions would trigger 5 identical TMDB API calls. The `seen` dict maps movie slug to UUID so TMDB is called once per unique movie per scraper run. This is the memoisation pattern — cache the result of an expensive operation keyed by its input.

---

## Phase 9 — Cinema Routes & Controller

**What this module does**
Two public endpoints that expose cinema data to the frontend: `GET /cinemas` returns all cinemas (used for map/list views), and `GET /cinemas/:slug` returns a single cinema with its sessions included (used for the cinema detail page). No auth required — cinema data is public.

**Key design decision**
These routes have no `protect` middleware because cinema listings are public information. Any visitor should be able to browse what's showing without logging in. Contrast this with watchlist routes, which are always protected because the data is personal.

**One thing I found surprising**
The `include: { sessions: true }` on `getCinemaBySlug` pulls in all related sessions in one query — Prisma handles the JOIN automatically. Without it, the detail page would need a second request to `/sessions?cinemaId=...` to get session times.

**Interview Q&A**

Q: When should you use `findUnique` vs `findFirst`?
A: `findUnique` can only be called on fields marked `@id` or `@unique` in the schema — Prisma enforces this at the type level. `findFirst` works on any field. Use `findUnique` when searching by a unique field like `slug` or `id`: it makes a semantic contract that the field is unique, lets Prisma optimise the query, and gives a compile-time error if you accidentally point it at a non-unique field.

Q: Why are `GET /cinemas` and `GET /cinemas/:slug` public routes?
A: Cinema data is shared public content — any visitor should be able to browse what's showing without an account. Protected routes are for personal data (watchlist) or write operations that need to be attributed to a user. Auth adds friction; only apply it where it's genuinely needed.

---

## Phase 10 — Frontend: Custom Hooks + Cinema Pages

**What this module does**
Replaces mock data in `CinemasPage` and `CinemaDetailPage` with real API calls. Two custom hooks — `useCinemas.ts` (fetches all cinemas) and `useCinema.ts` (fetches one by slug) — encapsulate the fetch logic and expose `isLoading`, `data`, and `error`. `CinemaDetailPage` uses `useMemo` to group the flat sessions array into a structure keyed by movie, then by date, so the UI can efficiently look up session times for any movie/date combination.

**Key design decision**
Session data comes from the API as a flat array. The UI needs it grouped: "all movies at this cinema" and "session times for selected movie on selected date." Rather than re-filtering the array on every render, `useMemo` builds the grouped structure once and caches it until `cinema` changes. This is the **grouping pattern** — transform flat API data into a shape the UI can consume directly, and memoize it so the transformation only runs when the source data changes.

**One thing I found surprising**
`useParams()` only works if the route param name matches exactly — the route was defined as `/:id` but the page destructured `slug`, so `slug` was always `undefined`. The fix was renaming the route param to `/:slug`. The mismatch produced no TypeScript error — it just silently returned `undefined` at runtime.

**Interview Q&A**

Q: What is a custom hook and why use one instead of fetching data directly in the component?
A: A custom hook is a function that starts with `use` and can call other hooks. It extracts reusable stateful logic out of a component. Fetching in the component works, but if two pages need the same data you'd duplicate the fetch logic. A custom hook lets both pages call `useCinemas()` and share the same loading/error/data pattern without repeating code.

Q: What does `useMemo` do and when should you use it?
A: `useMemo` runs a function and caches the result, only recalculating when its dependencies change. Use it when a computation is expensive or produces a new object/array reference on every render that would otherwise trigger unnecessary re-renders downstream. Don't use it for simple calculations — the overhead of memoization outweighs the benefit.

Q: Why does `isLoading` start as `true` instead of `false` in the custom hooks?
A: The fetch starts immediately on mount. If `isLoading` started `false`, the component would render with empty data on the first frame before the fetch completes — potentially showing a blank list or triggering a 404 redirect. Starting at `true` forces the component to show a loading state until real data arrives.

---

## Phase 11 — Add to Watchlist Button

**What this module does**
Adds an "Add to Watchlist" button to every movie card on `MoviesPage`. On mount, the page fetches the user's existing watchlist and builds a `Set<number>` of TMDB IDs. Each button checks `watchlistIds.has(movie.id)` to render as "In Watchlist" (disabled) or "Add to Watchlist" (active). Clicking calls `POST /api/watchlist` with TMDB movie data; the backend does a find-or-create on the `Movie` table before creating the `WatchlistItem`. The button is only shown to authenticated users.

**Key design decision**
`MoviesPage` shows TMDB movies (integer IDs) but `WatchlistItem` requires a UUID foreign key to our own `Movie` table. Rather than adding a separate "find-or-create movie" endpoint, the `POST /api/watchlist` controller handles it internally: look up the movie by `tmdbId`, create it if missing, then create the watchlist entry. One API call from the frontend, all complexity on the backend. This is the **find-or-create pattern** — check if exists, create if not, proceed either way.

**One thing I found surprising**
Updating a `Set` in React state requires creating a new Set — you can't mutate the existing one. `setWatchlistIds(prev => new Set(prev).add(id))` works because it returns a new reference, triggering a re-render. `prev.add(id)` mutates in place and React never re-renders because the reference didn't change.

**Interview Q&A**

Q: Why use a `Set` instead of an array to track which movies are in the watchlist?
A: `Set.has()` is O(1) — it uses a hash table internally and finds an item in constant time regardless of Set size. Array `.includes()` is O(n) — it scans left to right until it finds a match. With 20 movie cards and 200 watchlist items, `.includes()` does up to 4,000 comparisons per render. `.has()` does exactly 20.

Q: The watchlist `useEffect` depends on `[isAuthenticated]`. What breaks if you use `[]` instead?
A: `[]` means "run once on mount." If the user isn't logged in when the page first loads and logs in later, the watchlist fetch never re-runs — the Set stays empty and every button shows "Add to Watchlist" even for movies already in their watchlist. `[isAuthenticated]` re-runs whenever auth state changes, keeping the Set in sync with reality.

Q: Why does the button's `onClick` call `e.stopPropagation()`?
A: The button sits inside a `div` that has its own `onClick` navigating to the movie detail page. Without `stopPropagation()`, a button click triggers both handlers — click events bubble up the DOM tree from child to parent. `stopPropagation()` stops the event at the button so the parent `div` never sees it and navigation doesn't fire.

Q: `MoviesPage` shows TMDB movies but the watchlist stores a UUID foreign key. How does the backend bridge the two ID spaces?
A: The `POST /api/watchlist` controller receives the TMDB integer ID alongside movie metadata. It first calls `prisma.movie.findUnique({ where: { tmdbId } })`. If the movie exists in our DB, it uses that row's UUID. If not, it creates the movie row with `prisma.movie.create(...)` using the TMDB data sent from the frontend. Either way, it ends up with a UUID to attach to the new `WatchlistItem`. This is the find-or-create pattern.

---

## Phase 12 — Watchlist Enhancement (Rating UI + Split Views + Status Change)

**What this module does**
Enhances `WatchlistPage` with three features: tab-based filtering (Want to Watch / Watched), a rating `<select>` on Watched items, and a status `<select>` on Want to Watch items. Rating and status changes call `PUT /api/watchlist/:id` and update `items` state using the immutable `.map()` pattern. No new backend routes — the existing update endpoint handles both fields.

**Key design decision**
`wantToWatchItems`, `watchedItems`, and `displayedItems` are all derived directly in the component body — not stored in `useState`. This means a single `setItems(...)` call automatically updates both tabs. When a user changes a PLANNED item to COMPLETED, it disappears from the Want to Watch tab and appears in the Watched tab with no extra logic. This is the core payoff of keeping derived state out of `useState`: one source of truth, zero sync bugs.

**One thing I found surprising**
The backend update route was registered as `PUT` but the frontend was calling `PATCH`. The request failed silently — `handleRating` caught the error and logged it, but the UI's controlled input snapped back to the saved value because the state update was gated behind `response.ok`. No visible error, but the DB was never updated. Always verify the HTTP method matches the route registration when a write operation appears to do nothing.

**Interview Q&A**

Q: What is a controlled input and why does it matter for error handling?
A: A controlled input has its displayed value driven by React state via the `value` prop. If a `PUT` request fails, the state update never runs, so the input automatically reverts to the last saved value — no manual reset needed. An uncontrolled input (no `value` prop) lets the browser own the displayed value, so a failed save leaves the UI showing data that was never persisted.

Q: `wantToWatchItems` and `watchedItems` are computed in the component body, not in `useEffect`. Why?
A: They're derived state — computed synchronously from `items` with no async work and no external systems involved. `useEffect` is for side effects: fetches, subscriptions, DOM mutations. Putting pure computations inside `useEffect` would add unnecessary complexity and timing issues. The rule: if you can compute it from existing state or props, do it in the render body.

Q: What's the difference between a pessimistic and an optimistic update? Which did you use here?
A: A pessimistic update hits the API first and updates state only on success — the UI waits for confirmation. An optimistic update changes state immediately and rolls back on failure — the UI feels instant. The rating and status selects use pessimistic updates: `setItems` only runs if `response.ok` is true. For a rating selector the latency is imperceptible, so pessimistic is appropriate. Optimistic updates pay off for high-frequency interactions like text editing where latency is noticeable.

Q: Why does `e.target.value as WatchlistItem["status"]` need a type cast?
A: A `<select>` element always returns a plain `string` from `e.target.value` — TypeScript has no way to know which option was selected. The cast tells TypeScript to treat it as the union type `"PLANNED" | "WATCHING" | "COMPLETED" | "DROPPED"`. It's safe here because the `<select>` options are hardcoded to exactly those four values, so the cast can never be wrong at runtime.

---

## Phase 13 — Confirm-and-Rate Modal

**What this module does**
Adds a shadcn `Dialog` that intercepts status changes to COMPLETED or DROPPED. Instead of immediately calling the API, the status select opens a modal asking for an optional rating before confirming. PLANNED and WATCHING changes bypass the modal entirely. On confirm, a single `PUT` request sends both `status` and `rating` together. On cancel, the controlled select snaps back automatically because state was never updated.

**Key design decision**
`pendingChange` is typed as `{ itemId, newStatus, movieTitle } | null` — `null` means closed, an object means open. This is state colocation: the modal's open/closed state and its data are a single atomic unit. A separate `isModalOpen: boolean` would require two state updates to open the modal safely, creating a window where the modal could render with stale or missing context.

**One thing I found surprising**
`handleStatusChange` updated `status` in local state but not `rating`. The backend saved both fields correctly, but the Watched tab's rating select showed blank because it reads from state — not from the DB. The fix was `rating: rating ?? item.rating` in the `.map()` spread: use the new rating if one was passed, otherwise keep the existing value.

**Interview Q&A**

Q: Why use `null` as the closed state for a modal instead of a separate `isModalOpen` boolean?
A: With a boolean, you need two state updates to open the modal — set `isOpen: true` and set the item context. If they fire at different times or one is forgotten, the modal opens with no data. Using `null` as closed and an object as open means modal visibility and context are a single atomic update: one `setPendingChange(...)` call opens the modal with everything it needs. This pattern is called state colocation.

Q: Why does the modal only appear for COMPLETED and DROPPED, not PLANNED or WATCHING?
A: PLANNED and WATCHING are reversible progress updates with no side effects — no confirmation or extra data needed. COMPLETED and DROPPED are terminal states where collecting a rating is meaningful. Adding a modal to every status change would create unnecessary friction; reserving it for final states makes the UX intentional. The rule: only add confirmation steps when the action is consequential or irreversible.

Q: The cancel button closes the modal without calling the API. The status select then shows the original status, not what the user picked. How does that work without any reset code?
A: The select is a controlled input — `value={item.status}` ties its display to React state. `handleCancel` only clears `pendingChange`; it never calls `setItems`, so `item.status` in state is unchanged. On the next render, the select displays the original status automatically. Controlled inputs self-correct to match state with no manual reset needed.
