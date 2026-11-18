"use client";

import { useRef, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConversation } from "@/hooks/useConversation";
// import { useChat } from "@ai-sdk/react";
// import { DefaultChatTransport } from "ai";
import { useAstroStore } from "@/stores/astrowatch";
import MessageBubble from "./MessageBubble";
import { formatToolName } from "@/lib/formatToolName";
import { ChatMessage, ChatHistoryResponse, Elicitation } from "@/types";

const SUGGESTIONS = [
  "Which direction should I face?",
  "What time is the best pass?",
  "How bright will it be?",
];

export default function ChatPanel() {
  const { location, selectedPass } = useAstroStore();
  const { userId } = useAuth();
  const { conversationId, startNewConversation } = useConversation(userId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const locationRef = useRef(location);
  const selectedPassRef = useRef(selectedPass);
  locationRef.current = location;
  selectedPassRef.current = selectedPass;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // isLoading: loading dots before the first token arrives.
  // isBusy: the whole request, until the stream finishes. Blocks a second
  // send mid-stream, which would race on the same saved conversation.
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null); // NEW
  const [elicitation, setElicitation] = useState<Elicitation | null>(null);

  // Answers a paused calendar confirmation. Sends the button's VALUE (a
  // calendar id, "confirm" or "cancel"), not its label: the backend
  // continues the paused graph with it — no new chat message, no
  // classifier guessing what "yes" meant.
  async function resumeWithChoice(option: { label: string; value: string }) {
    if (isBusy || !conversationId) return;

    setElicitation(null);
    setIsBusy(true);
    setIsLoading(true);
    setStatusMessage("Working on it...");

    const assistantId = Date.now().toString();

    try {
      const resp = await fetch("/api/chat/v2/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, choice: option.value }),
      });
      await readEventStream(resp, assistantId);
    } catch (err) {
      console.error("Resume error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsBusy(false);
      setIsLoading(false);
      setStatusMessage(null);
    }
  }

  // Reads an SSE response from /api/chat/v2 or /api/chat/v2/resume and
  // applies its events to the chat. Both endpoints stream the same events.
  async function readEventStream(resp: Response, assistantId: string) {
    if (!resp.body) throw new Error("No response body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantStarted = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6));

        if (event.type === "status") {
          setStatusMessage(event.message);
        } else if (event.type === "token") {
          if (!assistantStarted) {
            assistantStarted = true;
            setIsLoading(false);
            setStatusMessage(null);
            setMessages((prev) => [
              ...prev,
              { id: assistantId, role: "assistant", content: event.text },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + event.text }
                  : m,
              ),
            );
          }
        } else if (event.type === "error") {
          setIsLoading(false);
          setStatusMessage(null);
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "assistant", content: event.message },
          ]);
        } else if (event.type === "elicitation") {
          setIsLoading(false);
          setStatusMessage(null);
          setElicitation({
            kind: event.kind,
            question: event.question,
            options: event.options,
          });
        } else if (event.type === "final") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, toolsUsed: event.toolsUsed ?? [] }
                : m,
            ),
          );
        }
      }
    }
  }

  async function submitMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || isBusy || !conversationId) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setElicitation(null);
    setIsBusy(true);
    setIsLoading(true);
    setStatusMessage("Understanding your question...");

    const assistantId = (Date.now() + 1).toString();

    try {
      const resp = await fetch("/api/chat/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId,
          location,
          selectedPass,
        }),
      });
      await readEventStream(resp, assistantId);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsBusy(false);
      setIsLoading(false);
      setStatusMessage(null);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, elicitation]);

  // Load the saved conversation whenever the conversation changes
  // (first load, reload, or "New chat").
  useEffect(() => {
    if (!conversationId) return;

    const controller = new AbortController();
    setMessages([]);
    setElicitation(null);
    setHistoryLoading(true);

    fetch(`/api/chat/v2/history?conversationId=${conversationId}`, {
      signal: controller.signal,
    })
      .then((resp): Promise<ChatHistoryResponse> | ChatHistoryResponse =>
        resp.ok
          ? (resp.json() as Promise<ChatHistoryResponse>)
          : { conversationId, messages: [], pendingConfirmation: null },
      )
      .then((data) => {
        setMessages(
          data.messages.map((m, i) => ({
            id: `${conversationId}-${i}`,
            role: m.role,
            content: m.content,
          })),
        );
        // Paused on a calendar confirmation: show the card again
        setElicitation(data.pendingConfirmation ?? null);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("History error:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });

    // If the conversation changes before this finishes, ignore the old result
    return () => controller.abort();
  }, [conversationId]);

  const inputDisabled = isBusy || historyLoading || !conversationId;

  // handles form submit event
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  // handles keyboard shortcut
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!inputDisabled && input.trim()) {
        submitMessage();
      }
    }
  }

  return (
    <div
      className="flex flex-col flex-1
      bg-aw-bg border border-aw-border
      rounded-xl overflow-y-scroll min-h-[300px]"
    >
      {/* header — only once there's something to start over from */}
      {messages.length > 0 && (
        <div className="flex justify-end border-b border-aw-border px-3 py-2">
          <button
            onClick={startNewConversation}
            disabled={isBusy}
            className="text-[11px] px-3 py-1 rounded-full
              border border-aw-border text-aw-text-muted
              hover:text-aw-text-sec transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            New chat
          </button>
        </div>
      )}
      <div
        className="flex-1 overflow-y-auto
        p-4 flex flex-col gap-3"
      >
        {/** Empty state */}
        {messages.length === 0 && !historyLoading && (
          <div
            className="flex flex-col items-center
            justify-center h-full gap-3 text-center"
          >
            <p className="text-aw-text-muted text-sm">
              Ask anything about selected passes
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-[11px] px-3 py-1.5
                    rounded-full border border-aw-border
                    text-aw-text-muted hover:text-aw-text-sec
                    hover:border-aw-border transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* message list */}
        {messages.map((msg) => (
          <div key={msg.id}>
            <MessageBubble msg={msg} />
            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-10 pt-2 items-center text-cyan-400">
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
          </div>
        ))}

        {/* elicitation confirmation card */}
        {elicitation && (
          <div className="rounded-xl border border-aw-border bg-aw-tint p-3 flex flex-col gap-2">
            <p className="text-[13px] text-aw-text">{elicitation.question}</p>
            <div className="flex flex-col gap-1.5">
              {elicitation.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => resumeWithChoice(opt)}
                  disabled={isBusy}
                  className="text-left text-[13px] px-3 py-2 rounded-lg
                  border border-aw-border hover:border-aw-purple
                  hover:bg-aw-purple/5 transition-colors
                  disabled:opacity-40"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* streaming indicator — dots + live status while waiting */}
        {isLoading && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full
            bg-aw-purple animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            {statusMessage && (
              <span className="text-[11px] text-aw-text-muted">
                {statusMessage}
              </span>
            )}
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
            disabled={inputDisabled}
            maxLength={4000}
            placeholder={
              selectedPass
                ? `Ask about ${selectedPass.satname}...`
                : "Select a pass to get started..."
            }
            className="flex-1 bg-aw-tint border
            border-aw-border rounded-lg px-3 py-2
            text-[13px] text-aw-text placeholder:text-aw-text-muted
            outline-none focus:border-aw-purple
            transition-colors disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || inputDisabled}
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
