import { describe, it, expect, vi } from "vitest";

// conversationService defaults its Prisma dependency to the real client. Every
// test injects a double, so that default is never used — but the import alone
// would construct a Prisma client and read the generated client off disk.
// Stubbing the module keeps this a true unit test with no database prerequisite.
vi.mock("../config/db.js", () => ({
  prisma: {},
  connectDB: vi.fn(),
  disconnectDB: vi.fn(),
}));

const {
  getOrCreateConversation,
  loadHistory,
  appendMessage,
  buildModelMessages,
  buildClientMessages,
  maybeSummarize,
} = await import("../services/conversationService.js");

// A stored ChatMessage row, with only the columns the code actually reads.
function row(seq, role, content, extra = {}) {
  return {
    id: `m${seq}`,
    conversationId: "c1",
    role,
    content,
    movies: null,
    seq,
    ...extra,
  };
}

// `count` alternating user/assistant rows starting at `startSeq`.
function rows(count, startSeq = 0) {
  return Array.from({ length: count }, (_, i) =>
    row(startSeq + i, i % 2 === 0 ? "USER" : "ASSISTANT", `message ${startSeq + i}`),
  );
}

describe("buildModelMessages", () => {
  it("lowercases roles and drops everything the model has no use for", () => {
    expect(
      buildModelMessages([
        row(0, "USER", "something scary"),
        row(1, "ASSISTANT", "here are two picks", { movies: [{ tmdbId: 1 }] }),
      ]),
    ).toEqual([
      { role: "user", content: "something scary" },
      { role: "assistant", content: "here are two picks" },
    ]);
  });

  it("returns an empty list for an empty conversation", () => {
    expect(buildModelMessages([])).toEqual([]);
  });
});

describe("buildClientMessages", () => {
  it("keeps the row id and the movie cards, which the UI needs", () => {
    const cards = [{ tmdbId: 1233413, title: "Sinners" }];
    expect(
      buildClientMessages([row(1, "ASSISTANT", "here are two picks", { movies: cards })]),
    ).toEqual([
      { id: "m1", role: "assistant", content: "here are two picks", movies: cards },
    ]);
  });

  it("reports a user turn's null movies as undefined so the prop is simply absent", () => {
    expect(buildClientMessages([row(0, "USER", "hi")])[0].movies).toBeUndefined();
  });
});

describe("getOrCreateConversation", () => {
  it("creates a new thread when no id is supplied, titled from the first message", async () => {
    const prisma = { conversation: { create: vi.fn().mockResolvedValue({ id: "c1" }) } };

    await getOrCreateConversation("u1", undefined, "  something scary tonight  ", { prisma });

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { userId: "u1", title: "something scary tonight" },
    });
  });

  it("truncates a long title rather than storing the whole message", async () => {
    const prisma = { conversation: { create: vi.fn().mockResolvedValue({ id: "c1" }) } };

    await getOrCreateConversation("u1", undefined, "x".repeat(200), { prisma });

    const { title } = prisma.conversation.create.mock.calls[0][0].data;
    expect(title).toHaveLength(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("scopes the lookup by userId as well as id, so an id alone is not enough", async () => {
    const prisma = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: "c1", userId: "u1" }) },
    };

    await getOrCreateConversation("u1", "c1", null, { prisma });

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: "c1", userId: "u1" },
    });
  });

  it("reports a miss as 404, never 403, so a real id is not confirmed", async () => {
    const prisma = { conversation: { findFirst: vi.fn().mockResolvedValue(null) } };

    await expect(
      getOrCreateConversation("u2", "c1", null, { prisma }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Conversation not found" });
  });
});

describe("loadHistory", () => {
  it("returns the whole thread when no watermark is given, which is what the UI wants", async () => {
    const prisma = { chatMessage: { findMany: vi.fn().mockResolvedValue([]) } };

    await loadHistory("c1", { prisma });

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { conversationId: "c1" },
      orderBy: { seq: "asc" },
    });
  });

  it("skips everything already folded when a watermark is given", async () => {
    const prisma = { chatMessage: { findMany: vi.fn().mockResolvedValue([]) } };

    await loadHistory("c1", { fromSeq: 10, prisma });

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { conversationId: "c1", seq: { gte: 10 } },
      orderBy: { seq: "asc" },
    });
  });
});

