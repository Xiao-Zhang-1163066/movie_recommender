import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

/**
 * Integration tests over the real express routes.
 *
 * These drive the app the way a client does — real routing, real middleware
 * chain, real validators, real controllers — with only the two I/O boundaries
 * replaced. vi.mock is hoisted above the imports below, so config/db.js and
 * config/redis.js never evaluate: no Prisma client is constructed and no Redis
 * connection is opened. That is what lets this suite run in CI with no secrets.
 *
 * The cases chosen here are the ones that fail quietly rather than loudly — a
 * missing record answered with an empty body, a leaked password hash, an
 * unhandled error reported as success. A crash gets noticed on its own; these
 * do not.
 */

const prismaMock = {
  movie: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: { findUnique: vi.fn(), create: vi.fn() },
  watchlistItem: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  session: { findMany: vi.fn() },
  cinema: { findMany: vi.fn(), findUnique: vi.fn() },
  agentRun: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  // Called as a tagged template, so the mock receives (strings, ...values).
  $queryRaw: vi.fn(),
};

vi.mock("../config/db.js", () => ({
  prisma: prismaMock,
  connectDB: vi.fn(),
  disconnectDB: vi.fn(),
}));

// Always a cache miss, so every test exercises the controller rather than a
// stale value left behind by the test before it.
vi.mock("../config/redis.js", () => ({
  cache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  },
}));

const app = (await import("../app.js")).default;
const { generateToken } = await import("../utils/generateToken.js");

const USER = { id: "user-1", name: "Sean", email: "sean@example.com" };
const OTHER_USER = { id: "user-2", name: "Someone Else", email: "other@example.com" };

// A real signed token — protect() verifies the signature, so a hand-written
// string would test the rejection path instead of the happy path.
const tokenFor = (user) => `Bearer ${generateToken(user.id)}`;

beforeEach(() => {
  vi.clearAllMocks();
  // protect() loads the user behind the token on every authenticated request.
  prismaMock.user.findUnique.mockImplementation(async ({ where }) => {
    if (where.id === USER.id) return { ...USER, password: "$2b$10$hashed" };
    if (where.id === OTHER_USER.id)
      return { ...OTHER_USER, password: "$2b$10$hashed" };
    return null;
  });
});

describe("GET /api/movies", () => {
  it("returns 200 with the movie list and a count", async () => {
    prismaMock.movie.findMany.mockResolvedValue([
      { id: "m1", title: "Dune", releaseYear: 2021 },
    ]);

    const res = await request(app).get("/api/movies");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.movies)).toBe(true);
    expect(res.body.data.movieNumber).toBe(1);
  });
});

describe("GET /api/movies/:id", () => {
  it("returns 404 for an id that does not exist, not 200 with an empty body", async () => {
    prismaMock.movie.findUnique.mockResolvedValue(null);

    const res = await request(app).get("/api/movies/does-not-exist");

    expect(res.status).toBe(404);
    // The failure this guards against is a 200 carrying `{ movie: null }`,
    // which a client renders as a blank page instead of a not-found state.
    expect(res.body.data?.movie).toBeUndefined();
  });
});

