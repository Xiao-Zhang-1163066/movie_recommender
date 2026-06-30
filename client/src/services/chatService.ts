import { API_BASE } from "@/lib/config";
import { getAuthHeaders } from "@/services/authService";

type ChatMessage = { role: string; content: string };

// A custom error subclass so the hook can distinguish a rate-limit failure
// from any other network error and show a "try again at X" message.
export class RateLimitError extends Error {
  resetAt: Date | null;
  constructor(message: string, resetAt: Date | null) {
    super(message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

export async function postChatMessage(
  messages: ChatMessage[],
  // Optional AbortSignal wired up in useChat — when the user hits Stop,
  // aborting the signal cancels the fetch and the browser closes the connection.
  // The server detects the disconnect via res.on("close") and aborts the LLM run.
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    if (res.status === 429) {
      // draft-6 RateLimit-Reset is seconds until reset (relative), not an epoch timestamp
      const resetHeader = res.headers.get("RateLimit-Reset");
      const resetAt = resetHeader ? new Date(Date.now() + Number(resetHeader) * 1000) : null;
      const data = await res.json().catch(() => ({}));
      throw new RateLimitError(data.error || "Rate limit exceeded", resetAt);
    }
    if (res.status === 401) {
      throw new Error("SESSION_EXPIRED");
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Chat request failed");
  }

  if (!res.body) throw new Error("No response body");
  return res;
}
