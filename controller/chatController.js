import { streamText, stepCountIs } from "ai";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { getNowShowing } from "./chatTools.js";
import { buildTools } from "../services/agentTools.js";
import {
  getOrCreateConversation,
  loadHistory,
  appendMessage,
  buildModelMessages,
  buildClientMessages,
  maybeSummarize,
  listConversations,
} from "../services/conversationService.js";

// Step 1: create the AI provider
// const google = createGoogleGenerativeAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

export function buildSystemPrompt(nowShowing, summary, { withTools = true } = {}) {
  // The summary belongs here rather than in the message list. It is background
  // the assistant knows, not something anybody said, and faking it as a chat
  // turn invites the model to quote it back or treat it as the user's words.
  const earlier = summary
    ? `\n  Earlier in this conversation (summarised):\n  ${summary}\n`
    : "";

  // An empty list is a normal state, not an error: the scraper may not have run
  // yet, or every session on file may have already passed. Saying so plainly
  // matters, because the alternative is printing "[]" and then, below, ordering
  // the model to pick something out of it. Measured against that contradiction,
  // the model searched three to eight times per turn hunting for a listing that
  // did not exist and ended two turns in five with nothing written at all. With
  // a populated list the same prompts took zero or one search and always
  // answered. See docs/bugs-found.md entry 5.
  const listing = nowShowing.length
    ? `Films currently playing in Christchurch cinemas:
  ${JSON.stringify(nowShowing)}`
    : `Cinema listings are unavailable right now, so you do not know what is
  playing in Christchurch today. Say so once, briefly, and move on to helping.
  Do not search for showtimes or listings — that data is simply not there, and
  searching repeatedly for it will not find any.`;

  const preamble = `You are AI Movie Mate, a concierge that recommends films to users in
  Christchurch, New Zealand.
${earlier}
  ${listing}
`;

  // The retry after an empty reply runs with no tools at all. It must not be
  // told it "MUST call recommend_movies", or it writes the tool call out as JSON
  // in the middle of its prose, which is what the user then reads.
  if (!withTools) {
    return `${preamble}
  Answer the user now, in two or three sentences of plain prose, naming specific
  films from the list above where they fit. You have no tools for this reply, so
  never write a function or tool call, never emit JSON or code blocks, and do not
  mention searching or looking anything up.`;
  }

  // Rule 1 is conditional on there being a list to pick from. Keeping it when
  // the list is empty is an instruction the model cannot satisfy, and an
  // unsatisfiable instruction is what sent it into the search loop.
  const inTheatreRule = nowShowing.length
    ? `1. At least one of your recommendations MUST come from the now-showing list above. You may
  also suggest other relevant films that are not currently playing.`
    : `1. There is no now-showing list, so recommend real films on their merits and do not claim
  anything is or is not in cinemas.`;

  return `${preamble}
  How to recommend:
  ${inTheatreRule}
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

// Shown only when the model produced nothing and the retry below also produced
// nothing. Better than leaving the user looking at their own message and silence.
const EMPTY_REPLY_FALLBACK =
  "Sorry, I got stuck working that one out. Could you ask me again, perhaps a little differently?";

/**
 * Ask once more, with no tools at all, and stream the answer.
 *
 * The model can burn its whole step budget calling tools and never get around to
 * writing anything, which ends the turn with `finishReason: "tool-calls"` and no
 * text. Observed in practice as eight consecutive search_movies calls.
 *
 * Only the real conversation is replayed. The half-finished tool calls from the
 * first attempt are deliberately left out: the SDK sends `tool_choice: none`
 * when no tools are defined, and feeding the model its own pending tool calls
 * tempts it into making another, which Groq rejects outright with "Tool choice
 * is none, but model called a tool". Losing those results costs some detail;
 * carrying them costs the whole retry. The now-showing list is in the system
 * prompt either way, which is the bulk of what a reply needs.
 *
 * This reply cannot produce movie cards, since recommend_movies is itself a
 * tool. Text without cards still beats silence.
 *
 * Returns whatever text it managed to stream.
 */
async function streamReplyWithoutTools({ res, system, messages, abortSignal }) {
  const result = streamText({
    model: groq("openai/gpt-oss-120b"),
    system,
    messages,
    abortSignal,
  });

  let text = "";
  for await (const part of result.fullStream) {
    if (res.writableEnded) break;
    if (part.type === "text-delta") {
      text += part.text;
      res.write(JSON.stringify({ t: "text", v: part.text }) + "\n");
    } else if (part.type === "error") {
      console.error("Empty-reply retry failed:", part.error);
      break;
    }
  }
  return text;
}

// How many tool-call rounds a single turn may take before the SDK stops the
// loop. Hitting this is what leaves a turn with no text: the run is cut off
// while tool calls are still pending, which is why the retry above exists.
const MAX_STEPS = 8;

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

    // Definitions live in services/agentTools.js so the eval suite can build the
    // exact tool set the model sees here, without an HTTP request or a database.
    const tools = buildTools(userId);

    // Resolve the thread and store the user's turn *before* the model is called.
    // If Groq is down, or the process dies mid-request, what the person typed is
    // already safe. Saving both turns at the end would lose it.
    // Any failure here still happens before the NDJSON header is set, so it can
    // be reported as ordinary JSON by the error handler.
    const conversation = await getOrCreateConversation(userId, conversationId, userMessage);
    await appendMessage(conversation.id, { role: "USER", content: userMessage });

    // Only the messages the summary does not already cover. Everything below the
    // watermark is represented by conversation.summary in the system prompt.
    const modelMessages = buildModelMessages(
      await loadHistory(conversation.id, { fromSeq: conversation.summarizedUpTo }),
    );

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

    const systemPrompt = buildSystemPrompt(nowShowing, conversation.summary);

    const result = streamText({
      model: groq("openai/gpt-oss-120b"),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: controller.signal,
    });

    // Accumulated alongside the writes so the finished turn can be stored. Until
    // now only the browser kept a running copy of the reply.
    let assistantText = "";
    let assistantMovies = [];
    // Set when the SDK reports a model or tool failure. The empty-reply retry
    // below is for a turn that ran cleanly but said nothing; retrying a turn that
    // already told the user it failed would just spend quota and confuse them.
    let streamFailed = false;

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
          streamFailed = true;
          const kind = classifyModelError(part.error);
          const retryAfter = kind === "rate_limit" ? extractRetryAfter(part.error) : undefined;
          res.write(
            JSON.stringify({ t: "error", v: MODEL_ERROR_MESSAGES[kind], kind, retryAfter }) + "\n",
          );
        }
      }

      // A turn that ran cleanly but produced no words at all. The user is
      // looking at their own message and nothing else, so try once more.
      if (!assistantText && !streamFailed && !res.writableEnded && !controller.signal.aborted) {
        console.warn(
          "Empty reply, retrying without tools. finishReason:",
          await result.finishReason.catch(() => "unknown"),
        );

        assistantText = await streamReplyWithoutTools({
          res,
          system: buildSystemPrompt(nowShowing, conversation.summary, { withTools: false }),
          messages: modelMessages,
          abortSignal: controller.signal,
        });
      }

      // Retry said nothing either. Say *something*, so the turn is never silent.
      if (!assistantText && !streamFailed && !res.writableEnded && !controller.signal.aborted) {
        assistantText = EMPTY_REPLY_FALLBACK;
        res.write(JSON.stringify({ t: "text", v: assistantText }) + "\n");
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

      // Deliberately not awaited. The reply has already been delivered, so this
      // must not add to the time the user waited, and there is no longer any
      // response left to report a failure on. A skipped run costs nothing: the
      // watermark means the next turn simply folds the same messages instead.
      maybeSummarize(conversation.id).catch((summaryErr) => {
        console.error("Failed to summarise conversation:", summaryErr);
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * GET /chat/:conversationId
 *
 * Rebuilds a conversation after a refresh, or when a link to one is opened.
 * Without this the id in the URL would be useless: the browser would know which
 * thread it is in but have nothing to show for it.
 */
export const getConversation = async (req, res, next) => {
  try {
    // The id is always present on this route, so this never creates anything.
    // It is reused for the ownership check, which is the part that matters here.
    const conversation = await getOrCreateConversation(
      req.user.id,
      req.params.conversationId,
    );
    const rows = await loadHistory(conversation.id);

    res.status(200).json({
      status: "success",
      data: {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          messages: buildClientMessages(rows),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /chat
 *
 * The threads to show in the sidebar. Without this a conversation is only
 * reachable by still holding its URL, which makes storing them half useful.
 */
export const getConversations = async (req, res, next) => {
  try {
    const conversations = await listConversations(req.user.id);
    res.status(200).json({ status: "success", data: { conversations } });
  } catch (err) {
    next(err);
  }
};
