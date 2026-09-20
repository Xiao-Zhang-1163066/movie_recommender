import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { streamText, stepCountIs } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { buildSystemPrompt } from "../../controller/chatController.js";
import { buildTools } from "../../services/agentTools.js";
import { NOW_SHOWING, NOW_SHOWING_IDS } from "./fixtures/nowShowing.js";
import { QUERIES } from "./fixtures/queries.js";

/**
 * Behavioural evals for the agent.
 *
 * These assert on what the model *did* — which tools it called, which ids it
 * passed — never on the prose it produced. Wording is non-deterministic, so a
 * string match on the reply produces false failures and false passes at once,
 * and grading quality properly would need an LLM judge that is itself
 * stochastic and paid for.
 *
 * Real Groq and real TMDB; only Postgres is faked. That is deliberate:
 * recommend_movies enriches every id from TMDB, so an invented id fails at the
 * fetch and the "no hallucinated films" assertion falls out of the tool's own
 * behaviour rather than needing a separate verification pass.
 *
 * Never runs in CI — it costs quota. `npm run test:evals`.
 */

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
// Must match controller/chatController.js. Evaluating a different model than
// production ships would make the pass rate describe nothing.
const CHAT_MODEL = "openai/gpt-oss-120b";
const MAX_STEPS = 8;
const TEST_USER_ID = "eval-user";

/**
 * Postgres stand-in. Permissive on purpose: the evals exercise the model's
 * choices, not the database, so every delegate returns something harmless.
 * movie.findMany is the one that matters — recommend_movies uses it to decide
 * the inTheatre flag, so it answers from the fixture to stay consistent with
 * the listing in the system prompt.
 */
function makeFakePrisma() {
  return {
    movie: {
      findMany: async ({ where } = {}) => {
        const wanted = where?.tmdbId?.in;
        if (!wanted) return [];
        return NOW_SHOWING.filter((m) => wanted.includes(m.tmdbId)).map((m) => ({
          tmdbId: m.tmdbId,
        }));
      },
      findUnique: async () => null,
      create: async (args) => ({ id: "movie-1", ...args?.data }),
      upsert: async (args) => ({ id: "movie-1", ...args?.create }),
    },
    watchlistItem: {
      findMany: async () => [],
      findUnique: async () => null,
      create: async (args) => ({ id: "wl-1", ...args?.data }),
      update: async (args) => ({ id: "wl-1", ...args?.data }),
      upsert: async (args) => ({ id: "wl-1", ...args?.create }),
    },
    // find_similar_movies runs raw SQL, so the fake has to answer $queryRaw as
    // well as the model-level methods — without this the tool throws the moment
    // the model reaches for it, and the eval would read as a model failure.
    // Returning ids from the frozen listing keeps the downstream
    // recommend_movies path honest: an invented id 404s at TMDB and looks
    // exactly like a hallucination the model never actually made.
    $queryRaw: async () =>
      NOW_SHOWING.slice(0, 5).map((m, i) => ({
        tmdbId: m.tmdbId,
        title: m.title,
        releaseYear: 2026,
        genres: m.genres,
        similarity: Number((0.72 - i * 0.02).toFixed(3)),
        inTheatre: true,
      })),
    session: { findMany: async () => [] },
    cinema: { findMany: async () => [] },
    user: { findUnique: async () => ({ id: TEST_USER_ID, name: "Eval" }) },
  };
}

// --- helpers over the SDK's step list ---------------------------------------

const toolNames = (steps) =>
  steps.flatMap((s) => (s.toolCalls ?? []).map((c) => c.toolName));

// The enriched cards recommend_movies returned, flattened across steps.
const recommendedCards = (steps) =>
  steps
    .flatMap((s) => s.toolResults ?? [])
    .filter((r) => r.toolName === "recommend_movies")
    .flatMap((r) => r.output ?? []);

// Did the turn produce any words at all?
//
// The plan asked for text *before* the first tool call, but a debug dump
// disproved the premise: this model emits reasoning → tool-call every working
// step and only produces text in the last one. That assertion would fail on
// every query regardless of behaviour — an always-red check nobody would read.
// A silent turn is the defect users actually hit (b55c109), so test that.
function producedText(steps) {
  return steps.some((s) => s.text?.trim());
}

