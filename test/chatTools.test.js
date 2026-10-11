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

const {
  searchMovies,
  getTasteProfile,
  markWatched,
  getShowtimes,
  findSimilarMovies,
  fetchWithRetry,
  TMDB_IMG_BASE,
} = await import("../controller/chatTools.js");

// These import the real tool implementations that chatController.js runs.
// An earlier version of this file re-implemented each function locally because
// the tools were closures inside chat() and could not be imported. Those tests
// passed whatever the controller did — they were testing a copy. Every
// dependency below is injected through the options object instead.

// A cache stub that always misses, so the TMDB path is the one under test.
function missingCache() {
  return { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
}

// A fetch stub returning one successful TMDB payload.
function okJson(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
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

  it("caps the rows, because each one is spent from the model's context", async () => {
    // TMDB returns up to 20 per page and the old code passed all of them on.
    // Measured: six searches in one turn came to 6,282 tokens and tipped the
    // request over Groq's 8,000 TPM limit, which ends the turn outright.
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      title: `Film ${i}`,
      release_date: "2024-01-01",
      overview: "Blurb.",
    }));
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: twenty }),
    });

    const results = await searchMovies("anything", {
      fetchFn: fakeFetch,
      cache: missingCache(),
      apiKey: "test-key",
    });

    expect(results).toHaveLength(5);
    // Relevance order is TMDB's, so the cap must keep the head of the list.
    expect(results[0].id).toBe(0);
    // overview deliberately survives: the model reads it to choose a film, and
    // it is the row count, not the blurb, that was free to cut.
    expect(results[0].overview).toBe("Blurb.");
  });

  it("versions the cache key, so a capped payload cannot be served from an uncapped cache", async () => {
    const cache = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    });

    await searchMovies("Dune", { fetchFn: fakeFetch, cache, apiKey: "test-key" });

    // The shape of a cached value is part of its identity. Without the bump,
    // Redis would keep answering with 20-row payloads for an hour after deploy.
    expect(cache.get.mock.calls[0][0]).toContain("v2");
    expect(cache.set.mock.calls[0][0]).toContain("v2");
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
  // The parameter used to be a Movie.id uuid, which no tool has ever shown the
  // model — so it guessed, and the write failed on the foreign key. These tests
  // are written against the TMDB id it actually holds.

  const TMDB_DETAILS = {
    id: 27205,
    title: "Inception",
    release_date: "2010-07-15",
    overview: "A thief who steals corporate secrets.",
    runtime: 148,
    vote_average: 8.4,
    poster_path: "/poster.jpg",
    genres: [{ name: "Science Fiction" }, { name: "Action" }],
  };

  function fakePrisma({ movie = null } = {}) {
    return {
      movie: {
        findUnique: vi.fn().mockResolvedValue(movie),
        upsert: vi.fn().mockResolvedValue({ id: "movie-456", title: "Inception" }),
      },
      watchlistItem: { upsert: vi.fn().mockResolvedValue({}) },
    };
  }

  it("resolves the TMDB id to the internal row before writing", async () => {
    // The whole point of the change: WatchlistItem.movieId is a uuid, and that
    // uuid now comes from a lookup rather than from the model.
    const prisma = fakePrisma({ movie: { id: "movie-456", title: "Inception" } });

    const result = await markWatched("user-123", 27205, 9, "Loved it!", { prisma });

    expect(prisma.movie.findUnique).toHaveBeenCalledWith({ where: { tmdbId: 27205 } });
    expect(result).toEqual({ success: true, title: "Inception" });

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

  it("costs no network call when the film is already on file", async () => {
    const prisma = fakePrisma({ movie: { id: "movie-456", title: "Inception" } });
    const fetchFn = vi.fn();

    await markWatched("user-123", 27205, undefined, undefined, { prisma, fetchFn });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(prisma.movie.upsert).not.toHaveBeenCalled();
  });

  it("creates the film from TMDB when we have never seen it", async () => {
    // Our Movie table holds the ~90 scraped Christchurch films. A user can
    // plausibly have watched anything, so an unknown film is created rather
    // than refused.
    const prisma = fakePrisma({ movie: null });
    const fetchFn = okJson(TMDB_DETAILS);

    const result = await markWatched("user-123", 27205, 8, undefined, {
      prisma,
      fetchFn,
      cache: missingCache(),
      apiKey: "k",
    });

    expect(result).toEqual({ success: true, title: "Inception" });

    // Every field comes from TMDB. The model passed one number, so there is no
    // field here it could have invented.
    expect(prisma.movie.upsert).toHaveBeenCalledWith({
      where: { tmdbId: 27205 },
      update: {},
      create: {
        tmdbId: 27205,
        title: "Inception",
        overview: "A thief who steals corporate secrets.",
        releaseYear: 2010,
        genres: ["Science Fiction", "Action"],
        runtime: 148,
        voteAverage: 8.4,
        posterUrl: `${TMDB_IMG_BASE}/poster.jpg`,
        createdBy: "user-123",
      },
    });
  });

  it("upserts rather than creates, so two turns at once cannot collide", async () => {
    // Both would miss the findUnique above and the second create would hit the
    // tmdbId unique constraint.
    const prisma = fakePrisma({ movie: null });

    await markWatched("user-123", 27205, undefined, undefined, {
      prisma,
      fetchFn: okJson(TMDB_DETAILS),
      cache: missingCache(),
      apiKey: "k",
    });

    expect(prisma.movie.upsert).toHaveBeenCalledOnce();
    expect(prisma.movie.upsert.mock.calls[0][0].update).toEqual({});
  });

  it("answers instead of throwing when TMDB has no release date", async () => {
    // Movie.releaseYear is a required Int, so there is nothing to store.
    // Letting Prisma reject it would reach the model as "the database could not
    // be reached" — false, and the misdirection the not_found kind exists to
    // avoid. Nothing is broken here, so this is a return value, not a throw.
    const prisma = fakePrisma({ movie: null });

    const result = await markWatched("user-123", 27205, undefined, undefined, {
      prisma,
      fetchFn: okJson({ ...TMDB_DETAILS, release_date: "" }),
      cache: missingCache(),
      apiKey: "k",
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/release date/i);
    // Nothing was written on the way out.
    expect(prisma.movie.upsert).not.toHaveBeenCalled();
    expect(prisma.watchlistItem.upsert).not.toHaveBeenCalled();
  });

  it("returns the title, so marking the wrong film is visible", async () => {
    // "done" on its own confirms nothing about which film was meant. This is
    // the model's only chance to notice, and the user's only chance to catch it.
    const prisma = fakePrisma({ movie: { id: "m1", title: "The Godfather" } });

    const result = await markWatched("user-123", 238, undefined, undefined, { prisma });

    expect(result.title).toBe("The Godfather");
  });
});

describe("getShowtimes tool", () => {
  // This filtered Session.movieId — a foreign key to Movie.id — with whatever
  // the model guessed, so it returned [] every time. Worse than mark_watched's
  // version of the same bug, because [] is a *valid* answer meaning "nothing
  // scheduled", so the model told users films were not playing when they were.

  function fakePrisma({ movie = null, sessions = [] } = {}) {
    return {
      movie: { findUnique: vi.fn().mockResolvedValue(movie) },
      session: { findMany: vi.fn().mockResolvedValue(sessions) },
    };
  }

  it("resolves the TMDB id and filters sessions on the internal uuid", async () => {
    const sessions = [{ id: "s1", cinema: { name: "Hoyts Riccarton" } }];
    const prisma = fakePrisma({ movie: { id: "movie-456", title: "Inception" }, sessions });

    const result = await getShowtimes(27205, undefined, { prisma });

    expect(prisma.movie.findUnique).toHaveBeenCalledWith({
      where: { tmdbId: 27205 },
      select: { id: true, title: true },
    });
    // The uuid from the lookup, never the number the model passed.
    expect(prisma.session.findMany.mock.calls[0][0].where).toEqual({ movieId: "movie-456" });
    expect(result).toEqual({ found: true, title: "Inception", sessions });
  });

  it("says the film is unknown rather than returning a bare empty list", async () => {
    // "we have no such film" and "that film has no sessions" are different
    // things to tell a user, and [] cannot say which.
    const prisma = fakePrisma({ movie: null });

    const result = await getShowtimes(999999, undefined, { prisma });

    expect(result).toEqual({ found: false, title: null, sessions: [] });
    // No point querying sessions for a film we do not have.
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });

  it("reports an empty schedule as found, which is the other half of that", async () => {
    const prisma = fakePrisma({ movie: { id: "m1", title: "Inception" }, sessions: [] });

    expect(await getShowtimes(27205, undefined, { prisma })).toEqual({
      found: true,
      title: "Inception",
      sessions: [],
    });
  });

  it("narrows to a single day when a date is given", async () => {
    const prisma = fakePrisma({ movie: { id: "m1", title: "Inception" } });

    await getShowtimes(27205, "2026-10-15", { prisma });

    const { startsAt } = prisma.session.findMany.mock.calls[0][0].where;
    expect(startsAt.gte).toEqual(new Date("2026-10-15"));
    // Exclusive upper bound one day on, so a session at 23:59 is still included.
    expect(startsAt.lt).toEqual(new Date("2026-10-16"));
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

describe("fetchWithRetry", () => {
  // This function had no test of its own, which is how its code and its comment
  // came to disagree: the "don't retry 4xx" throw sat inside the try and was
  // caught by that try's own catch, so every 404 cost three round-trips and
  // 1.5 s of backoff. Retry policy is exactly the kind of thing that fails
  // quietly — it only ever shows up as latency and spent quota.
  const ok = { ok: true, status: 200 };

  it("returns the first successful response without retrying", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok);
    await expect(fetchWithRetry("u", { fetchFn })).resolves.toBe(ok);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("gives up on a 4xx after one attempt, because it will fail identically", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchWithRetry("u", { fetchFn })).rejects.toThrow("TMDB 404");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("retries a 5xx up to maxAttempts and reports the last status", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchWithRetry("u", { fetchFn, maxAttempts: 2 })).rejects.toThrow("TMDB 503");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries a network error and succeeds on a later attempt", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(ok);
    await expect(fetchWithRetry("u", { fetchFn, maxAttempts: 2 })).resolves.toBe(ok);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("surfaces the network error itself once the attempts run out", async () => {
    // The message matters downstream: classifyToolError reads "fetch failed"
    // as an upstream failure rather than an unknown one.
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchWithRetry("u", { fetchFn, maxAttempts: 1 })).rejects.toThrow("fetch failed");
  });
});
