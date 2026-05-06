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
