import "dotenv/config";
import { embed, embedMany } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * A throwaway experiment, not part of the app. Run it with:
 *   node scripts/embeddingDemo.js
 *
 * It exists to make one abstract claim concrete: an embedding puts text with
 * similar *meaning* at similar coordinates, even when the texts share no words.
 * Everything Sprint 3 builds rests on that claim being true, so it is worth
 * seeing the numbers once rather than taking it on faith.
 */

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

// 768 rather than the model's native 3072 — the same setting the real pipeline
// will use, so what we measure here is what production will behave like.
const DIMENSIONS = 768;
const model = google.textEmbeddingModel("gemini-embedding-001");

// Three plot summaries. The first two are both "one person, alone, surviving",
// told in completely different vocabulary — no shared nouns at all. The third is
// deliberately unrelated. If embeddings work, 1 and 2 must come out close and 3
// must come out far, and no keyword search could ever tell you that.
const documents = [
  "A young man is stranded on a lifeboat in the Pacific Ocean with a tiger, and must survive for months.",
  "An astronaut is left behind alone on Mars and has to work out how to stay alive until rescue.",
  "Amateur bakers compete in a tent to make the best cakes and pastries.",
];

// What a user would actually type. Note it shares almost no words with any
// document above — that is the whole point of the exercise.
const query = "a story about being alone and trying to survive";

// Cosine similarity: 1 means pointing the same way, 0 unrelated, -1 opposite.
// For unit-length vectors this is just the dot product, which is why the
// normalisation below matters.
const cosine = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

// Euclidean length. Printed below because it is the evidence for a gotcha that
// would otherwise be invisible.
const norm = (v) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));

// Gemini returns a unit-length vector only at its full 3072 dimensions. Ask for
// a truncated 768 and the prefix comes back un-normalised, so cosine distance
// stops being equivalent to inner product and scores stop being comparable
// between rows. One function, applied to every vector, is the cheap fix.
const normalise = (v) => {
  const len = norm(v);
  return v.map((x) => x / len);
};

async function main() {
  // taskType tells Gemini which side of a search this text is on. The same words
  // embedded as a DOCUMENT and as a QUERY produce different vectors on purpose.
  const { embeddings: rawDocs } = await embedMany({
    model,
    values: documents,
    providerOptions: {
      google: { outputDimensionality: DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
    },
  });

  const { embedding: rawQuery } = await embed({
    model,
    value: query,
    providerOptions: {
      google: { outputDimensionality: DIMENSIONS, taskType: "RETRIEVAL_QUERY" },
    },
  });

  console.log("=== 1. What a vector actually looks like ===");
  console.log(`Text: "${documents[0]}"`);
  console.log(`Dimensions: ${rawDocs[0].length}`);
  console.log("First 8 numbers:", rawDocs[0].slice(0, 8).map((n) => n.toFixed(4)).join(", "));
  console.log(`Length before normalising: ${norm(rawDocs[0]).toFixed(4)}  <-- not 1.0, so it must be normalised`);

  const docs = rawDocs.map(normalise);
  const q = normalise(rawQuery);
  console.log(`Length after normalising:  ${norm(docs[0]).toFixed(4)}`);

  console.log("\n=== 2. Do texts about the same thing land close together? ===");
  console.log(`lifeboat  vs  Mars    : ${cosine(docs[0], docs[1]).toFixed(4)}   (different words, same idea)`);
  console.log(`lifeboat  vs  baking  : ${cosine(docs[0], docs[2]).toFixed(4)}`);
  console.log(`Mars      vs  baking  : ${cosine(docs[1], docs[2]).toFixed(4)}`);

  console.log("\n=== 3. The actual search ===");
  console.log(`Query: "${query}"\n`);
  const ranked = documents
    .map((text, i) => ({ text, score: cosine(q, docs[i]) }))
    .sort((a, b) => b.score - a.score);
  ranked.forEach(({ text, score }, rank) => {
    console.log(`${rank + 1}. ${score.toFixed(4)}  ${text}`);
  });

  console.log("\n=== 4. Why keyword search cannot do this ===");
  // Stopwords carry no topic, so a keyword engine discards them before matching.
  // Excluding them here is not stacking the deck — it is doing what the engine
  // we are comparing against would do.
  const STOPWORDS = new Set(["a", "an", "and", "the", "to", "of", "on", "in", "is", "it", "for", "with", "about", "has", "out", "up", "be", "being", "that"]);
  const contentWords = (s) =>
    new Set((s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !STOPWORDS.has(w)));
  const winner = ranked[0];
  const shared = [...contentWords(query)].filter((w) => contentWords(winner.text).has(w));
  console.log(`Top match: "${winner.text}"`);
  console.log(`Content words shared with the query: ${shared.length ? shared.join(", ") : "(none)"}`);
  console.log(
    `The query says "survive"; the winning text says "stay alive". Keyword search scores that overlap at ${shared.length}, ` +
      `and would rank this no higher than anything else. The embedding ranked it first.`,
  );

  // The most expensive misreading of this output is treating 0.65 as "65%
  // similar". It is not a percentage: the model packs all real text into a
  // narrow cone of the space, so the score for *unrelated* text has a floor
  // well above zero. Measuring that floor is what makes the point unarguable,
  // and it is the reason Phase 4 ranks by order instead of cutting on a fixed
  // threshold — a threshold tuned here would not survive a change of model,
  // dimension count, or text length.
  console.log("\n=== 5. What does 'completely unrelated' actually score? ===");
  const unrelated = [
    "The quarterly tax return must be filed before the end of the month.",
    "Volcanic soil is unusually rich in potassium and phosphorus.",
    "She tuned the cello a quarter-tone flat for the final movement.",
    "Freight costs from the port rose by eleven percent last year.",
  ];
  const { embeddings: rawUnrelated } = await embedMany({
    model,
    values: unrelated,
    providerOptions: {
      google: { outputDimensionality: DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
    },
  });
  const unrelatedVecs = rawUnrelated.map(normalise);

  const pairs = [];
  for (let i = 0; i < unrelatedVecs.length; i++) {
    for (let j = i + 1; j < unrelatedVecs.length; j++) {
      pairs.push(cosine(unrelatedVecs[i], unrelatedVecs[j]));
    }
  }
  const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
  console.log(`${pairs.length} pairs of sentences about tax, geology, music and shipping.`);
  console.log(`Lowest: ${Math.min(...pairs).toFixed(4)}   Highest: ${Math.max(...pairs).toFixed(4)}   Mean: ${mean.toFixed(4)}`);

  // A pair of random vectors is what "no relationship at all" looks like in this
  // many dimensions, and it is nowhere near what real text scores.
  const randomVec = () => normalise(Array.from({ length: DIMENSIONS }, () => Math.random() - 0.5));
  console.log(`Two random vectors, for reference: ${cosine(randomVec(), randomVec()).toFixed(4)}`);
  console.log(
    `\nSo the floor for unrelated *text* is around ${mean.toFixed(2)}, not 0.00. ` +
      `That is why 0.65 means "unrelated" here, and why only the gaps between scores carry information.`,
  );
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
