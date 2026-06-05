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
  } = useChat();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <MessageList
        messages={messages}
        streamingText={streamingText}
        streamingMovies={streamingMovies}
        isLoading={isLoading}
      />

      <ChatInput
        input={input}
        onInputChange={setInput}
        onSend={sendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}

export default ChatPage;
