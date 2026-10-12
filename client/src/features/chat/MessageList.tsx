import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ChatMovie, Message, PendingWatch } from "./types";
import ChatMovieCard from "./ChatMovieCard";
import ConfirmWatchCard from "./ConfirmWatchCard";
import MovieDetailModal from "./MovieDetailModal";
import { DotStream } from "ldrs/react";
import "ldrs/react/DotStream.css";

// Tailwind's preflight strips default list/margin styling, so map the elements
// the model actually emits back to sensible spacing.
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-2 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-2 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
      style={{ color: "var(--lime)" }}
    >
      {children}
    </a>
  ),
};

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
}

function MovieGrid({
  movies,
  onOpen,
}: {
  movies: ChatMovie[];
  onOpen: (tmdbId: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 w-full">
      {movies.map((m) => (
        <ChatMovieCard key={m.tmdbId} movie={m} onOpen={onOpen} />
      ))}
    </div>
  );
}

// The backend sends raw tool names; the wording lives here so copy changes ship
// with the frontend instead of needing a backend deploy. Keys match the tool
// names in services/agentTools.js — and therefore AgentRun.toolCalls, so the log
// and the UI describe a turn in the same vocabulary.
const TOOL_LABELS: Record<string, string> = {
  search_movies: "Searching TMDB…",
  get_movie_details: "Looking up details…",
  get_showtimes: "Checking showtimes…",
  get_user_watchlist: "Checking your watchlist…",
  get_taste_profile: "Reading your taste…",
  mark_watched: "Updating your watchlist…",
  recommend_movies: "Picking recommendations…",
};

const EXAMPLE_QUESTIONS = [
  "What's showing in Christchurch right now?",
  "Recommend a thriller for tonight",
  "Something funny for a date night",
  "Best sci-fi I can watch this weekend",
];

function MessageList({
  messages,
  streamingText,
  streamingMovies,
  activeTool,
  pendingWatches,
  onConfirmWatch,
  onDismissWatch,
  isLoading,
  onExampleClick,
}: {
  messages: Message[];
  streamingText: string;
  streamingMovies: ChatMovie[];
  activeTool: string | null;
  pendingWatches: PendingWatch[];
  onConfirmWatch: (
    pending: PendingWatch,
  ) => Promise<{ ok: true; title: string } | { ok: false; message: string }>;
  onDismissWatch: (tmdbId: number) => void;
  isLoading: boolean;
  onExampleClick: (q: string) => void;
}) {
  const [openTmdbId, setOpenTmdbId] = useState<number | null>(null);

  // Invisible marker at the bottom of the list — scrollIntoView targets it.
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when a message is added or loading state changes.
  // Intentionally excludes streamingText — firing on every delta would queue
  // dozens of scroll animations and make the response feel jittery.
  // pendingWatches.length only moves the scroll *earlier*: a card arriving
  // mid-stream is brought into view at once rather than when isLoading flips
  // false at the end of the turn, which would reveal it anyway.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading, pendingWatches.length]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-10 py-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-3">
        {messages.length === 0 && !streamingText && !streamingMovies.length && (
          <div className="text-center pt-16 flex flex-col items-center gap-6">
            <div>
              <p
                className="text-3xl font-black mb-2"
                style={{ letterSpacing: "-0.03em" }}
              >
                What are you in the mood for?
              </p>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                Ask me anything — genres, moods, actors, release years.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => onExampleClick(q)}
                  className="example-chip px-4 py-2 text-sm rounded-full"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            // Stored messages carry a database id, which is a stable identity.
            // The index is only a fallback for a message the user has just typed
            // and which the server has not yet handed back with an id.
            key={m.id ?? i}
            className={`flex flex-col ${
              m.role === "user"
                ? "self-end items-end"
                : "self-start items-start"
            }`}
            style={{ maxWidth: m.movies?.length ? "100%" : "80%" }}
          >
            {m.content && (
              <div
                className="px-4 py-3 text-sm leading-relaxed"
                style={{
                  borderRadius: "14px",
                  background:
                    m.role === "user" ? "var(--lime)" : "var(--surface-2)",
                  color: m.role === "user" ? "#000" : "var(--foreground)",
                }}
              >
                {m.role === "assistant" ? (
                  <Markdown>{m.content}</Markdown>
                ) : (
                  m.content
                )}
              </div>
            )}
            {m.movies?.length ? (
              <MovieGrid movies={m.movies} onOpen={setOpenTmdbId} />
            ) : null}
          </div>
        ))}

        {isLoading && !streamingText && (
          <div
            className="self-start flex items-center gap-3 px-4 py-3 text-sm"
            style={{ borderRadius: "14px", background: "var(--surface-2)" }}
          >
            <DotStream size="36" speed="2.5" color="#c6f432" />
            {/* Unknown names fall back rather than render nothing — the backend
                can add a tool before the frontend knows its wording. */}
            {activeTool && (
              <span style={{ color: "var(--text-2)" }}>
                {TOOL_LABELS[activeTool] ?? "Working…"}
              </span>
            )}
          </div>
        )}

        {/* Only render once text has started arriving — this guarantees the
            text bubble always appears before movie cards, even if the model
            emits a recommend_movies tool call before its first text delta. */}
        {streamingText && (
          <div
            className="self-start flex flex-col items-start"
            style={{ maxWidth: "100%" }}
          >
            <div
              className="px-4 py-3 text-sm leading-relaxed"
              style={{
                maxWidth: "80%",
                borderRadius: "14px",
                background: "var(--surface-2)",
              }}
            >
              <Markdown>{streamingText}</Markdown>
            </div>
            {streamingMovies.length > 0 && (
              <MovieGrid movies={streamingMovies} onOpen={setOpenTmdbId} />
            )}
          </div>
        )}

        {/* Outside the streamingText block on purpose. That block unmounts when
            the turn ends and its text is committed to `messages`, which would
            take the card with it — and the card has to outlive the stream,
            because answering it is a decision the user makes afterwards. */}
        {pendingWatches.map((pending) => (
          <ConfirmWatchCard
            key={pending.tmdbId}
            pending={pending}
            onConfirm={() => onConfirmWatch(pending)}
            onDismiss={() => onDismissWatch(pending.tmdbId)}
          />
        ))}
      </div>

      {/* Scroll anchor — sits below all content so scrollIntoView lands at the bottom */}
      <div ref={bottomRef} />

      {openTmdbId !== null && (
        <MovieDetailModal
          tmdbId={openTmdbId}
          onClose={() => setOpenTmdbId(null)}
        />
      )}
    </div>
  );
}

export default MessageList;
