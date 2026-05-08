# CLAUDE.md — AI Movie Mate

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start server with nodemon (hot reload) on port 3000
npx prisma migrate dev --name <name>   # Create and run a new migration
npx prisma generate                    # Regenerate Prisma client after schema changes
npx prisma studio                      # Open Prisma Studio GUI for the database
```

## Architecture

This is an Express 5 REST API using ES modules (`"type": "module"` in package.json). Entry point is `server.js`.

**Request lifecycle:** Route → `validate(schema)` middleware (Zod) → `protect` middleware (JWT, auth-required routes only) → Controller → Prisma → PostgreSQL

**Key layers:**
- `routes/` — wires HTTP methods to middleware chains and controllers
- `controller/` — business logic; each function handles one endpoint
- `middleware/validateRequest.js` — generic Zod validation wrapper; pass any Zod schema to `validate(schema)`
- `middleware/authMiddleware.js` — JWT auth via `protect`; reads token from `req.cookies.jwt`, attaches `req.user`
- `validators/` — Zod schemas for each domain (auth, movies, watchlist)
- `config/db.js` — Prisma client singleton with `@prisma/adapter-pg`; exports `prisma`, `connectDB`, `disconnectDB`
- `utils/generateToken.js` — signs JWT and sets it as an `httpOnly` cookie on the response

**Prisma setup:** Schema is in `prisma/schema.prisma`; generated client goes to `generated/prisma/` (not the default location). The `prisma.config.ts` file reads `DATABASE_URL` from `.env`. Run `prisma generate` after any schema change.

**Database:** Local PostgreSQL at `postgresql://sean@localhost:5432/movie_recommender`. No `JWT_SECRET` in `.env` by default — add it before running auth routes.

**Auth flow:** `POST /auth/register` and `POST /auth/login` set a `jwt` cookie. Protected routes require this cookie. `POST /auth/logout` clears it.

**Data models:** `User` → `Movie` (one-to-many, creator relation) → `WatchlistItem` (many-to-many join with status enum: `PLANNED | WATCHING | COMPLETED | DROPPED`, optional rating 1–10).
