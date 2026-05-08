# Agent Design Decisions

Open design questions for the AI agent (Epic 2 / Phase 3+).
Not yet decided — capture context here so the choice can be made when we
reach the implementation phase.

---

## Decision 1 — How does the agent decide between TMDB-wide and currently-showing recommendations?

**Context**

The agent has access to two universes of movies:

- **TMDB** — every movie ever made (~800k titles). Reached via `search_movies` and `get_movie_details`.
- **Local cinema DB** — only what the scraper found currently showing in Christchurch. Reached via `get_showtimes`.

The PRD's primary use case is "what should I watch tonight" → recommendations
should be actionable (currently showing). But the watchlist explicitly supports
films not currently in cinemas (US-4.4: "I just watched Inception, 8/10";
"recommend me a 90s thriller" queries; "Want to Watch" lists).

The agent needs a way to know which mode it's in.

**Approaches**

### Approach A — System prompt instruction

Tell the agent in its system prompt:

> Default to currently-showing films. Only recommend non-showing films when the
> user explicitly asks about classics, watchlists, or past films.

- Cheapest to implement.
- Relies on the model to follow instructions.
- Can drift across conversations.

### Approach B — Tool-level filter

Make `search_movies` call `get_showtimes` internally and only return movies
that have at least one upcoming session.

- Strict guarantee: agent cannot recommend non-showing films.
- Breaks the "I just watched X" flow and "recommend me a 90s film" use case.
- Removes a degree of agentic flexibility.

### Approach C — Agent decides via tool composition (recommended)

Give the agent both tools:

- `search_movies(query)` — TMDB-wide search
- `search_showing_now(query)` — filtered to local cinemas

The agent picks which to call based on user intent.

- Most flexible.
- Most "agentic" — demonstrates real tool composition.
- Strongest interview story: *"the agent autonomously chooses between a broad
  search and a local-showtimes search based on user intent."*
- Probably what the PRD implies in US-2.2 ("Agent decides when to call which
  tool — no hardcoded if/else logic").

**Recommendation:** Approach C. Best portfolio signal and matches PRD US-2.2.

**Status:** Not yet decided. Revisit when starting Phase 3 (basic /chat endpoint).
