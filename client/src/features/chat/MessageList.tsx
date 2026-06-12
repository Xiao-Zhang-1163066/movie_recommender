import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ChatMovie, Message } from "./types";
import ChatMovieCard from "./ChatMovieCard";
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

function MessageList({
  messages,
  streamingText,
  streamingMovies,
  isLoading,
}: {
  messages: Message[];
  streamingText: string;
  streamingMovies: ChatMovie[];
  isLoading: boolean;
}) {
  const [openTmdbId, setOpenTmdbId] = useState<number | null>(null);

  // Invisible marker at the bottom of the list — scrollIntoView targets it.
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when a message is added or loading state changes.
  // Intentionally excludes streamingText — firing on every delta would queue
  // dozens of scroll animations and make the response feel jittery.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-10 py-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-3">
        {messages.length === 0 && !streamingText && !streamingMovies.length && (
          <div className="text-center pt-16">
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
        )}

        {messages.map((m, i) => (
          <div
            key={i}
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
            className="self-start px-4 py-3 text-sm leading-relaxed"
            style={{
              borderRadius: "14px",
              background: "var(--surface-2)",
              // color: "var(--text-2)",
            }}
          >
            <DotStream size="60" speed="2.5" color="#c6f432" />
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
