import { useRef, useState } from "react";
import type { ChatMovie, Message, StreamEvent } from "./types";
import { postChatMessage, RateLimitError } from "@/services/chatService";
import { useNavigate } from "react-router-dom";

export function useChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMovies, setStreamingMovies] = useState<ChatMovie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");

  // errorMessage + resetAt power the rate-limit (and generic error) UI in ChatInput.
  // They're separate from streamingText so errors don't bleed into the message history.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetAt, setResetAt] = useState<Date | null>(null);
  // true only for rate-limit errors where we must prevent sending until the window resets
  const [sendBlocked, setSendBlocked] = useState(false);

  // useRef keeps the AbortController instance between renders without causing
  // re-renders when it changes — we only need it for its .abort() side-effect.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Called by the Stop button. Aborting the controller cancels the fetch,
  // which triggers an AbortError in the catch block below.
  function stopStream() {
    abortControllerRef.current?.abort();
  }

  // `override` lets example chips send a pre-set question without going through
  // setInput first (setState is async so reading `input` right after would miss it).
  async function sendMessage(override?: string) {
    const userInput = (override ?? input).trim();
    if (!userInput || isLoading) return;
    const newUserMessage: Message = { role: "user", content: userInput };
    const updatedMessages = [...messages, newUserMessage];

    // Optimistically add the user message and clear the input immediately
    // so the UI feels instant — we revert both if the request fails.
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setErrorMessage(null);
    setResetAt(null);
    setSendBlocked(false);

    // Fresh controller for this request — stored in ref so stopStream() can reach it.
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let assistantText = "";
    let assistantMovies: ChatMovie[] = [];
    let modelRateLimitHit = false;

    try {
      const response = await postChatMessage(
        updatedMessages.map(({ role, content }) => ({ role, content })),
        controller.signal,
      );

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // The backend streams NDJSON: one JSON event per line. Lines can arrive
      // split across chunks, so we buffer and only parse on a newline.
      outer: while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.t === "text") {
            assistantText += event.v;
            setStreamingText(assistantText);
          } else if (event.t === "movies") {
            assistantMovies = [...assistantMovies, ...event.v];
            setStreamingMovies(assistantMovies);
          } else if (event.t === "error") {
            if (event.kind === "rate_limit") {
              // Stop reading — show the banner and disable send. Commit any
              // partial text that already streamed so it's not lost.
              modelRateLimitHit = true;
              await reader.cancel();
              break outer;
            } else if (event.kind === "context_limit") {
              assistantText += "\n\n⚠️ This conversation is too long for me to continue. Please start a new chat.";
              setStreamingText(assistantText);
              await reader.cancel();
              break outer;
            } else {
              assistantText += `\n\n⚠️ ${event.v}`;
              setStreamingText(assistantText);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // User pressed Stop — don't show an error. Whatever was streamed so far
        // will be committed to the message list below.
      } else if (error instanceof RateLimitError) {
        // Revert the optimistic user message and restore the input so the user
        // can resend once the window resets.
        setMessages(messages);
        setInput(userInput);
        setErrorMessage(error.message);
        setResetAt(error.resetAt);
        setSendBlocked(true);
        return; // finally still runs (clears loading state), but skip the commit block
      } else if ((error as Error).message === "SESSION_EXPIRED") {
        // Token is invalid or expired — clear it and send the user to login.
        localStorage.removeItem("jwt");
        navigate("/login", { replace: true });
        return;
      } else {
        // Generic network / parse error — revert so the user can retry immediately.
        setMessages(messages);
        setInput(userInput);
        setErrorMessage("Something went wrong. Please try again.");
        console.error("Chat error:", error);
        return; // sendBlocked stays false — the user can click Send to retry
      }
    } finally {
      // Always clean up streaming state and loading flag, regardless of outcome.
      // (finally runs even when catch does `return`.)
      setStreamingText("");
      setStreamingMovies([]);
      setIsLoading(false);
      abortControllerRef.current = null;
    }

    // Model-level rate limit: show the banner and disable send. We keep the
    // user message visible and commit any text that already streamed.
    if (modelRateLimitHit) {
      setErrorMessage("The AI service is busy — you've hit its rate limit. Please wait a moment before sending another message.");
      setSendBlocked(true);
    }

    // Only commit if text arrived — movies without an explanation are
    // confusing and not useful, so if Stop was pressed before any text
    // streamed we simply discard the partial result.
    if (assistantText) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantText,
          movies: assistantMovies.length ? assistantMovies : undefined,
        },
      ]);
    }
  }

  return {
    messages,
    streamingText,
    streamingMovies,
    isLoading,
    input,
    setInput,
    sendMessage,
    stopStream,
    errorMessage,
    resetAt,
    sendBlocked,
  };
}
