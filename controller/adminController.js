import { prisma } from "../config/db.js";

// Offset pagination is fine here: an admin reads the newest rows, never page 400.
// Swap to cursor pagination if deep pages ever get slow.
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// Query params are strings and may be junk ("abc", "-5", ""). Fall back instead
// of letting NaN reach Prisma.
const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// GET /api/admin/agent-runs -admin
const getAgentRuns = async (req, res) => {
  const page = toPositiveInt(req.query.page, 1);
  // Capped so a single request can't ask for the whole table.
  const limit = Math.min(toPositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);

  // Both queries are independent, so one round trip instead of two.
  const [runs, total] = await Promise.all([
    prisma.agentRun.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.agentRun.count(),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      runs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
    message: "Agent runs retrieved successfully",
  });
};

// GET /api/admin/agent-runs/summary -admin
const getAgentRunSummary = async (req, res) => {
  const [totals, erroredCount, retriedCount, latency, toolUsage] =
    await Promise.all([
      prisma.agentRun.aggregate({
        _avg: { inputTokens: true, outputTokens: true, latencyMs: true },
        _count: true,
      }),
      prisma.agentRun.count({ where: { errored: true } }),
      prisma.agentRun.count({ where: { retried: true } }),

      // Prisma's aggregate API has no percentile function, so this drops to SQL.
      // ::int casts matter — Postgres count() returns bigint, and res.json()
      // throws on BigInt.
      prisma.$queryRaw`
        SELECT
          percentile_cont(0.5)  WITHIN GROUP (ORDER BY "latencyMs")::int AS p50,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")::int AS p95,
          MAX("latencyMs")::int AS max
        FROM "AgentRun"
      `,

      // unnest flattens the toolCalls array so each call becomes a row to group
      // on. Doing this in JS would mean loading every row just to count strings.
      prisma.$queryRaw`
        SELECT tool, COUNT(*)::int AS count
        FROM "AgentRun", unnest("toolCalls") AS tool
        GROUP BY tool
        ORDER BY count DESC
      `,
    ]);

  const totalRuns = totals._count;

  // Guard every rate: with no rows this is 0/0, which is NaN, and NaN serialises
  // to null in JSON — a silently broken dashboard rather than an obvious zero.
  const rate = (count) => (totalRuns === 0 ? 0 : count / totalRuns);

  res.status(200).json({
    status: "success",
    data: {
      totalRuns,
      avgInputTokens: totals._avg.inputTokens,
      avgOutputTokens: totals._avg.outputTokens,
      avgLatencyMs: totals._avg.latencyMs,
      // p50/p95 describe the tail that avgLatencyMs hides. Both are meaningless
      // until there are enough rows — with 10 runs p95 is just the slowest one.
      latencyMs: latency[0] ?? { p50: null, p95: null, max: null },
      errorRate: rate(erroredCount),
      retryRate: rate(retriedCount),
      toolUsage,
    },
    message: "Agent run summary retrieved successfully",
  });
};

export { getAgentRuns, getAgentRunSummary };
