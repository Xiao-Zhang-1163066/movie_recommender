/**
 * Chat latency benchmark — measures the two optimisations made to chatController.js:
 *
 *  1. Now-showing pre-fetch: Postgres query vs Redis cache hit
 *  2. TMDB movie detail fetch: live HTTP call vs Redis cache hit
 *
 * Run with: npx vitest run test/chatPerf.test.js
 * Requires: server NOT needed — hits DB and Redis directly.
 *           REDIS_URL must be set (or Redis calls silently no-op).
 *           TMDB_API_KEY must be set for the cold-path TMDB benchmark.
 */

import { describe, it, beforeAll, afterAll } from "vitest";
import { cache } from "../config/redis.js";
import { prisma } from "../config/db.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { min: sorted[0], max: sorted[sorted.length - 1], mean, p50, p95 };
}

function fmt(ms) {
  return ms.toFixed(1) + "ms";
}

function printTable(rows) {
  const colWidths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => String(r[i]).length)),
  );
  rows.forEach((row) => {
    console.log(
      "  " +
        row.map((cell, i) => String(cell).padEnd(colWidths[i])).join("  "),
    );
  });
}

const RUNS = 10;

// ─── now-showing benchmark ──────────────────────────────────────────────────

describe("Now-showing fetch: Postgres vs Redis", () => {
  const NOW_SHOWING_KEY = "now_showing";

  const fetchFromDB = async () => {
    const now = new Date();
    return prisma.movie.findMany({
      where: {
        sessions: { some: { startsAt: { gt: now } } },
        tmdbId: { not: null },
      },
      select: {
        tmdbId: true,
        title: true,
        genres: true,
        voteAverage: true,
        overview: true,
      },
    });
  };

  beforeAll(async () => {
    // Warm the Redis cache with one real DB fetch so warm-path tests are valid.
    const data = await fetchFromDB();
    await cache.set(NOW_SHOWING_KEY, data, 300);
  });

  afterAll(async () => {
    await cache.del(NOW_SHOWING_KEY);
  });

  it(`cold path — Postgres query (${RUNS} runs)`, async () => {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      await fetchFromDB();
      times.push(performance.now() - t0);
    }
    const s = stats(times);
    console.log(`\n  [BEFORE] Now-showing from Postgres (${RUNS} runs)`);
    printTable([
      ["min", "mean", "p50", "p95", "max"],
      [fmt(s.min), fmt(s.mean), fmt(s.p50), fmt(s.p95), fmt(s.max)],
    ]);
  }, 30_000);

  it(`warm path — Redis cache hit (${RUNS} runs)`, async () => {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      await cache.get(NOW_SHOWING_KEY);
      times.push(performance.now() - t0);
    }
    const s = stats(times);
    console.log(`\n  [AFTER]  Now-showing from Redis  (${RUNS} runs)`);
    printTable([
      ["min", "mean", "p50", "p95", "max"],
      [fmt(s.min), fmt(s.mean), fmt(s.p50), fmt(s.p95), fmt(s.max)],
    ]);
  }, 10_000);
});

// ─── TMDB detail fetch benchmark ────────────────────────────────────────────

describe("TMDB movie detail fetch: HTTP vs Redis", () => {
  // Use a well-known stable movie so the TMDB response is always valid.
  const TEST_TMDB_ID = 550; // Fight Club
  const CACHE_KEY = `tmdb:movie:${TEST_TMDB_ID}`;
  const TMDB_URL = `https://api.themoviedb.org/3/movie/${TEST_TMDB_ID}?api_key=${process.env.TMDB_API_KEY}`;

  beforeAll(async () => {
    await cache.del(CACHE_KEY);
  });

  afterAll(async () => {
    await cache.del(CACHE_KEY);
  });

  it(`cold path — live TMDB HTTP fetch (${RUNS} runs)`, async () => {
    if (!process.env.TMDB_API_KEY) {
      console.log("\n  Skipped: TMDB_API_KEY not set");
      return;
    }

    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const res = await fetch(TMDB_URL);
      const data = await res.json();
      times.push(performance.now() - t0);

      // Populate cache on the first run so the warm-path test is valid.
      if (i === 0) await cache.set(CACHE_KEY, data, 86_400);
    }
    const s = stats(times);
    console.log(`\n  [BEFORE] TMDB detail via HTTP      (${RUNS} runs)`);
    printTable([
      ["min", "mean", "p50", "p95", "max"],
      [fmt(s.min), fmt(s.mean), fmt(s.p50), fmt(s.p95), fmt(s.max)],
    ]);
  }, 60_000);

  it(`warm path — Redis cache hit (${RUNS} runs)`, async () => {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      await cache.get(CACHE_KEY);
      times.push(performance.now() - t0);
    }
    const s = stats(times);
    console.log(`\n  [AFTER]  TMDB detail from Redis    (${RUNS} runs)`);
    printTable([
      ["min", "mean", "p50", "p95", "max"],
      [fmt(s.min), fmt(s.mean), fmt(s.p50), fmt(s.p95), fmt(s.max)],
    ]);
  }, 10_000);
});

