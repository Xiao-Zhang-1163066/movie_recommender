# Product Requirements Document — AI Movie Mate

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft — ready to build |
| **Target market** | Christchurch, New Zealand |
| **Estimated build** | 4 weeks (full-time equivalent) |
| **Repo** | This document is the source of truth — referenced as `@docs/PRD.md` from `CLAUDE.md` |

---

## 1. Executive summary

AI Movie Concierge is a full-stack web application that helps Christchurch film-goers decide what to watch and where to see it. Users describe their mood in plain English ("something funny but not stupid, under two hours, good for a date night") and an AI agent autonomously searches movie databases, reads reviews, checks local cinema schedules, and recommends specific sessions with one-tap booking handoffs to the cinema's own ticketing page.

The product solves a real frustration: existing options force users to either browse static cinema websites without recommendations, or use recommendation services that have no idea what is actually showing nearby tonight. By combining conversational AI with a live local cinema database, the app delivers the rare combination of relevant and actionable.

### Why this project exists

- Demonstrates production-grade full-stack engineering for a junior developer portfolio
- Showcases agentic AI design — not just an API wrapper, but a system where the model autonomously chains tool calls
- Solves a genuine local problem the developer encounters personally
- Is immediately demoable in a 60-second interview window

---

## 2. Goals & non-goals

### 2.1 Goals

- Ship a publicly-deployed web app with a custom domain that recruiters can try in under 30 seconds
- Cover 100% of major Christchurch cinemas in the showtime database
- Support a complete user journey from "what should I watch tonight" to landing on the cinema's seat selection page
- Demonstrate clean architecture — separation between the AI layer, REST API, scraping service, and frontend
- Ship with rate limiting, caching, error monitoring, and a non-trivial deployment topology

### 2.2 Non-goals

- In-app payment processing — handoff to cinema booking sites is by design
- Mobile native apps — web only, but mobile-responsive
- Coverage outside Christchurch — single-city scope keeps the project achievable
- Social network features such as friend recommendations or shared watchlists
- Streaming service integration such as Netflix or Disney+ availability

---

## 3. Target users & personas

### 3.1 Primary persona — "the indecisive film fan"

A 25-to-40 year old Christchurch resident who watches one or two films a month at cinemas. They follow film culture casually but find browsing cinema websites tedious. They want a recommendation that takes their taste into account and tells them where and when they can see it.

### 3.2 Secondary persona — "the date planner"

Someone organising a dinner-and-a-movie evening who needs to balance two people's preferences, a runtime that fits the schedule, and a cinema that is both convenient and appropriate for the occasion.

---

## 4. Technical stack

The stack is a modern TypeScript-first architecture with one Python microservice for the cinema scraper. This split is deliberate — TypeScript dominates the user-facing layer for type safety and shared types, while Python owns the scraping work where its ecosystem (Playwright, BeautifulSoup, rapidfuzz) genuinely outperforms Node.

### 4.1 Stack overview

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast SPA build, HMR, type safety |
| Styling | Tailwind CSS + shadcn/ui | Utility-first styling, accessible components |
| Routing | React Router v6 | Client-side routing with nested layouts |
| Server state | TanStack Query | Caching, mutations, optimistic updates |
| Client state | Zustand | Lightweight global UI state |
| Backend API | Express + TypeScript | REST API for all user-facing data |
| AI | Anthropic Claude SDK | Agentic loop with tool use and streaming |
| Validation | Zod | Runtime schemas, input validation |
| ORM | Drizzle ORM | Type-safe Postgres queries with migrations |
| Scraper | Python + Playwright + BeautifulSoup | Scrapes Christchurch cinema sites every 4 hours |
| Database | Supabase (Postgres + pgvector + Auth) | Single managed DB serves API, auth, embeddings |
| Cache | Upstash Redis | TMDB cache, rate limiting, session cache |
| Email | Resend | Verification, password reset, weekly digest |
| External APIs | Anthropic, TMDB | AI inference and movie metadata |
| Hosting | Vercel + Railway + Supabase | Frontend, backend services, managed DB |
| Observability | Sentry | Error tracking on frontend and backend |

