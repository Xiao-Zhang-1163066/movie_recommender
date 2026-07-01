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
  role: "user" | "assistant";
  content: string;
  movies?: ChatMovie[];
};

// One line of the backend's NDJSON stream protocol.
export type StreamEvent =
  | { t: "text"; v: string }
  | { t: "movies"; v: ChatMovie[] }
  | { t: "error"; v: string; kind?: "rate_limit" | "daily_limit" | "context_limit" | "general"; retryAfter?: number };
