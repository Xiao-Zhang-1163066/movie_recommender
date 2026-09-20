-- Hand-edited after `prisma migrate dev --create-only`. Prisma emitted only the
-- AlterTable below: it will happily diff an Unsupported("vector(768)") column,
-- but it does not know the type needs an extension, and it cannot express an
-- HNSW index at all. Both are added here so one migration is self-contained —
-- the shadow database and a fresh Neon branch replay it without manual steps.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Movie" ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "embedding" vector(768),
ADD COLUMN     "embeddingHash" TEXT;

-- CreateIndex
-- vector_cosine_ops must match the `<=>` operator the retrieval query uses. An
-- index built with a different opclass is not an error: the planner silently
-- ignores it, and the only symptom is a query that stays slow.
-- With 75 rows Postgres will still choose a sequential scan over this index and
-- be right to — it exists because the row count is the only thing that has to
-- change for it to start paying off.
CREATE INDEX "Movie_embedding_hnsw_idx"
  ON "Movie" USING hnsw ("embedding" vector_cosine_ops);
