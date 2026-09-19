-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "finishReason" TEXT,
ADD COLUMN     "steps" INTEGER,
ADD COLUMN     "toolCalls" TEXT[] DEFAULT ARRAY[]::TEXT[];
