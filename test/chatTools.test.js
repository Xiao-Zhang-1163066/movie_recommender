import { describe, it, expect, vi, beforeEach } from "vitest";

// We can't import the tools directly because they're defined inside the chat()
// function. So we'll test the *logic* by writing a small helper that mirrors
// what the search_movies tool does. This is a common pattern when functions
// aren't exported — extract the logic, test the logic.

// Step 1: write a function called searchMovies that accepts a query string and
// a fetch function (we'll pass in a fake one during tests).
// It should call fetch with a TMDB search URL and return an array of objects
// with: id, title, release_date, overview.
// (Mirror the logic in chatController.js lines 116-127)

async function searchMovies(query, fetchFn) {
  // your code here
  const fakeApiKey = "FAKE_API_KEY_FOR_TESTING";
  const data = await fetchFn(
    `https://api.themoviedb.org/3/search/movie?api_key=${fakeApiKey}&query=${encodeURIComponent(query)}`,
  ).then((res) => res.json());
  // return only: id, title, release_date, overview from results.results
  return data.results.map((movie) => ({
    id: movie.id,
    title: movie.title,
    release_date: movie.release_date,
    overview: movie.overview,
  }));
}

// Step 2: describe block groups related tests together — think of it as a label
describe("searchMovies tool", () => {
  // Step 3: write a test that:
  //   - creates a fake fetch function (vi.fn()) that returns a fake TMDB response
  //   - calls searchMovies with that fake fetch
  //   - checks that the returned array has the right shape

  it("returns mapped movie objects from TMDB response", async () => {
    // create a fake fetch — vi.fn() makes a mock function
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          results: [
            {
              id: 123,
              title: "Test Movie",
              release_date: "2024-01-01",
              overview: "A great film",
              poster_path: "/abc.jpg", // extra field — your tool should ignore this
            },
          ],
        }),
    });

    // call your function with the fake fetch
    const results = await searchMovies("test query", fakeFetch);

    // check the results — fill in the expected values
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 123,
      title: "Test Movie",
      release_date: "2024-01-01",
      overview: "A great film",
    });
  });
});

// Mirror the get_taste_profile tool logic — accepts a userId and a prisma instance
async function getTasteProfile(userId, prisma) {
  // step 1: query prisma.watchlistItem.findMany for COMPLETED items where rating is not null
  // include: { movie: true }

  // step 2: return an object with:
  //   ratingCount: number of watched movies
  //   avgRating: average rating, or null if none
  //   recentRatings: last 5 items mapped to { title, rating }
  const watchedMovies = await prisma.watchlistItem.findMany({
    where: { userId, status: "COMPLETED", rating: { not: null } },
    include: { movie: true },
  });
  return {
    ratingCount: watchedMovies.length,
    avgRating: watchedMovies.length
      ? watchedMovies.reduce((acc, item) => acc + item.rating, 0) /
        watchedMovies.length
      : null,
    recentRatings: watchedMovies.slice(-5).map((item) => ({
      title: item.movie.title,
      rating: item.rating,
    })),
  };
}

describe("getTasteProfile tool", () => {
  it("calculates average rating correctly", async () => {
    const fakePrisma = {
      watchlistItem: {
        findMany: vi.fn().mockResolvedValue([
          { rating: 8, movie: { title: "Film A" } },
          { rating: 6, movie: { title: "Film B" } },
          { rating: 10, movie: { title: "Film C" } },
        ]),
      },
    };

    const result = await getTasteProfile("user-123", fakePrisma);

    expect(result.ratingCount).toBe(3);
    expect(result.avgRating).toBe(8);
  });

  it("returns null avgRating when no movies watched", async () => {
    const fakePrisma = {
      watchlistItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await getTasteProfile("user-123", fakePrisma);

    expect(result.ratingCount).toBe(0);
    expect(result.avgRating).toBe(null);
  });
});

async function markWatched(userId, movieId, rating, notes, prisma) {
  await prisma.watchlistItem.upsert({
    where: { userId_movieId: { userId, movieId } },
    update: { status: "COMPLETED", rating, notes },
    create: { userId, movieId, status: "COMPLETED", rating, notes },
  });
  return { success: true };
}

describe("markWatched tool", () => {
  it("calls upsert with correct arguments and returns success", async () => {
    const fakePrisma = {
      watchlistItem: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await markWatched(
      "user-123",
      456,
      9,
      "Loved it!",
      fakePrisma,
    );

    // check the return value
    expect(result).toEqual({ success: true });

    // check that upsert was called with the right shape
    expect(fakePrisma.watchlistItem.upsert).toHaveBeenCalledWith({
      where: { userId_movieId: { userId: "user-123", movieId: 456 } },
      update: { status: "COMPLETED", rating: 9, notes: "Loved it!" },
      create: {
        userId: "user-123",
        movieId: 456,
        status: "COMPLETED",
        rating: 9,
        notes: "Loved it!",
      },
    });
  });
});
