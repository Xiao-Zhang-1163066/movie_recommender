import { describe, it, expect, vi } from "vitest";

// chatController pulls in Prisma, Redis and the Groq client at import time.
// buildSystemPrompt itself is pure, so the stubs just keep the import cheap and
// free of connection prerequisites.
vi.mock("../config/db.js", () => ({ prisma: {}, connectDB: vi.fn(), disconnectDB: vi.fn() }));
vi.mock("../config/redis.js", () => ({
  cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

const { buildSystemPrompt } = await import("../controller/chatController.js");

const showing = [{ tmdbId: 1233413, title: "Sinners", genres: ["Horror"], voteAverage: 7.5 }];

describe("buildSystemPrompt with a populated listing", () => {
  it("includes the films and requires one pick to come from them", () => {
    const prompt = buildSystemPrompt(showing, null);

    expect(prompt).toContain("Sinners");
    expect(prompt).toContain("MUST come from the now-showing list");
  });
});

describe("buildSystemPrompt with an empty listing", () => {
  // The scraper may not have run, or every session on file may have passed.
  // Printing "[]" and then ordering the model to pick from it is an instruction
  // it cannot satisfy, which is what sent it into a search loop.
  it("never tells the model to pick from a list that does not exist", () => {
    const prompt = buildSystemPrompt([], null);

    expect(prompt).not.toContain("MUST come from the now-showing list");
    expect(prompt).not.toContain("[]");
  });

  it("says the listings are unavailable and tells it not to hunt for them", () => {
    const prompt = buildSystemPrompt([], null);

    expect(prompt).toContain("Cinema listings are unavailable");
    expect(prompt).toContain("Do not search for showtimes");
  });

  it("still asks for recommend_movies, so cards survive a missing listing", () => {
    expect(buildSystemPrompt([], null)).toContain("MUST call recommend_movies");
  });
});

describe("buildSystemPrompt with a rolling summary", () => {
  it("carries the summary as background rather than as something anyone said", () => {
    const prompt = buildSystemPrompt(showing, "User dislikes horror.");

    expect(prompt).toContain("Earlier in this conversation (summarised)");
    expect(prompt).toContain("User dislikes horror.");
  });

  it("omits the section entirely when there is no summary yet", () => {
    expect(buildSystemPrompt(showing, null)).not.toContain("Earlier in this conversation");
  });
});

describe("buildSystemPrompt for the no-tools retry", () => {
  // Told it MUST call recommend_movies while having no tools, the model writes
  // the call out as JSON in the middle of its prose and the user reads that.
  it("drops every instruction to call a tool", () => {
    const prompt = buildSystemPrompt(showing, null, { withTools: false });

    expect(prompt).not.toContain("MUST call recommend_movies");
    expect(prompt).not.toContain("search_movies");
    expect(prompt).toContain("never write a function or tool call");
  });

  it("still gives it the films to talk about", () => {
    expect(buildSystemPrompt(showing, null, { withTools: false })).toContain("Sinners");
  });
});

describe("buildSystemPrompt — choosing between the two search tools", () => {
  // Self-contained fixture: this block asserts the search guidance only, so it
  // should not break if the shared now-showing fixture above is reshaped.
  const films = [
    { tmdbId: 1, title: "Sinners", genres: ["Horror"], voteAverage: 7.1 },
  ];

  it("tells the model which tool matches which kind of request", () => {
    const prompt = buildSystemPrompt(films, null, { withSimilarSearch: true });

    expect(prompt).toContain("find_similar_movies");
    expect(prompt).toContain("names a film");
    // The measured part: plot-shaped queries retrieve, category words do not.
    expect(prompt).toContain("plot-style description");
  });

  it("warns against overselling a weak match", () => {
    // The tool deliberately returns results even when nothing fits well, so the
    // honesty has to live here rather than in a WHERE clause.
    const prompt = buildSystemPrompt(films, null, { withSimilarSearch: true });
    expect(prompt).toContain("similarity score");
  });

  it("never mentions the tool when it is not registered", () => {
    // Naming a tool the model does not have is the same unsatisfiable
    // instruction that sent it hunting for an empty now-showing list.
    const prompt = buildSystemPrompt(films, null, { withSimilarSearch: false });
    expect(prompt).not.toContain("find_similar_movies");
  });

  it("stays out of the no-tools retry prompt", () => {
    const prompt = buildSystemPrompt(films, null, {
      withTools: false,
      withSimilarSearch: true,
    });
    expect(prompt).not.toContain("find_similar_movies");
  });
});
