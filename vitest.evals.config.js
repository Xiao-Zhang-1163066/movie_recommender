import { defineConfig } from "vitest/config";

// Behavioural evals. Like the perf suite these hit real infrastructure — Groq
// and the TMDB API — so they load the real .env and never run in CI. Only
// Postgres is faked, inside the test file.
//
// `dotenv/config` must load here rather than in the test file: config/redis.js
// decides whether to connect by reading REDIS_URL at module-evaluation time,
// and ESM evaluates imports before any statement in the test body runs.
export default defineConfig({
  test: {
    include: ["test/evals/**/*.test.js"],
    setupFiles: ["dotenv/config"],
    environment: "node",
    // Live model runs are slow and rate-limited; parallel files would contend
    // for the same Groq quota and turn a 429 into a fake behavioural failure.
    fileParallelism: false,
    // Vitest hides a passing test's console output, so the first green run
    // printed no table and the pass rate was lost. The per-query table is the
    // point of this suite, not a debugging aid.
    disableConsoleIntercept: true,
    // The suite drives twenty sequential model turns in a single test, measured
    // at ~80s each, so ~26 minutes. Capped well clear of that.
    testTimeout: 45 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
});
