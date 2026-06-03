import MessageList from "@/features/chat/MessageList";
import ChatInput from "@/features/chat/ChatInput";
import { useChat } from "@/features/chat/useChat";

function ChatPage() {
  const { messages, streamingText, isLoading, input, setInput, sendMessage } =
    useChat();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <MessageList messages={messages} streamingText={streamingText} />

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
