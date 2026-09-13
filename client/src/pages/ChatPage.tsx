import { useParams } from "react-router-dom";
import MessageList from "@/features/chat/MessageList";
import ChatInput from "@/features/chat/ChatInput";
import { useChat } from "@/features/chat/useChat";

function ChatPage() {
  // Undefined on /chat, which means a new thread. On /chat/:conversationId it
  // names the stored thread the hook should load.
  const { conversationId } = useParams();

  const {
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

  if (isLoadingHistory) {
    return (
      <div
        className="flex items-center justify-center h-[calc(100dvh-4rem)] text-sm"
        style={{ color: "var(--text-2)" }}
      >
        Loading conversation…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
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
    </div>
  );
}

export default ChatPage;
