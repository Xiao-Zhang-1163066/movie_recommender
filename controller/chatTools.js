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
export async function fetchWithRetry(
  url,
  { maxAttempts = 3, timeoutMs = 8_000, fetchFn = fetch } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { signal: controller.signal });
      if (res.ok) return res;
      if (res.status < 500) throw new Error(`TMDB ${res.status}`); // don't retry 4xx
      lastError = new Error(`TMDB ${res.status}`);
    } catch (err) {
      lastError = err; // network error or timeout — fall through to retry
    } finally {
      clearTimeout(timer);
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

export async function markWatched(
  userId,
  movieId,
  rating,
  notes,
  { prisma = defaultPrisma } = {},
) {
  // The WatchlistItem schema has @@unique([userId, movieId]), which Prisma
  // exposes as a compound key called userId_movieId. The where for upsert must
  // use it.
  await prisma.watchlistItem.upsert({
    where: { userId_movieId: { userId, movieId } },
    update: { status: "COMPLETED", rating, notes },
    create: { userId, movieId, status: "COMPLETED", rating, notes },
  });
  return { success: true };
}

export async function searchMovies(
  query,
  {
    fetchFn = fetch,
    cache = defaultCache,
    apiKey = process.env.TMDB_API_KEY,
  } = {},
) {
  const cacheKey = `tmdb:search:${query.toLowerCase()}`;
  let results = await cache.get(cacheKey);
  if (!results) {
    const data = await fetchWithRetry(
      `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`,
      { fetchFn },
    ).then((res) => res.json());
    results = data.results.map((movie) => ({
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

export async function getShowtimes(movieId, date, { prisma = defaultPrisma } = {}) {
  const where = { movieId };
  if (date) {
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    where.startsAt = { gte: startDate, lt: endDate };
  }
  return prisma.session.findMany({ where, include: { cinema: true } });
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