### 4.2 Architecture summary

Three deployable services share one Postgres database. The React SPA is a static build hosted on Vercel and talks only to the Express API. The Express API talks to Postgres, Redis, Anthropic, and TMDB. The Python scraper service runs on a 4-hour cron schedule, scrapes cinema sites, and writes normalised session data to the same Postgres database the API reads from.

- **Frontend** → deployed to Vercel as a static SPA. Talks to the Express API via HTTPS.
- **Express API** → deployed to Railway. Owns all user-facing endpoints, AI orchestration, and reads from Postgres + Redis.
- **Python scraper** → deployed to Railway as a scheduled job. Writes only — never reads from the API.
- **Supabase Postgres** → shared store with Row-Level Security for user data and a public schema for cinemas, movies, and sessions.

---

## 5. Christchurch cinemas in scope

Eight cinemas across Christchurch will be covered. Coverage is prioritised by foot traffic and ticketing complexity — major chains have richer structured data, while indie cinemas are easier to scrape but more important for cultural breadth.

| Cinema | Type | Location | Scraping difficulty |
|---|---|---|---|
| **Hoyts EntX** | Major chain | Colombo St, Central | Hard — Vista SPA, XHR intercept |
| **Hoyts Riccarton** | Major chain | Westfield Riccarton | Hard — same as EntX |
| **Hoyts Northlands** | Major chain | Northlands Mall, Papanui | Hard — same adapter reusable |
| **Reading Cinemas** | Major chain | The Palms, Shirley | Hard — Vista, JSON XHR |
| **Silky Otter** | Boutique luxury | Wigram & Sumner | Medium — modern site, JS-rendered |
| **Deluxe Cinemas** | Boutique | The Tannery, Woolston | Medium — small site, mostly static |
| **Alice Cinema** | Indie / arthouse | Tuam St, Central | Easy — static HTML |
| **Hollywood Cinema** | Indie | Sumner | Easy — static HTML |

**Build order:** Start with Alice and Hollywood (easy static scrapers — prove the pipeline end-to-end). Then tackle Hoyts EntX (the hardest target — once that adapter works, it generalises to Hoyts Riccarton, Northlands, and Reading with config changes only). Silky Otter and Deluxe last.

---

## 6. User stories

18 stories across 5 epics. Priorities are P0 (must have for MVP), P1 (should have before public launch), and P2 (nice to have). Building only the P0 stories produces a complete, demo-able product. Adding P1 stories is what takes it from "junior portfolio" to "would hire on the spot".

### Epic 1 — Authentication & accounts

Users can sign up, log in, manage their profile. Auth is the gate for any personalisation feature.

#### `US-1.1` — Sign up with email and password — **P0**

> As a new visitor, I want to create an account with my email and password so that I can save my watchlist and ratings between visits.

**Acceptance criteria**
- Form validates email format and password strength (minimum 8 characters)
- Password is hashed before storage using bcrypt or Supabase's built-in hashing
- Verification email sent via Resend within 30 seconds of signup
- User cannot log in until email is verified
- Error states clearly shown for duplicate emails and weak passwords

**Stack:** React form · Express POST /auth/signup · Resend · bcrypt

#### `US-1.2` — Log in and stay logged in — **P0**

> As a returning user, I want to log in once and stay signed in for 30 days so that I don't have to enter credentials every visit.

**Acceptance criteria**
- JWT issued on successful login, stored in httpOnly secure cookie
- Session persists for 30 days unless explicitly logged out
- Token validated on every protected route via Express auth middleware
- Logout clears the cookie and redirects to home
- Refresh token rotation on each successful auth check

**Stack:** JWT · httpOnly cookie · Express middleware

#### `US-1.3` — Sign in with Google — **P1**

