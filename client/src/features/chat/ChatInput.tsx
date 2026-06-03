type Props = {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

function ChatInput({ input, onInputChange, onSend, isLoading }: Props) {
  return (
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
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Ask for a movie recommendation…"
          disabled={isLoading}
        />
        <button
          onClick={onSend}
          disabled={isLoading}
          className="px-5 py-2.5 text-sm font-bold rounded-full shrink-0 transition-opacity disabled:opacity-40"
          style={{ background: "var(--lime)", color: "#000" }}
        >
          {isLoading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

export default ChatInput;
