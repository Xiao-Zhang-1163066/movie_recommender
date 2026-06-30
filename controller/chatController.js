import { streamText, tool, stepCountIs } from "ai";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { createGroq } from "@ai-sdk/groq";
import { cache } from "../config/redis.js";

// Step 1: create the AI provider
// const google = createGoogleGenerativeAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w500";

function buildSystemPrompt(nowShowing) {
  return `You are AI Movie Mate, a concierge that recommends films to users in
  Christchurch, New Zealand.

  Films currently playing in Christchurch cinemas:
  ${JSON.stringify(nowShowing)}

  How to recommend:
  1. At least one of your recommendations MUST come from the now-showing list above. You may
  also suggest other relevant films that are not currently playing.
  2. Never invent TMDB ids. Every tmdbId must come from the now-showing list or search_movies —
  real movies only. Use get_movie_details if you need runtime or genres before deciding.
  3. When you suggest specific films you MUST call recommend_movies, passing each film's TMDB
  id and a one-sentence reason it fits what the user asked for. The reason is shown on the card.
  4. If nothing currently playing fits the request, say so honestly and recommend the closest
  real films that aren't in theatres — do not force an ill-fitting in-theatre pick.

  Response format — follow this order every time:
  1. Write your opening text first (1–2 short sentences framing the picks). Do not call any
  tools before writing this — it must stream to the user immediately.
  2. Then call recommend_movies in the same response.
  Do not describe posters or ratings in prose — the card shows those.`;
}

// Classifies model-provider errors so the client can show targeted help text
// instead of a generic "something went wrong" message.
function classifyModelError(err) {
  const msg = String(err?.message ?? "").toLowerCase();
  const body = String(err?.responseBody ?? err?.data ?? "").toLowerCase();
  const combined = msg + " " + body;
  const status = err?.statusCode ?? err?.status;

  if (status === 429 || combined.includes("rate_limit") || combined.includes("rate limit")) {
    return "rate_limit";
  }
  if (combined.includes("context length") || combined.includes("context window") || combined.includes("maximum context")) {
    return "context_limit";
  }
  return "general";
}

const MODEL_ERROR_MESSAGES = {
  rate_limit: "The AI service is busy — you've hit its rate limit. Please wait a moment before sending another message.",
  context_limit: "This conversation is too long for me to continue. Please start a new chat.",
  general: "The assistant ran into a problem.",
};

