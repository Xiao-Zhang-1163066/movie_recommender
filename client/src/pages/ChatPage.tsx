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
    const newUserMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("api/chat", {
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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {messages.length === 0 && !streamingText && (
            <div className="text-center pt-16">
              <p
                className="text-3xl font-black mb-2"
                style={{ letterSpacing: "-0.03em" }}
              >
                What are you in the mood for?
              </p>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                Ask me anything — genres, moods, actors, release years.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`px-4 py-3 text-sm leading-relaxed ${
                m.role === "user" ? "self-end" : "self-start"
              }`}
              style={{
                maxWidth: "80%",
                borderRadius: "14px",
                background:
                  m.role === "user" ? "var(--lime)" : "var(--surface-2)",
                color: m.role === "user" ? "#000" : "var(--foreground)",
              }}
            >
              {m.content}
            </div>
          ))}

          {streamingText && (
            <div
              className="self-start px-4 py-3 text-sm leading-relaxed"
              style={{
                maxWidth: "80%",
                borderRadius: "14px",
                background: "var(--surface-2)",
              }}
            >
              {streamingText}
            </div>
          )}
        </div>
      </div>

      {/* Input row */}
      <div
        className="px-10 py-4"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(10,10,10,0.95)",
        }}
      >
        <div
          className="max-w-2xl mx-auto flex gap-3 items-center p-2 pl-5"
          style={{
            background: "var(--surface-2)",
            borderRadius: "999px",
          }}
        >
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder-text-2"
            style={{ color: "var(--foreground)" }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask for a movie recommendation…"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading}
            className="px-5 py-2.5 text-sm font-bold rounded-full shrink-0 transition-opacity disabled:opacity-40"
            style={{ background: "var(--lime)", color: "#000" }}
          >
            {isLoading ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