> As a user, I want to sign in with my Google account so that I don't have to remember another password.

**Acceptance criteria**
- "Continue with Google" button on login and signup screens
- OAuth flow handled via Supabase Auth
- New Google sign-ups auto-create a profile with email pre-filled
- Existing email accounts can link to a Google account from settings
- Failed OAuth gracefully returns to login with an error toast

**Stack:** Supabase Auth · OAuth 2.0

---

### Epic 2 — AI movie concierge agent

The conversational AI that recommends movies and finds showtimes. This is the centrepiece feature.

#### `US-2.1` — Chat with the concierge — **P0**

> As a user, I want to describe what I'm in the mood for in plain English so that the agent can recommend movies that fit my taste right now.

**Acceptance criteria**
- Chat input accepts free text and sends on Enter
- Agent responses stream word-by-word via Server-Sent Events
- Conversation history shown above the input, scrollable
- Agent can recall context from earlier in the conversation
- Loading indicator displayed while agent is thinking
- User can stop a generation mid-stream

**Stack:** React chat UI · SSE streaming · Anthropic SDK

#### `US-2.2` — Agent uses tools to search for movies — **P0**

> As a user, I want the agent to autonomously search TMDB and the local cinema database so that its recommendations are based on real data, not made up titles.

**Acceptance criteria**
- Agent has access to `search_movies`, `get_movie_details`, `get_showtimes`, and `get_user_watchlist` tools
- Agent decides when to call which tool — no hardcoded if/else logic
- Tool results feed back into the agent for further reasoning
- Agentic loop continues until `stop_reason` equals `end_turn`
- Tool errors surface gracefully — agent retries or apologises rather than crashing

**Stack:** Claude tool use · Express agentic loop · Zod tool schemas

#### `US-2.3` — See what the agent is doing in real time — **P1**

> As a user, I want to see "searching for sci-fi films… checking your watchlist…" while the agent works so that I know it's making progress and trust its answers.

**Acceptance criteria**
- Tool use events streamed to the UI as they happen, not just at the end
- Each tool call shown as a small status pill (e.g. "🔍 Searching TMDB")
- Pills collapse into a "thinking" log expandable below the final response
- Time taken per tool call shown on hover for transparency

**Stack:** SSE event types · React streaming UI

#### `US-2.4` — Movie cards inside chat — **P1**

> As a user, I want recommended movies to appear as visual cards in the chat with poster, rating, and runtime so that I can scan recommendations quickly without reading walls of text.

**Acceptance criteria**
- Agent returns structured movie references using a defined output schema
- Frontend parses these and renders `MovieCard` components inline within messages
- Each card has poster, title, year, runtime, rating, and "Add to watchlist" button
- Click on card opens full movie detail modal with synopsis, cast, and showtimes
- Cards are responsive and stack vertically on mobile

**Stack:** Structured output · MovieCard component · Modal UI

---

### Epic 3 — Cinema showtimes & booking

Find when films are showing and book tickets at Christchurch cinemas. This is the differentiator that takes the app from a recommendation toy to a useful product.

#### `US-3.1` — Scrape Christchurch cinema sites for showtimes — **P0**

> As the system, I want to ingest fresh session data from all eight Christchurch cinemas so that users see real, current showtimes — not stale data.

**Acceptance criteria**
- Python scraper service runs every 4 hours via cron schedule
- Each cinema has its own adapter inheriting from a `BaseScraper` class
- Scraped sessions normalised to the unified sessions DB schema
- Movie titles fuzzy-matched to TMDB metadata via rapidfuzz with 85% threshold
- Errors per-cinema do not kill the whole scrape run — failures logged and reported
- Polite scraping with 2-second delays and identifying user agent

**Stack:** Python · Playwright · BeautifulSoup · Cron · Railway

#### `US-3.2` — See showtimes for a movie near me — **P0**

> As a user, I want to see all showtimes for a film at Christchurch cinemas so that I can pick the most convenient session and cinema.

