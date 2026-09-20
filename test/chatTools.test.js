import { describe, it, expect, vi } from "vitest";

// chatTools.js defaults its dependencies to the real Prisma and Redis clients.
// Every test below injects fakes, so those defaults are never called — but the
// import alone would construct a Prisma client and read the generated client off
// disk. Stubbing the modules keeps this file a true unit test with no
// filesystem or connection prerequisites.
vi.mock("../config/db.js", () => ({ prisma: {}, connectDB: vi.fn(), disconnectDB: vi.fn() }));
vi.mock("../config/redis.js", () => ({
  cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

const { searchMovies, getTasteProfile, markWatched, findSimilarMovies } = await import(
  "../controller/chatTools.js"
);

// These import the real tool implementations that chatController.js runs.
// An earlier version of this file re-implemented each function locally because
// the tools were closures inside chat() and could not be imported. Those tests
// passed whatever the controller did — they were testing a copy. Every
// dependency below is injected through the options object instead.

// A cache stub that always misses, so the TMDB path is the one under test.
function missingCache() {
  return { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
}

describe("searchMovies tool", () => {
  it("returns mapped movie objects from TMDB response", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: 123,
              title: "Test Movie",
              release_date: "2024-01-01",
              overview: "A great film",
              poster_path: "/abc.jpg", // extra field — the tool should drop this
            },
          ],
        }),
    });

    const results = await searchMovies("test query", {
      fetchFn: fakeFetch,
      cache: missingCache(),
      apiKey: "test-key",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 123,
      title: "Test Movie",
      release_date: "2024-01-01",
      overview: "A great film",
    });
  });

  it("url-encodes the query so titles with spaces and symbols reach TMDB intact", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    });

    await searchMovies("Am I OK?", {
      fetchFn: fakeFetch,
      cache: missingCache(),
      apiKey: "test-key",
    });

    // A mock ignores its arguments, so asserting on the return value alone would
    // never catch a malformed URL. Inspect the call instead.
    const [calledUrl] = fakeFetch.mock.calls[0];
    expect(calledUrl).toContain("query=Am%20I%20OK%3F");
  });

  it("serves a cache hit without calling TMDB", async () => {
    const cached = [{ id: 1, title: "Cached", release_date: "", overview: "" }];
    const cache = { get: vi.fn().mockResolvedValue(cached), set: vi.fn() };
    const fakeFetch = vi.fn();

    const results = await searchMovies("anything", {
      fetchFn: fakeFetch,
      cache,
      apiKey: "test-key",
    });

    expect(results).toEqual(cached);
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});

