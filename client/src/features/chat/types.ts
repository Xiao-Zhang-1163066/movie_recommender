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

// A write the agent has prepared but not performed. mark_watched is read-only:
// it resolves the title and hands this back, and nothing reaches the database
// until the user accepts it on a card, which POSTs to /api/chat/confirm.
//
// `title` and `posterUrl` are resolved server-side from TMDB, never supplied by
// the model. An invented title would make this card describe one film while the
// tmdbId wrote another — the card lying about what is being approved, which
// would defeat the only safeguard in the flow.
export type PendingWatch = {
  pending: true;
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  rating: number | null;
  notes: string | null;
  // Present on the wire but meant for the model, not for rendering: it tells it
  // to ask rather than announce. Typed so nobody reads it as UI copy.
  instruction?: string;
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
  // Transient progress only — never stored, never replayed by GET /chat/:id.
  // Carries the raw tool name; the human wording lives in the UI so copy can
  // change without a backend deploy.
  | { t: "tool"; v: { name: string } }
  | { t: "movies"; v: ChatMovie[] }
  // A proposal awaiting the user. Transient like `tool`, not committed into
  // `messages`: the server does not store it on the ChatMessage row, so a card
  // sitting in the transcript would be something GET /chat/:id cannot reproduce
  // — the stored history would replay missing a card that was once there.
  // Losing it on refresh is safe precisely because nothing was written.
  | { t: "confirm"; v: PendingWatch }
  // request_too_large was added by b5b3d87 and never reached this union, so a
  // 413 fell into the `else` branch and was shown as a generic warning. It is
  // the one kind with a specific way out ("start a new chat"), which is exactly
  // what the generic path throws away.
  | {
      t: "error";
      v: string;
      kind?:
        | "rate_limit"
        | "daily_limit"
        | "context_limit"
        | "request_too_large"
        | "general";
      retryAfter?: number;
    };
