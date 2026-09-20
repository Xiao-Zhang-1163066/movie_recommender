// Test environment guard.
//
// The unit and integration suites mock config/db.js and config/redis.js, but a
// mock is easy to forget and the failure mode is silent: a test would quietly
// read and write the real Neon database. Clearing the connection strings here
// makes that mistake loud instead — Prisma throws on a missing URL, and the
// Redis client in config/redis.js falls back to its no-op branch.
//
// This also removes any need for CI secrets: the suite has nothing real to
// connect to by construction.
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;
delete process.env.REDIS_URL;

// Fixed values so signed tokens are reproducible across runs and machines.
process.env.JWT_SECRET = "test-secret-not-used-in-production";
process.env.JWT_EXPIRES_IN = "7d";
process.env.TMDB_API_KEY = "test-tmdb-key";
process.env.GROQ_API_KEY = "test-groq-key";
// Set rather than left to chance: buildTools registers find_similar_movies only
// when this exists, so without a fixed value the tool set would differ between a
// machine with a .env and CI without one — a suite that passes locally and fails
// in Actions. The gate itself is tested by deleting this inside one test.
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.NODE_ENV = "test";
process.env.CORS_ORIGIN = "http://localhost:5173";
