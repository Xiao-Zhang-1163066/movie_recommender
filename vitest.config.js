import { defineConfig } from "vitest/config";

// Default suite: unit + integration. These must run with no database, no Redis
// and no network, so they can run in CI without any secrets configured.
// Performance tests live in test/perf/ and behavioural evals in test/evals/.
// Both are excluded here — they hit real infrastructure (Neon, Upstash, Groq,
// TMDB) and have their own configs (vitest.perf.config.js, vitest.evals.config.js).
// Leaving either out of `exclude` silently enrols it in CI, where it would fail
// for want of secrets and, in the evals' case, spend model quota per deploy.
export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    exclude: ["test/perf/**", "test/evals/**", "**/node_modules/**", "client/**"],
    setupFiles: ["test/setup.js"],
    environment: "node",
  },
});
