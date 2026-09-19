import { useEffect, useRef, useState } from "react";
import type { ChatMovie, Message, StreamEvent } from "./types";
import {
  postChatMessage,
  getConversation,
  RateLimitError,
} from "@/services/chatService";
import { useNavigate } from "react-router-dom";

/**
 * @param urlConversationId the id in the address bar, from /chat/:conversationId.
 *   Undefined on /chat, which means "start a new thread".
 */
export function useChat(urlConversationId?: string) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  // The thread currently on screen. Starts empty even when the URL names one:
  // the loader below is what fills it in, and starting them equal would make the
  // loader think there was nothing to fetch.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMovies, setStreamingMovies] = useState<ChatMovie[]>([]);
  // Which tool the agent is running right now, or null. Raw name, not copy.
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");

  // errorMessage + resetAt power the rate-limit (and generic error) UI in ChatInput.
  // They're separate from streamingText so errors don't bleed into the message history.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetAt, setResetAt] = useState<Date | null>(null);
  // true only for rate-limit errors where we must prevent sending until the window resets
  const [sendBlocked, setSendBlocked] = useState(false);

  // When the rate-limit window expires, auto-clear the banner and re-enable Send.
  useEffect(() => {
    if (!resetAt || !sendBlocked) return;
    const timer = setTimeout(() => {
      setErrorMessage(null);
      setSendBlocked(false);
      setResetAt(null);
    }, Math.max(0, resetAt.getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [resetAt, sendBlocked]);

  const urlId = urlConversationId ?? null;

  // Clearing the screen when the user starts a new chat is an adjustment to a
  // changed prop, not a synchronisation with anything outside React, so React
  // wants it during render rather than in an effect. Doing it in an effect would
  // render the old thread once before wiping it, and would cascade renders.
  //
  // Only a move *to* /chat clears. Gaining an id goes the other way: the first
  // send of a new chat rewrites the URL mid-stream, and clearing there would
  // throw away the reply as it is arriving.
  const [lastUrlId, setLastUrlId] = useState<string | null>(urlId);
  if (urlId !== lastUrlId) {
    setLastUrlId(urlId);
    if (urlId === null) {
      setConversationId(null);
      setMessages([]);
    }
  }

  // Derived rather than stored. A thread is loading exactly when the URL names
  // one we are not showing yet and there is nothing on screen. The last part
  // matters: without it, the URL rewrite mid-stream could flash the loading
  // screen over a live reply.
  const isLoadingHistory =
    urlId !== null && urlId !== conversationId && messages.length === 0;

  // Remembers which thread we have already asked the server for. navigate() is
  // not guaranteed to keep the same identity between renders, so the effect
  // below can re-run more often than the URL actually changes; without this the
  // repeats would each start another request.
  const requestedIdRef = useRef<string | null>(null);

  // Rebuild whatever thread the URL names. This is what makes a refresh, or a
  // pasted link, show the conversation instead of an empty page.
  useEffect(() => {
    // Already showing this thread, so there is nothing to fetch. This guard
    // matters more than it looks: the mid-stream URL rewrite re-runs this
    // effect, and without it we would fetch history during a live stream.
    if (!urlId || urlId === conversationId) return;
    if (requestedIdRef.current === urlId) return;
    requestedIdRef.current = urlId;

    // Guards against a slow response for a thread the user has already navigated
    // away from landing on top of the one they are now looking at.
    let cancelled = false;

    getConversation(urlId)
      .then((conversation) => {
        if (cancelled) return;
        setConversationId(conversation.id);
        setMessages(conversation.messages);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        if (error.message === "SESSION_EXPIRED") {
          localStorage.removeItem("jwt");
          navigate("/login", { replace: true });
          return;
        }
        // The id in the URL is unusable — deleted, or never theirs. Fall back to
        // a new chat rather than stranding the user on a blank thread.
        setErrorMessage(error.message);
        navigate("/chat", { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [urlId, conversationId, navigate]);

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
    let modelRetryAfter = 60;
    let modelRateLimitMessage = "The AI service is temporarily at capacity. Please try again shortly.";
    // Flipped once the server names the thread, which it only does after writing
    // the user's message to the database. Before that a failure means nothing was
    // stored and the optimistic message should be taken back; after it, removing
    // the message would put the screen out of step with the database and it would
    // reappear on the next refresh.
    let messagePersisted = false;

    try {
      const response = await postChatMessage(
        userInput,
        conversationId,
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
          if (event.t === "conversation") {
            messagePersisted = true;
            if (event.v.id !== conversationId) {
              // A brand-new chat has just been given an id. Put it in the
              // address bar so a refresh can find it again. replace: true keeps
              // Back going wherever the user came from rather than to an empty
              // version of this same page.
              setConversationId(event.v.id);
              navigate(`/chat/${event.v.id}`, { replace: true });
            }
          } else if (event.t === "text") {
            // Words have started, so the pill has done its job. Set to null
            // unconditionally rather than reading activeTool first — this closure
            // captured the value from the render that started the stream, so the
            // read would be stale. React bails out when the value is unchanged.
            setActiveTool(null);
            assistantText += event.v;
            setStreamingText(assistantText);
          } else if (event.t === "tool") {
            setActiveTool(event.v.name);
          } else if (event.t === "movies") {
            assistantMovies = [...assistantMovies, ...event.v];
            setStreamingMovies(assistantMovies);
          } else if (event.t === "error") {
            if (event.kind === "rate_limit") {
              // Stop reading — show the banner and disable send. Commit any
              // partial text that already streamed so it's not lost.
              modelRateLimitHit = true;
              modelRetryAfter = event.retryAfter ?? 60;
              modelRateLimitMessage = event.v;
              await reader.cancel();
              break outer;
            } else if (event.kind === "daily_limit") {
              modelRateLimitHit = true;
              modelRetryAfter = 0; // no countdown — message says "try again tomorrow"
              modelRateLimitMessage = event.v;
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
        // A 429 comes from chatLimiter, which runs before the controller, so the
        // message was never stored. Reverting it is the right thing here, and
        // restoring the input lets the user resend once the window resets.
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
        // Generic network / parse error. Only take the message back if the
        // server never got as far as storing it, otherwise the screen would
        // disagree with the database.
        if (!messagePersisted) {
          setMessages(messages);
          setInput(userInput);
        }
        setErrorMessage("Something went wrong. Please try again.");
        console.error("Chat error:", error);
        return; // sendBlocked stays false — the user can click Send to retry
      }
    } finally {
      // Always clean up streaming state and loading flag, regardless of outcome.
      // (finally runs even when catch does `return`.)
      setStreamingText("");
      setStreamingMovies([]);
      // Cleared here as well as on the first text delta. A stopped, failed or
      // text-less stream never reaches that branch, and without this the pill
      // would spin forever.
      setActiveTool(null);
      setIsLoading(false);
      abortControllerRef.current = null;
    }

    // Model-level rate limit: show the banner and disable send. We keep the
    // user message visible and commit any text that already streamed.
    if (modelRateLimitHit) {
      setErrorMessage(modelRateLimitMessage);
      if (modelRetryAfter > 0) setResetAt(new Date(Date.now() + modelRetryAfter * 1000));
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
    conversationId,
    isLoadingHistory,
    messages,
    streamingText,
    streamingMovies,
    activeTool,
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
