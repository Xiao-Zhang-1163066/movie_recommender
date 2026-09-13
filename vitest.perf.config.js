import { defineConfig } from "vitest/config";

// Performance benchmarks. Unlike the default suite these deliberately hit real
// infrastructure — Neon, Upstash and the TMDB API — so they load the real .env
// and never run in CI.
//
// `dotenv/config` must be loaded here rather than inside the test files: the
// Redis client in config/redis.js decides whether to connect by reading
// REDIS_URL at module-evaluation time, and ESM evaluates imports before any
// statement in the test file body would run.
export default defineConfig({
  test: {
    include: ["test/perf/**/*.test.js"],
    setupFiles: ["dotenv/config"],
    environment: "node",
    // Benchmarks are timing-sensitive; parallel files would contend for the
    // same connection pool and skew the percentiles.
    fileParallelism: false,
  },
});
