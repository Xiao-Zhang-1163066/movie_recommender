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
const { zodSchema } = await import("ai");

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
  it("exposes exactly the eight tools the model is allowed to call", () => {
    expect(Object.keys(buildTools("u1")).sort()).toEqual([
      "find_similar_movies",
      "get_movie_details",
      "get_showtimes",
      "get_taste_profile",
      "get_user_watchlist",
      "mark_watched",
      "recommend_movies",
      "search_movies",
    ]);
  });

  it("hides find_similar_movies entirely when there is no embedding key", () => {
    // Absent, not present-and-failing. A tool that always throws still gets
    // called, and every attempt spends one of the eight steps a turn is allowed.
    const key = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      expect(buildTools("u1")).not.toHaveProperty("find_similar_movies");
      // Everything else must keep working without it.
      expect(Object.keys(buildTools("u1"))).toContain("search_movies");
    } finally {
      process.env.GEMINI_API_KEY = key;
    }
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

  it("mark_watched takes a numeric tmdbId and bounds the rating to 1–10", () => {
    const film = { tmdbId: 27205, title: "Inception" };
    expect(accepts("mark_watched", { ...film, rating: 8 })).toBe(true);
    expect(accepts("mark_watched", film)).toBe(true);
    expect(accepts("mark_watched", { title: "Inception", rating: 8 })).toBe(false);
    expect(accepts("mark_watched", { ...film, rating: 0 })).toBe(false);
    expect(accepts("mark_watched", { ...film, rating: 11 })).toBe(false);
  });

  it("mark_watched requires a title, because the id check needs one", () => {
    // Optional would let the model skip the one claim that exposes an
    // invented id.
    expect(accepts("mark_watched", { tmdbId: 27205 })).toBe(false);
  });

  it("mark_watched rejects the internal uuid it used to ask for", () => {
    // The old schema was z.string(), which accepted a Movie.id uuid the model
    // has never been shown and could only invent. A number cannot be guessed
    // the same way: every id the model holds came out of a tool result.
    expect(accepts("mark_watched", { movieId: "a3f8c2e1-9b4d-4f7a-8e52-1c6d0b9a7e34" })).toBe(
      false,
    );
    // A numeric id as a string is the likeliest remaining mistake, since ids
    // arrive in prose. The schema is what turns that into a retryable tool
    // error rather than a lookup for the film with tmdbId "27205".
    expect(accepts("mark_watched", { tmdbId: "27205" })).toBe(false);
  });

  it("search_movies and get_movie_details require their one argument", () => {
    expect(accepts("search_movies", { query: "dune" })).toBe(true);
    expect(accepts("search_movies", {})).toBe(false);
    expect(accepts("get_movie_details", { movieId: "438631" })).toBe(true);
    expect(accepts("get_movie_details", {})).toBe(false);
  });

  it("find_similar_movies requires a description and makes the filter optional", () => {
    expect(accepts("find_similar_movies", { description: "slow and dreamlike" })).toBe(true);
    expect(accepts("find_similar_movies", { description: "x", onlyInTheatres: true })).toBe(true);
    expect(accepts("find_similar_movies", {})).toBe(false);
  });

  it("get_showtimes takes a numeric tmdbId and makes the date optional", () => {
    expect(accepts("get_showtimes", { tmdbId: 27205 })).toBe(true);
    expect(accepts("get_showtimes", { tmdbId: 27205, date: "2026-09-15" })).toBe(true);
    expect(accepts("get_showtimes", { date: "2026-09-15" })).toBe(false);
    // Same correction as mark_watched: this asked for a uuid it filtered
    // Session.movieId with, and silently matched nothing.
    expect(accepts("get_showtimes", { movieId: "m1" })).toBe(false);
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

  it("gives mark_watched no way to write at all", async () => {
    // The trust boundary, as an absence rather than a check. If this ever
    // fails, the model can write to the database on its own say-so again —
    // which is the whole thing Phase 3 removed. Asserting on the Prisma double
    // rather than on the return value is deliberate: a return value can be
    // made to look right while a write still happens underneath.
    const prisma = {
      movie: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn() },
      watchlistItem: { upsert: vi.fn(), create: vi.fn(), update: vi.fn() },
    };

    await buildTools("u1", {
      prisma,
      fetchFn: okJson({ id: 27205, title: "Inception", poster_path: "/p.jpg" }),
      cache: missingCache(),
      apiKey: "k",
    }).mark_watched.execute(
      { tmdbId: 27205, title: "Inception", rating: 9, notes: "Loved it" },
      {},
    );

    for (const model of Object.values(prisma)) {
      for (const [name, spy] of Object.entries(model)) {
        expect(spy, name).not.toHaveBeenCalled();
      }
    }
  });

  it("returns a proposal carrying the arguments and a TMDB-sourced title", async () => {
    const result = await buildTools("u1", {
      fetchFn: okJson({ id: 27205, title: "Inception", poster_path: "/p.jpg" }),
      cache: missingCache(),
      apiKey: "k",
    }).mark_watched.execute(
      { tmdbId: 27205, title: "Inception", rating: 9, notes: "Loved it" },
      {},
    );

    expect(result).toMatchObject({
      pending: true,
      tmdbId: 27205,
      // From TMDB, never from the model: an invented title would make the
      // confirmation card lie about what the user is approving.
      title: "Inception",
      rating: 9,
      notes: "Loved it",
    });
  });

  it("tells the model to ask, not to announce", async () => {
    // Without this the model reports "done" off the back of pending: true, and
    // the transcript records a write that may never happen.
    const result = await buildTools("u1", {
      fetchFn: okJson({ id: 27205, title: "Inception" }),
      cache: missingCache(),
      apiKey: "k",
    }).mark_watched.execute({ tmdbId: 27205, title: "Inception" }, {});

    expect(result.instruction).toMatch(/confirm/i);
    expect(result.instruction).toMatch(/not been saved|do not say it is done/i);
  });

  it("forwards network deps to search_movies, so a test never reaches TMDB", async () => {
    const fetchFn = okJson({ results: [] });
    await buildTools("u1", { fetchFn, cache: missingCache(), apiKey: "k" }).search_movies.execute({
      query: "blade runner",
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0][0]).toContain("query=blade%20runner");
  });

  it("resolves the tmdbId before querying sessions in get_showtimes", async () => {
    const prisma = {
      movie: { findUnique: vi.fn().mockResolvedValue({ id: "m1", title: "Inception" }) },
      session: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await buildTools("u1", { prisma }).get_showtimes.execute({ tmdbId: 27205 });

    // The uuid from the lookup, not the number the model passed. The startsAt
    // half of this where clause is covered in chatTools.test.js.
    expect(prisma.session.findMany.mock.calls[0][0].where.movieId).toBe("m1");
  });

  it("embeds the description once and defaults the theatre filter to false", async () => {
    // The tool's schema makes onlyInTheatres optional, but findSimilarMovies
    // builds SQL from it — undefined reaching the query would filter nothing
    // while looking like it filtered.
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const embedQuery = vi.fn().mockResolvedValue([0.1, 0.2]);

    await buildTools("u1", { prisma, embedQuery }).find_similar_movies.execute({
      description: "a heist inside someone's dreams",
    });

    expect(embedQuery).toHaveBeenCalledWith("a heist inside someone's dreams");
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    // The bound values of the tagged template: the vector twice, then the flag.
    expect(prisma.$queryRaw.mock.calls[0]).toContain(false);
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

describe("buildTools — error containment", () => {
  // The SDK already keeps a throwing tool from ending the turn: it catches,
  // emits a tool-error part, and feeds the error text back to the model as that
  // call's result. What it does not decide is *what* text — it passes
  // err.message through verbatim. These tests cover the layer that does.

  function throwingPrisma(err) {
    return { watchlistItem: { findMany: vi.fn().mockRejectedValue(err) } };
  }

  it("wraps every tool, so a tool added later cannot forget to opt in", async () => {
    // Containment is applied as one pass over the finished object rather than
    // tool by tool, which is the only version of this that stays true a year
    // from now. This test is what makes that claim checkable: it breaks every
    // dependency the layer has and walks the whole tool set, so a new tool is
    // covered by existing, not by someone remembering to add a case.
    const boom = () => Promise.reject(new Error("dependency down"));
    const prisma = new Proxy(
      {},
      {
        // $queryRaw is called directly; every other access is a model with
        // methods on it. Both resolve to something that fails.
        get: (_t, key) =>
          String(key).startsWith("$") ? boom : new Proxy({}, { get: () => boom }),
      },
    );
    // A 404 rather than a rejection: fetchWithRetry throws on a 4xx
    // immediately, where a network error costs it 1.5 s of backoff first.
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const tools = buildTools("u1", {
      prisma,
      fetchFn,
      embedQuery: boom,
      cache: missingCache(),
      apiKey: "k",
    });

    const inputs = {
      get_user_watchlist: {},
      get_taste_profile: {},
      mark_watched: { tmdbId: 27205, title: "Inception" },
      search_movies: { query: "dune" },
      get_movie_details: { movieId: "603" },
      get_showtimes: { tmdbId: 27205 },
      recommend_movies: { recommendations: [] },
      find_similar_movies: { description: "slow and dreamlike" },
    };

    for (const [name, definition] of Object.entries(tools)) {
      expect(inputs, `${name} has no input in this test`).toHaveProperty(name);
      const thrown = await definition
        .execute(inputs[name], {})
        .then(() => null, (err) => err);
      expect(thrown?.name, name).toBe("ToolFailure");
    }
  });

  it("replaces a Prisma dump with a sentence written for the model", async () => {
    const err = new Error(
      'Invalid `prisma.watchlistItem.findMany()` invocation\n  SELECT "public"."WatchlistItem" ...',
    );
    err.name = "PrismaClientKnownRequestError";
    const tools = buildTools("u1", { prisma: throwingPrisma(err) });

    await expect(tools.get_user_watchlist.execute({}, {})).rejects.toMatchObject({
      name: "ToolFailure",
      kind: "database",
    });
    await expect(tools.get_user_watchlist.execute({}, {})).rejects.toThrow(
      /do not call it again/i,
    );
  });

  it("does not convert anything when the run is being cancelled", async () => {
    // Stop aborts the run and abandons every in-flight call. A ToolFailure here
    // would record a failure that never happened.
    const err = new Error("TMDB 500");
    const tools = buildTools("u1", { prisma: throwingPrisma(err) });

    await expect(
      tools.get_user_watchlist.execute({}, { abortSignal: { aborted: true } }),
    ).rejects.toBe(err);
  });

  it("passes a successful result through untouched", async () => {
    const rows = [{ id: "w1" }];
    const prisma = { watchlistItem: { findMany: vi.fn().mockResolvedValue(rows) } };

    await expect(buildTools("u1", { prisma }).get_user_watchlist.execute({}, {})).resolves.toBe(
      rows,
    );
  });

  it("keeps recommend_movies' array contract, which the controller spreads", async () => {
    // Why failures are re-thrown rather than returned as { error }. The
    // controller does assistantMovies.push(...output); handing it an object
    // spreads a non-iterable, throws a TypeError into the outer catch, and
    // kills a turn that was otherwise fine.
    const err = new Error("TMDB 503");
    const tools = buildTools("u1", {
      prisma: { movie: { findMany: vi.fn().mockRejectedValue(err) } },
    });

    const result = await tools.recommend_movies
      .execute({ recommendations: [{ tmdbId: 603, reason: "Cerebral." }] }, {})
      .catch((e) => e);

    expect(result).toBeInstanceOf(Error);
    expect(result.kind).toBe("upstream");
  });
});

describe("buildTools — what the provider accepts", () => {
  // Groq validates the model's arguments against these schemas on its own
  // servers, before execute runs. A mismatch there does not become a
  // tool-error the model can recover from — it rejects the whole generation
  // and ends the turn, out of reach of the containment above.

  it("lets every optional argument be null, not just absent", () => {
    // The bug this pins: `rating: z.number().optional()` meant "may be absent,
    // but if present must be a number", and gpt-oss fills a blank with
    // `rating: null`. Asking to mark two films watched with no rating killed
    // the turn with "expected number, but got null".
    //
    // Checked on the JSON schema actually sent to the provider, and swept over
    // every tool, so a tool added later with a plain .optional() fails here
    // without anyone having to remember this happened.
    for (const [name, definition] of Object.entries(buildTools("u1"))) {
      const { properties = {}, required = [] } = zodSchema(definition.inputSchema).jsonSchema;
      for (const [field, schema] of Object.entries(properties)) {
        if (required.includes(field)) continue;
        const allowsNull = (schema.anyOf ?? [schema]).some(
          (option) => option.type === "null" || [].concat(option.type).includes("null"),
        );
        expect(allowsNull, `${name}.${field}`).toBe(true);
      }
    }
  });

  it("treats a null status as no filter, not as a filter on null", async () => {
    const prisma = { watchlistItem: { findMany: vi.fn().mockResolvedValue([]) } };
    await buildTools("u1", { prisma }).get_user_watchlist.execute({ status: null }, {});

    expect(prisma.watchlistItem.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("treats a null theatre filter as false", async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await buildTools("u1", {
      prisma,
      embedQuery: vi.fn().mockResolvedValue([0.1]),
    }).find_similar_movies.execute({ description: "x", onlyInTheatres: null }, {});

    // Bound values of the tagged template: the vector twice, then the flag.
    expect(prisma.$queryRaw.mock.calls[0].slice(1)).toContain(false);
  });
});
