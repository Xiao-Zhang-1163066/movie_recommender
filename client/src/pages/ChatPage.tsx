import MessageList from "@/features/chat/MessageList";
import ChatInput from "@/features/chat/ChatInput";
import { useChat } from "@/features/chat/useChat";

function ChatPage() {
  const {
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
  } = useChat();

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