async function runQuery(query) {
  const result = streamText({
    model: groq(CHAT_MODEL),
    // Same prompt builder production uses, fed the frozen listing.
    system: buildSystemPrompt(NOW_SHOWING, null),
    messages: [{ role: "user", content: query.text }],
    // Real TMDB (fetchFn/cache/apiKey left at their defaults), fake database.
    tools: buildTools(TEST_USER_ID, { prisma: makeFakePrisma() }),
    stopWhen: stepCountIs(MAX_STEPS),
  });

  // Draining the stream is what drives the loop to completion.
  for await (const _ of result.textStream) void _;
  const steps = await result.steps;

  // EVAL_DEBUG=1 dumps the raw step shape. Worth keeping: a failed check is
  // ambiguous until you know whether the model misbehaved or the accessor read
  // the wrong field, and calibrating a threshold against broken accessors would
  // bake the bug into the baseline.
  if (process.env.EVAL_DEBUG) {
    console.log(
      `=== DEBUG ${query.id} ===`,
      JSON.stringify(
        steps.map((s) => ({
          finishReason: s.finishReason,
          contentTypes: (s.content ?? []).map((p) => p.type),
          toolCalls: (s.toolCalls ?? []).map((c) => c.toolName),
          toolResults: (s.toolResults ?? []).map((r) => ({
            name: r.toolName,
            output: Array.isArray(r.output)
              ? `array[${r.output.length}]`
              : typeof r.output,
          })),
          text: (s.text ?? "").slice(0, 120),
        })),
        null,
        2,
      ),
    );
  }

  const names = toolNames(steps);
  const cards = recommendedCards(steps);
  const called = names.includes("recommend_movies");

  const checks = {};

  // 1. Called (or correctly withheld) recommend_movies.
  if (query.shouldRecommend === true) checks.recommends = called;
  else if (query.shouldRecommend === false) checks.withholds = !called;

  // 2. No invented ids. A fabricated id 404s at TMDB, so a card with no title
  //    is the signature of a hallucination.
  if (cards.length) {
    checks.realIds = cards.every((c) => Boolean(c?.title) && Boolean(c?.tmdbId));
  }

  // 3. At least one pick is actually showing — only meaningful when the user
  //    asked for something to watch.
  if (query.shouldRecommend === true && cards.length) {
    checks.oneShowing = cards.some((c) => NOW_SHOWING_IDS.has(c.tmdbId));
  }

  // 4. Reached for the right search tool. The two overlap by design — one
  //    searches TMDB by title, the other our own catalogue by meaning — so what
  //    this catches is the model keyword-searching a mood, or semantic-searching
  //    a title it was handed verbatim.
  if (query.expectTool) checks.usedExpectedTool = names.includes(query.expectTool);
  if (query.avoidTool) checks.avoidedTool = !names.includes(query.avoidTool);

  // 5. The user was not left staring at silence.
  checks.producedText = producedText(steps);

  return { id: query.id, tools: names, cardCount: cards.length, checks };
}

// A stochastic system cannot be held to 20/20: at 95% per-query reliability an
// all-must-pass gate is red ~64% of the time, and a suite that is always red is
// a suite nobody reads. The gate is a rate instead.
//
// Calibrated against a measured baseline of 86.4% (51/59 checks, 2026-09-20).
// Set below it, not at it: the same query genuinely flips between runs — mood-cosy
// failed a smoke run and passed the full one — so a gate at the observed rate
// would go red on noise. 0.75 still trips if a prompt change costs ~7 checks.
// Re-measure and move this whenever the prompt or the tool descriptions change.
const PASS_RATE_GATE = 0.75;

// Milliseconds to wait between queries. Modest on purpose: spacing helps with
// the per-minute bucket, but it is NOT what limits this suite.
//
// The binding constraint is Groq's free-tier **tokens per day** — 200,000 for
// openai/gpt-oss-120b. The response headers only ever describe the per-minute
// bucket, so a TPD rejection arrives as a 429 alongside
// `x-ratelimit-remaining-tokens: 8000` — a full bucket next to a refusal. Read
// error.responseBody, not the headers; only the body names the limit that was
// actually hit.
//
// One eval turn re-sends the system prompt and all eight tool schemas on every
// step, so a full 23-query run costs on the order of a hundred thousand tokens.
// That is one, maybe two full runs per day on the free tier. Use EVAL_ONLY to
// check specific cases and save the full run for recording a baseline.
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 10_000);

