import { API_BASE } from "@/lib/config";
import { getAuthHeaders } from "@/services/authService";
import type { Message } from "@/features/chat/types";

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

type ApiError = { message?: string; error?: string };

// The API reports failures in two shapes. validate() and the global error
// handler send { status, message }; the auth middleware sends { error }. Reading
// only one of them silently discarded the real reason and showed the fallback
// instead, so read both.
function readErrorMessage(data: ApiError, fallback: string): string {
  return data.message || data.error || fallback;
}

type Conversation = {
  id: string;
  title: string | null;
  messages: Message[];
};

// A sidebar row. No message bodies — the list only needs a label per thread.
export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export async function postChatMessage(
  message: string,
  // Absent on the first send of a new chat. The server creates the thread and
  // announces its id on the first line of the stream.
  conversationId: string | null,
  // Optional AbortSignal wired up in useChat — when the user hits Stop,
  // aborting the signal cancels the fetch and the browser closes the connection.
  // The server detects the disconnect via res.on("close") and aborts the LLM run.
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    // The whole transcript used to go here on every turn. The server reads it
    // from the database now, so a request carries one message.
    body: JSON.stringify({ message, conversationId: conversationId ?? undefined }),
    signal,
  });

  if (!res.ok) {
    if (res.status === 429) {
      // draft-6 RateLimit-Reset is seconds until reset (relative), not an epoch timestamp
      const resetHeader = res.headers.get("RateLimit-Reset");
      const resetAt = resetHeader ? new Date(Date.now() + Number(resetHeader) * 1000) : null;
      const data = await res.json().catch(() => ({}));
      throw new RateLimitError(readErrorMessage(data, "Rate limit exceeded"), resetAt);
    }
    if (res.status === 401) {
      throw new Error("SESSION_EXPIRED");
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(readErrorMessage(data, "Chat request failed"));
  }

  if (!res.body) throw new Error("No response body");
  return res;
}

/**
 * Fetch a stored conversation so a refresh, or an opened link, can rebuild the
 * message list. Returns messages already in the shape the UI renders, cards
 * included.
 */
export async function getConversation(conversationId: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/api/chat/${conversationId}`, {
    headers: { ...getAuthHeaders() },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("SESSION_EXPIRED");
    const data = await res.json().catch(() => ({}));
    throw new Error(readErrorMessage(data, "Could not load that conversation"));
  }

  const data = await res.json();
  return data.data.conversation;
}

/**
 * Accept a mark_watched proposal.
 *
 * The write the agent could not do. Note what is *not* sent: no title, no
 * poster, no status. The server resolves the film from TMDB by id and always
 * writes COMPLETED, so there is nothing here a caller could get wrong — and
 * nothing the model could have influenced beyond the id it proposed.
 *
 * Returns the resolved title so the UI can name the film it recorded rather
 * than just saying "saved", which is the user's last chance to spot the wrong
 * one.
 */
export async function confirmWatched(
  tmdbId: number,
  rating: number | null,
  notes: string | null,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    // ?? undefined rather than passing null: the Zod schema marks these
    // optional, and z.number().optional() rejects an explicit null.
    body: JSON.stringify({
      tmdbId,
      rating: rating ?? undefined,
      notes: notes ?? undefined,
    }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("SESSION_EXPIRED");
    const data = await res.json().catch(() => ({}));
    // A 422 carries a real reason ("TMDB has no release date..."), so read the
    // body rather than showing a status-code-shaped fallback.
    throw new Error(readErrorMessage(data, "Could not save that"));
  }

  const data = await res.json();
  return data.data.watched.title as string;
}

/** The user's recent threads, newest first, for the sidebar. */
export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${API_BASE}/api/chat`, { headers: { ...getAuthHeaders() } });

  if (!res.ok) {
    if (res.status === 401) throw new Error("SESSION_EXPIRED");
    const data = await res.json().catch(() => ({}));
    throw new Error(readErrorMessage(data, "Could not load your conversations"));
  }

  const data = await res.json();
  return data.data.conversations;
}
