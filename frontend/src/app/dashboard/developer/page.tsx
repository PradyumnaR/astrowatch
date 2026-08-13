"use client";

import { useEffect, useMemo, useState } from "react";
import { Server, KeyRound, BarChart3 } from "lucide-react";
import ServerCard from "./_components/ServerCard";
import NewKeyModal from "./_components/NewKeyModal";
import CopyButton from "./_components/CopyButton";
import { MCP_SERVERS, MCP_SERVER_NAMES, mcpEndpoint } from "@/lib/mcp-servers";
import type { McpApiKey, McpServerName } from "@/types";

interface NewKey {
  serverName: McpServerName;
  rawKey: string;
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<McpApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<McpServerName | null>(null);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchKeys() {
      try {
        const res = await fetch("/api/mcp-keys");
        if (!res.ok) throw new Error(`${res.status}`);
        setKeys((await res.json()) as McpApiKey[]);
      } catch (err) {
        console.error("Failed to fetch MCP keys", err);
        setError("Couldn't load your API keys. Refresh to try again.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchKeys();
  }, []);

  const handleGenerate = async (serverName: McpServerName) => {
    setGeneratingFor(serverName);
    setError(null);

    try {
      const res = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverName }),
      });

      if (!res.ok) throw new Error(`${res.status}`);

      const created = (await res.json()) as McpApiKey & { rawKey: string };
      const { rawKey, ...row } = created;

      setKeys((prev) => [row, ...prev]);
      setNewKey({ serverName, rawKey });
    } catch (err) {
      console.error("Failed to generate MCP key", err);
      setError("Couldn't generate a key. Try again in a moment.");
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleRevoke = async (id: string) => {
    setError(null);

    try {
      const res = await fetch(`/api/mcp-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status}`);

      const revokedAt = new Date().toISOString();
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, revokedAt } : k)),
      );
    } catch (err) {
      console.error("Failed to revoke MCP key", err);
      setError("Couldn't revoke that key. Try again in a moment.");
    }
  };

  const keysByServer = useMemo(() => {
    const grouped: Record<McpServerName, McpApiKey[]> = {
      satellite: [],
      weather: [],
      knowledge: [],
    };
    for (const key of keys) grouped[key.serverName]?.push(key);
    return grouped;
  }, [keys]);

  const activeKeyCount = keys.filter((k) => !k.revokedAt).length;

  return (
    <div className="h-[calc(100dvh-50px)] overflow-y-auto">
      <div className="max-w-[900px] mx-auto p-6 flex flex-col gap-5">
        {/* header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-[18px] font-medium text-aw-text">Developer</h1>
          <p className="text-[12px] text-aw-text-sec leading-relaxed">
            Connect Claude Desktop, Cursor, or any MCP client to your AstroWatch
            data. Generate a key per server, then pass it as a bearer token.
          </p>
        </div>

        {error && (
          <div
            className="bg-red-500/10 border border-red-500/25
              rounded-xl px-3 py-2.5 text-[11px] text-red-400"
          >
            {error}
          </div>
        )}

        {/* stats — only counts we can actually derive; usage logging isn't built */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<Server size={13} />}
            label="Servers available"
            value={String(MCP_SERVER_NAMES.length)}
          />
          <StatCard
            icon={<KeyRound size={13} />}
            label="Active keys"
            value={isLoading ? "—" : String(activeKeyCount)}
          />
          <StatCard
            icon={<BarChart3 size={13} />}
            label="Calls this month"
            value="—"
            note="Usage logging not available yet"
          />
        </div>

        {/* server cards */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {MCP_SERVER_NAMES.map((name) => (
              <div
                key={name}
                className="h-[260px] rounded-xl bg-aw-tint animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {MCP_SERVER_NAMES.map((name) => (
              <ServerCard
                key={name}
                server={MCP_SERVERS[name]}
                keys={keysByServer[name]}
                onGenerate={handleGenerate}
                onRevoke={handleRevoke}
                isGenerating={generatingFor === name}
              />
            ))}
          </div>
        )}

        <ConnectSnippet />

        <p className="text-[10px] text-aw-text-muted leading-relaxed pb-2">
          Each key is limited to 30 tool calls per minute. Keys are stored as
          sha256 hashes — we never keep the raw value, so a lost key has to be
          revoked and replaced.
        </p>
      </div>

      {newKey && (
        <NewKeyModal
          serverName={newKey.serverName}
          rawKey={newKey.rawKey}
          onClose={() => setNewKey(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-aw-tint border border-aw-border rounded-xl px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-aw-text-muted">
        {icon}
        <span className="text-[10px] font-medium tracking-widest uppercase">
          {label}
        </span>
      </div>
      <p className="text-[20px] font-medium text-aw-text mt-1.5 leading-none">
        {value}
      </p>
      {note && <p className="text-[10px] text-aw-text-muted mt-1.5">{note}</p>}
    </div>
  );
}

function ConnectSnippet() {
  const config = JSON.stringify(
    {
      mcpServers: Object.fromEntries(
        MCP_SERVER_NAMES.map((name) => [
          MCP_SERVERS[name].serverId,
          {
            url: mcpEndpoint(name),
            headers: { Authorization: `Bearer ${"<your-key>"}` },
          },
        ]),
      ),
    },
    null,
    2,
  );

  return (
    <div className="bg-aw-tint border border-aw-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-medium text-aw-text">
            Connect a client
          </p>
          <p className="text-[11px] text-aw-text-sec">
            Drop this into your MCP client config, swapping in the keys you
            generated above.
          </p>
        </div>
        <CopyButton value={config} label="Copy MCP client config" />
      </div>

      <pre
        className="font-mono text-[10px] leading-relaxed text-aw-text-sec
          bg-aw-tint-hover border border-aw-border rounded-lg
          px-3 py-2.5 overflow-x-auto"
      >
        {config}
      </pre>
    </div>
  );
}
