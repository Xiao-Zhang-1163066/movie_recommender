import { createHash } from "node:crypto";
import { embed, embedMany } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { cache as defaultCache } from "../config/redis.js";

/**
 * Turns text into vectors, in both directions the app needs: a batch of movie
 * rows for the backfill job, and a single user sentence on the chat request
 * path.
 *
 * It is a service rather than more functions in chatTools.js because those two
 * callers have nothing else in common — one is a cron script chewing through
 * the whole table, the other is a controller with a user waiting. Same reason
 * conversationService.js exists.
 *
 * Every external dependency arrives through the trailing options object and
 * defaults to the real thing, matching chatTools.js: production calls pass
 * nothing, tests pass fakes. That is what lets the default vitest suite cover
 * this file with no API key and no network.
 */

export const EMBEDDING_MODEL = "gemini-embedding-001";

// 768 rather than the model's native 3072. gemini-embedding-001 is a Matryoshka
// model, so a truncated prefix is still a usable embedding — a quarter of the
// storage and index size, and well inside pgvector's 2000-dimension HNSW limit.
// This number is also baked into the vector(768) column, so the two must move
// together or every insert fails.
export const EMBEDDING_DIMENSIONS = 768;

// Built on first use, not at import time. Importing this module must stay free
// of side effects and must not require a key: agentTools.js decides whether to
// expose the search tool at all based on hasEmbeddingSupport(), and it cannot
// make that decision if merely importing has already thrown.
let provider;
function defaultModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set — embeddings are unavailable");
  }
  provider ??= createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  return provider.textEmbeddingModel(EMBEDDING_MODEL);
}

/** Whether embeddings can run at all. Used to gate the tool rather than let it fail. */
export function hasEmbeddingSupport() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * The exact string that represents a movie in vector space.
 *
 * Pure and deterministic on purpose: embeddingHash() is computed from this
 * output, and the backfill decides what to re-embed by comparing hashes. If the
 * same row could produce two different strings, the job would either re-embed
 * everything forever or silently skip rows that really did change.
 *
 * Title, year, genres and overview only. voteAverage and runtime are left out
 * deliberately — a rating embedded as the token "7.4" nudges the vector in a
 * direction that means nothing about what the film is like, and makes unrelated
 * films that share a score look closer. Those are WHERE-clause data. The year
 * stays because era genuinely carries style ("a 90s thriller"), which a number
 * like 7.4 does not.
 */
export function buildEmbeddingText(movie) {
  const parts = [];

  parts.push(movie.releaseYear ? `${movie.title} (${movie.releaseYear}).` : `${movie.title}.`);

  // Sorted, not in the order the row happens to hold them. The scraper rewrites
  // genres on every run, and a reordered array with identical contents would
  // otherwise change the hash and trigger a pointless re-embed.
  if (movie.genres?.length) {
    parts.push(`Genres: ${[...movie.genres].sort().join(", ")}.`);
  }

  if (movie.overview?.trim()) parts.push(movie.overview.trim());

  // Collapse whitespace so a re-wrapped overview is not treated as new text.
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Identity of the embedded text, so unchanged rows cost nothing to re-run. */
export function embeddingHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Scale a vector to unit length.
 *
 * Not optional. Gemini returns a unit-length vector only at its full 3072
 * dimensions; truncated to 768 the prefix comes back at around 0.59, and at
 * different lengths for different texts. Left as-is, cosine distance stops
 * being equivalent to inner product and scores stop being comparable between
 * rows — a longer vector simply scores higher against everything.
 */
export function normalise(vector) {
  const length = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  // A zero vector cannot be normalised; returning it unchanged keeps the caller
  // from propagating NaN through every subsequent comparison.
  if (length === 0) return vector;
  return vector.map((x) => x / length);
}

/**
 * Render a vector for SQL. pgvector has no binary protocol in node-postgres, so
 * every vector crosses as the literal '[0.1,0.2,...]' and is cast with ::vector
 * at the call site.
 */
export function toSqlVector(vector) {
  return `[${vector.join(",")}]`;
}

/**
 * Embed movie texts, in batch, for storage.
 *
 * taskType matters more than it looks: Gemini produces a *different* vector for
 * the same words depending on which side of a search they are on. Documents are
 * embedded as RETRIEVAL_DOCUMENT, the user's question as RETRIEVAL_QUERY below.
 * Getting this wrong throws no error — the results are just quietly worse,
 * which is the failure mode that survives all the way to production.
 */
export async function embedDocuments(
  texts,
  { model, embedManyFn = embedMany, maxParallelCalls = 2 } = {},
) {
  if (!texts.length) return [];
  const { embeddings } = await embedManyFn({
    model: model ?? defaultModel(),
    values: texts,
    // Held low on purpose: the backfill runs against Gemini's free tier, where
    // the per-minute limit is the binding constraint, not throughput.
    maxParallelCalls,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    },
  });
  return embeddings.map(normalise);
}

/**
 * Embed one user description, for searching.
 *
 * Cached because this one sits on the request path: a repeated phrasing should
 * cost a Redis round-trip, not a model call. The key carries the model and
 * dimension count, so changing either cannot serve vectors from the old space —
 * the same lesson as bumping now_showing:v2 in Sprint 2.
 */
export async function embedQuery(
  text,
  { model, embedFn = embed, cache = defaultCache } = {},
) {
  const key = `embed:q:v1:${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}:${embeddingHash(text)}`;

  const cached = await cache.get(key);
  if (cached) return cached;

  const { embedding } = await embedFn({
    model: model ?? defaultModel(),
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: "RETRIEVAL_QUERY",
      },
    },
  });

  const vector = normalise(embedding);
  // 24 h: a query's vector only goes stale if the model changes, and that
  // changes the key.
  await cache.set(key, vector, 86_400);
  return vector;
}