**Acceptance criteria**
- Movie detail page lists upcoming sessions grouped by cinema
- Each session shows time, format (Standard / 3D / IMAX / LUX), and price
- Date picker switches between today, tomorrow, and the next 7 days
- Cinemas sorted by distance from user using browser geolocation API
- Empty state shown clearly if no sessions are available for the selected date
- Sessions in the past automatically hidden

**Stack:** Express GET /sessions · Geolocation API · React Router

#### `US-3.3` — Book tickets via deep-link — **P0**

> As a user, I want a "Book now" button on each session that jumps directly to the cinema's checkout so that I can complete my booking in one tap.

**Acceptance criteria**
- Each session card has a prominent "Book now →" button
- Click opens the cinema's exact session URL in a new tab with `target=_blank`
- For Hoyts and Reading, URL contains the Vista session ID and drops user on seat selection
- For indie cinemas, URL goes to the closest available equivalent (session page or cinema page)
- Click logs an analytics event capturing cinema, session, and user
- Fallback to cinema homepage if no specific deep-link is available

**Stack:** Deep linking · Analytics · external href

#### `US-3.4` — Seat availability urgency signal — **P1**

> As a user, I want to see when a session is nearly full so that I book quickly when seats are scarce.

**Acceptance criteria**
- Sessions with under 20 seats remaining show "Only X seats left" badge in amber
- Sold-out sessions show "Sold out" badge and disable the book button
- Seat availability refreshed every 30 minutes via the scraper service
- Stale availability data (older than 6 hours) shows a small "updated 6h ago" note

**Stack:** Redis cache · Conditional UI · Tailwind variants

---

### Epic 4 — Watchlist, Watched List & AI Taste Profile

The user has two distinct lists, both backed by a single `WatchlistItem` table
filtered by `status`:

- **Want to Watch** — items with `status` in (`PLANNED`, `WATCHING`).
- **Watched** — items with `status = COMPLETED`, optionally with a 1–10 rating
  and free-text notes.

A movie can move between lists. Rating only applies to watched items. The
unique `(userId, movieId)` constraint means a movie cannot be on both lists at
once.

**User stories**

- **US-4.1 (P0):** As a user, I can mark any movie as watched from the movie
  card or my "Want to Watch" list with a single click.
- **US-4.2 (P0):** As a user, I can rate a watched movie on a 1–10 scale and
  optionally leave personal notes.
- **US-4.3 (P0):** As a user, I can view my Watched list as a separate page,
  sortable by rating and watched-date.
- **US-4.4 (P0):** As a user, I can tell the AI agent "I just watched
  Inception, 8/10" in chat and the agent saves it via the `mark_watched`
  tool.
- **US-4.5 (P0):** As a user, when I ask the agent for recommendations it
  invokes `get_taste_profile` to retrieve my preference summary (average
  rating, top-rated genres, recent watches) and uses it to ground its picks.
- **US-4.6 (P1):** As a user, I can update or remove a rating after the fact.
- **US-4.7 (P2):** Taste profile is enriched with an LLM-generated prose
  summary (e.g. "Loves slow-burn sci-fi, dislikes broad comedy") refreshed
  whenever the watched list changes.

**Tools exposed to the agent**

| Tool | Type | Notes |
|---|---|---|
| `mark_watched(movieId, rating?, notes?)` | write | Upserts a `WatchlistItem` with `status = COMPLETED` |
| `get_taste_profile()` | read | Returns `{ avgRating, ratingCount, topGenres[], recentRatings[] }` |
| `get_user_watchlist(status?)` | read | Filters by status; defaults to all |

**Design rationale**

- One table for both lists keeps writes simple and sidesteps the "what
  happens when a movie moves PLANNED → COMPLETED" data-migration question.
- Tool-call retrieval (rather than always injecting taste profile into the
  system prompt) keeps token usage proportional to demand and demonstrates a
  production agentic pattern.
- 1–10 rating is retained from existing schema; converting to 5-star later
  is trivial display logic.

