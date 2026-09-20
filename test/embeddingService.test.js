import { describe, it, expect, vi } from "vitest";

// No module stubs needed: embeddingService builds its Google provider lazily
// and test/setup.js clears REDIS_URL, so importing this module connects to
// nothing. That is the property Phase 5's capability gate depends on.
const {
  buildEmbeddingText,
  embeddingHash,
  normalise,
  toSqlVector,
  embedQuery,
  embedDocuments,
  hasEmbeddingSupport,
  EMBEDDING_DIMENSIONS,
} = await import("../services/embeddingService.js");

const MOVIE = {
  title: "Inception",
  releaseYear: 2010,
  genres: ["Science Fiction", "Action"],
  overview: "A thief who steals corporate secrets through dream-sharing technology.",
};

// Length of a vector — used to assert normalisation rather than trusting it.
const norm = (v) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));

describe("buildEmbeddingText", () => {
  it("includes title, year, genres and overview", () => {
    const text = buildEmbeddingText(MOVIE);

    expect(text).toContain("Inception (2010)");
    expect(text).toContain("Genres: Action, Science Fiction.");
    expect(text).toContain("dream-sharing");
  });

  it("leaves out the numbers that describe popularity rather than content", () => {
    // A rating embedded as the token "7.4" moves the vector in a direction that
    // says nothing about what the film is like, and makes unrelated films that
    // share a score look closer. Those are WHERE-clause data.
    const text = buildEmbeddingText({ ...MOVIE, voteAverage: 8.4, runtime: 148, posterUrl: "/x.jpg" });

    expect(text).not.toContain("8.4");
    expect(text).not.toContain("148");
    expect(text).not.toContain("/x.jpg");
  });

  it("sorts genres, so a reordered array is not treated as a change", () => {
    // The scraper rewrites genres on every run and TMDB does not guarantee
    // order. Without the sort, the nightly backfill would re-embed the whole
    // table every night — correct results, pure cost, and no visible symptom.
    const a = buildEmbeddingText(MOVIE);
    const b = buildEmbeddingText({ ...MOVIE, genres: ["Action", "Science Fiction"] });

    expect(a).toBe(b);
    expect(embeddingHash(a)).toBe(embeddingHash(b));
  });

  it("collapses whitespace, so a re-wrapped overview is not new content", () => {
    const wrapped = buildEmbeddingText({
      ...MOVIE,
      overview: "A thief who steals   corporate secrets\n  through dream-sharing technology.",
    });

    expect(embeddingHash(wrapped)).toBe(embeddingHash(buildEmbeddingText(MOVIE)));
  });

  it("survives the rows that are missing pieces", () => {
    // One real row has an empty overview and two have no genres. A text builder
    // that produced "undefined" for those would embed the word "undefined".
    expect(buildEmbeddingText({ title: "Concert", releaseYear: 2026, genres: [], overview: "" }))
      .toBe("Concert (2026).");
    expect(buildEmbeddingText({ title: "Untitled", genres: null, overview: null }))
      .toBe("Untitled.");
  });

  it("changes when the overview really changes", () => {
    const a = embeddingHash(buildEmbeddingText(MOVIE));
    const b = embeddingHash(buildEmbeddingText({ ...MOVIE, overview: MOVIE.overview + " Extra." }));

    expect(a).not.toBe(b);
  });
});

describe("normalise", () => {
  it("scales a vector to unit length", () => {
    // Gemini returns unit length only at its native 3072 dimensions; truncated
    // to 768 it comes back around 0.59, and at different lengths for different
    // texts, which would make scores incomparable between rows.
    expect(normalise([3, 4])).toEqual([0.6, 0.8]);
    expect(norm(normalise([1, 2, 3, 4]))).toBeCloseTo(1, 10);
  });

  it("returns a zero vector unchanged instead of producing NaN", () => {
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("toSqlVector", () => {
  it("renders the literal pgvector casts with ::vector", () => {
    expect(toSqlVector([0.1, -0.2, 0.3])).toBe("[0.1,-0.2,0.3]");
  });
});

describe("embedQuery", () => {
  function fakeCache() {
    const store = new Map();
    return {
      store,
      get: vi.fn(async (k) => store.get(k) ?? null),
      set: vi.fn(async (k, v) => void store.set(k, v)),
    };
  }

  it("asks Gemini for a query-side vector, at the stored dimension count", async () => {
    // The asymmetry that raises no error when wrong: a query and a document are
    // different sides of a search, and the model encodes them differently.
    const embedFn = vi.fn().mockResolvedValue({ embedding: [3, 4] });
    const cache = fakeCache();

    const vector = await embedQuery("slow and dreamlike", { embedFn, cache, model: {} });

    expect(embedFn.mock.calls[0][0].providerOptions.google).toEqual({
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: "RETRIEVAL_QUERY",
    });
    expect(vector).toEqual([0.6, 0.8]);
  });

  it("serves a repeated question from cache instead of paying for it twice", async () => {
    const embedFn = vi.fn().mockResolvedValue({ embedding: [3, 4] });
    const cache = fakeCache();

    await embedQuery("same question", { embedFn, cache, model: {} });
    const second = await embedQuery("same question", { embedFn, cache, model: {} });

    expect(embedFn).toHaveBeenCalledOnce();
    expect(second).toEqual([0.6, 0.8]);
  });

  it("puts the model and the dimensions in the cache key", async () => {
    // A vector from another model or another dimension count is meaningless
    // here, so the key has to change when either does — the same reason the
    // now-showing cache key was bumped to :v2 in Sprint 2.
    const embedFn = vi.fn().mockResolvedValue({ embedding: [1, 0] });
    const cache = fakeCache();

    await embedQuery("anything", { embedFn, cache, model: {} });
    const [key] = cache.set.mock.calls[0];

    expect(key).toContain("gemini-embedding-001");
    expect(key).toContain(String(EMBEDDING_DIMENSIONS));
  });
});

describe("embedDocuments", () => {
  it("asks for document-side vectors and normalises every one", async () => {
    const embedManyFn = vi.fn().mockResolvedValue({ embeddings: [[3, 4], [0, 5]] });

    const vectors = await embedDocuments(["a", "b"], { embedManyFn, model: {} });

    expect(embedManyFn.mock.calls[0][0].providerOptions.google.taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(vectors).toEqual([[0.6, 0.8], [0, 1]]);
  });

  it("does not call the API for an empty batch", async () => {
    // The backfill reaches this whenever nothing has changed, which after the
    // first run is every single night.
    const embedManyFn = vi.fn();

    expect(await embedDocuments([], { embedManyFn, model: {} })).toEqual([]);
    expect(embedManyFn).not.toHaveBeenCalled();
  });
});

describe("hasEmbeddingSupport", () => {
  it("reports whether the tool can be registered at all", () => {
    const key = process.env.GEMINI_API_KEY;
    try {
      expect(hasEmbeddingSupport()).toBe(true);
      delete process.env.GEMINI_API_KEY;
      expect(hasEmbeddingSupport()).toBe(false);
    } finally {
      process.env.GEMINI_API_KEY = key;
    }
  });
});
