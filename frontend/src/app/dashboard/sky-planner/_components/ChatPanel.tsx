"use client";

import { useRef, useEffect, useMemo, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useAstroStore } from "@/stores/astrowatch";
import MessageBubble from "./MessageBubble";

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

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          location: locationRef.current,
          selectedPass: selectedPassRef.current,
        }),
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({ transport });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isLoading = status === "streaming" || status === "submitted";

  function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className="flex flex-col flex-1
      bg-[#0d0d1a] border border-aw-border
      rounded-xl overflow-hidden min-h-[320px]"
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
              Ask anything about tonight's passes
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
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* streaming indicator — dots while waiting */}
        {status === "submitted" && (
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
        p-3 flex gap-2 items-center"
      >
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
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="w-9 h-9 rounded-lg bg-aw-purple
            flex items-center justify-center text-white
            disabled:opacity-30 disabled:cursor-not-allowed
            hover:opacity-85 transition-opacity"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
