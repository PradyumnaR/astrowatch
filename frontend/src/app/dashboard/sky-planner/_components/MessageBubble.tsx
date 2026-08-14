import { ChatMessage } from "@/types";
import Markdown from "./Markdown";

export default function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div
      className={`flex gap-2 items-start
          ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* avatar */}
      <div
        className={`w-7 h-7 rounded-full flex-shrink-0
            flex items-center justify-center
            text-[10px] font-semibold mt-0.5
            ${
              isUser
                ? "bg-aw-tint text-aw-text-muted"
                : "bg-aw-purple/20 text-aw-purple border border-aw-purple/25"
            }`}
      >
        {isUser ? "User" : "AI"}
      </div>

      {/* bubble */}
      <div
        className={`max-w-[82%] px-3 py-2.5
            rounded-2xl text-[13px] leading-relaxed
            ${
              isUser
                ? "bg-aw-purple/15 text-aw-purple border border-aw-purple/20"
                : "bg-aw-tint text-aw-text-sec border border-aw-border"
            }`}
      >
        {isUser ? <span>{msg.content}</span> : <Markdown text={msg.content} />}
      </div>
    </div>
  );
}
