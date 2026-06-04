import { useState } from "react";
import type { ChatMovie, Message, StreamEvent } from "./types";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMovies, setStreamingMovies] = useState<ChatMovie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");

  async function sendMessage() {
    if (!input.trim() || isLoading) return;
    const newUserMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    let assistantText = "";
    let assistantMovies: ChatMovie[] = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Send only role + content — the model doesn't need our rendered cards.
        body: JSON.stringify({
          messages: updatedMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Network response was not ok");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // The backend streams NDJSON: one JSON event per line. Lines can arrive
      // split across chunks, so we buffer and only parse on a newline.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the trailing partial line

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
            assistantText += `\n\n⚠️ ${event.v}`;
            setStreamingText(assistantText);
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantText,
          movies: assistantMovies.length ? assistantMovies : undefined,
        },
      ]);
    } catch (error) {
      console.error("Error during chat:", error);
    } finally {
      setStreamingText("");
      setStreamingMovies([]);
      setIsLoading(false);
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
  };
}
