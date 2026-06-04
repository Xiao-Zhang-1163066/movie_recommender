# In-Theatre Movie Recommendation — User Stories & Acceptance Criteria

Chatbot recommends movies based on the user's stated interest, with at least one
pick currently showing in theatres.

**Design decisions**
- **Source of "now showing":** scraped cinema listings (the `Session` table).
- **No made-up movies:** every recommendation must resolve to a real TMDB entry
  (non-null `tmdbId`).
- **Result rule:** at least one pick must be now-showing; additional picks may be
  movies not currently playing, as long as they are real TMDB entries.
- **Location scope:** single city/cinema for the MVP — Christchurch (already fixed
  in the chat `SYSTEM_PROMPT`).

---

## Epic
> As a user, I want the chatbot to recommend movies based on my interests —
> including at least one showing in theatres now — so that I can decide what to go
> see without browsing listings myself.

---

### Story 1 — Get a recommendation from a free-text interest
**As a** movie-goer
**I want** to tell the chatbot what I'm in the mood for in plain language
**so that** it suggests films that match — at least one of which is playing right now.

**Acceptance criteria**
- **Given** I type something like *"I want a tense sci-fi thriller"*, **when** I send
  it, **then** the bot replies with at least one movie that is currently in theatres.
- **Given** a recommendation is returned, **then** each suggestion carries a one-line
  reason it matches my interest — **shown on the movie card** (not only in the chat
  text) — plus its title and whether it's "now showing."
- **Given** the bot recommends several movies, **then** **at least one** must come
  from the **scraped cinema listings** (the `Session` table); the rest may be movies
  not currently playing.
- **Given** any recommended movie (playing or not), **then** it must resolve to a real
  TMDB entry (non-null `tmdbId`) — **no made-up movies**. Now-showing picks are tagged
  as such; others are not.
- **Given** my message has no genre/interest signal (e.g. *"hi"*), **when** I send it,
  **then** the bot asks a clarifying question instead of guessing.

---

### Story 2 — See enough detail to decide
**As a** user
**I want** each recommended movie to show key details
**so that** I can judge it at a glance.

**Acceptance criteria**
- **Given** a recommendation, **then** I see a movie card with poster, title, genre,
  and rating/synopsis (already have `ChatMovieCard`).
- **Given** a recommendation card, **then** it displays the bot's one-line **reason for
  recommending** that movie, tied to what I asked for (e.g. *"Picked for the tense
  sci-fi tone you wanted"*).
- **Given** a movie was recommended without a reason, **then** the card still renders
  cleanly with the reason line simply omitted.
- **Given** a card is shown, **then** its poster/rating/runtime come from **TMDB** (the
  existing `recommend_movies` enrichment), so nothing on the card is invented.
- **Given** I click a recommended card, **then** a detail modal opens with the full
  synopsis (already have `MovieDetailModal`).
- **Given** poster/metadata is missing for a title, **then** the card still renders
  gracefully with a placeholder, not a broken image.

---

### Story 3 — Know where and when it's playing
**As a** user
**I want** to see which cinema(s) and showtimes the recommended movie has
**so that** I can plan to actually go.

**Acceptance criteria**
- **Given** a movie is recommended, **then** I can see the cinema currently screening
  it (**single city/cinema for the MVP — Christchurch**, already fixed in the
  `SYSTEM_PROMPT`).
- **Given** a recommended movie is **not** currently playing, **then** the card simply
  omits showtimes (no cinema/time shown) rather than implying it's screening.
- **Given** showtime data exists in the scraper, **then** showtimes are displayed (via
  the `get_showtimes` tool); **if not available**, the cinema name still shows without
  breaking the layout.

---

### Story 4 — Refine the recommendation
**As a** user
**I want** to follow up conversationally (e.g. "something lighter", "nothing scary")
**so that** I can narrow down to the right pick.

**Acceptance criteria**
- **Given** I've received a recommendation, **when** I send a follow-up, **then** the
  bot uses the prior turn as context (it doesn't reset).
- **Given** I add a constraint (e.g. *"under 2 hours"*), **then** the next suggestion
  respects it where data allows.
- **Given** any follow-up, **then** the refined set still includes at least one
  now-showing title, and every pick remains a real TMDB entry.

---

### Story 5 — Graceful empty / error states
**As a** user
**I want** clear feedback when nothing matches or something fails
**so that** I'm never stuck on a silent screen.

**Acceptance criteria**
- **Given** nothing currently playing matches my interest, **then** the bot says so,
  and may still recommend real (TMDB-backed) movies that aren't playing — clearly
  flagged as not in theatres.
- **Given** the `Session` table is empty (scraper hasn't run), **then** the bot says it
  has no current listings, rather than implying any pick is now showing.
- **Given** the cinemas data or LLM call fails, **then** I see a friendly error message,
  not a crash or infinite spinner.
- **Given** the bot is generating, **then** I see a loading/typing indicator.
