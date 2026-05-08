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
