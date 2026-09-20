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
  findSimilarMovies,
} from "../controller/chatTools.js";
import { hasEmbeddingSupport } from "../services/embeddingService.js";

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
  const tools = {
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

    // "when the user names a film" is the half that matters now that a second
    // search tool exists. A model picks between two tools by contrast, so each
    // description has to say what the other one is for.
    search_movies: tool({
      description:
        "Search all of TMDB for movies by title. Use this when the user names a specific film.",
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

  // Registered only when embeddings can actually run. Absent beats
  // present-and-failing: a tool that throws still gets called, and every attempt
  // spends one of the eight steps a turn is allowed. With no definition the
  // model simply plans around it, and a clone of this repo holding only a Groq
  // key keeps working.
  if (hasEmbeddingSupport()) {
    tools.find_similar_movies = tool({
      description:
        "Find movies by what they are like — plot, mood, theme, style — rather than by title. " +
        "Use this whenever the user describes the kind of film they want instead of naming one. " +
        "Searches the local Christchurch catalogue, not all of TMDB.",
      inputSchema: z.object({
        description: z
          .string()
          .describe(
            // Measured, not guessed: plot-style wording scored 0.73 against the
            // right film, while category wording ("a loud action blockbuster")
            // barely cleared the noise floor. Overviews are written as plots, so
            // queries shaped like plots match them.
            "A short plot-style description of the film the user is imagining, in the style of a synopsis — not genre labels",
          ),
        onlyInTheatres: z
          .boolean()
          .optional()
          .describe(
            "True when the user wants something they can watch in a cinema now",
          ),
      }),
      execute: async ({ description, onlyInTheatres }) =>
        findSimilarMovies(description, onlyInTheatres ?? false, deps),
    });
  }

  return tools;
}