// ─── projected savings summary ───────────────────────────────────────────────

describe("Projected savings per chat turn", () => {
  it("prints a before/after summary for a typical 3-movie recommendation", async () => {
    const MOVIES_PER_TURN = 3;

    // Measure now-showing: Postgres (cold) vs Redis (warm)
    const nowShowingDBTimes = [];
    const nowShowingRedisTimes = [];
    const KEY = "perf:now_showing_summary";

    const data = await prisma.movie.findMany({
      where: { sessions: { some: { startsAt: { gt: new Date() } } }, tmdbId: { not: null } },
      select: { tmdbId: true, title: true, genres: true, voteAverage: true, overview: true },
    });
    await cache.set(KEY, data, 60);

    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      await prisma.movie.findMany({
        where: { sessions: { some: { startsAt: { gt: new Date() } } }, tmdbId: { not: null } },
        select: { tmdbId: true, title: true, genres: true, voteAverage: true, overview: true },
      });
      nowShowingDBTimes.push(performance.now() - t0);

      const t1 = performance.now();
      await cache.get(KEY);
      nowShowingRedisTimes.push(performance.now() - t1);
    }
    await cache.del(KEY);

    // Measure Redis hit for a TMDB movie (set a synthetic value)
    const TMDB_KEY = "tmdb:movie:550";
    await cache.set(TMDB_KEY, { id: 550, title: "Fight Club" }, 86_400);
    const tmdbRedisTimes = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      await cache.get(TMDB_KEY);
      tmdbRedisTimes.push(performance.now() - t0);
    }
    await cache.del(TMDB_KEY);

    const dbMean    = stats(nowShowingDBTimes).mean;
    const redisMean = stats(nowShowingRedisTimes).mean;
    const tmdbRedis = stats(tmdbRedisTimes).mean;

    // TMDB HTTP is ~300 ms based on typical API latency (use measured value if available)
    const TMDB_HTTP_ESTIMATE_MS = 300;

    const beforeMs =
      dbMean + // get_now_showing tool call (Postgres, no cache)
      MOVIES_PER_TURN * TMDB_HTTP_ESTIMATE_MS; // N × TMDB HTTP fetches

    const afterMs =
      redisMean + // now-showing from Redis (pre-fetched)
      MOVIES_PER_TURN * tmdbRedis; // N × TMDB from Redis

    console.log("\n  ── Projected savings per chat turn (3-movie recommendation) ──\n");
    printTable([
      ["Step", "Before", "After", "Saved"],
      [
        "Now-showing fetch",
        fmt(dbMean),
        fmt(redisMean),
        fmt(dbMean - redisMean),
      ],
      [
        `TMDB fetches (${MOVIES_PER_TURN}×)`,
        fmt(MOVIES_PER_TURN * TMDB_HTTP_ESTIMATE_MS) + " (est.)",
        fmt(MOVIES_PER_TURN * tmdbRedis),
        fmt(MOVIES_PER_TURN * (TMDB_HTTP_ESTIMATE_MS - tmdbRedis)) + " (est.)",
      ],
      [
        "Total (excl. LLM)",
        fmt(beforeMs),
        fmt(afterMs),
        fmt(beforeMs - afterMs) + " (est.)",
      ],
    ]);
    console.log(
      `\n  Note: this excludes the eliminated LLM round-trip (~1–2 s saved on top).`,
    );
  }, 30_000);
});