describe("appendMessage", () => {
  // A transaction double that runs the callback against the same fake tables,
  // which is all the code needs from $transaction.
  function fakePrisma({ lastSeq }) {
    const tx = {
      conversation: { update: vi.fn().mockResolvedValue({}) },
      chatMessage: {
        findFirst: vi
          .fn()
          .mockResolvedValue(lastSeq === null ? null : { seq: lastSeq }),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    return { prisma: { $transaction: (fn) => fn(tx) }, tx };
  }

  it("starts at seq 0 in an empty conversation", async () => {
    const { prisma, tx } = fakePrisma({ lastSeq: null });

    const created = await appendMessage("c1", { role: "USER", content: "hi" }, { prisma });

    expect(created.seq).toBe(0);
    expect(tx.chatMessage.create).toHaveBeenCalled();
  });

  it("takes the next seq after the highest stored one", async () => {
    const { prisma } = fakePrisma({ lastSeq: 5 });

    const created = await appendMessage("c1", { role: "USER", content: "hi" }, { prisma });

    expect(created.seq).toBe(6);
  });

  it("updates the parent row first, which is the lock that stops two writers racing", async () => {
    const order = [];
    const tx = {
      conversation: {
        update: vi.fn(() => {
          order.push("lock");
          return Promise.resolve({});
        }),
      },
      chatMessage: {
        findFirst: vi.fn(() => {
          order.push("read-seq");
          return Promise.resolve({ seq: 2 });
        }),
        create: vi.fn(({ data }) => {
          order.push("insert");
          return Promise.resolve(data);
        }),
      },
    };

    await appendMessage(
      "c1",
      { role: "USER", content: "hi" },
      { prisma: { $transaction: (fn) => fn(tx) } },
    );

    expect(order).toEqual(["lock", "read-seq", "insert"]);
  });

  it("omits movies for a user turn so the column stays SQL NULL", async () => {
    const { prisma, tx } = fakePrisma({ lastSeq: null });

    await appendMessage("c1", { role: "USER", content: "hi" }, { prisma });

    expect(tx.chatMessage.create.mock.calls[0][0].data.movies).toBeUndefined();
  });
});

describe("maybeSummarize", () => {
  // KEEP_RECENT is 10 and SUMMARY_TRIGGER is 6, so folding starts above 16 rows.
  function fakePrisma({ summary = null, summarizedUpTo = 0, stored, updatedCount = 1 }) {
    return {
      conversation: {
        findUnique: vi.fn().mockResolvedValue({ summary, summarizedUpTo }),
        updateMany: vi.fn().mockResolvedValue({ count: updatedCount }),
      },
      chatMessage: {
        findMany: vi
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              stored.filter((r) => !where.seq || r.seq >= where.seq.gte),
            ),
          ),
      },
    };
  }

  it("does nothing at exactly the threshold — 16 rows is not past 16", async () => {
    const prisma = fakePrisma({ stored: rows(16) });
    const summarize = vi.fn();

    expect(await maybeSummarize("c1", { prisma, summarize })).toEqual({
      summarized: false,
      reason: "below_threshold",
    });
    expect(summarize).not.toHaveBeenCalled();
  });

  it("folds one row past the threshold, keeping the last ten verbatim", async () => {
    const prisma = fakePrisma({ stored: rows(17) });
    const summarize = vi.fn().mockResolvedValue("a summary");

    expect(await maybeSummarize("c1", { prisma, summarize })).toEqual({
      summarized: true,
      folded: 7,
      summarizedUpTo: 7,
    });
  });

  it("counts from the existing watermark, not from the start of the thread", async () => {
    // 27 messages, seq 0-26, already folded up to 10: 17 rows remain, so 7 fold
    // and the watermark lands on 17.
    const prisma = fakePrisma({ summarizedUpTo: 10, stored: rows(27) });
    const summarize = vi.fn().mockResolvedValue("a summary");

    expect(await maybeSummarize("c1", { prisma, summarize })).toEqual({
      summarized: true,
      folded: 7,
      summarizedUpTo: 17,
    });

    // One short of that is a no-op: 26 messages leaves exactly 16 rows.
    const justBelow = fakePrisma({ summarizedUpTo: 10, stored: rows(26) });
    expect(await maybeSummarize("c1", { prisma: justBelow, summarize })).toMatchObject({
      summarized: false,
      reason: "below_threshold",
    });
  });

  it("passes the previous summary forward instead of re-reading the whole thread", async () => {
    const prisma = fakePrisma({ summary: "earlier summary", stored: rows(17) });
    const summarize = vi.fn().mockResolvedValue("a summary");

    await maybeSummarize("c1", { prisma, summarize });

    const { previousSummary, transcript } = summarize.mock.calls[0][0];
    expect(previousSummary).toBe("earlier summary");
    // Only the seven folded rows, not all seventeen.
    expect(transcript.split("\n")).toHaveLength(7);
    expect(transcript).toContain("User: message 0");
    expect(transcript).not.toContain("message 7");
  });

  it("writes conditionally on the watermark it read", async () => {
    const prisma = fakePrisma({ summarizedUpTo: 10, stored: rows(27) });
    const summarize = vi.fn().mockResolvedValue("  a summary  ");

    await maybeSummarize("c1", { prisma, summarize });

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", summarizedUpTo: 10 },
      data: { summary: "a summary", summarizedUpTo: 17 },
    });
  });

  it("discards its work when another run moved the watermark first", async () => {
    const prisma = fakePrisma({ stored: rows(17), updatedCount: 0 });
    const summarize = vi.fn().mockResolvedValue("a summary");

    expect(await maybeSummarize("c1", { prisma, summarize })).toEqual({
      summarized: false,
      reason: "raced",
    });
  });

  it("never stores an empty summary", async () => {
    const prisma = fakePrisma({ stored: rows(17) });
    const summarize = vi.fn().mockResolvedValue("   ");

    expect(await maybeSummarize("c1", { prisma, summarize })).toEqual({
      summarized: false,
      reason: "empty_summary",
    });
    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("gives up quietly when the conversation has been deleted", async () => {
    const prisma = {
      conversation: { findUnique: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
      chatMessage: { findMany: vi.fn() },
    };

    expect(await maybeSummarize("gone", { prisma, summarize: vi.fn() })).toEqual({
      summarized: false,
      reason: "gone",
    });
  });
});