describe("GET /api/cinemas/:slug", () => {
  it("asks only for upcoming sessions, since past ones are never deleted", async () => {
    prismaMock.cinema.findUnique.mockResolvedValue({ slug: "lumiere", sessions: [] });
    const before = Date.now();

    const res = await request(app).get("/api/cinemas/lumiere");

    expect(res.status).toBe(200);
    const { where } = prismaMock.cinema.findUnique.mock.calls[0][0].include.sessions;
    expect(where.startsAt.gt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("GET /api/sessions", () => {
  it("defaults to upcoming sessions when no date is given", async () => {
    prismaMock.session.findMany.mockResolvedValue([]);
    const before = Date.now();

    await request(app).get("/api/sessions");

    const { where } = prismaMock.session.findMany.mock.calls[0][0];
    expect(where.startsAt.gt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("still honours an explicit date, even a past one", async () => {
    prismaMock.session.findMany.mockResolvedValue([]);

    await request(app).get("/api/sessions?date=2020-01-01");

    const { where } = prismaMock.session.findMany.mock.calls[0][0];
    expect(where.startsAt.gte).toEqual(new Date("2019-12-31T11:00:00Z"));
    expect(where.startsAt.gt).toBeUndefined();
  });
});

describe("POST /api/auth/register", () => {
  it("returns 400 with a message when a required field is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Sean", email: "sean@example.com" }); // no password

    expect(res.status).toBe(400);
    expect(res.body.message).toBeTruthy();
    // Validation must stop the request before it reaches the database.
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login", () => {
  it("returns 401 on a wrong password and never echoes the password hash", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...USER,
      // A real bcrypt hash of some other password.
      password: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: USER.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    // Assert on the whole serialised body: a hash can leak through any key, so
    // checking one field by name would miss the next refactor that adds another.
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });
});

describe("GET /api/watchlist", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/watchlist");

    expect(res.status).toBe(401);
    expect(prismaMock.watchlistItem.findMany).not.toHaveBeenCalled();
  });

  it("returns only the requesting user's items", async () => {
    prismaMock.watchlistItem.findMany.mockResolvedValue([]);

    await request(app)
      .get("/api/watchlist")
      .set("Authorization", tokenFor(USER));

    expect(prismaMock.watchlistItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER.id } }),
    );
  });
});

