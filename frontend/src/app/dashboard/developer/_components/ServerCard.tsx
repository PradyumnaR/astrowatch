"use client";

import { useState } from "react";
import { BookOpen, CloudSun, Plus, Satellite, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import CopyButton from "./CopyButton";
import { keyPrefix, mcpEndpoint, type McpServerMeta } from "@/lib/mcp-servers";
import type { McpApiKey, McpServerName } from "@/types";

const ICONS: Record<McpServerName, LucideIcon> = {
  satellite: Satellite,
  weather: CloudSun,
  knowledge: BookOpen,
};

export default function ServerCard({
  server,
  keys,
  onGenerate,
  onRevoke,
  isGenerating,
}: {
  server: McpServerMeta;
  /** every key for this server, active and revoked, newest first */
  keys: McpApiKey[];
  onGenerate: (serverName: McpServerName) => void;
  onRevoke: (id: string) => Promise<void>;
  isGenerating: boolean;
}) {
  const Icon = ICONS[server.name];
  const endpoint = mcpEndpoint(server.name);

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedCount = keys.length - activeKeys.length;

  return (
    <div className="bg-aw-tint border border-aw-border rounded-xl p-4 flex flex-col gap-4">
      {/* header */}
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex-shrink-0
            bg-aw-purple/15 border border-aw-purple/25
            flex items-center justify-center text-aw-purple"
        >
          <Icon size={15} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium text-aw-text truncate">
              {server.serverId}
            </p>
            <span
              className="flex-shrink-0 flex items-center gap-1.5
                px-2 py-0.5 rounded-full
                bg-aw-teal/10 border border-aw-teal/25
                text-[10px] font-medium text-aw-teal"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-aw-teal" />
              Active
            </span>
          </div>
          <p className="text-[11px] text-aw-text-sec mt-1 leading-relaxed">
            {server.blurb}
          </p>
        </div>
      </div>

      {/* tools */}
      <div className="flex flex-col gap-1.5">
        <p
          className="text-[10px] font-medium tracking-widest
            uppercase text-aw-text-muted"
        >
          Tools
        </p>
        <div className="flex flex-wrap gap-1.5">
          {server.tools.map((tool) => (
            <span
              key={tool}
              className="font-mono text-[10px] text-aw-text-sec
                bg-aw-tint-hover border border-aw-border
                rounded-md px-1.5 py-0.5"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>

      {/* endpoint */}
      <div className="flex flex-col gap-1.5">
        <p
          className="text-[10px] font-medium tracking-widest
            uppercase text-aw-text-muted"
        >
          Endpoint
        </p>
        <div
          className="flex items-center gap-2
            bg-aw-tint-hover border border-aw-border rounded-lg px-2.5 py-1.5"
        >
          <code className="font-mono text-[10px] text-aw-text-sec flex-1 min-w-0 break-all">
            {endpoint}
          </code>
          <CopyButton
            value={endpoint}
            label={`Copy ${server.displayName} endpoint`}
          />
        </div>
      </div>

      {/* keys */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p
            className="text-[10px] font-medium tracking-widest
              uppercase text-aw-text-muted"
          >
            API keys
            {activeKeys.length > 0 && ` · ${activeKeys.length} active`}
          </p>

          {activeKeys.length > 0 && (
            <button
              onClick={() => onGenerate(server.name)}
              disabled={isGenerating}
              className="flex items-center gap-1 text-[10px] font-medium
                text-aw-purple hover:text-aw-purple/80
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors cursor-pointer"
            >
              <Plus size={11} />
              New key
            </button>
          )}
        </div>

        {activeKeys.length === 0 ? (
          <button
            onClick={() => onGenerate(server.name)}
            disabled={isGenerating}
            className="w-full py-2 rounded-lg
              bg-aw-purple/15 border border-aw-purple/25
              text-[11px] font-medium text-aw-purple
              hover:bg-aw-purple/25
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors cursor-pointer
              flex items-center justify-center gap-1.5"
          >
            <Plus size={12} />
            {isGenerating ? "Generating…" : "Generate key"}
          </button>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activeKeys.map((key) => (
              <KeyRow
                key={key.id}
                apiKey={key}
                serverName={server.name}
                onRevoke={onRevoke}
              />
            ))}
          </div>
        )}

        {revokedCount > 0 && (
          <p className="text-[10px] text-aw-text-muted mt-0.5">
            {revokedCount} revoked key{revokedCount === 1 ? "" : "s"} retained
            for audit
          </p>
        )}
      </div>
    </div>
  );
}

function KeyRow({
  apiKey,
  serverName,
  onRevoke,
}: {
  apiKey: McpApiKey;
  serverName: McpServerName;
  onRevoke: (id: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  const handleRevoke = async () => {
    setIsRevoking(true);
    try {
      await onRevoke(apiKey.id);
    } finally {
      setIsRevoking(false);
      setConfirming(false);
    }
  };

  // We store only the hash, so there is no real tail to reveal — the mask
  // is the whole key body, not a partial fingerprint.
  const masked = `${keyPrefix(serverName)}${"•".repeat(16)}`;

  return (
    <div
      className="flex items-center gap-2
        bg-aw-tint-hover border border-aw-border rounded-lg px-2.5 py-2"
    >
      <div className="flex-1 min-w-0">
        <code className="font-mono text-[11px] text-aw-text-sec">{masked}</code>
        <p className="text-[10px] text-aw-text-muted mt-0.5 truncate">
          {apiKey.label ? `${apiKey.label} · ` : ""}
          created{" "}
          {new Date(apiKey.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {confirming ? (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleRevoke}
            disabled={isRevoking}
            className="h-7 px-2.5 rounded-lg text-[10px] font-medium
              bg-red-500/15 border border-red-500/30 text-red-400
              hover:bg-red-500/25 disabled:opacity-50
              transition-colors cursor-pointer"
          >
            {isRevoking ? "Revoking…" : "Confirm"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isRevoking}
            aria-label="Cancel revoke"
            className="text-aw-text-muted hover:text-aw-text
              transition-colors p-1 cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex-shrink-0 h-7 px-2.5 rounded-lg
            border border-aw-border text-[10px] font-medium
            text-aw-text-muted hover:text-red-400 hover:border-red-500/30
            transition-colors cursor-pointer"
        >
          Revoke
        </button>
      )}
    </div>
  );
}
