import { describe, it, expect, vi } from "vitest";

// agentRunService defaults its Prisma dependency to the real client. Every test
// injects a double, so that default is never used — but the import alone would
// construct a Prisma client and read the generated client off disk. Stubbing the
// module keeps this a true unit test with no database prerequisite.
vi.mock("../config/db.js", () => ({ prisma: {}, connectDB: vi.fn(), disconnectDB: vi.fn() }));

const { recordAgentRun } = await import("../services/agentRunService.js");

function fakePrisma() {
  return { agentRun: { create: vi.fn().mockResolvedValue({ id: "run1" }) } };
}

// What the fake was actually asked to insert.
const insertedBy = (prisma) => prisma.agentRun.create.mock.calls[0][0].data;

describe("recordAgentRun", () => {
  it("saves the fields it is given", async () => {
    const prisma = fakePrisma();

    await recordAgentRun(
      {
        userId: "u1",
        model: "openai/gpt-oss-120b",
        inputTokens: 1280,
        outputTokens: 80,
        latencyMs: 1843,
      },
      { prisma },
    );

    expect(insertedBy(prisma)).toEqual({
      userId: "u1",
      model: "openai/gpt-oss-120b",
      inputTokens: 1280,
      outputTokens: 80,
      latencyMs: 1843,
    });
  });

  it("writes through the injected client, never the real one", async () => {
    const prisma = fakePrisma();

    await recordAgentRun({ userId: "u1", model: "m", latencyMs: 5 }, { prisma });

    expect(prisma.agentRun.create).toHaveBeenCalledOnce();
  });

  it("accepts a turn that reported no token counts", async () => {
    // A turn that failed before the model answered has no usage to report.
    // Prisma reads undefined as "column not supplied", so it stays null rather
    // than being recorded as a turn that cost nothing.
    const prisma = fakePrisma();

    await recordAgentRun(
      { userId: "u1", model: "m", latencyMs: 402, inputTokens: undefined },
      { prisma },
    );

    expect(insertedBy(prisma).inputTokens).toBeUndefined();
    expect(prisma.agentRun.create).toHaveBeenCalledOnce();
  });
});