---

### Epic 5 — Production polish

What makes the app feel real — rate limits, monitoring, error handling, and the live deployment.

#### `US-5.1` — Rate-limit AI calls per user — **P1**

> As the operator, I want per-user rate limits on Claude API calls so that a single user can't burn through my API budget.

**Acceptance criteria**
- Free users: 20 chat messages per 24-hour rolling window
- Sliding-window rate limit implemented using Upstash Redis
- Friendly UI message when limit hit, showing reset time
- Rate limit headers exposed (`X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- Anonymous users get 5 messages before being prompted to sign up

**Stack:** Upstash Redis · Express middleware · Sliding window

#### `US-5.2` — Cache TMDB and showtime queries — **P1**

> As the operator, I want repeated queries to hit the cache, not external APIs, so that I save money and improve latency.

**Acceptance criteria**
- TMDB responses cached for 24 hours
- Session queries cached for 30 minutes
- Cache key includes all relevant query parameters
- Manual cache bust endpoint available for testing (admin only)
- Cache hits and misses logged for monitoring

**Stack:** Redis · Cache-aside pattern · TTL strategy

#### `US-5.3` — Error monitoring and observability — **P2**

> As the developer, I want to see errors in production so that I can fix bugs without users having to report them.

**Acceptance criteria**
- Sentry integrated on both frontend and backend with source maps
- Every Claude API call logged with latency, token usage, and tool calls
- Alerts fire when error rate exceeds 1% of requests over 5 minutes
- Sensitive data (API keys, user emails) scrubbed from error reports

**Stack:** Sentry · Logging middleware · Source maps

#### `US-5.4` — Deployed live with custom domain — **P0**

> As a job applicant, I want a live URL on my resume so that recruiters can try the app immediately and form a positive impression.

**Acceptance criteria**
- Frontend deployed to Vercel with a custom domain
- Express API deployed to Railway with public URL and uptime monitoring
- Python scraper deployed to Railway with cron schedule running every 4 hours
- README contains screenshots, demo GIF, architecture diagram, and setup instructions
- Public GitHub repo with clean commit history (no secrets, no junk commits)
- Live URL loads in under 2 seconds on first visit

**Stack:** Vercel · Railway · Custom domain · GitHub

---

## 7. Build roadmap

A 4-week plan for a solo developer working full-time equivalent hours. Each week ships something demoable — no week ends with broken features.

### Week 1 — Foundation

- Set up monorepo: `/frontend` (Vite), `/backend` (Express), `/scraper` (Python)
- Provision Supabase (auth + Postgres), Upstash Redis, Vercel, Railway
- `US-1.1`, `US-1.2`: Auth foundation working end-to-end
- `US-3.1`: First scraper (Alice Cinema, easy static HTML) writes real sessions to DB
- Deploy nothing yet — local development only

**End of week deliverable:** a developer can sign up, log in, and a CLI script populates the sessions table from one cinema.

### Week 2 — The agent

- `US-2.1`: Chat UI with streaming responses
- `US-2.2`: Agentic loop with tool use — `search_movies`, `get_movie_details`
- `US-2.4`: Movie cards rendered inline in chat
- `US-3.1`: Add 2-3 more easy scrapers (Hollywood, Deluxe)
- First deploy to Vercel + Railway — even if the URL is rough

**End of week deliverable:** a public URL where you can chat with the concierge and get real movie recommendations.

### Week 3 — Showtimes & booking

- `US-3.2`, `US-3.3`: Showtime UI with deep-link booking
- `US-4.1`: Watchlist save/load
- `US-3.1`: Tackle Hoyts EntX scraper (the hard one — XHR intercept with Playwright)
- Once Hoyts works, generalise to Hoyts Riccarton, Hoyts Northlands, Reading
- `US-2.3`: Streaming agent reasoning steps

**End of week deliverable:** the full happy path works — from "what should I watch" to landing on Hoyts seat selection.

### Week 4 — Polish & ship

- `US-4.2`, `US-4.3`: Ratings and taste profile feeding back into the agent
- `US-5.1`, `US-5.2`: Rate limiting and caching
- `US-5.4`: Custom domain, README, demo GIF, architecture diagram
- `US-5.3`: Sentry if time permits
- Polish: error states, loading states, mobile responsiveness, accessibility

**End of week deliverable:** public launch — link goes on the resume.

---

## 8. Success metrics

Because this is a portfolio project, the success metrics are oriented towards the project's actual goal — securing a junior developer role — not towards traditional product KPIs.

### Primary metrics

- Project mentioned in at least one technical interview as something the interviewer asked about
- Live URL works flawlessly when a recruiter clicks it for the first time
- README clearly explains the agentic AI architecture in under 60 seconds of reading
- Developer can answer 5 specific technical questions about every layer of the stack

### Secondary metrics

- App handles 100 concurrent users without degradation
- All 8 Christchurch cinemas successfully scraped at least once a day
- p95 chat response time under 3 seconds for a typical recommendation query
- AI cost per active user under NZ$0.10 per session

---

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cinema sites change HTML or block scrapers | **High** | Adapter pattern means each cinema is isolated. Can disable a broken adapter without taking down the whole platform. Add monitoring on session counts per cinema. |
| Anthropic API costs spiral on demo day | **Medium** | Per-user rate limits in `US-5.1`. Set hard daily spend cap on Anthropic dashboard. Use claude-haiku for low-stakes tool calls. |
| Scope creep — adding features instead of shipping | **High** | Strict P0 / P1 / P2 priority. P2 features only after live deploy. README "future ideas" section catches good ideas without building them. |
| Cinema booking deep-links break or change format | **Medium** | Fallback to cinema homepage. Test deep-links in scraper validation step. Display "unable to find direct link" gracefully. |
| Legal / TOS issues with scraping | **Low** | Portfolio project, non-commercial use, polite scraping (2s delays, identifying UA). README explicitly notes the educational scope. |

---

## 10. Appendix — interview talking points

Pre-prepared answers for likely interview questions about this project. Practice these out loud.

### "Walk me through the architecture"

Three deployable services share one Postgres database. The frontend is a Vite-built React SPA on Vercel. The backend is an Express API on Railway that owns all user-facing endpoints, AI orchestration, and reads from Postgres and Redis. A separate Python scraper service runs on a 4-hour cron, scrapes 8 Christchurch cinema sites with site-specific adapters, and writes normalised session data to the same Postgres database. The split is deliberate — TypeScript for the user-facing layer because of shared types, Python for scraping where Playwright and BeautifulSoup are unmatched.

### "What's the hardest thing you built?"

The Hoyts adapter. Their site is a React SPA powered by Vista ticketing, so scraping the rendered DOM is brittle and messy. Instead, I open the page in Playwright and intercept the XHR responses their own frontend uses to populate the page. That gives me clean JSON with Vista session IDs, which I use to construct deep-links that drop the user directly on Hoyts' seat selection screen. It took two days to figure out, and once it worked it generalised to every Hoyts cinema and Reading with config changes only.

### "Why an agentic loop, not just one Claude call?"

Because the recommendations need real, current data. A single call would have to invent showtimes. With tool use, Claude calls `search_movies`, then `get_showtimes`, then optionally `get_user_watchlist` — autonomously, in the right order. I don't hardcode that flow. The model sees the user's request and the tool descriptions, and decides what to do. That's what makes it an agent rather than a chatbot.

### "What would you do differently?"

If I rebuilt it I'd put more thought into the data ingestion contract earlier. The scraper started writing slightly different shapes from each cinema, and I had to refactor the normaliser twice. Locking down the `BaseScraper` return type from day one would have saved me half a week. Architecturally, I'd also separate the agent into its own service rather than running inside the main API — long-running streaming requests don't play well with regular REST endpoints under load.