// Wraps fetch with a per-request timeout and exponential-backoff retries.
// Only retries on network errors and 5xx responses — 4xx are caller errors and
// should surface immediately rather than burning quota retrying a bad request.
async function fetchWithRetry(url, { maxAttempts = 3, timeoutMs = 8_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
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

/**
 * POST /chat
 * Body: { messages: [{ role, content }] }
 *
 * Streams a custom NDJSON protocol — one JSON object per line:
 *   { "t": "text",   "v": "<delta>" }                 incremental assistant text
 *   { "t": "movies", "v": [ ...cards ] }              a recommend_movies result
 *   { "t": "error",  "v": "<message>", "kind": "..." } a stream-level error
 */
export const chat = async (req, res, next) => {
  try {
    const { messages } = req.body;
    const userId = req.user.id;

    const tools = {
      get_user_watchlist: tool({
        description:
          "Get the logged-in user's watchlist, optionally filtered by status (PLANNED, WATCHING, COMPLETED, DROPPED)",
        inputSchema: z.object({
          status: z
            .enum(["PLANNED", "WATCHING", "COMPLETED", "DROPPED"])
            .optional(),
        }),
        execute: async ({ status }) => {
          const watchlist = await prisma.watchlistItem.findMany({
            where: { userId, ...(status ? { status } : {}) },
            include: { movie: true },
          });
          return watchlist;
        },
      }),
      get_taste_profile: tool({
        description:
          "Get a summary of the user's movie taste based on their watched and rated movies",
        inputSchema: z.object({}),
        execute: async () => {
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
        },
      }),
      mark_watched: tool({
        description:
          "Mark a movie as watched for the logged-in user, optionally with a rating (1-10) and notes",
        inputSchema: z.object({
          movieId: z.string(),
          rating: z.number().min(1).max(10).optional(),
          notes: z.string().optional(),
        }),
        execute: async ({ movieId, rating, notes }) => {
          // upsert a WatchlistItem: where userId+movieId, update status=COMPLETED+rating+notes, create if not exists
          await prisma.watchlistItem.upsert({
            where: { userId_movieId: { userId, movieId } }, // The WatchlistItem schema has @@unique([userId, movieId]), which Prisma exposes as a compound key called userId_movieId. The where for upsert must use it
            update: { status: "COMPLETED", rating, notes },
            create: { userId, movieId, status: "COMPLETED", rating, notes },
          });
          return { success: true };
        },
      }),

      search_movies: tool({
        description: "Search for movies by title using TMDB",
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: async ({ query }) => {
          const cacheKey = `tmdb:search:${query.toLowerCase()}`;
          let results = await cache.get(cacheKey);
          if (!results) {
            const data = await fetchWithRetry(
              `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`,
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
        },
      }),

      get_movie_details: tool({
        description:
          "Get full details for a specific movie by its TMDB movie ID",
        inputSchema: z.object({
          movieId: z.string(),
        }),
        execute: async ({ movieId }) => {
          const cacheKey = `tmdb:movie:${movieId}`;
          let data = await cache.get(cacheKey);
          if (!data) {
            data = await fetchWithRetry(
              `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}`,
            ).then((res) => res.json());
            await cache.set(cacheKey, data, 86_400); // 24 h
          }
          return {
            id: data.id,
            title: data.title,
            release_date: data.release_date,
            overview: data.overview,
            runtime: data.runtime,
            genres: data.genres.map((g) => g.name),
          };
        },
      }),
      get_showtimes: tool({
        description:
          "Get cinema showtimes for a specific movie, optionally filtered by date (YYYY-MM-DD format)",
        inputSchema: z.object({
          movieId: z.string(),
          date: z.string().optional(),
        }),
        execute: async ({ movieId, date }) => {
          // build a where clause: always filter by movieId

          // if date is provided, filter startsAt >= start of that day and < start of next day
          const where = { movieId };
          if (date) {
            const startDate = new Date(date);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            where.startsAt = { gte: startDate, lt: endDate };
          }
          const sessions = await prisma.session.findMany({
            where,
            include: { cinema: true },
          });
          return sessions;
        },
      }),

      recommend_movies: tool({
        description:
          "Display recommended movies to the user as visual cards. Call this whenever you suggest specific films. For each movie pass its TMDB id and a short reason it fits the user's request — the reason is shown on the card.",
        inputSchema: z.object({
          recommendations: z.array(
            z.object({
              tmdbId: z.number(),
              reason: z
                .string()
                .describe(
                  "One short sentence on why this movie fits what the user asked for",
                ),
            }),
          ),
        }),
        execute: async ({ recommendations }) => {
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
          const cards = await Promise.all(
            recommendations.map(async ({ tmdbId, reason }) => {
              const cacheKey = `tmdb:movie:${tmdbId}`;
              let data = await cache.get(cacheKey);
              if (!data) {
                data = await fetchWithRetry(
                  `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`,
                ).then((r) => r.json());
                // Movie metadata (title, poster, runtime, genres) is stable —
                // 24 h TTL keeps cards accurate without hammering the TMDB API.
                await cache.set(cacheKey, data, 86_400);
              }
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
          return cards;
        },
      }),
    };

    // Pre-fetch now-showing so the model gets it as context rather than spending
    // a tool-call round-trip on get_now_showing. Cached for 5 min so every turn
    // in the same window hits Redis instead of Postgres.
    const NOW_SHOWING_CACHE_KEY = "now_showing";
    let nowShowing = await cache.get(NOW_SHOWING_CACHE_KEY);
    if (!nowShowing) {
      const now = new Date();
      nowShowing = await prisma.movie.findMany({
        where: {
          sessions: { some: { startsAt: { gt: now } } },
          tmdbId: { not: null },
        },
        select: {
          tmdbId: true,
          title: true,
          genres: true,
          voteAverage: true,
          overview: true,
        },
      });
      await cache.set(NOW_SHOWING_CACHE_KEY, nowShowing, 300);
    }

    // Abort the model run only if the client disconnects mid-stream. Wire this
    // to the *response* close (not req close, which fires as soon as the request
    // body is read) and guard on writableEnded so normal completion never aborts.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const result = streamText({
      model: groq("openai/gpt-oss-120b"),
      system: buildSystemPrompt(nowShowing),
      messages,
      tools,
      stopWhen: stepCountIs(8),
      abortSignal: controller.signal,
    });

    // Stream our own NDJSON protocol off the SDK's fullStream so we can carry
    // both text deltas and structured recommend_movies cards on one connection.
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    try {
      for await (const part of result.fullStream) {
        if (res.writableEnded) break;
        if (part.type === "text-delta") {
          res.write(JSON.stringify({ t: "text", v: part.text }) + "\n");
        } else if (
          part.type === "tool-result" &&
          part.toolName === "recommend_movies"
        ) {
          res.write(JSON.stringify({ t: "movies", v: part.output }) + "\n");
        } else if (part.type === "error") {
          // The SDK surfaces model/tool failures as a stream part rather than
          // throwing — classify and forward so the client can show targeted help.
          console.error("Chat fullStream error part:", part.error);
          const kind = classifyModelError(part.error);
          res.write(
            JSON.stringify({ t: "error", v: MODEL_ERROR_MESSAGES[kind], kind }) + "\n",
          );
        }
      }
    } catch (streamErr) {
      console.error("Chat stream error:", streamErr);
      if (!res.writableEnded) {
        const kind = classifyModelError(streamErr);
        res.write(
          JSON.stringify({ t: "error", v: MODEL_ERROR_MESSAGES[kind], kind }) + "\n",
        );
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  } catch (err) {
    next(err);
  }
};
