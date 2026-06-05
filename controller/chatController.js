import { streamText, tool, stepCountIs } from "ai";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { createGroq } from "@ai-sdk/groq";

// Step 1: create the Gemini provider using GEMINI_API_KEY from process.env
// const google = createGoogleGenerativeAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w500";

const SYSTEM_PROMPT = `You are AI Movie Mate, a concierge that recommends films to users in 
  Christchurch, New Zealand.

  How to recommend:
  1. Before recommending, call get_now_showing to see which films are currently playing in 
  Christchurch cinemas.
  2. At least one of your recommendations MUST come from that now-showing list. You may also 
  suggest other relevant films that are not currently playing.
  3. Never invent TMDB ids. Every id must come from get_now_showing or search_movies — real 
  movies only. Use get_movie_details if you need runtime or genres before deciding.
  4. When you suggest specific films you MUST call recommend_movies, passing each film's TMDB 
  id and a one-sentence reason it fits what the user asked for. The reason is shown on the 
  card.
  5. If nothing currently playing fits the request, say so honestly and recommend the closest 
  real films as options that aren't in theatres right now — do not force an ill-fitting 
  in-theatre pick.

  Keep your text reply short and conversational (a sentence or two framing the picks). Do not 
  describe posters or ratings in prose — the card shows those.`;

/**
 * POST /chat
 * Body: { messages: [{ role, content }] }
 *
 * Streams a custom NDJSON protocol — one JSON object per line:
 *   { "t": "text",   "v": "<delta>" }   incremental assistant text
 *   { "t": "movies", "v": [ ...cards ] } a recommend_movies result
 *   { "t": "error",  "v": "<message>" } a stream-level error
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
          // fetch from https://api.themoviedb.org/3/search/movie
          const data = await fetch(
            `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`,
          ).then((res) => res.json());
          // return only: id, title, release_date, overview from results.results
          return data.results.map((movie) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            overview: movie.overview,
          }));
        },
      }),

      get_movie_details: tool({
        description:
          "Get full details for a specific movie by its TMDB movie ID",
        inputSchema: z.object({
          movieId: z.string(),
        }),
        execute: async ({ movieId }) => {
          // fetch from https://api.themoviedb.org/3/movie/{movieId}
          // query params: api_key
          const data = await fetch(
            `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}`,
          ).then((res) => res.json());
          // return only: id, title, release_date, overview, runtime, genres
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

      get_now_showing: tool({
        description:
          "List movies currently showing in Christchurch cinemas (from scraped sessions). Use this to ground recommendations — at least one recommended movie must come from this list.",
        // No inputs: it always returns the full now-showing set.
        inputSchema: z.object({}),
        execute: async () => {
          const now = new Date();

          const movies = await prisma.movie.findMany({
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
          return movies;
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
              const data = await fetch(
                `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`,
              ).then((r) => r.json());
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

    // Abort the model run only if the client disconnects mid-stream. Wire this
    // to the *response* close (not req close, which fires as soon as the request
    // body is read) and guard on writableEnded so normal completion never aborts.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const result = streamText({
      model: groq("openai/gpt-oss-120b"),
      system: SYSTEM_PROMPT,
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
          // throwing — forward it so the loop doesn't just end silently.
          console.error("Chat fullStream error part:", part.error);
          res.write(
            JSON.stringify({
              t: "error",
              v: "The assistant ran into a problem.",
            }) + "\n",
          );
        }
      }
    } catch (streamErr) {
      console.error("Chat stream error:", streamErr);
      if (!res.writableEnded) {
        res.write(
          JSON.stringify({
            t: "error",
            v: "The assistant ran into a problem.",
          }) + "\n",
        );
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  } catch (err) {
    next(err);
  }
};
