import { tool } from "ai";
import { z } from "zod";
import {
  getUserWatchlist,
  getTasteProfile,
  markWatched,
  searchMovies,
  getMovieDetails,
  getShowtimes,
  recommendMovies,
} from "../controller/chatTools.js";

/**
 * The tool set handed to the model, separated from the implementations in
 * controller/chatTools.js.
 *
 * Two layers, two jobs. `chatTools.js` holds what each tool *does* — plain
 * async functions that query Postgres or TMDB. This file holds what the model
 * *reads*: the name, the description sentence, and the input schema. Groq picks
 * a tool from that description alone, so the wording here is as much part of the
 * agent's behaviour as the prompt is, and the eval suite in test/evals asserts
 * against it.
 *
 * Until now these definitions lived inside chat(), which meant reaching them
 * required an HTTP request, a signed-in user and a live database. Nothing could
 * import them, so nothing could test them.
 *
 * A factory rather than an exported object because every tool closes over
 * `userId`, which is different on every request — there is no single correct
 * value to freeze at module scope.
 *
 * `deps` is forwarded untouched to each implementation. They all declare inner
 * defaults (`{ prisma = defaultPrisma } = {}`), so production calls
 * `buildTools(userId)` and gets the real clients, while a test passes only the
 * pieces it wants to fake and the rest fall through to the defaults. That is
 * what lets an eval run the real TMDB path against a fake database.
 *
 * get_now_showing is deliberately absent: the listing is pre-fetched into the
 * system prompt instead, so the model does not spend a tool-call round-trip on
 * something needed every turn.
 */
export function buildTools(userId, deps = {}) {
  return {
    get_user_watchlist: tool({
      description:
        "Get the logged-in user's watchlist, optionally filtered by status (PLANNED, WATCHING, COMPLETED, DROPPED)",
      inputSchema: z.object({
        status: z
          .enum(["PLANNED", "WATCHING", "COMPLETED", "DROPPED"])
          .optional(),
      }),
      execute: async ({ status }) => getUserWatchlist(userId, status, deps),
    }),

    get_taste_profile: tool({
      description:
        "Get a summary of the user's movie taste based on their watched and rated movies",
      inputSchema: z.object({}),
      execute: async () => getTasteProfile(userId, deps),
    }),

    mark_watched: tool({
      description:
        "Mark a movie as watched for the logged-in user, optionally with a rating (1-10) and notes",
      inputSchema: z.object({
        movieId: z.string(),
        rating: z.number().min(1).max(10).optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ movieId, rating, notes }) =>
        markWatched(userId, movieId, rating, notes, deps),
    }),

    search_movies: tool({
      description: "Search for movies by title using TMDB",
      inputSchema: z.object({
        query: z.string(),
      }),
      execute: async ({ query }) => searchMovies(query, deps),
    }),

    get_movie_details: tool({
      description: "Get full details for a specific movie by its TMDB movie ID",
      inputSchema: z.object({
        movieId: z.string(),
      }),
      execute: async ({ movieId }) => getMovieDetails(movieId, deps),
    }),

    get_showtimes: tool({
      description:
        "Get cinema showtimes for a specific movie, optionally filtered by date (YYYY-MM-DD format)",
      inputSchema: z.object({
        movieId: z.string(),
        date: z.string().optional(),
      }),
      execute: async ({ movieId, date }) => getShowtimes(movieId, date, deps),
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
      execute: async ({ recommendations }) =>
        recommendMovies(recommendations, deps),
    }),
  };
}
