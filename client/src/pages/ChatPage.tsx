import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");

  async function sendMessage() {
    if (!input.trim() || isLoading) return;
    // step 1: build the new user message object and append it to messages
    // step 2: clear the input field and set isLoading to true
    // step 3: POST to /api/chat with the updated messages array as JSON body
    // step 4: get a Reader from response.body and decode chunks in a loop
    //   - each chunk is a Uint8Array; use TextDecoder to convert it to a string
    //   - append each decoded string to streamingText
    // step 5: when the loop ends (done === true), push the completed assistant
    //         message into messages and reset streamingText to ""
    // step 6: set isLoading back to false (put in a finally block)
    const newUserMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Network response was not ok");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value);
        assistantMessage += chunkText;
        setStreamingText(assistantMessage);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantMessage },
      ]);
      setStreamingText("");
    } catch (error) {
      console.error("Error during chat:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
      {/* Message list */}
      <div className="flex flex-col gap-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-3 rounded ${
              m.role === "user"
                ? "bg-blue-100 self-end"
                : "bg-gray-100 self-start"
            }`}
          >
            {m.content}
          </div>
        ))}

        {/* Streaming bubble — only show when streamingText is non-empty */}
        {/* hint: same style as an assistant message above */}
        {streamingText && (
          <div className="p-3 rounded bg-gray-100 self-start">
            {streamingText}
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask for a movie recommendation..."
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {isLoading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
export default ChatPage;
