import { defineConfig } from "vitest/config";

// Default suite: unit + integration. These must run with no database, no Redis
// and no network, so they can run in CI without any secrets configured.
// Performance tests live in test/perf/ and are excluded here — they measure real
// infrastructure and have their own config (vitest.perf.config.js).
export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    exclude: ["test/perf/**", "**/node_modules/**", "client/**"],
    setupFiles: ["test/setup.js"],
    environment: "node",
  },
});
