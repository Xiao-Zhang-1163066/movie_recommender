import { config } from "dotenv";
config({ quiet: true });
delete process.env.REDIS_URL;
const { streamText, stepCountIs, tool } = await import("ai");
const { createGroq } = await import("@ai-sdk/groq");
const { z } = await import("zod");
const T = await import("./controller/chatTools.js");
const { buildSystemPrompt } = await import("./controller/chatController.js");
const { prisma } = await import("./config/db.js");

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

const tools = {
  search_movies: tool({ description: "Search for movies by title using TMDB",
    inputSchema: z.object({ query: z.string() }), execute: async ({ query }) => T.searchMovies(query) }),
  get_movie_details: tool({ description: "Get full details for a specific movie by its TMDB movie ID",
    inputSchema: z.object({ movieId: z.string() }), execute: async ({ movieId }) => T.getMovieDetails(movieId) }),
  recommend_movies: tool({ description: "Display recommended movies to the user as visual cards.",
    inputSchema: z.object({ recommendations: z.array(z.object({ tmdbId: z.number(), reason: z.string() })) }),
    execute: async ({ recommendations }) => T.recommendMovies(recommendations) }),
};

// A stand-in for a working scraper: real TMDB ids so recommend_movies can resolve them.
const populated = [
  { tmdbId: 1233413, title: "Sinners", genres: ["Horror","Thriller"], voteAverage: 7.5 },
  { tmdbId: 574475,  title: "Final Destination Bloodlines", genres: ["Horror"], voteAverage: 7.0 },
  { tmdbId: 552524,  title: "Lilo & Stitch", genres: ["Family","Comedy"], voteAverage: 7.1 },
  { tmdbId: 749170,  title: "Heads of State", genres: ["Action","Comedy"], voteAverage: 6.8 },
  { tmdbId: 1061474, title: "Superman", genres: ["Action","Sci-Fi"], voteAverage: 7.4 },
];

const prompts = [
  "any good thrillers",
  "suggest a comedy",
  "what should I watch tonight",
  "recommend something scary",
  "something funny for a date night",
  "best sci-fi this weekend",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(nowShowing, prompt) {
  const r = streamText({
    model: groq("openai/gpt-oss-120b"),
    system: buildSystemPrompt(nowShowing, null),
    messages: [{ role: "user", content: prompt }],
    tools,
    stopWhen: stepCountIs(8),
  });
  let text = "", calls = [], rateLimited = false;
  for await (const p of r.fullStream) {
    if (p.type === "text-delta") text += p.text;
    if (p.type === "tool-call") calls.push(p.toolName);
    if (p.type === "error") rateLimited = true;
  }
  return {
    rateLimited,
    finish: await r.finishReason.catch(() => "err"),
    chars: text.length,
    searches: calls.filter((c) => c === "search_movies").length,
    recommended: calls.includes("recommend_movies"),
  };
}

for (const [label, nowShowing] of [["EMPTY now-showing (today)", []], ["POPULATED now-showing", populated]]) {
  let empties = 0, cards = 0, usable = 0;
  console.log(`\n=== ${label} ===`);
  for (const p of prompts) {
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await runOne(nowShowing, p);
      if (!res.rateLimited) break;
      await sleep(20000);
    }
    if (res.rateLimited) { console.log(`  rate-limited, skipped: ${p}`); continue; }
    usable++;
    if (res.chars === 0) empties++;
    if (res.recommended) cards++;
    console.log(`  ${res.chars === 0 ? "EMPTY" : "ok   "} finish=${res.finish} chars=${String(res.chars).padStart(4)} searches=${res.searches} cards=${res.recommended}  | ${p}`);
    await sleep(6000);
  }
  console.log(`  -> empty first attempts: ${empties}/${usable} | turns with cards: ${cards}/${usable}`);
}
await prisma.$disconnect();
process.exit(0);
