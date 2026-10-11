-- DropIndex
DROP INDEX "Movie_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "toolErrors" TEXT[] DEFAULT ARRAY[]::TEXT[];
