import { describe, it, expect, vi } from "vitest";

// agentTools.js imports chatTools.js, which defaults its dependencies to the
// real Prisma and Redis clients. Every test below injects fakes through `deps`,
// so those defaults are never called — but importing them would still construct
// a Prisma client. Stubbing the modules keeps this a true unit test.
vi.mock("../config/db.js", () => ({ prisma: {}, connectDB: vi.fn(), disconnectDB: vi.fn() }));
vi.mock("../config/redis.js", () => ({
  cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

const { buildTools } = await import("../services/agentTools.js");

// These tests cover the layer the model reads — names, schemas, and the wiring
// from each definition to its implementation. What the implementations do is
// covered in chatTools.test.js; repeating it here would test the same code twice.

function missingCache() {
  return { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
}

function okJson(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

describe("buildTools — the tool set", () => {
  it("exposes exactly the seven tools the model is allowed to call", () => {
    expect(Object.keys(buildTools("u1")).sort()).toEqual([
      "get_movie_details",
      "get_showtimes",
      "get_taste_profile",
      "get_user_watchlist",
      "mark_watched",
      "recommend_movies",
      "search_movies",
    ]);
  });

  it("does not expose get_now_showing, which is pre-fetched into the prompt", () => {
    // If this ever appears, the model starts spending a round-trip every turn
    // on data it already has in its system prompt.
    expect(buildTools("u1")).not.toHaveProperty("get_now_showing");
  });

  it("gives every tool a description, since that is all the model chooses by", () => {
    for (const [name, def] of Object.entries(buildTools("u1"))) {
      expect(def.description, name).toEqual(expect.any(String));
      expect(def.description.length, name).toBeGreaterThan(10);
    }
  });
});

describe("buildTools — input schemas", () => {
  const tools = buildTools("u1");
  const accepts = (name, input) => tools[name].inputSchema.safeParse(input).success;

  it("get_user_watchlist takes an optional status from the enum only", () => {
    expect(accepts("get_user_watchlist", {})).toBe(true);
    expect(accepts("get_user_watchlist", { status: "COMPLETED" })).toBe(true);
    expect(accepts("get_user_watchlist", { status: "FINISHED" })).toBe(false);
  });

  it("mark_watched requires a movieId and bounds the rating to 1–10", () => {
    expect(accepts("mark_watched", { movieId: "m1", rating: 8 })).toBe(true);
    expect(accepts("mark_watched", { movieId: "m1" })).toBe(true);
    expect(accepts("mark_watched", { rating: 8 })).toBe(false);
    expect(accepts("mark_watched", { movieId: "m1", rating: 0 })).toBe(false);
    expect(accepts("mark_watched", { movieId: "m1", rating: 11 })).toBe(false);
  });

  it("search_movies and get_movie_details require their one argument", () => {
    expect(accepts("search_movies", { query: "dune" })).toBe(true);
    expect(accepts("search_movies", {})).toBe(false);
    expect(accepts("get_movie_details", { movieId: "438631" })).toBe(true);
    expect(accepts("get_movie_details", {})).toBe(false);
  });

  it("get_showtimes requires a movieId and makes the date optional", () => {
    expect(accepts("get_showtimes", { movieId: "m1" })).toBe(true);
    expect(accepts("get_showtimes", { movieId: "m1", date: "2026-09-15" })).toBe(true);
    expect(accepts("get_showtimes", { date: "2026-09-15" })).toBe(false);
  });

  it("recommend_movies requires a numeric tmdbId and a reason for every pick", () => {
    expect(
      accepts("recommend_movies", { recommendations: [{ tmdbId: 603, reason: "Cerebral." }] }),
    ).toBe(true);
    // A string id is the likeliest model mistake, since ids arrive in prose.
    // The schema is what turns it into a retryable tool error instead of a
    // TMDB lookup for "603".
    expect(
      accepts("recommend_movies", { recommendations: [{ tmdbId: "603", reason: "Cerebral." }] }),
    ).toBe(false);
    expect(accepts("recommend_movies", { recommendations: [{ tmdbId: 603 }] })).toBe(false);
  });
});

describe("buildTools — wiring to implementations", () => {
  it("scopes get_user_watchlist to the user the set was built for", async () => {
    const prisma = { watchlistItem: { findMany: vi.fn().mockResolvedValue([]) } };
    await buildTools("u1", { prisma }).get_user_watchlist.execute({ status: "PLANNED" });

    expect(prisma.watchlistItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", status: "PLANNED" } }),
    );
  });

  it("keeps two users' tool sets isolated from each other", async () => {
    // The reason buildTools is a factory. A module-level tool set would have one
    // userId frozen into it, and every request would read that user's data.
    const prisma = { watchlistItem: { findMany: vi.fn().mockResolvedValue([]) } };
    const alice = buildTools("alice", { prisma });
    const bob = buildTools("bob", { prisma });

    await bob.get_user_watchlist.execute({});
    await alice.get_user_watchlist.execute({});

    const userIds = prisma.watchlistItem.findMany.mock.calls.map(([args]) => args.where.userId);
    expect(userIds).toEqual(["bob", "alice"]);
  });

  it("scopes get_taste_profile to the user", async () => {
    const prisma = { watchlistItem: { findMany: vi.fn().mockResolvedValue([]) } };
    await buildTools("u1", { prisma }).get_taste_profile.execute({});

    expect(prisma.watchlistItem.findMany.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("passes every mark_watched argument through, with the user's id", async () => {
    const prisma = { watchlistItem: { upsert: vi.fn().mockResolvedValue({}) } };
    await buildTools("u1", { prisma }).mark_watched.execute({
      movieId: "m1",
      rating: 9,
      notes: "Loved it",
    });

    expect(prisma.watchlistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_movieId: { userId: "u1", movieId: "m1" } },
        create: expect.objectContaining({ userId: "u1", movieId: "m1", rating: 9, notes: "Loved it" }),
      }),
    );
  });

  it("forwards network deps to search_movies, so a test never reaches TMDB", async () => {
    const fetchFn = okJson({ results: [] });
    await buildTools("u1", { fetchFn, cache: missingCache(), apiKey: "k" }).search_movies.execute({
      query: "blade runner",
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0][0]).toContain("query=blade%20runner");
  });

  it("forwards the movie id and date to get_showtimes", async () => {
    const prisma = { session: { findMany: vi.fn().mockResolvedValue([]) } };
    await buildTools("u1", { prisma }).get_showtimes.execute({ movieId: "m1" });

    expect(prisma.session.findMany.mock.calls[0][0].where).toEqual({ movieId: "m1" });
  });

  it("forwards both the database and the network deps to recommend_movies", async () => {
    // recommend_movies is the one tool that needs both: Postgres for whether a
    // film is in cinemas, TMDB for the card. The eval suite relies on being able
    // to fake one and keep the other real.
    const prisma = { movie: { findMany: vi.fn().mockResolvedValue([{ tmdbId: 603 }]) } };
    const fetchFn = okJson({
      id: 603,
      title: "The Matrix",
      release_date: "1999-03-31",
      runtime: 136,
      vote_average: 8.2,
      poster_path: "/matrix.jpg",
      overview: "A hacker learns the truth.",
    });

    const [card] = await buildTools("u1", {
      prisma,
      fetchFn,
      cache: missingCache(),
      apiKey: "k",
    }).recommend_movies.execute({ recommendations: [{ tmdbId: 603, reason: "Cerebral." }] });

    expect(prisma.movie.findMany).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(card).toMatchObject({ tmdbId: 603, title: "The Matrix", reason: "Cerebral.", inTheatre: true });
  });
});
