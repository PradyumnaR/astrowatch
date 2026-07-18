"use client";

import { useRef, useEffect, useMemo, useState, type FormEvent } from "react";
// import { useChat } from "@ai-sdk/react";
// import { DefaultChatTransport } from "ai";
import { useAstroStore } from "@/stores/astrowatch";
import MessageBubble from "./MessageBubble";
import { formatToolName } from "@/lib/formatToolName";
import { ChatMessage } from "@/types";

const SUGGESTIONS = [
  "Which direction should I face?",
  "What time is the best pass?",
  "How bright will it be?",
];

export default function ChatPanel() {
  const { location, selectedPass } = useAstroStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const locationRef = useRef(location);
  const selectedPassRef = useRef(selectedPass);
  locationRef.current = location;
  selectedPassRef.current = selectedPass;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function submitMessage() {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await fetch("/api/chat/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          location,
          selectedPass,
        }),
      });

      const data = await resp.json();

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.content,
        toolsUsed: data.toolsUsed ?? [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // const transport = useMemo(
  //   () =>
  //     new DefaultChatTransport({
  //       api: "/api/chat/v2",
  //       body: () => ({
  //         location: locationRef.current,
  //         selectedPass: selectedPassRef.current,
  //       }),
  //     }),
  //   [],
  // );

  // const { messages, sendMessage, status } = useChat({ transport });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //const isLoading = status === "streaming" || status === "submitted";

  // function handleSend() {
  //   const text = input.trim();
  //   if (!text || isLoading) return;
  //   sendMessage({ text });
  //   setInput("");
  // }

  // handles form submit event
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  // handles keyboard shortcut
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        submitMessage();
      }
    }
  }
  return (
    <div
      className="flex flex-col flex-1
      bg-[#0d0d1a] border border-aw-border
      rounded-xl overflow-y-scroll min-h-[300px]"
    >
      <div
        className="flex-1 overflow-y-auto
        p-4 flex flex-col gap-3"
      >
        {/** Empty state */}
        {messages.length === 0 && (
          <div
            className="flex flex-col items-center
            justify-center h-full gap-3 text-center"
          >
            <p className="text-white/20 text-sm">
              Ask anything about selected passes
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-[11px] px-3 py-1.5
                    rounded-full border border-aw-border
                    text-white/30 hover:text-white/60
                    hover:border-white/20 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* message list */}
        {messages.map((msg, i) => (
          <div key={msg.id}>
            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-10 pb-2 items-center text-cyan-400">
                <span className="text-[12px]">Tools used: </span>
                {msg.toolsUsed.map((tool: string) => (
                  <span
                    key={tool}
                    className="text-[12px] font-medium px-2 py-0.5
                    rounded-full bg-aw-purple/10
                    border border-aw-purple/20
                    text-aw-purple/60"
                  >
                    {formatToolName(tool)}
                  </span>
                ))}
              </div>
            )}
            <MessageBubble key={msg.id} msg={msg} />
          </div>
        ))}

        {/* streaming indicator — dots while waiting */}
        {isLoading && (
          <div className="flex gap-1.5 px-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full
                  bg-aw-purple animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
      {/* ── input row ── */}
      <div
        className="border-t border-aw-border
        p-3"
      >
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={
              selectedPass
                ? `Ask about ${selectedPass.satname}...`
                : "Select a pass to get started..."
            }
            className="flex-1 bg-white/5 border
            border-aw-border rounded-lg px-3 py-2
            text-[13px] text-white placeholder:text-white/20
            outline-none focus:border-aw-purple
            transition-colors disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-9 h-9 rounded-lg bg-aw-purple
            flex items-center justify-center text-white
            disabled:opacity-30 disabled:cursor-not-allowed
            hover:opacity-85 transition-opacity"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
