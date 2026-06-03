import type { Message } from "./types";

function MessageList({
  messages,
  streamingText,
}: {
  messages: Message[];
  streamingText: string;
}) {
  return (
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
  );
}

export default MessageList;
