import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConversations } from "./useConversations";

/**
 * The thread list beside the chat.
 *
 * Without it a conversation is only reachable by still holding its URL, which
 * makes storing conversations at all only half useful.
 */
function ConversationList({ activeId }: { activeId?: string }) {
  const { conversations, isLoading } = useConversations();

  return (
    <aside
      className="hidden md:flex flex-col w-60 shrink-0 border-r overflow-y-auto"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="p-3">
        {/* asChild renders the Link itself with the button's styles, so the row
            stays a real anchor: middle-click and "open in new tab" keep working. */}
        <Button asChild variant="secondary" className="w-full justify-center">
          <Link to="/chat">+ New chat</Link>
        </Button>
      </div>

      {isLoading && (
        <p className="px-4 py-2 text-xs" style={{ color: "var(--text-2)" }}>
          Loading…
        </p>
      )}

      {!isLoading && conversations.length === 0 && (
        <p className="px-4 py-2 text-xs" style={{ color: "var(--text-2)" }}>
          Your chats will appear here.
        </p>
      )}

      <nav className="flex flex-col gap-1 px-2 pb-4">
        {conversations.map((c) => (
          <Link
            key={c.id}
            to={`/chat/${c.id}`}
            // Classes, not inline style: an inline background would beat hover:.
            className={cn(
              "px-3 py-2 rounded-lg text-sm truncate transition-colors",
              c.id === activeId
                ? "bg-white/5 text-foreground"
                : "text-text-2 hover:bg-white/5 hover:text-foreground",
            )}
            // The full title in a tooltip, since the row truncates it.
            title={c.title ?? "Untitled chat"}
          >
            {c.title ?? "Untitled chat"}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export default ConversationList;