describe("PUT /api/watchlist/:id", () => {
  it("returns 403 when the entry belongs to another user", async () => {
    // The row exists, but it is USER's. OTHER_USER holds a perfectly valid
    // token — authentication passes and authorisation is what must stop this.
    prismaMock.watchlistItem.findUnique.mockResolvedValue({
      id: "w1",
      userId: USER.id,
      movieId: "m1",
    });

    const res = await request(app)
      .put("/api/watchlist/w1")
      .set("Authorization", tokenFor(OTHER_USER))
      .send({ status: "COMPLETED", rating: 10 });

    expect(res.status).toBe(403);
    expect(prismaMock.watchlistItem.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/watchlist", () => {
  it("rejects a duplicate entry with 400 rather than reporting success", async () => {
    prismaMock.movie.findUnique.mockResolvedValue({
      id: "m1",
      tmdbId: 550,
      voteAverage: 8.4,
    });
    // P2002 is Prisma's unique-constraint violation — here the
    // @@unique([userId, movieId]) on WatchlistItem.
    prismaMock.watchlistItem.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const res = await request(app)
      .post("/api/watchlist")
      .set("Authorization", tokenFor(USER))
      .send({ tmdbId: 550, title: "Fight Club", releaseYear: 1999 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already in watchlist/i);
  });
});

describe("unhandled controller errors", () => {
  it("returns 500, not 200, when the database throws", async () => {
    prismaMock.movie.findMany.mockRejectedValue(new Error("connection lost"));

    const res = await request(app).get("/api/movies");

    // This is the case the error handler exists for. It returned 200 until
    // errorMiddleware.js was given the res.status(statusCode) it was missing —
    // the body said "error" while the status line said success.
    expect(res.status).toBe(500);
    expect(res.body.status).toBe("error");
  });
});

describe("admin routes", () => {
  const ADMIN = { id: "user-3", name: "Admin", email: "admin@example.com" };

  beforeEach(() => {
    process.env.ADMIN_EMAIL = ADMIN.email;
    // The outer beforeEach only knows USER and OTHER_USER; protect needs to be
    // able to load the admin too.
    prismaMock.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === ADMIN.id) return { ...ADMIN, password: "$2b$10$hashed" };
      if (where.id === USER.id) return { ...USER, password: "$2b$10$hashed" };
      return null;
    });
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/admin/agent-runs");

    expect(res.status).toBe(401);
  });

  it("returns 403 for a logged-in non-admin and never reaches the controller", async () => {
    const res = await request(app)
      .get("/api/admin/agent-runs")
      .set("Authorization", tokenFor(USER));

    expect(res.status).toBe(403);
    // The point of the whole slice: a valid token is not authorisation. If this
    // assertion fails, requireAdmin ran too late to stop the query.
    expect(prismaMock.agentRun.findMany).not.toHaveBeenCalled();
  });

  it("denies everyone when ADMIN_EMAIL is unset rather than letting everyone in", async () => {
    delete process.env.ADMIN_EMAIL;

    const res = await request(app)
      .get("/api/admin/agent-runs")
      .set("Authorization", tokenFor(ADMIN));

    // Fail closed. Without the explicit guard in requireAdmin this would be a
    // 200, because undefined === undefined.
    expect(res.status).toBe(403);
  });

  it("returns 200 with rows and pagination for the admin", async () => {
    prismaMock.agentRun.findMany.mockResolvedValue([
      { id: "run-1", model: "openai/gpt-oss-120b", latencyMs: 1200 },
    ]);
    prismaMock.agentRun.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/api/admin/agent-runs")
      .set("Authorization", tokenFor(ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.runs).toHaveLength(1);
    expect(res.body.data.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it("clamps a junk page and an oversized limit instead of passing them to Prisma", async () => {
    prismaMock.agentRun.findMany.mockResolvedValue([]);
    prismaMock.agentRun.count.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/admin/agent-runs?page=abc&limit=999999")
      .set("Authorization", tokenFor(ADMIN));

    expect(res.status).toBe(200);
    // NaN must never reach skip/take, and limit is capped at MAX_LIMIT.
    expect(prismaMock.agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 100 }),
    );
  });

  it("computes rates and returns percentiles in the summary", async () => {
    prismaMock.agentRun.aggregate.mockResolvedValue({
      _avg: { inputTokens: 1000, outputTokens: 200, latencyMs: 1500 },
      _count: 10,
    });
    // Promise.all evaluates in array order: errored count, then retried count.
    prismaMock.agentRun.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ p50: 1000, p95: 5000, max: 22000 }])
      .mockResolvedValueOnce([
        { tool: "search_movies", count: 7, failures: 1 },
      ]);

    const res = await request(app)
      .get("/api/admin/agent-runs/summary")
      .set("Authorization", tokenFor(ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.errorRate).toBeCloseTo(0.2);
    expect(res.body.data.retryRate).toBeCloseTo(0.1);
    expect(res.body.data.latencyMs.p95).toBe(5000);
    // A failure count per tool alongside the call count, so "search_movies
    // failed 9 times" can be read as a rate rather than as a bare number.
    expect(res.body.data.toolUsage).toEqual([
      { tool: "search_movies", count: 7, failures: 1 },
    ]);

    // $queryRaw is mocked, so the SQL above is never executed here and only a
    // real database proves it runs. What this does pin is that the query still
    // reads both arrays — deleting the toolErrors half would leave every
    // `failures` at zero and look exactly like a healthy system.
    const toolQuery = prismaMock.$queryRaw.mock.calls[1][0].join(" ");
    expect(toolQuery).toContain("toolCalls");
    expect(toolQuery).toContain("toolErrors");
  });

  it("reports zero rates instead of null when there are no runs", async () => {
    prismaMock.agentRun.aggregate.mockResolvedValue({
      _avg: { inputTokens: null, outputTokens: null, latencyMs: null },
      _count: 0,
    });
    prismaMock.agentRun.count.mockResolvedValue(0);
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ p50: null, p95: null, max: null }])
      .mockResolvedValueOnce([]);

    const res = await request(app)
      .get("/api/admin/agent-runs/summary")
      .set("Authorization", tokenFor(ADMIN));

    expect(res.status).toBe(200);
    // 0/0 is NaN, and JSON.stringify(NaN) is null — a blank dashboard instead
    // of an obvious zero.
    expect(res.body.data.errorRate).toBe(0);
    expect(res.body.data.retryRate).toBe(0);
  });
});