describe("agent behaviour evals", () => {
  it(
    `passes at least ${PASS_RATE_GATE * 100}% of behavioural checks`,
    async () => {
      const results = [];
      // EVAL_LIMIT=1 runs a single query. Twenty live turns is an expensive way
      // to discover a typo, so smoke the wiring first, then run the full set.
      const limit = Number(process.env.EVAL_LIMIT) || QUERIES.length;
      // EVAL_ONLY=semantic-mood,keyword-named-film runs exactly those cases.
      // EVAL_LIMIT takes a prefix, which is the wrong instrument when the cases
      // you need to check were appended near the end: re-running twenty live
      // turns to reach three of them is how the quota got exhausted in the first
      // place.
      const only = process.env.EVAL_ONLY?.split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const selected = only?.length
        ? QUERIES.filter((q) => only.includes(q.id))
        : QUERIES.slice(0, limit);
      // Sequential: twenty concurrent runs would risk Groq rate limits, and a
      // 429 would look like a behavioural failure rather than a quota one.
      for (const query of selected) {
        // Spacing, not politeness. A full run on 2026-09-20 exhausted the quota
        // after twelve queries and the remaining eleven all died with a 429
        // carrying retry-after: 248s — including every Sprint 3 case, so the run
        // proved nothing about the thing it was written to test. Pausing between
        // turns is the cheapest way to stop a quota failure being recorded as
        // model behaviour.
        if (results.length) await new Promise((r) => setTimeout(r, DELAY_MS));
        try {
          results.push(await runQuery(query));
        } catch (error) {
          // checks:{} was the original shape, and it made an outage look like an
          // improvement: the denominator below is built from the checks that
          // exist, so a query that never ran simply left the sample. The run
          // that found this scored 75% and went green with eleven queries dead.
          // A failure must push the rate down, never up.
          results.push({
            id: query.id,
            error: String(error).slice(0, 120),
            checks: { ran: false },
          });
        }
      }

      const flat = results.flatMap((r) =>
        Object.entries(r.checks).map(([name, ok]) => ({ id: r.id, name, ok })),
      );
      const passed = flat.filter((c) => c.ok).length;
      const rate = flat.length ? passed / flat.length : 0;

      // Printed every run, not only on failure: the per-query table is the
      // diagnostic, and the rate is the number to record as the new baseline.
      console.log("\n=== eval results ===");
      for (const r of results) {
        const marks = Object.entries(r.checks)
          .map(([n, ok]) => `${ok ? "✓" : "✗"}${n}`)
          .join(" ");
        console.log(
          `  ${r.id.padEnd(24)} ${marks || "(no checks)"}${r.error ? `  ERROR ${r.error}` : ""}` +
            `\n${"".padEnd(26)}tools: [${(r.tools ?? []).join(", ")}] cards: ${r.cardCount ?? 0}`,
        );
      }
      const errored = results.filter((r) => r.error).length;
      console.log(
        `\n  checks passed: ${passed}/${flat.length}  =  ${(rate * 100).toFixed(1)}%` +
          `\n  queries that never reached the model: ${errored}/${results.length}` +
          (errored
            ? "\n  NOT A VALID BASELINE — part of the suite never ran, so this rate describes" +
              "\n  a partial sample. Fix the cause and re-run before recording it.\n"
            : "\n") +
          // A subset is for diagnosis, not calibration. Recording one as the
          // baseline would move the gate against a different set of questions.
          (selected.length < QUERIES.length
            ? `  PARTIAL SELECTION — ${selected.length}/${QUERIES.length} queries. Diagnostic only, not a baseline.\n`
            : ""),
      );

      // Written unconditionally, because vitest hides a passing test's stdout —
      // the first green run reported nothing and the rate was lost. A suite whose
      // result only survives failure cannot be a baseline. Gitignored.
      writeFileSync(
        new URL("./results.json", import.meta.url),
        JSON.stringify(
          { ranAt: new Date().toISOString(), rate, passed, total: flat.length, errored, results },
          null,
          2,
        ),
      );

      expect(flat.length).toBeGreaterThan(0);
      expect(rate).toBeGreaterThanOrEqual(PASS_RATE_GATE);
    },
    // Twenty sequential live model runs. Measured at ~80s each in a smoke run,
    // so ~26 minutes; the cap is set well clear of that rather than just above.
    45 * 60 * 1000,
  );
});
