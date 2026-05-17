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
