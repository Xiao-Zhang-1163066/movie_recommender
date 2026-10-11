import { prisma as defaultPrisma } from "../config/db.js";
import { cache as defaultCache } from "../config/redis.js";
import { embedQuery as defaultEmbedQuery, toSqlVector } from "../services/embeddingService.js";

export const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w500";

/**
 * The implementations behind the chat assistant's tools.
 *
 * These live outside chatController.js so the tests can import the same code the
 * assistant runs. Previously the tool bodies were closures inside chat(), which
 * made them unreachable from a test file — the unit tests had to re-implement
 * the logic, so they passed no matter what the controller did.
 *
 * Every external dependency (Prisma, Redis, fetch, the TMDB key) arrives through
 * the trailing options object and defaults to the real thing. Production callers
 * pass nothing; tests pass fakes. Nothing here reaches for a dependency itself.
 */

// Wraps fetch with a per-request timeout and exponential-backoff retries.
// Only retries on network errors and 5xx responses — 4xx are caller errors and
// should surface immediately rather than burning quota retrying a bad request.
//
// The status check sits *outside* the try on purpose. It used to be inside it,
// as `if (res.status < 500) throw ...` with a "don't retry 4xx" comment, and
// that throw was caught by its own catch two lines below and retried like any
// network error — so every 404 cost three round-trips and 1.5 s of backoff
// while the comment claimed otherwise. The function had no test of its own,
// which is how the code and the comment got to disagree for that long.
export async function fetchWithRetry(
  url,
  { maxAttempts = 3, timeoutMs = 8_000, fetchFn = fetch } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchFn(url, { signal: controller.signal });
    } catch (err) {
      lastError = err; // network error or timeout — fall through to retry
    } finally {
      clearTimeout(timer);
    }
    if (res) {
      if (res.ok) return res;
      if (res.status < 500) throw new Error(`TMDB ${res.status}`); // caller error, never retried
      lastError = new Error(`TMDB ${res.status}`);
    }
    if (attempt < maxAttempts) {
      // 500 ms → 1 000 ms backoff
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

// Shared by every TMDB-backed tool: check Redis, fall back to the API, store the
// result. Keeping it in one place means the cache key format can't drift between
// the tool that writes it and the tool that reads it.
async function fetchTmdbCached(url, cacheKey, ttlSeconds, { fetchFn, cache }) {
  const cached = await cache.get(cacheKey);
  if (cached) return cached;
  const data = await fetchWithRetry(url, { fetchFn }).then((res) => res.json());
  await cache.set(cacheKey, data, ttlSeconds);
  return data;
}

export async function getUserWatchlist(userId, status, { prisma = defaultPrisma } = {}) {
  return prisma.watchlistItem.findMany({
    where: { userId, ...(status ? { status } : {}) },
    include: { movie: true },
  });
}

export async function getTasteProfile(userId, { prisma = defaultPrisma } = {}) {
  const watchedMovies = await prisma.watchlistItem.findMany({
    where: { userId, status: "COMPLETED", rating: { not: null } },
    include: { movie: true },
  });
  return {
    ratingCount: watchedMovies.length,
    avgRating: watchedMovies.length
      ? watchedMovies.reduce((acc, item) => acc + item.rating, 0) /
        watchedMovies.length
      : null,
    recentRatings: watchedMovies.slice(-5).map((item) => ({
      title: item.movie.title,
      rating: item.rating,
    })),
  };
}

/**
 * Turn a TMDB id into the internal Movie row, creating it from TMDB if we have
 * never seen the film.
 *
 * Every tool hands the model a `tmdbId` — search results, semantic search, the
 * now-showing list in the system prompt — and no tool has ever shown it a
 * `Movie.id`. So a tool parameter typed as an internal id is a parameter the
 * model can only guess at, which is why this exists.
 *
 * The important part is where the metadata comes from. `addToWatchlist` in
 * watchlistController.js does the same find-or-create, but reads title, poster
 * and overview out of the request body — fine, because a browser form is
 * quoting a film it was shown. Here the caller is a language model, and a
 * `title` parameter would be a field it could invent, so the only thing it may
 * pass is the number and everything else is fetched. Every row this creates
 * therefore carries real TMDB metadata.
 *
 * Stated precisely, because it is easy to oversell: this does not stop the
 * model passing a real id for the wrong film — that risk is the same one
 * recommend_movies already carries. What it stops is invented strings reaching
 * the database.
 *
 * Returns null when TMDB has no release date. `Movie.releaseYear` is a required
 * Int, so there is nothing to store, and letting Prisma reject it would surface
 * to the model as "the database could not be reached" — false, and the same
 * misdirection the not_found kind was added to fix.
 *
 * No embedding is written. The backfill job finds rows whose hash does not
 * match and embeds them on its next run, so a new row is picked up without this
 * request waiting on an API call it does not need.
 */
async function findOrCreateMovieByTmdbId(
  tmdbId,
  userId,
  { prisma, fetchFn, cache, apiKey },
) {
  // Fast path first: a film already on file costs one indexed lookup and no
  // network at all. tmdbId is @unique, so this is a primary-key-grade read.
  const existing = await prisma.movie.findUnique({ where: { tmdbId } });
  if (existing) return existing;

  // Same cache key as getMovieDetails and recommendMovies, so a film the model
  // has already looked at this turn is free here.
  const data = await fetchTmdbCached(
    `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`,
    `tmdb:movie:${tmdbId}`,
    86_400, // 24 h
    { fetchFn, cache },
  );

  const releaseYear = data.release_date
    ? Number(data.release_date.slice(0, 4))
    : null;
  if (!releaseYear) return null;

  // upsert, not create: two turns marking the same film at once would both miss
  // the lookup above and the second create would hit the tmdbId unique
  // constraint. `update: {}` because the only thing being asserted is that the
  // row exists — we are not the owner of this data, the scraper is.
  return prisma.movie.upsert({
    where: { tmdbId: data.id },
    update: {},
    create: {
      tmdbId: data.id,
      title: data.title,
      overview: data.overview ?? null,
      releaseYear,
      genres: data.genres?.map((genre) => genre.name) ?? [],
      runtime: data.runtime ?? null,
      voteAverage: data.vote_average ?? null,
      posterUrl: data.poster_path ? `${TMDB_IMG_BASE}${data.poster_path}` : null,
      createdBy: userId,
    },
  });
}

export async function markWatched(
  userId,
  tmdbId,
  rating,
  notes,
  {
    prisma = defaultPrisma,
    fetchFn = fetch,
    cache = defaultCache,
    apiKey = process.env.TMDB_API_KEY,
  } = {},
) {
  const movie = await findOrCreateMovieByTmdbId(tmdbId, userId, {
    prisma,
    fetchFn,
    cache,
    apiKey,
  });

  // Returned, not thrown. This is an answer the model can pass on, not a
  // dependency failing: nothing is broken, the film simply cannot be stored.
  // Phase 1's rule is that failures throw so they stay a tool-error; an
  // outcome like this one belongs in the return value alongside success.
  if (!movie) {
    return {
      success: false,
      reason:
        "TMDB has no release date for that film, so it cannot be stored. Tell the user you could not record that one.",
    };
  }

  // The WatchlistItem schema has @@unique([userId, movieId]), which Prisma
  // exposes as a compound key called userId_movieId. The where for upsert must
  // use it.
  await prisma.watchlistItem.upsert({
    where: { userId_movieId: { userId, movieId: movie.id } },
    update: { status: "COMPLETED", rating, notes },
    create: { userId, movieId: movie.id, status: "COMPLETED", rating, notes },
  });

  // The title goes back deliberately. It is the model's only chance to notice
  // it marked the wrong film, and the user's only chance to catch it, since
  // "done" on its own confirms nothing about which film was meant.
  return { success: true, title: movie.title };
}

// Every row returned here lands in the model's context, so this is a token
// budget, not a page size. Measured on 2026-10-10: six real searches during one
// turn returned 66 rows totalling 6,282 tokens — 76% of the 8,210-token request
// that then blew Groq's 8,000 TPM ceiling and killed the turn. Capping at five
// brings the same turn to ~4,081.
//
// Only the count is capped; overview is left intact. It is tempting to drop it
// (that would save 93% rather than 66%) but the sole consumer of this result is
// the model, and overview is what it reads to judge which film fits the request.
// TMDB orders by relevance, so rows 6-20 are noise — searching "inception"
// returns "Bikini Inception" — which makes the count the part that is free to cut.
const SEARCH_RESULT_LIMIT = 5;

export async function searchMovies(
  query,
  {
    fetchFn = fetch,
    cache = defaultCache,
    apiKey = process.env.TMDB_API_KEY,
  } = {},
) {
  // :v2 — the shape changed when the row count was capped. Reusing the key
  // would serve 20-row payloads for another hour out of a cache that looks
  // perfectly healthy, which is the trap now_showing:v2 was bumped for.
  const cacheKey = `tmdb:search:v2:${query.toLowerCase()}`;
  let results = await cache.get(cacheKey);
  if (!results) {
    const data = await fetchWithRetry(
      `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`,
      { fetchFn },
    ).then((res) => res.json());
    results = data.results.slice(0, SEARCH_RESULT_LIMIT).map((movie) => ({
      id: movie.id,
      title: movie.title,
      release_date: movie.release_date,
      overview: movie.overview,
    }));
    // 1 h — search results shift more often than individual movie details
    await cache.set(cacheKey, results, 3_600);
  }
  return results;
}

export async function getMovieDetails(
  movieId,
  {
    fetchFn = fetch,
    cache = defaultCache,
    apiKey = process.env.TMDB_API_KEY,
  } = {},
) {
  const data = await fetchTmdbCached(
    `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}`,
    `tmdb:movie:${movieId}`,
    86_400, // 24 h
    { fetchFn, cache },
  );
  return {
    id: data.id,
    title: data.title,
    release_date: data.release_date,
    overview: data.overview,
    runtime: data.runtime,
    genres: data.genres.map((g) => g.name),
  };
}

/**
 * Showtimes for one film, looked up by TMDB id.
 *
 * This took a `movieId` and filtered `Session.movieId` with it directly, which
 * is a foreign key to `Movie.id` — a uuid the model has never been shown. So
 * every call filtered on a value that matched no row and came back `[]`.
 *
 * That is worse than the same bug in mark_watched, which at least failed
 * loudly on the foreign key. `[]` is a *valid* answer here, meaning "nothing
 * scheduled", so the model read it as fact and told the user the film was not
 * playing — confidently, and wrongly, for a film that might be on tonight.
 * A silent wrong answer beats a loud failure for cost every time.
 *
 * `found` exists because "we have no such film" and "that film has no sessions"
 * are different things to tell a user, and an empty array cannot say which.
 * The resolved `title` rides along for the same reason markWatched returns it:
 * it is where a lookup for the wrong film becomes visible.
 */
export async function getShowtimes(tmdbId, date, { prisma = defaultPrisma } = {}) {
  // Read-only: unlike markWatched this never creates the film. A Movie row with
  // no sessions would be of no use to anyone, and inventing one to answer a
  // question about showtimes would put a row in the table on the strength of a
  // question rather than a fact.
  const movie = await prisma.movie.findUnique({
    where: { tmdbId },
    select: { id: true, title: true },
  });
  if (!movie) return { found: false, title: null, sessions: [] };

  const where = { movieId: movie.id };
  if (date) {
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    where.startsAt = { gte: startDate, lt: endDate };
  } else {
    // Upcoming only. Without this the answer was every session ever scraped:
    // scraper/db.py deletes only *future* sessions before re-inserting, because
    // the cinema website is authoritative about the future and silent about the
    // past, so past rows accumulate indefinitely. The model read them as
    // current and offered users screenings that had already happened.
    //
    // A date is still honoured as given. Someone asking what played on a
    // particular Saturday deserves a straight answer, even a past one — the
    // default is what needed fixing, not the filter.
    //
    // getNowShowing, findSimilarMovies and recommendMovies all filtered on
    // startsAt already. This was the one that did not.
    where.startsAt = { gt: new Date() };
  }

  const sessions = await prisma.session.findMany({
    where,
    include: { cinema: true },
    // Chronological, because the model is answering "when can I see this" and
    // an unordered list makes it pick a time rather than the earliest one.
    orderBy: { startsAt: "asc" },
  });
  return { found: true, title: movie.title, sessions };
}

export async function recommendMovies(
  recommendations,
  {
    prisma = defaultPrisma,
    fetchFn = fetch,
    cache = defaultCache,
    apiKey = process.env.TMDB_API_KEY,
  } = {},
) {
  // Enrich each id into a card payload from TMDB so poster / rating /
  // runtime are always accurate (never invented by the model).
  const now = new Date();
  const tmdbIds = recommendations.map((r) => r.tmdbId);
  const inTheatreMovies = await prisma.movie.findMany({
    where: {
      tmdbId: { in: tmdbIds },
      sessions: { some: { startsAt: { gt: now } } },
    },
    select: { tmdbId: true },
  });
  const inTheatreIds = new Set(inTheatreMovies.map((m) => m.tmdbId));
  return Promise.all(
    recommendations.map(async ({ tmdbId, reason }) => {
      // Movie metadata (title, poster, runtime, genres) is stable —
      // 24 h TTL keeps cards accurate without hammering the TMDB API.
      const data = await fetchTmdbCached(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`,
        `tmdb:movie:${tmdbId}`,
        86_400,
        { fetchFn, cache },
      );
      return {
        tmdbId: data.id,
        title: data.title,
        releaseYear: data.release_date
          ? Number(data.release_date.slice(0, 4))
          : null,
        runtime: data.runtime ?? null,
        voteAverage: data.vote_average ?? null,
        posterUrl: data.poster_path
          ? `${TMDB_IMG_BASE}${data.poster_path}`
          : null,
        overview: data.overview ?? null,
        reason: reason,
        inTheatre: inTheatreIds.has(tmdbId),
      };
    }),
  );
}

// Pre-fetched into the system prompt rather than exposed as a tool, so the model
// doesn't spend a round-trip asking for it. Cached for 5 min so every turn in the
// same window hits Redis instead of Postgres.
export async function getNowShowing({
  prisma = defaultPrisma,
  cache = defaultCache,
} = {}) {
  // Bumped to :v2 when overview was dropped below. The shape of a cached value is
  // part of its identity — reusing the key would serve the old fat payload for up
  // to 5 more minutes after deploy, from a cache that looks perfectly healthy.
  const CACHE_KEY = "now_showing:v2";
  const cached = await cache.get(CACHE_KEY);
  if (cached) return cached;

  const nowShowing = await prisma.movie.findMany({
    where: {
      sessions: { some: { startsAt: { gt: new Date() } } },
      tmdbId: { not: null },
    },
    // overview dropped: 21 blurbs were ~71% of this payload and rode into every
    // system prompt unread. The prompt already tells the model to call
    // get_movie_details when it wants a synopsis, so this is repeated, not lost.
    select: {
      tmdbId: true,
      title: true,
      genres: true,
      voteAverage: true,
    },
  });
  await cache.set(CACHE_KEY, nowShowing, 300);
  return nowShowing;
}

// Ten is a retrieval budget, not a display limit. Every row here rides into the
// model's context, and Sprint 2 measured what a fat payload costs per turn.
const SIMILAR_LIMIT = 10;

/**
 * Semantic search over our own catalogue: vector recall, then a hard filter on
 * reality. The complement to search_movies, which matches TMDB titles by
 * keyword and cannot answer "something dreamlike and slow".
 *
 * Pre-filter, not post-filter. The tempting version takes the top 20 by
 * similarity and then drops the ones with no session — with 21 of 75 films
 * showing, that routinely returns an empty list for a question the database
 * could easily answer. Putting the session check in the WHERE clause makes
 * Postgres rank *within* the eligible set, so onlyInTheatres always yields the
 * best available answer rather than possibly nothing.
 *
 * The cost, stated plainly: a pre-filter defeats the HNSW index, because the
 * graph cannot be walked with an arbitrary predicate applied, so Postgres falls
 * back to an exact scan of the filtered rows. At this size that is free — and
 * at 75 rows it was choosing a sequential scan anyway.
 */
export async function findSimilarMovies(
  description,
  onlyInTheatres = false,
  { prisma = defaultPrisma, embedQuery = defaultEmbedQuery } = {},
) {
  const vector = toSqlVector(await embedQuery(description));

  const rows = await prisma.$queryRaw`
    SELECT m."tmdbId", m.title, m."releaseYear", m.genres,
           1 - (m.embedding <=> ${vector}::vector) AS similarity,
           EXISTS (
             SELECT 1 FROM "Session" s
             WHERE s."movieId" = m.id AND s."startsAt" > now()
           ) AS "inTheatre"
    FROM "Movie" m
    WHERE m.embedding IS NOT NULL
      -- Rows without a TMDB id are unusable downstream: recommend_movies is
      -- keyed on tmdbId, so returning one would invite the model to invent a
      -- number or to cite a film it cannot then display.
      AND m."tmdbId" IS NOT NULL
      AND (
        ${onlyInTheatres}::boolean IS NOT TRUE
        OR EXISTS (
          SELECT 1 FROM "Session" s
          WHERE s."movieId" = m.id AND s."startsAt" > now()
        )
      )
    ORDER BY m.embedding <=> ${vector}::vector
    LIMIT ${SIMILAR_LIMIT}
  `;

  return rows.map((row) => ({
    tmdbId: row.tmdbId,
    title: row.title,
    releaseYear: row.releaseYear,
    genres: row.genres,
    inTheatre: row.inTheatre,
    // Three decimals is all the ordering information the model can use, and the
    // other fourteen digits are tokens spent saying nothing.
    similarity: Number(row.similarity.toFixed(3)),
  }));
}
