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
