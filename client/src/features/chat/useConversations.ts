import { useQuery } from "@tanstack/react-query";
import { listConversations, type ConversationSummary } from "@/services/chatService";

export const conversationsQueryKey = ["conversations"];

/**
 * The thread list for the chat sidebar.
 *
 * Chat's send path is hand-rolled fetch because it reads a stream, which
 * react-query does not model. This is an ordinary request, so it uses the same
 * hook shape as every other feature (see features/cinemas/useCinemas.ts).
 */
export function useConversations() {
  const {
    data: conversations = [],
    isLoading,
    error,
  } = useQuery<ConversationSummary[]>({
    queryKey: conversationsQueryKey,
    queryFn: listConversations,
  });

  return { conversations, isLoading, error };
}