describe("getTasteProfile tool", () => {
  it("calculates average rating correctly", async () => {
    const prisma = {
      watchlistItem: {
        findMany: vi.fn().mockResolvedValue([
          { rating: 8, movie: { title: "Film A" } },
          { rating: 6, movie: { title: "Film B" } },
          { rating: 10, movie: { title: "Film C" } },
        ]),
      },
    };

    const result = await getTasteProfile("user-123", { prisma });

    expect(result.ratingCount).toBe(3);
    expect(result.avgRating).toBe(8);
    expect(result.recentRatings).toEqual([
      { title: "Film A", rating: 8 },
      { title: "Film B", rating: 6 },
      { title: "Film C", rating: 10 },
    ]);
  });

  it("returns null avgRating when no movies watched", async () => {
    const prisma = {
      watchlistItem: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const result = await getTasteProfile("user-123", { prisma });

    expect(result.ratingCount).toBe(0);
    expect(result.avgRating).toBe(null);
    expect(result.recentRatings).toEqual([]);
  });

  it("scopes the query to the requesting user and to rated, completed items", async () => {
    const prisma = {
      watchlistItem: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await getTasteProfile("user-123", { prisma });

    // Dropping any part of this where clause would leak another user's ratings
    // into the taste profile, or average in unrated rows as if they were zero.
    expect(prisma.watchlistItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-123", status: "COMPLETED", rating: { not: null } },
      include: { movie: true },
    });
  });
});

describe("markWatched tool", () => {
  it("calls upsert with correct arguments and returns success", async () => {
    const prisma = {
      watchlistItem: { upsert: vi.fn().mockResolvedValue({}) },
    };

    // movieId is a uuid string — WatchlistItem.movieId is String in the Prisma
    // schema and the tool's inputSchema is z.string().
    const result = await markWatched(
      "user-123",
      "movie-456",
      9,
      "Loved it!",
      { prisma },
    );

    expect(result).toEqual({ success: true });

    // upsert returns nothing useful, so the call arguments are the only thing
    // that proves the write was correct.
    expect(prisma.watchlistItem.upsert).toHaveBeenCalledWith({
      where: { userId_movieId: { userId: "user-123", movieId: "movie-456" } },
      update: { status: "COMPLETED", rating: 9, notes: "Loved it!" },
      create: {
        userId: "user-123",
        movieId: "movie-456",
        status: "COMPLETED",
        rating: 9,
        notes: "Loved it!",
      },
    });
  });
});

describe("findSimilarMovies tool", () => {
  // $queryRaw is a tagged template, so a spy receives the strings array first
  // and every interpolated value after it. Asserting on those bound values is
  // the only way to check a raw query without a database.
  const boundValues = (spy) => spy.mock.calls[0].slice(1);

  function fakePrisma(rows = []) {
    return { $queryRaw: vi.fn().mockResolvedValue(rows) };
  }

  it("embeds the description once and binds that vector to the query", async () => {
    const prisma = fakePrisma();
    const embedQuery = vi.fn().mockResolvedValue([0.6, 0.8]);

    await findSimilarMovies("a heist inside someone's dreams", false, { prisma, embedQuery });

    expect(embedQuery).toHaveBeenCalledOnce();
    expect(embedQuery).toHaveBeenCalledWith("a heist inside someone's dreams");
    // Once for the score in the SELECT, once for the ORDER BY. Both must be the
    // same vector, or the rows would be ranked by a different query than the one
    // whose similarity is reported.
    expect(boundValues(prisma.$queryRaw).filter((v) => v === "[0.6,0.8]")).toHaveLength(2);
  });

  it("passes the theatre filter through as a real boolean", async () => {
    const prisma = fakePrisma();
    const embedQuery = vi.fn().mockResolvedValue([1, 0]);

    await findSimilarMovies("something funny", true, { prisma, embedQuery });
    expect(boundValues(prisma.$queryRaw)).toContain(true);

    const unfiltered = fakePrisma();
    await findSimilarMovies("something funny", false, { prisma: unfiltered, embedQuery });
    expect(boundValues(unfiltered.$queryRaw)).toContain(false);
  });

  it("caps how many rows can reach the model's context", async () => {
    // Every returned row rides into the prompt, so the limit is a token budget
    // rather than a display choice.
    const prisma = fakePrisma();
    await findSimilarMovies("anything", false, { prisma, embedQuery: vi.fn().mockResolvedValue([1]) });

    expect(boundValues(prisma.$queryRaw)).toContain(10);
  });

  it("rounds similarity and returns only the fields a recommendation needs", async () => {
    const prisma = fakePrisma([
      {
        tmdbId: 27205,
        title: "Inception",
        releaseYear: 2010,
        genres: ["Science Fiction"],
        similarity: 0.7345678901234,
        inTheatre: false,
      },
    ]);

    const [row] = await findSimilarMovies("dreams", false, {
      prisma,
      embedQuery: vi.fn().mockResolvedValue([1]),
    });

    // The remaining digits are tokens that carry no ordering information.
    expect(row).toEqual({
      tmdbId: 27205,
      title: "Inception",
      releaseYear: 2010,
      genres: ["Science Fiction"],
      inTheatre: false,
      similarity: 0.735,
    });
  });
});
