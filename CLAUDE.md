# CLAUDE.md — AI Movie Mate

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start server with nodemon (hot reload) on port 3000
npm test           # Unit + integration suite. No DB, no Redis, no network — safe in CI
npm run test:perf  # Benchmarks against real Neon/Upstash/TMDB. Never in CI
npm run test:evals # Behavioural agent evals against real Groq + TMDB. Never in CI, costs quota

npx prisma migrate dev --name <name>   # Create and run a new migration
npx prisma generate                    # Regenerate Prisma client after schema changes
npx prisma studio                      # Open Prisma Studio GUI for the database
```

The frontend is a separate Vite + React + TypeScript app in `client/` (`npm run dev`, `npm run build`).

## Architecture

Express 5 REST API using ES modules (`"type": "module"`).

`server.js` loads env, connects the database and listens. `app.js` builds and exports the app
**without** starting it, so tests can mount it with supertest — importing `app.js` must stay
free of side effects.

**Request lifecycle:** Route → `validate(schema)` (Zod) → `protect` (JWT) → `requireAdmin` (admin routes only) → Controller → Prisma → PostgreSQL

**Key layers:**
- `routes/` — wires HTTP methods to middleware chains and controllers
- `controller/` — business logic; one function per endpoint
- `services/` — logic reused outside a request, dependency-injected so it is testable offline:
  `conversationService.js` (history + rolling summary), `agentRunService.js` (the observability
  log), `agentTools.js` (`buildTools(userId, deps)` — the tool *definitions* the model reads)
- `controller/chatTools.js` — the tool *implementations*; `agentTools.js` holds what the model
  reads, this holds what each tool does
- `middleware/` — `validateRequest.js` (generic Zod wrapper), `authMiddleware.js` (`protect`),
  `adminMiddleware.js` (`requireAdmin`), `chatLimiter.js`, `errorMiddleware.js`
- `validators/` — Zod schemas per domain (auth, chat, movies, watchlist)
- `config/db.js` — Prisma singleton with `@prisma/adapter-pg`; exports `prisma`, `connectDB`, `disconnectDB`
- `config/redis.js` — cache; **degrades to no-ops when `REDIS_URL` is unset**, so local dev works without it
- `utils/generateToken.js` — signs a JWT and **returns the string**

`errorHandler` must stay registered last in `app.js` — Express only treats a 4-arg middleware
as the error handler, and only errors from middleware registered before it reach it.

**Mounted routes:** `/api/auth`, `/api/movies`, `/api/watchlist`, `/api/cinemas`, `/api/sessions`, `/api/chat`, `/api/admin`

**Prisma setup:** Schema is in `prisma/schema.prisma`; the generated client goes to
`generated/prisma/`, not the default location. `prisma.config.ts` reads `DATABASE_URL` from
`.env`. Run `prisma generate` after any schema change — forgetting is a recurring bug.

**Database:** Neon PostgreSQL. `DATABASE_URL` is the pooled (PgBouncer) connection used at
runtime; `DIRECT_URL` bypasses the pooler and is what migrations use.

**Auth flow:** `POST /auth/register` and `POST /auth/login` return a JWT, which the frontend
stores in `localStorage` and sends as `Authorization: Bearer <token>`. This is *not* cookie
auth — cookies were dropped because Safari iOS ITP blocks `SameSite=None` cookies across the
SWA/Container App domain split. `protect` reads the header, never `req.cookies`.

**Admin:** `/api/admin/*` requires `protect` **and** `requireAdmin`, which compares
`req.user.email` to `ADMIN_EMAIL`. It fails closed — an unset `ADMIN_EMAIL` denies everyone.

**Required env:** `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `GROQ_API_KEY`, `TMDB_API_KEY`,
`ADMIN_EMAIL`. Optional: `REDIS_URL`, `CORS_ORIGIN`, `PORT`.

**The agent:** `controller/chatController.js` streams a tool-calling loop
(`openai/gpt-oss-120b` on Groq, `stopWhen: stepCountIs(8)`) over a custom NDJSON protocol.
Now-showing listings are pre-fetched into the system prompt rather than exposed as a tool.
Every turn writes one `AgentRun` row after the response has been sent, fire-and-forget, so
logging can never add latency or fail a request.

**Data models:** `User` → `Movie` (creator relation) → `WatchlistItem` (status enum
`PLANNED | WATCHING | COMPLETED | DROPPED`, optional rating 1–10). `Cinema` → `Session` →
`Movie` for showtimes. `Conversation` → `ChatMessage` for server-side chat history, with a
rolling `summary` and a `summarizedUpTo` watermark. `AgentRun` is an append-only observability
log with **no** foreign keys — deliberately, so deleting a conversation cannot cascade away the
history the log exists to preserve.

## Conventions

- Plans, docs and code comments are written in English. Plans live in `docs/plan-<topic>.md`.
- **`docs/` is gitignored on purpose** — it holds personal learning notes, not portfolio
  artifacts. Do not `git add` anything under it.
- Comments explain *why*, not *what*, and stay short — one or two lines.
- `test/perf/` and `test/evals/` are excluded from the default suite in `vitest.config.js`.
  Anything added there that hits real infrastructure must be excluded too, or CI will run it
  without secrets and spend quota on every deploy.
