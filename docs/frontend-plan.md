# Frontend Plan — AI Movie Mate

## Navigation

Three top-level nav links (public):

| Label | Route |
|---|---|
| Movies | `/` |
| Cinemas | `/cinemas` |
| Chat | `/chat` (protected — requires login) |

Auth links shown in nav corner: **Login** / **Register** when logged out, **Logout** when logged in.

---

## Pages & Routes

### 1. Movies (Home) — `/`
- Grid of now-playing movies fetched from **TMDb API** (`/movie/now_playing`)
- Each card shows: poster, title, rating
- Click a card → Movie Detail

### 2. Movie Detail — `/movies/:id`
- Fetched from **TMDb API** (`/movie/:id`)
- Shows: large poster, title, synopsis, genre, runtime, rating
- "Buy Tickets" button → Showtime Picker for this movie

### 3. Showtime Picker — `/movies/:id/cinemas`
- Lists cinemas showing this movie (mock data)
- Date picker defaults to today; changing date re-filters sessions
- Each cinema row shows available session times for that day
- Click a cinema → Cinema Detail (with this movie pre-selected)

### 4. Cinemas — `/cinemas`
- Grid of all cinema cards (mock data)
- Each card shows: cinema name, suburb, number of screens
- Click a card → Cinema Detail

### 5. Cinema Detail — `/cinemas/:id`
- Shows all movies screening today at this cinema (mock data)
- If arrived from Showtime Picker, the originating movie is pre-selected
- Date picker defaults to today
- Selecting a movie shows its session times for the chosen date

### 6. Chat — `/chat` (protected)
- AI chat interface
- Wires up to existing backend `/chat` SSE endpoint (already built)
- Redirects to `/login` if not authenticated

### 7. Login — `/login`
- Email + password form
- POST `/api/auth/login` → sets JWT cookie
- On success → redirect to `/chat`
- Link to Register page

### 8. Register — `/register`
- Name + email + password form
- POST `/api/auth/register` → sets JWT cookie
- On success → redirect to `/chat`
- Link to Login page

---

## Data Sources

| Data | Source |
|---|---|
| Movies (now playing, detail) | TMDb API — free, needs API key from themoviedb.org |
| Cinemas | Mock JSON (no free global cinema API exists) |
| Sessions / showtimes | Mock JSON, keyed by cinemaId + movieId + date |

### TMDb setup
- Register at themoviedb.org → Settings → API → request a key (free)
- Base URL: `https://api.themoviedb.org/3`
- Image base URL: `https://image.tmdb.org/t/p/w500`
- Store key in `client/.env` as `VITE_TMDB_API_KEY`

### Mock data shape (example)

```ts
// src/data/cinemas.ts
[
  { id: "c1", name: "Event Cinemas George St", suburb: "Sydney CBD", screens: 16 },
  { id: "c2", name: "Hoyts Broadway", suburb: "Glebe", screens: 10 },
]

// src/data/sessions.ts
// sessions[cinemaId][movieId][date (YYYY-MM-DD)] = string[]
{
  c1: {
    "550": { "2026-05-10": ["10:00", "13:15", "16:30", "19:45"] }
  }
}
```

---

## Implementation Phases

### Phase 1 — Routing skeleton + nav
- Install `react-router-dom`
- Create `Layout` component with top nav (Movies / Cinemas / Chat)
- Create stub page components for all 6 routes
- Wire everything in `App.tsx`

### Phase 2 — Movies page
- Create `src/api/tmdb.ts` with fetch helpers
- Add `VITE_TMDB_API_KEY` to `.env`
- Build `MoviesPage`: fetch now-playing, render movie grid with `MovieCard`

### Phase 3 — Movie Detail page
- Fetch single movie from TMDb by id
- Build `MovieDetailPage`: poster, info, "Buy Tickets" button
- Button navigates to `/movies/:id/cinemas`

### Phase 4 — Showtime Picker page
- Import mock cinemas + sessions data
- Build `ShowtimesPage`: date picker, cinema list, session time buttons
- Cinema click navigates to `/cinemas/:id?movieId=:id`

### Phase 5 — Cinemas page
- Import mock cinemas
- Build `CinemasPage`: cinema card grid
- Card click navigates to `/cinemas/:id`

### Phase 6 — Cinema Detail page
- Import mock cinemas + sessions
- Build `CinemaDetailPage`: movie list sidebar + session grid
- Read `movieId` from query param to pre-select the originating movie
- Date picker defaults to today

### Phase 7 — Chat page
- Build `ChatPage`: message list + input box
- Connect to backend `POST /chat` with SSE streaming

### Phase 8 — Auth pages
- Build `LoginPage` and `RegisterPage` with shadcn form components
- Create `src/api/auth.ts`: login, register, logout fetch helpers
- Create `src/hooks/useAuth.ts`: auth state (user logged in or not)
- Build `ProtectedRoute.tsx`: redirects to `/login` if unauthenticated
- Wire `/chat` through `ProtectedRoute`
- Add Login/Register/Logout links to `Layout` nav

---

## File Structure

```
src/
  pages/
    MoviesPage.tsx
    MovieDetailPage.tsx
    ShowtimesPage.tsx
    CinemasPage.tsx
    CinemaDetailPage.tsx
    ChatPage.tsx
    LoginPage.tsx
    RegisterPage.tsx
  components/
    ui/              ← shadcn (done)
    Layout.tsx       ← nav wrapper
    ProtectedRoute.tsx
    MovieCard.tsx
  api/
    tmdb.ts
    auth.ts
  data/
    cinemas.ts
    sessions.ts
  hooks/
    useAuth.ts
  lib/
    utils.ts         ← done
```

## Tech Stack (frontend)

- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- shadcn/ui (Button, Card, Input already installed)
- lucide-react (icons)
- react-router-dom (to install)
