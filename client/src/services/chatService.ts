import { API_BASE } from "@/lib/config";
import { getAuthHeaders } from "@/services/authService";

type ChatMessage = { role: string; content: string };

export async function postChatMessage(
  messages: ChatMessage[],
): Promise<Response> {
  // POST /api/chat — streams the response back; caller reads the body as a stream
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Chat request failed");
  }
  if (!res.body) {
    throw new Error("No response body");
  }
  return res;
}
