import { describe, it, expect } from "vitest";

import {
  ToolFailure,
  classifyToolError,
  toToolFailure,
} from "../services/toolErrors.js";

// What the model is told when a tool fails. The point of these tests is not
// that the strings are pretty — it is that nothing internal ever reaches the
// context window, and that a cancelled run is never recorded as a broken one.

function prismaKnownError() {
  // Shape, not substance: the real class carries a `code` and a message that
  // runs to a dozen lines with the generated SQL and a caret diagram.
  const err = new Error(
    'Invalid `prisma.watchlistItem.upsert()` invocation in\n' +
      '/app/controller/chatTools.js:94:38\n\n' +
      '  SELECT "public"."WatchlistItem"."id" FROM "public"."WatchlistItem" WHERE ...\n' +
      "                                         ^\n" +
      "Can't reach database server at `ep-cool-forest-123.ap-southeast-2.aws.neon.tech:5432`",
  );
  err.name = "PrismaClientKnownRequestError";
  err.code = "P1001";
  return err;
}

describe("classifyToolError", () => {
  it("reads Prisma failures off the class name", () => {
    expect(classifyToolError(prismaKnownError(), "get_user_watchlist")).toBe("database");
  });

  it("reads Prisma failures off a P-code when the name is missing", () => {
    // $queryRaw in find_similar_movies can surface either shape.
    const err = Object.assign(new Error("db gone"), { code: "P2010" });
    expect(classifyToolError(err, "find_similar_movies")).toBe("database");
  });

  it("treats fetchWithRetry's exhausted timeout as a timeout", () => {
    const err = Object.assign(new Error("This operation was aborted"), {
      name: "AbortError",
    });
    expect(classifyToolError(err, "search_movies")).toBe("timeout");
  });

  it("treats a TMDB status and a dead socket as the same upstream failure", () => {
    expect(classifyToolError(new Error("TMDB 503"), "search_movies")).toBe("upstream");
    expect(classifyToolError(new TypeError("fetch failed"), "get_movie_details")).toBe(
      "upstream",
    );
  });

  it("blames the embedding call only once the database is ruled out", () => {
    // find_similar_movies does exactly two things that can fail: the Postgres
    // query and the Gemini call. The database branch runs first, so an
    // unrecognised error from this tool can only be the embedding — which is
    // steadier than matching strings in a provider's error text.
    const err = new Error("GEMINI_API_KEY is not set — embeddings are unavailable");
    expect(classifyToolError(err, "find_similar_movies")).toBe("embedding");
  });

  it("does not blame the embedding call for an unrecognised error elsewhere", () => {
    expect(classifyToolError(new Error("who knows"), "search_movies")).toBe("unknown");
  });
});

describe("ToolFailure — the message the model reads", () => {
  const kinds = ["timeout", "upstream", "database", "embedding", "unknown"];

  it("gives every kind a message", () => {
    for (const kind of kinds) {
      expect(new ToolFailure(kind).message.length, kind).toBeGreaterThan(20);
    }
  });

  it("falls back to the unknown message for a kind nobody defined", () => {
    expect(new ToolFailure("nonsense").message).toBe(new ToolFailure("unknown").message);
  });

  it("leaks nothing internal, whatever was thrown", () => {
    // The real regression this guards: the SDK passes err.message to the model
    // verbatim, so a Prisma dump used to ride into the context window carrying
    // our SQL, our file paths and our database hostname.
    const message = toToolFailure(prismaKnownError(), "get_user_watchlist").message;
    for (const leak of [
      "SELECT",
      "WatchlistItem",
      "prisma",
      "neon.tech",
      "chatTools.js",
      "P1001",
    ]) {
      expect(message, leak).not.toContain(leak);
    }
  });

  it("tells the model not to retry, because the step budget is the scarce thing", () => {
    // Sprint 3's finding: a turn that spends its eight steps re-calling a
    // broken tool never reaches recommend_movies at all.
    for (const kind of kinds) {
      expect(new ToolFailure(kind).message, kind).toMatch(/do not call it again/i);
    }
  });

  it("points the embedding failure at the tool that still works", () => {
    expect(new ToolFailure("embedding").message).toContain("search_movies");
  });
});

describe("toToolFailure", () => {
  it("leaves the error alone when the run itself is being cancelled", () => {
    // Pressing Stop aborts the run and abandons every in-flight tool call.
    // Converting that would log a failure that never happened, on a turn
    // nobody is waiting for.
    const err = new Error("TMDB 500");
    const signal = { aborted: true };
    expect(toToolFailure(err, "search_movies", { abortSignal: signal })).toBe(err);
  });

  it("converts when the run is still live", () => {
    const failure = toToolFailure(new Error("TMDB 500"), "search_movies", {
      abortSignal: { aborted: false },
    });
    expect(failure).toBeInstanceOf(ToolFailure);
    expect(failure.kind).toBe("upstream");
  });

  it("survives being called with no options at all", () => {
    expect(toToolFailure(new Error("x"), "search_movies").kind).toBe("unknown");
  });

  it("does not re-wrap, which would lose the original kind", () => {
    const first = new ToolFailure("database");
    expect(toToolFailure(first, "search_movies").kind).toBe("database");
  });
});
