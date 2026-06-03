import { useState } from "react";
import type { Message } from "./types";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");

  async function sendMessage() {
    if (!input.trim() || isLoading) return;
    const newUserMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Network response was not ok");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value);
        assistantMessage += chunkText;
        setStreamingText(assistantMessage);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantMessage },
      ]);
      setStreamingText("");
    } catch (error) {
      console.error("Error during chat:", error);
    } finally {
      setIsLoading(false);
    }
  }
  return {
    messages,
    streamingText,
    isLoading,
    input,
    setInput,
    sendMessage,
  };
}
