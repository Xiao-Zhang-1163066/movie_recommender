import { prisma as defaultPrisma } from "../config/db.js";

/**
 * Save one finished turn to the AgentRun log.
 *
 * Dependencies arrive through a trailing options object that defaults to the
 * real client, the same shape services/conversationService.js uses. Production
 * passes nothing; tests pass a double, so no test needs a live database.
 *
 * Callers fire this without awaiting, once the reply has already been sent, so
 * it must never become something a user waits for.
 */
export async function recordAgentRun(fields, { prisma = defaultPrisma } = {}) {
  return prisma.agentRun.create({ data: fields });
}
