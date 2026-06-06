import { API_BASE } from "@/lib/config";

type ChatMessage = { role: string; content: string };

export async function postChatMessage(
  messages: ChatMessage[],
): Promise<Response> {
  // POST /api/chat
  // headers: Content-Type application/json
  // credentials: "include"
  // body: JSON.stringify({ messages })
  // throw if !response.ok or !response.body
  // return the raw Response (hook will read the stream)
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
