import { tool } from "ai";
import { z } from "zod";
import {
  getUserWatchlist,
  getTasteProfile,
  proposeWatched,
  searchMovies,
  getMovieDetails,
  getShowtimes,
  recommendMovies,
  findSimilarMovies,
} from "../controller/chatTools.js";
import { hasEmbeddingSupport } from "../services/embeddingService.js";
import { toToolFailure } from "./toolErrors.js";

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
/**
 * Tools whose result is a proposal awaiting the user, not an accomplished fact.
 *
 * Named here rather than sniffed for a `pending` key in the controller, so the
 * list of tools that need a confirmation card is one grep away and adding a
 * second write tool is one line. The controller already branches on tool name
 * for recommend_movies, so this matches how it reads the stream.
 */
export const CONFIRMABLE_TOOLS = new Set(["mark_watched"]);

export function buildTools(userId, deps = {}) {
  // Every optional argument is .nullish(), never .optional(). The two differ in
  // what the model may *send*: optional means the key may be absent, but if
  // present it must match the type — and gpt-oss fills a blank by writing
  // `rating: null` rather than leaving the key out. Groq validates arguments
  // against this schema on its own servers before execute ever runs, so a null
  // where the schema says number rejects the whole generation and ends the
  // turn. Phase 1's containment cannot see it: it wraps execute, and execute is
  // never reached. Found on 2026-10-12 by asking to mark two films watched with
  // no rating. Every implementation already treats null like undefined
  // (`?? null`, `?? false`, `if (date)`), so accepting it costs nothing.
  const tools = {
    get_user_watchlist: tool({
      description:
        "Get the logged-in user's watchlist, optionally filtered by status (PLANNED, WATCHING, COMPLETED, DROPPED)",
      inputSchema: z.object({
        status: z
          .enum(["PLANNED", "WATCHING", "COMPLETED", "DROPPED"])
          .nullish(),
      }),
      execute: async ({ status }) => getUserWatchlist(userId, status, deps),
    }),

    get_taste_profile: tool({
      description:
        "Get a summary of the user's movie taste based on their watched and rated movies",
      inputSchema: z.object({}),
      execute: async () => getTasteProfile(userId, deps),
    }),

    // The one write-class tool, and it no longer writes. proposeWatched is
    // read-only: it resolves the title and hands back a proposal, and the write
    // happens on POST /api/chat/confirm after the user accepts the card.
    //
    // The description says "prepare", not "mark", on purpose. A model told it
    // can mark a film watched will report that it did; the wording is as much
    // of this tool's behaviour as the schema is.
    //
    // tmdbId, not movieId: this asked for an internal Movie.id uuid, which no
    // tool has ever put in front of the model, so it had to invent one and the
    // write failed on the foreign key every time.
    mark_watched: tool({
      description:
        "Prepare to mark a movie as watched for the logged-in user, optionally with a rating (1-10) " +
        "and notes. Pass the film's TMDB id, the same id search_movies and the now-showing list " +
        "return. This does NOT save anything — it shows the user a confirmation card, and they " +
        "decide. Ask them to confirm; never tell them it is already done.",
      inputSchema: z.object({
        tmdbId: z.number(),
        // Required, not nullish: the check only works if the model commits to
        // a name. It is compared against TMDB's title for the id and then
        // discarded — never shown on the card, never stored.
        title: z
          .string()
          .describe(
            "The film's title as you understand it. Used only to check the id is the right film.",
          ),
        rating: z.number().min(1).max(10).nullish(),
        notes: z.string().nullish(),
      }),
      execute: async ({ tmdbId, title, rating, notes }) =>
        proposeWatched(tmdbId, title, rating, notes, deps),
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

    // Same correction as mark_watched, and the same cause: this filtered
    // Session.movieId, a foreign key to Movie.id, with whatever the model
    // guessed. It returned [] every time, which reads as "nothing scheduled"
    // rather than as a failure, so the model told users films were not playing
    // when they were.
    get_showtimes: tool({
      description:
        "Get cinema showtimes for a specific movie, optionally filtered by date (YYYY-MM-DD format). " +
        "Pass the film's TMDB id. Returns found: false when the film is not in the Christchurch " +
        "listings at all, which is different from being listed with no upcoming sessions.",
      inputSchema: z.object({
        tmdbId: z.number(),
        date: z.string().nullish(),
      }),
      execute: async ({ tmdbId, date }) => getShowtimes(tmdbId, date, deps),
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
        description: z.string().describe(
          // Measured, not guessed: plot-style wording scored 0.73 against the
          // right film, while category wording ("a loud action blockbuster")
          // barely cleared the noise floor. Overviews are written as plots, so
          // queries shaped like plots match them.
          "A short plot-style description of the film the user is imagining, in the style of a synopsis — not genre labels",
        ),
        onlyInTheatres: z
          .boolean()
          .nullish()
          .describe(
            "True when the user wants something they can watch in a cinema now",
          ),
      }),
      execute: async ({ description, onlyInTheatres }) =>
        findSimilarMovies(description, onlyInTheatres ?? false, deps),
    });
  }

  return containErrors(tools);
}

/**
 * Re-wrap every tool so a thrown error reaches the model as a sentence written
 * for it, rather than as whatever Prisma or undici happened to say.
 *
 * Applied in one pass over the finished object instead of tool by tool. There
 * is no opt-in step to forget, so a tool added next year is covered by having
 * been added at all — which is the only version of this that stays true.
 *
 * `tool()` from the SDK is the identity function, so these are plain objects
 * and spreading one is safe. The second argument is the SDK's own
 * ToolExecutionOptions; it is forwarded untouched because toToolFailure reads
 * `abortSignal` off it to tell a cancelled run from a broken dependency.
 */
function containErrors(tools) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => [
      name,
      {
        ...definition,
        execute: async (input, options) => {
          try {
            return await definition.execute(input, options);
          } catch (err) {
            console.error(`Tool ${name} failed:`, err);
            throw toToolFailure(err, name, options);
          }
        },
      },
    ]),
  );
}
