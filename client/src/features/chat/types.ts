// A movie reference the agent surfaces via the recommend_movies tool.
// Shape mirrors the card payload built in controller/chatController.js.
export type ChatMovie = {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  runtime: number | null;
  voteAverage: number | null;
  posterUrl: string | null;
  overview: string | null;
  reason: string;
  inTheatre: boolean;
};

export type Message = {
  // Set on messages loaded from the server. Optimistic messages the user has
  // only just typed have no id until the next load, which is why it is optional.
  id?: string;
  role: "user" | "assistant";
  content: string;
  movies?: ChatMovie[];
};

// One line of the backend's NDJSON stream protocol.
export type StreamEvent =
  // Always the first line. A new chat has no id until the server makes one, and
  // needs it for the URL and for sending the next message into the same thread.
  | { t: "conversation"; v: { id: string; title: string | null } }
  | { t: "text"; v: string }
  | { t: "movies"; v: ChatMovie[] }
  | { t: "error"; v: string; kind?: "rate_limit" | "daily_limit" | "context_limit" | "general"; retryAfter?: number };
