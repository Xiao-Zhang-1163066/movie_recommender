import { streamText, tool, stepCountIs } from "ai";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { createGroq } from "@ai-sdk/groq";
import {
  getUserWatchlist,
  getTasteProfile,
  markWatched,
  searchMovies,
  getMovieDetails,
  getShowtimes,
  recommendMovies,
  getNowShowing,
} from "./chatTools.js";
import {
  getOrCreateConversation,
  loadHistory,
  appendMessage,
  buildModelMessages,
} from "../services/conversationService.js";

// Step 1: create the AI provider
// const google = createGoogleGenerativeAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

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
    if (combined.includes("daily") || combined.includes("per day")) return "daily_limit";
    return "rate_limit";
  }
  if (combined.includes("context length") || combined.includes("context window") || combined.includes("maximum context")) {
    return "context_limit";
  }
  return "general";
}

// Groq embeds the retry window in the error message ("Try again in 42s", "in 1m30s",
// "in 105ms") and sometimes in a retry-after header. Returns seconds until retry.
function extractRetryAfter(err) {
  const header = err?.responseHeaders?.["retry-after"] ?? err?.headers?.["retry-after"];
  if (header) {
    const secs = Number(header);
    if (!isNaN(secs) && secs > 0) return Math.ceil(secs);
  }
  const combined = String(err?.message ?? "") + " " + String(err?.responseBody ?? "");
  const match = combined.match(/try again in (\d+(?:\.\d+)?)\s*(ms|s|m)?/i);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = (match[2] ?? "s").toLowerCase();
    if (unit === "ms") return Math.max(1, Math.ceil(value / 1000));
    if (unit === "m") return Math.ceil(value * 60);
    return Math.ceil(value);
  }
  return 60;
}

const MODEL_ERROR_MESSAGES = {
  rate_limit: "The AI service is temporarily at capacity. Please try again shortly.",
  daily_limit: "The AI service has reached its daily limit. Please try again tomorrow.",
  context_limit: "This conversation is too long for me to continue. Please start a new chat.",
  general: "The assistant ran into a problem.",
};

/**
 * POST /chat
 * Body: { conversationId?: string, message: string }
 *
 * The client used to post its whole message array back on every turn. History
 * now lives in Postgres, so a request only says which thread it is in and what
 * the user just typed. That makes a conversation survive a refresh and stops
 * the client from being able to dictate what the model is told it said.
 *
 * Streams a custom NDJSON protocol — one JSON object per line:
 *   { "t": "conversation", "v": { id, title } }        always first, so a new
 *                                                      chat learns its own id
 *   { "t": "text",   "v": "<delta>" }                 incremental assistant text
 *   { "t": "movies", "v": [ ...cards ] }              a recommend_movies result
 *   { "t": "error",  "v": "<message>", "kind": "..." } a stream-level error
 */
