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
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: { findUnique: vi.fn(), create: vi.fn() },
  watchlistItem: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  session: { findMany: vi.fn() },
  cinema: { findMany: vi.fn(), findUnique: vi.fn() },
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
