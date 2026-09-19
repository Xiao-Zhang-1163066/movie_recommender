-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "errorKind" TEXT,
ADD COLUMN     "errored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retried" BOOLEAN NOT NULL DEFAULT false;
