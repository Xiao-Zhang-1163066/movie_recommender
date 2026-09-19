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
