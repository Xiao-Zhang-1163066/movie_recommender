# AI Movie Mate

AI-powered cinema companion for Christchurch film-goers.

## Stack

- **Backend:** Express 5 (Node.js, ES modules), Prisma ORM, PostgreSQL
- **Frontend:** React + Vite + TypeScript, TailwindCSS
- **Scraper:** Python 3, BeautifulSoup, TMDB API
- **AI:** Gemini (via AI SDK)

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL running locally

---

## Environment Variables

### Backend (`/.env`)

```
DATABASE_URL="postgresql://username@localhost:5432/movie_recommender"
DIRECT_URL="postgresql://username@localhost:5432/movie_recommender"
JWT_SECRET="your_jwt_secret"
JWT_EXPIRES_IN="30d"
NODE_ENV="development"
GEMINI_API_KEY="your_gemini_key"
```

### Scraper (`/scraper/.env`)

```
DATABASE_URL="postgresql://username@localhost:5432/movie_recommender"
TMDB_API_KEY="your_tmdb_key"
```

---

## Running the App

### 1. Backend API (port 3000)

```bash
npm install
npm run dev
```

### 2. Frontend (port 5173)

```bash
cd client
npm install
npm run dev
```

### 3. Scraper

```bash
cd scraper
source .venv/bin/activate
python run.py
```

The scraper fetches sessions from Alice Cinema and three Hoyts locations, looks up movie metadata from TMDB, and writes everything to the database.

---

## Database

```bash
# Run migrations
npx prisma migrate dev --name <name>

# Regenerate Prisma client after schema changes
npx prisma generate

# Open database GUI
npx prisma studio
```

---

## Project Structure

```
/               — Express API (server.js entry point)
/client         — React frontend
/scraper        — Python cinema scraper
/prisma         — Database schema and migrations
/routes         — API route definitions
/controller     — Request handlers
/middleware     — Zod validation, JWT auth
/validators     — Zod schemas
```
