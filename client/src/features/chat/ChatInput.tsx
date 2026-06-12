// Converts the RateLimit-Reset timestamp into a human-readable suffix.
// Returns "" once the window has already expired so stale text never shows.
function formatResetTime(resetAt: Date | null): string {
  if (!resetAt) return "";
  const diffMs = resetAt.getTime() - Date.now();
  if (diffMs <= 0) return "";
  const mins = Math.ceil(diffMs / 60_000);
  return mins <= 1 ? " Try again in a moment." : ` Try again in ${mins} minutes.`;
}

type Props = {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  // onStop fires the AbortController in useChat, which cancels the fetch
  // and triggers the server to abort the LLM run via res.on("close").
  onStop: () => void;
  errorMessage?: string | null;
  resetAt?: Date | null;
};

function ChatInput({ input, onInputChange, onSend, onStop, isLoading, errorMessage, resetAt }: Props) {
  return (
    <div
      className="px-4 py-4"
      style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10,10,10,0.95)",
      }}
    >
      {/* Rate-limit / error banner — only mounts when errorMessage is set.
          The user can still type but Send is disabled until the window resets. */}
      {errorMessage && (
        <p className="text-xs text-center mb-2" style={{ color: "var(--text-2)" }}>
          {errorMessage}{formatResetTime(resetAt ?? null)}
        </p>
      )}

      <div
        className="flex gap-3 items-center p-2 pl-5"
        style={{
          background: "var(--surface-2)",
          borderRadius: "999px",
        }}
      >
        <input
          className="flex-1 bg-transparent text-base md:text-sm outline-none placeholder-text-2"
          style={{ color: "var(--foreground)" }}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isLoading && onSend()}
          placeholder="Ask for a movie recommendation…"
          disabled={isLoading}
        />

        {/* Swap Send ↔ Stop based on loading state.
            Stop calls onStop which aborts the in-flight fetch. */}
        {isLoading ? (
          <button
            onClick={onStop}
            className="px-5 py-2.5 text-sm font-bold rounded-full shrink-0"
            style={{ background: "rgba(255,255,255,0.12)", color: "var(--foreground)" }}
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim() || !!errorMessage}
            className="px-5 py-2.5 text-sm font-bold rounded-full shrink-0 transition-opacity disabled:opacity-40"
            style={{ background: "var(--lime)", color: "#000" }}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

export default ChatInput;
