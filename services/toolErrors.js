/**
 * What the model is told when one of its tools fails.
 *
 * The AI SDK already keeps a failed tool from ending the turn: a throw inside
 * `execute` becomes a `tool-error` stream part, which is fed back to the model
 * as a tool result and the step loop carries on. What it does not do is decide
 * *what* to feed back — it passes `err.message` through verbatim
 * (`errorMode: "text"` in ai/dist/index.mjs). For `new Error("TMDB 500")` that
 * is fine. For a Prisma failure it is a multi-line dump carrying the generated
 * SQL and a caret diagram: hundreds of tokens of our internals spent inside a
 * context window we have already had to shrink twice, saying nothing the model
 * can act on.
 *
 * So every tool failure is re-thrown as a ToolFailure whose message was written
 * for the model to read. Re-thrown rather than returned as `{ error }` on
 * purpose: a throw stays a `tool-error` part, which the controller and the
 * AgentRun log can recognise *as* a failure, and it leaves every tool's success
 * contract intact — `recommend_movies` in particular must always return an
 * array, because the controller spreads it.
 */

// Shared by most messages, because the advice is the same whatever broke. A
// retry is the obvious instinct and the wrong one: Sprint 3 established that
// the eight-step budget, not the dependency, is the scarce resource, and a turn
// that spends its steps re-calling a broken tool never reaches recommend_movies
// at all. Answering with less beats answering with nothing.
const DO_NOT_RETRY =
  "Do not call it again this turn. Tell the user you could not look that up, and answer from what you already have.";

// One sentence per kind, then the advice. Deliberately free of identifiers, SQL,
// table names, status codes and stack frames: the model cannot act on any of
// that, the user should never read it, and every token of it is billed.
const MODEL_MESSAGES = {
  timeout: `The movie database did not respond in time. ${DO_NOT_RETRY}`,
  upstream: `The movie database (TMDB) is unavailable right now. ${DO_NOT_RETRY}`,
  database: `This app's own database could not be reached. ${DO_NOT_RETRY}`,
  // The one kind that invites another call, because the fix is cheap and the
  // model has the means. A 404 says the id was wrong, not that TMDB is down —
  // and that is a correctable mistake, where every other kind here is a
  // dependency the model cannot do anything about. Telling it "do not retry"
  // would leave it reporting an outage that is not happening.
  not_found:
    "There is no film with that id on TMDB, so the id was wrong — the service itself is fine. " +
    "Do not send the same id again. Look the title up with search_movies to get the correct " +
    "id, or tell the user you could not find that film.",
  // The only kind with different advice, because there is a real alternative
  // to fall back to rather than just less of an answer.
  embedding:
    "Searching by description is unavailable right now. Do not call it again this turn. " +
    "Use search_movies if the user named a particular film, otherwise recommend from the " +
    "now-showing list in your instructions.",
  // Thrown by proposeWatched, not classified from an error: the id resolved to
  // a real film, just not the one the model named. Like not_found it invites a
  // retry, because the fix is one search away. It must not claim the service
  // failed — nothing failed except the model's recall.
  id_mismatch:
    "That TMDB id belongs to a different film from the title you gave, so the id is wrong. " +
    "Do not guess ids from memory. Look the title up with search_movies and use the id it returns.",
  unknown: `That step failed for an unexpected reason. ${DO_NOT_RETRY}`,
};

export class ToolFailure extends Error {
  constructor(kind) {
    super(MODEL_MESSAGES[kind] ?? MODEL_MESSAGES.unknown);
    this.name = "ToolFailure";
    this.kind = kind;
  }
}

// Prisma reports known request failures with a P-prefixed code, and everything
// else (initialisation, validation, a Rust panic) with a PrismaClient* class
// name. Checking both covers $queryRaw, which find_similar_movies uses.
function isDatabaseError(err) {
  return (
    String(err?.name ?? "").startsWith("PrismaClient") ||
    /^P\d{4}$/.test(String(err?.code ?? ""))
  );
}

// fetchWithRetry gives each attempt its own AbortController for the 8 s
// timeout, and throws the last AbortError once the attempts run out. A user
// pressing Stop looks identical, which is why the caller checks the run's own
// signal before this is ever consulted — see toToolFailure.
function isTimeoutError(err) {
  const name = String(err?.name ?? "");
  return name === "AbortError" || name === "TimeoutError";
}

// Checked before isUpstreamError, which would otherwise swallow this: its
// `TMDB \d{3}` pattern matches 404 as readily as 503. A model that invents an
// id — or carries over a stale one — gets a 404, and reporting that as "the
// movie database is unavailable" is both false and unactionable, while the real
// answer ("wrong id, go and find the right one") is something it can act on.
function isNotFoundError(err) {
  return /^TMDB 404$/.test(String(err?.message ?? ""));
}

// `TMDB 500` is fetchWithRetry's own wording. `fetch failed` is undici's when
// DNS or the socket gives out, which is still a failure to reach TMDB from the
// model's point of view, so it gets the same message.
function isUpstreamError(err) {
  const message = String(err?.message ?? "");
  return /^TMDB \d{3}$/.test(message) || /fetch failed/i.test(message);
}

/**
 * Which kind this is.
 *
 * `toolName` is part of the decision, not decoration. find_similar_movies is
 * the only tool that embeds, and it can fail in exactly two ways: the Postgres
 * query or the Gemini call. The database check above runs first, so by the time
 * the tool name is consulted the embedding call is the only candidate left —
 * which is far more reliable than string-matching a provider's error text.
 */
export function classifyToolError(err, toolName) {
  if (isDatabaseError(err)) return "database";
  if (isTimeoutError(err)) return "timeout";
  // Before the general upstream check, which matches any TMDB status code.
  if (isNotFoundError(err)) return "not_found";
  if (isUpstreamError(err)) return "upstream";
  if (toolName === "find_similar_movies") return "embedding";
  return "unknown";
}

/**
 * Convert a thrown error into the ToolFailure the model should read.
 *
 * Returns the original error untouched when the run itself is being cancelled.
 * Pressing Stop aborts the model run and abandons every in-flight tool call;
 * dressing that up as "the movie database is unavailable" would record a
 * failure that never happened, on a turn nobody is waiting for.
 */
export function toToolFailure(err, toolName, { abortSignal } = {}) {
  if (abortSignal?.aborted) return err;
  // Already converted — re-wrapping would lose the original kind.
  if (err instanceof ToolFailure) return err;
  return new ToolFailure(classifyToolError(err, toolName));
}
