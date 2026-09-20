import "dotenv/config";
import { prisma } from "../config/db.js";
import {
  buildEmbeddingText,
  embeddingHash,
  embedDocuments,
  toSqlVector,
  hasEmbeddingSupport,
} from "../services/embeddingService.js";

/**
 * Gives every movie a vector, and keeps them current.
 *
 * Run manually with `npm run embed:backfill`, and daily in CI right after the
 * Python scraper, so films inserted this morning are searchable this morning.
 *
 * Deliberately a script rather than a migration. Migrations describe schema:
 * they must be fast, offline and deterministic, because every environment
 * replays them from empty. This calls a rate-limited external API, so as a
 * migration it would fail forever on a database with no GEMINI_API_KEY and
 * would stall `migrate deploy` mid-rollout on a quota error.
 */

// The unit of durable progress, not a throughput setting. Everything embedded
// is written before the next batch starts, so losing the network at movie 60
// costs the current batch and nothing already done. The AI SDK does its own
// request batching underneath.
const BATCH_SIZE = 10;

async function main() {
  if (!hasEmbeddingSupport()) {
    console.error("GEMINI_API_KEY is not set — cannot embed. Nothing was changed.");
    process.exit(1);
  }

  // Raw SQL because Prisma cannot see the embedding column at all, so "does
  // this row have a vector yet" is not a question the client can ask.
  const rows = await prisma.$queryRaw`
    SELECT id, title, overview, "releaseYear", genres, "embeddingHash",
           embedding IS NULL AS "missingVector"
    FROM "Movie"
  `;

  // The hash is computed here rather than in SQL because it depends on
  // buildEmbeddingText — the database has no idea what text we chose to embed.
  const pending = [];
  for (const row of rows) {
    const text = buildEmbeddingText(row);
    const hash = embeddingHash(text);
    if (row.missingVector || row.embeddingHash !== hash) {
      pending.push({ id: row.id, title: row.title, text, hash });
    }
  }

  console.log(
    `${rows.length} movies: ${pending.length} to embed, ${rows.length - pending.length} unchanged.`,
  );
  if (!pending.length) return { embedded: 0, failed: 0 };

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    try {
      const vectors = await embedDocuments(batch.map((m) => m.text));

      // One transaction per batch, so a row's vector and its hash always agree.
      // Written separately, a crash between them would leave a hash claiming
      // "already current" over a vector built from the previous text — a stale
      // row that no future run would ever notice.
      await prisma.$transaction(
        batch.map(
          (m, j) => prisma.$executeRaw`
            UPDATE "Movie"
            SET embedding       = ${toSqlVector(vectors[j])}::vector,
                "embeddingHash" = ${m.hash},
                "embeddedAt"    = now()
            WHERE id = ${m.id}
          `,
        ),
      );

      embedded += batch.length;
      console.log(`  [${embedded}/${pending.length}] ${batch.map((m) => m.title).join(", ")}`);
    } catch (err) {
      // Carry on rather than abort: one poisoned row (or one unlucky 429)
      // should not stop the other 60 films from becoming searchable. The exit
      // code below is what makes the failure visible in CI.
      failed += batch.length;
      console.error(`  batch of ${batch.length} failed: ${err.message}`);
    }
  }

  return { embedded, failed };
}

main()
  .then(async ({ embedded, failed }) => {
    console.log(`\nDone. embedded: ${embedded}, failed: ${failed}`);
    await prisma.$disconnect();
    // Non-zero so a scheduled run that half-worked shows up red in Actions
    // instead of passing quietly with a third of the catalogue unsearchable.
    process.exit(failed ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("Backfill failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