describe("POST /api/chat/confirm", () => {
  // The write half of mark_watched. The tool itself cannot write at all; this
  // is the only path to the database, and it is reachable only by a signed-in
  // user making their own request. These tests are about that boundary, not
  // about the upsert, which chatTools.test.js covers.

  const body = { tmdbId: 27205, rating: 9, notes: "Loved it" };

  const post = (payload = body, auth = tokenFor(USER)) =>
    request(app).post("/api/chat/confirm").set("Authorization", auth).send(payload);

  it("rejects an unauthenticated request", async () => {
    // If this ever passes without a token, the confirmation step is theatre:
    // anything that can reach the route could write.
    const res = await request(app).post("/api/chat/confirm").send(body);

    expect(res.status).toBe(401);
    expect(prismaMock.watchlistItem.upsert).not.toHaveBeenCalled();
  });

  it("writes against the token's user, not anything in the body", async () => {
    // The body has no userId field, and this is what keeps it that way: a
    // future "convenience" parameter would turn this route into a way to write
    // to someone else's watchlist.
    prismaMock.movie.findUnique.mockResolvedValue({ id: "m1", title: "Inception" });
    prismaMock.watchlistItem.upsert.mockResolvedValue({});

    const res = await post({ ...body, userId: OTHER_USER.id });

    expect(res.status).toBe(200);
    expect(prismaMock.watchlistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_movieId: { userId: USER.id, movieId: "m1" } },
      }),
    );
  });

  it("stores COMPLETED and echoes the resolved title", async () => {
    prismaMock.movie.findUnique.mockResolvedValue({ id: "m1", title: "Inception" });
    prismaMock.watchlistItem.upsert.mockResolvedValue({});

    const res = await post();

    expect(res.status).toBe(200);
    expect(prismaMock.watchlistItem.upsert.mock.calls[0][0].update).toEqual({
      status: "COMPLETED",
      rating: 9,
      notes: "Loved it",
    });
    // The title comes back so the UI names the film it recorded rather than
    // just saying "saved" — the user's last chance to spot the wrong one.
    expect(res.body.message).toContain("Inception");
  });

  it("ignores a title in the body, resolving it from TMDB instead", async () => {
    // The schema has no title field, so one sent anyway is dropped rather than
    // stored. A stored client-supplied title is how a confirmation card ends up
    // describing a different film from the one it writes.
    prismaMock.movie.findUnique.mockResolvedValue(null);
    prismaMock.movie.upsert.mockResolvedValue({ id: "m1", title: "Inception" });
    prismaMock.watchlistItem.upsert.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 27205,
          title: "Inception",
          release_date: "2010-07-15",
          genres: [],
        }),
      }),
    );

    const res = await post({ ...body, title: "Totally Different Film" });

    expect(res.status).toBe(200);
    expect(prismaMock.movie.upsert.mock.calls[0][0].create.title).toBe("Inception");
    vi.unstubAllGlobals();
  });

  it("rejects a malformed tmdbId before any database call", async () => {
    for (const tmdbId of ["27205", -1, 27205.5, undefined]) {
      const res = await post({ tmdbId });
      expect(res.status, String(tmdbId)).toBe(400);
    }
    expect(prismaMock.watchlistItem.upsert).not.toHaveBeenCalled();
  });

  it("bounds the rating the same way the tool does", async () => {
    expect((await post({ tmdbId: 27205, rating: 0 })).status).toBe(400);
    expect((await post({ tmdbId: 27205, rating: 11 })).status).toBe(400);
  });

  it("answers 422, not 400, when TMDB has no release date for the film", async () => {
    // The request was well-formed and the id was real; Movie.releaseYear is
    // required and there is nothing to put in it. 400 would tell the client it
    // sent something malformed, and it did not.
    prismaMock.movie.findUnique.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 27205, title: "Unreleased", release_date: "", genres: [] }),
      }),
    );

    const res = await post({ tmdbId: 27205 });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/release date/i);
    expect(prismaMock.watchlistItem.upsert).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
