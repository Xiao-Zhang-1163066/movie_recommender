import { describe, it, expect, vi, beforeEach } from "vitest";

// Proves the controller *passes* the right fields to the log writer.
// agentRunService.test.js asserts what happens to fields once handed over; on
// its own it would still pass if chat() never recorded a failed turn at all.

vi.mock("../config/db.js", () => ({ prisma: {}, connectDB: vi.fn(), disconnectDB: vi.fn() }));
vi.mock("../config/redis.js", () => ({ cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));

vi.mock("ai", () => ({
  streamText: vi.fn(),
  // Pass-throughs: the tool definitions are covered in agentTools.test.js.
  tool: (definition) => definition,
  stepCountIs: (n) => n,
}));

vi.mock("../controller/chatTools.js", () => ({
  getNowShowing: vi.fn().mockResolvedValue([]),
  getUserWatchlist: vi.fn(),
  getTasteProfile: vi.fn(),
  markWatched: vi.fn(),
  searchMovies: vi.fn(),
  getMovieDetails: vi.fn(),
  getShowtimes: vi.fn(),
  recommendMovies: vi.fn(),
}));

vi.mock("../services/conversationService.js", () => ({
  getOrCreateConversation: vi
    .fn()
    .mockResolvedValue({ id: "c1", title: "hi", summary: null, summarizedUpTo: 0 }),
  appendMessage: vi.fn().mockResolvedValue({}),
  loadHistory: vi.fn().mockResolvedValue([]),
  buildModelMessages: vi.fn().mockReturnValue([]),
  buildClientMessages: vi.fn().mockReturnValue([]),
  maybeSummarize: vi.fn().mockResolvedValue({}),
  listConversations: vi.fn(),
}));

vi.mock("../services/agentRunService.js", () => ({
  recordAgentRun: vi.fn().mockResolvedValue({}),
}));

const { streamText } = await import("ai");
const { recordAgentRun } = await import("../services/agentRunService.js");
const { chat } = await import("../controller/chatController.js");

const USAGE = { inputTokens: 5855, outputTokens: 551 };

// Stands in for the SDK's result object: the parts the loop reads, plus the
// three promises the finally block awaits.
function fakeRun(parts, { usage = USAGE, steps = [], finishReason = "stop" } = {}) {
  return () => ({
    fullStream: (async function* () {
      for (const part of parts) yield part;
    })(),
    totalUsage: Promise.resolve(usage),
    steps: Promise.resolve(steps),
    finishReason: Promise.resolve(finishReason),
  });
}

function fakeRes() {
  return {
    writableEnded: false,
    headers: {},
    written: [],
    setHeader(k, v) { this.headers[k] = v; },
    write(line) { this.written.push(JSON.parse(line)); return true; },
    end() { this.writableEnded = true; },
    on() {},
  };
}

const req = () => ({ body: { message: "something scary" }, user: { id: "u1" } });
const loggedRow = () => recordAgentRun.mock.calls[0][0];

beforeEach(() => vi.clearAllMocks());

describe("chat() — what reaches the run log", () => {
  it("records a clean turn with its tool calls in order", async () => {
    const steps = [
      { toolCalls: [{ toolName: "search_movies" }, { toolName: "search_movies" }] },
      { toolCalls: [{ toolName: "recommend_movies" }] },
    ];
    streamText.mockImplementation(
      fakeRun([{ type: "text-delta", text: "Here are two picks." }], { steps }),
    );

    await chat(req(), fakeRes(), vi.fn());

    expect(recordAgentRun).toHaveBeenCalledOnce();
    expect(loggedRow()).toMatchObject({
      userId: "u1",
      conversationId: "c1",
      model: "openai/gpt-oss-120b",
      inputTokens: 5855,
      outputTokens: 551,
      // Order and duplicates preserved — the shape that exposes a search loop.
      toolCalls: ["search_movies", "search_movies", "recommend_movies"],
      steps: 2,
      finishReason: "stop",
      retried: false,
      errored: false,
      errorKind: null,
    });
    expect(loggedRow().latencyMs).toEqual(expect.any(Number));
  });

  it("records a failed turn, with the classified error kind", async () => {
    // The turns most worth investigating. If this were skipped the log would be
    // blind to exactly the ones that matter.
    const rateLimited = Object.assign(new Error("rate limit reached"), { statusCode: 429 });
    streamText.mockImplementation(fakeRun([{ type: "error", error: rateLimited }]));

    await chat(req(), fakeRes(), vi.fn());

    expect(loggedRow()).toMatchObject({ errored: true, errorKind: "rate_limit" });
  });

  it("marks a turn that needed the no-tools retry", async () => {
    // First attempt produces no text at all, so the controller asks again with
    // no tools. Invisible to the user, but it is a second model call.
    streamText
      .mockImplementationOnce(fakeRun([], { finishReason: "tool-calls" }))
      .mockImplementationOnce(fakeRun([{ type: "text-delta", text: "A plain answer." }]));

    await chat(req(), fakeRes(), vi.fn());

    expect(loggedRow()).toMatchObject({ retried: true, errored: false });
  });

  it("absorbs an oversized request with the no-tools retry, without telling the user", async () => {
    // The real Groq shape, and the reason branch order matters: the message says
    // "Request too large" while the body's code is rate_limit_exceeded. If the
    // 429 check is ever moved above the 413 one, errorKind below flips to
    // "rate_limit" and the user gets told to wait — for a request that will fail
    // identically forever, because waiting does not shrink a request.
    const tooLarge = Object.assign(
      new Error(
        "Request too large for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Requested 8210",
      ),
      {
        statusCode: 413,
        responseBody: '{"error":{"code":"rate_limit_exceeded","type":"tokens"}}',
      },
    );

    streamText
      .mockImplementationOnce(fakeRun([{ type: "error", error: tooLarge }]))
      .mockImplementationOnce(
        fakeRun([{ type: "text-delta", text: "A shorter answer." }]),
      );

    const res = fakeRes();
    await chat(req(), res, vi.fn());

    // No error line: the fallback answered, and an error followed by a good
    // answer reads as a bug.
    expect(res.written.some((l) => l.t === "error")).toBe(false);
    expect(res.written.some((l) => l.t === "text" && l.v.includes("shorter"))).toBe(true);
    // errored stays false because the user got an answer; errorKind still
    // records it, so the log shows how many turns the fallback is carrying.
    expect(loggedRow()).toMatchObject({
      retried: true,
      errored: false,
      errorKind: "request_too_large",
    });
  });

  it("names a way out when even the smaller retry produces nothing", async () => {
    const tooLarge = Object.assign(new Error("Request too large"), { statusCode: 413 });

    streamText
      .mockImplementationOnce(fakeRun([{ type: "error", error: tooLarge }]))
      .mockImplementationOnce(fakeRun([]));

    const res = fakeRes();
    await chat(req(), res, vi.fn());

    // Deliberately not the generic "I got stuck" line — that one invites the
    // user to retry the same oversized request.
    const texts = res.written.filter((l) => l.t === "text").map((l) => l.v).join(" ");
    expect(texts).toContain("start a new chat");
  });

  it("logs only after the response has been closed", async () => {
    // The reason this is fire-and-forget: a log write must never sit in front
    // of the reply the user is waiting for.
    const res = fakeRes();
    let endedWhenLogged = null;
    recordAgentRun.mockImplementation(() => {
      endedWhenLogged = res.writableEnded;
      return Promise.resolve({});
    });
    streamText.mockImplementation(fakeRun([{ type: "text-delta", text: "hi" }]));

    await chat(req(), res, vi.fn());

    expect(endedWhenLogged).toBe(true);
  });
});

describe("chat() — a tool that fails", () => {
  // A failed tool is not a failed turn. The SDK catches the throw, emits a
  // tool-error part, and hands the error text back to the model as that call's
  // result, so the step loop carries on and usually still answers. Before this,
  // the controller had no tool-error branch at all: the part fell through every
  // else-if and was dropped, which left the log showing a clean run and the
  // user watching a progress pill that never resolved.

  const toolError = (toolName) => ({
    type: "tool-error",
    toolName,
    error: new Error("This app's own database could not be reached."),
  });

  it("records which tools failed, without marking the turn as errored", async () => {
    streamText.mockImplementation(
      fakeRun([
        toolError("get_user_watchlist"),
        { type: "text-delta", text: "I could not read your watchlist, but here is a pick." },
      ]),
    );

    await chat(req(), fakeRes(), vi.fn());

    expect(loggedRow()).toMatchObject({
      toolErrors: ["get_user_watchlist"],
      // The user got an answer. Setting errored here would make every
      // flaky-dependency turn look like a broken one.
      errored: false,
      errorKind: null,
    });
  });

  it("keeps the order and the duplicates, like toolCalls", async () => {
    // Sprint 2's reason for keeping toolCalls unsorted and un-deduplicated: the
    // same name three times running is the signal, and a set would hide it.
    streamText.mockImplementation(
      fakeRun([
        toolError("search_movies"),
        toolError("search_movies"),
        toolError("get_movie_details"),
        { type: "text-delta", text: "Sorry, lookups are down." },
      ]),
    );

    await chat(req(), fakeRes(), vi.fn());

    expect(loggedRow().toolErrors).toEqual([
      "search_movies",
      "search_movies",
      "get_movie_details",
    ]);
  });

  it("records an empty list for a turn where nothing failed", async () => {
    streamText.mockImplementation(fakeRun([{ type: "text-delta", text: "Two picks." }]));

    await chat(req(), fakeRes(), vi.fn());

    expect(loggedRow().toolErrors).toEqual([]);
  });

  it("tells the client the pill failed, rather than leaving it spinning", async () => {
    streamText.mockImplementation(
      fakeRun([
        { type: "tool-call", toolName: "search_movies" },
        toolError("search_movies"),
        { type: "text-delta", text: "Could not look that up." },
      ]),
    );

    const res = fakeRes();
    await chat(req(), res, vi.fn());

    const pills = res.written.filter((line) => line.t === "tool");
    expect(pills).toEqual([
      { t: "tool", v: { name: "search_movies" } },
      // Reuses the `tool` event rather than inventing a second one. `failed` is
      // absent from every event the current frontend handles, so a client that
      // has not been updated renders the pill it already rendered.
      { t: "tool", v: { name: "search_movies", failed: true } },
    ]);
    // No error line: the turn is still alive and about to answer.
    expect(res.written.some((line) => line.t === "error")).toBe(false);
  });

  it("survives recommend_movies returning something that is not an array", async () => {
    // Why tool failures are re-thrown rather than returned as { error }. The
    // controller spreads this output; an object would spread a non-iterable,
    // throw a TypeError into the outer catch, and kill a turn that was fine.
    // The guard makes the cost one missing card instead.
    streamText.mockImplementation(
      fakeRun([
        { type: "text-delta", text: "Here are two picks." },
        { type: "tool-result", toolName: "recommend_movies", output: { error: "nope" } },
      ]),
    );

    const res = fakeRes();
    await chat(req(), res, vi.fn());

    expect(res.written.some((line) => line.t === "movies")).toBe(false);
    expect(res.written.some((line) => line.t === "error")).toBe(false);
    expect(loggedRow()).toMatchObject({ errored: false });
  });
});
