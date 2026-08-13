"use client";

import { TriangleAlert } from "lucide-react";
import CopyButton from "./CopyButton";
import { MCP_SERVERS } from "@/lib/mcp-servers";
import type { McpServerName } from "@/types";

/**
 * One-time reveal of a freshly minted raw key. Only the sha256 hash was
 * persisted, so once this closes the key is genuinely unrecoverable —
 * hence the deliberately blunt warning and the explicit dismiss button
 * (no click-outside-to-close).
 */
export default function NewKeyModal({
  serverName,
  rawKey,
  onClose,
}: {
  serverName: McpServerName;
  rawKey: string;
  onClose: () => void;
}) {
  const server = MCP_SERVERS[serverName];

  return (
    <>
      {/* backdrop — intentionally not click-to-dismiss */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`New ${server.displayName} API key`}
        className="fixed z-50 top-1/2 left-1/2
          -translate-x-1/2 -translate-y-1/2
          w-[min(560px,calc(100vw-32px))] bg-aw-bg
          border border-aw-border rounded-2xl
          p-6 flex flex-col gap-4 shadow-2xl"
      >
        <div
          className="w-10 h-10 rounded-xl
            bg-aw-amber/10 border border-aw-amber/20
            flex items-center justify-center text-aw-amber"
        >
          <TriangleAlert size={18} />
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-semibold text-aw-text">
            Your {server.displayName} key
          </p>
          <p className="text-[12px] text-aw-text-sec leading-relaxed">
            Copy it now — this is the only time it will ever be shown. We store
            only a hash, so we can&apos;t show it to you again. If you lose it,
            revoke it and generate a new one.
          </p>
        </div>

        <div
          className="flex items-center gap-2
            bg-aw-tint border border-aw-border rounded-xl px-3 py-2.5"
        >
          <code
            className="font-mono text-[11px] text-aw-text
              flex-1 min-w-0 break-all select-all"
          >
            {rawKey}
          </code>
          <CopyButton value={rawKey} label="Copy API key" />
        </div>

        <div className="flex flex-col gap-1.5">
          <p
            className="text-[10px] font-medium tracking-widest
              uppercase text-aw-text-muted"
          >
            Use it as
          </p>
          <code
            className="font-mono text-[11px] text-aw-text-sec
              bg-aw-tint border border-aw-border rounded-xl px-3 py-2 break-all"
          >
            Authorization: Bearer {rawKey.slice(0, 10)}…
          </code>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl
            bg-aw-purple/20 border border-aw-purple/30
            text-[12px] font-medium text-aw-purple
            hover:bg-aw-purple/30 transition-colors cursor-pointer"
        >
          I&apos;ve saved it — close
        </button>
      </div>
    </>
  );
}