export const chat = async (req, res, next) => {
  try {
    const { conversationId, message } = req.body;
    const userId = req.user.id;

    // The schema trims before checking the length, but validate() throws the
    // parsed value away and hands the controller the raw body, so the trim has
    // to happen again here for the version that gets stored and sent.
    const userMessage = message.trim();

    const tools = {
      get_user_watchlist: tool({
        description:
          "Get the logged-in user's watchlist, optionally filtered by status (PLANNED, WATCHING, COMPLETED, DROPPED)",
        inputSchema: z.object({
          status: z
            .enum(["PLANNED", "WATCHING", "COMPLETED", "DROPPED"])
            .optional(),
        }),
        execute: async ({ status }) => getUserWatchlist(userId, status),
      }),
      get_taste_profile: tool({
        description:
          "Get a summary of the user's movie taste based on their watched and rated movies",
        inputSchema: z.object({}),
        execute: async () => getTasteProfile(userId),
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
          markWatched(userId, movieId, rating, notes),
      }),

      search_movies: tool({
        description: "Search for movies by title using TMDB",
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: async ({ query }) => searchMovies(query),
      }),

      get_movie_details: tool({
        description:
          "Get full details for a specific movie by its TMDB movie ID",
        inputSchema: z.object({
          movieId: z.string(),
        }),
        execute: async ({ movieId }) => getMovieDetails(movieId),
      }),

      get_showtimes: tool({
        description:
          "Get cinema showtimes for a specific movie, optionally filtered by date (YYYY-MM-DD format)",
        inputSchema: z.object({
          movieId: z.string(),
          date: z.string().optional(),
        }),
        execute: async ({ movieId, date }) => getShowtimes(movieId, date),
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
          recommendMovies(recommendations),
      }),
    };

    // Resolve the thread and store the user's turn *before* the model is called.
    // If Groq is down, or the process dies mid-request, what the person typed is
    // already safe. Saving both turns at the end would lose it.
    // Any failure here still happens before the NDJSON header is set, so it can
    // be reported as ordinary JSON by the error handler.
    const conversation = await getOrCreateConversation(userId, conversationId, userMessage);
    await appendMessage(conversation.id, { role: "USER", content: userMessage });

    const modelMessages = buildModelMessages(await loadHistory(conversation.id));

    // Pre-fetch now-showing so the model gets it as context rather than spending
    // a tool-call round-trip on get_now_showing.
    const nowShowing = await getNowShowing();

    // Abort the model run only if the client disconnects mid-stream. Wire this
    // to the *response* close (not req close, which fires as soon as the request
    // body is read) and guard on writableEnded so normal completion never aborts.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    // Stream our own NDJSON protocol off the SDK's fullStream so we can carry
    // both text deltas and structured recommend_movies cards on one connection.
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");

    // Announce the thread before anything else. A brand-new chat only learns its
    // id here, and it needs it to put the id in the URL and to send a follow-up
    // message into the same thread.
    res.write(
      JSON.stringify({
        t: "conversation",
        v: { id: conversation.id, title: conversation.title },
      }) + "\n",
    );

    const result = streamText({
      model: groq("openai/gpt-oss-120b"),
      system: buildSystemPrompt(nowShowing),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(8),
      abortSignal: controller.signal,
    });

    // Accumulated alongside the writes so the finished turn can be stored. Until
    // now only the browser kept a running copy of the reply.
    let assistantText = "";
    let assistantMovies = [];

    try {
      for await (const part of result.fullStream) {
        if (res.writableEnded) break;
        if (part.type === "text-delta") {
          assistantText += part.text;
          res.write(JSON.stringify({ t: "text", v: part.text }) + "\n");
        } else if (
          part.type === "tool-result" &&
          part.toolName === "recommend_movies"
        ) {
          assistantMovies.push(...part.output);
          res.write(JSON.stringify({ t: "movies", v: part.output }) + "\n");
        } else if (part.type === "error") {
          // The SDK surfaces model/tool failures as a stream part rather than
          // throwing — classify and forward so the client can show targeted help.
          console.error("Chat fullStream error part:", part.error);
          const kind = classifyModelError(part.error);
          const retryAfter = kind === "rate_limit" ? extractRetryAfter(part.error) : undefined;
          res.write(
            JSON.stringify({ t: "error", v: MODEL_ERROR_MESSAGES[kind], kind, retryAfter }) + "\n",
          );
        }
      }
    } catch (streamErr) {
      console.error("Chat stream error:", streamErr);
      if (!res.writableEnded) {
        const kind = classifyModelError(streamErr);
        const retryAfter = kind === "rate_limit" ? extractRetryAfter(streamErr) : undefined;
        res.write(
          JSON.stringify({ t: "error", v: MODEL_ERROR_MESSAGES[kind], kind, retryAfter }) + "\n",
        );
      }
    } finally {
      if (!res.writableEnded) res.end();

      // Store the reply after the response is closed, so the database write
      // never delays what the user sees. Running in finally means a stream cut
      // short by the Stop button still keeps whatever had already arrived.
      //
      // The "only if text arrived" rule has to match the client's commit rule in
      // useChat.ts, or the stored history and the on-screen history drift apart.
      if (assistantText) {
        try {
          await appendMessage(conversation.id, {
            role: "ASSISTANT",
            content: assistantText,
            movies: assistantMovies.length ? assistantMovies : undefined,
          });
        } catch (persistErr) {
          // The user already has their answer; losing the copy is not worth
          // throwing over, and the response has been sent so we cannot report it.
          console.error("Failed to persist assistant message:", persistErr);
        }
      }
    }
  } catch (err) {
    next(err);
  }
};
