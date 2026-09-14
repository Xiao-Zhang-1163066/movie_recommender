import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import MessageList from "@/features/chat/MessageList";
import ChatInput from "@/features/chat/ChatInput";
import ConversationList from "@/features/chat/ConversationList";
import { conversationsQueryKey } from "@/features/chat/useConversations";
import { useChat } from "@/features/chat/useChat";

function ChatPage() {
  // Undefined on /chat, which means a new thread. On /chat/:conversationId it
  // names the stored thread the hook should load.
  const { conversationId } = useParams();
  const queryClient = useQueryClient();

  const {
    conversationId: activeId,
    isLoadingHistory,
    messages,
    streamingText,
    streamingMovies,
    isLoading,
    input,
    setInput,
    sendMessage,
    stopStream,
    errorMessage,
    resetAt,
    sendBlocked,
  } = useChat(conversationId);

  // The sidebar is a cached query, so it does not know a thread was just created
  // or replied in. Marking it stale when the active thread changes, and again
  // when a turn finishes, is what keeps a new chat from being missing from its
  // own sidebar until a reload.
  useEffect(() => {
    if (!activeId || isLoading) return;
    queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
  }, [activeId, isLoading, queryClient]);

  return (
    <div className="flex h-[calc(100dvh-4rem)]">
      <ConversationList activeId={activeId ?? undefined} />

      <div className="flex flex-col flex-1 min-w-0">
        {isLoadingHistory ? (
          <div
            className="flex flex-1 items-center justify-center text-sm"
            style={{ color: "var(--text-2)" }}
          >
            Loading conversation…
          </div>
        ) : (
          <>
            <MessageList
              messages={messages}
              streamingText={streamingText}
              streamingMovies={streamingMovies}
              isLoading={isLoading}
              onExampleClick={sendMessage}
            />

            <ChatInput
              input={input}
              onInputChange={setInput}
              onSend={sendMessage}
              onStop={stopStream}
              isLoading={isLoading}
              errorMessage={errorMessage}
              resetAt={resetAt}
              sendBlocked={sendBlocked}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
