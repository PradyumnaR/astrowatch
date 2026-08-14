import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/server/supabase";
import { isMcpServerName, keyPrefix } from "@/lib/mcp-servers";
import type { McpApiKey, McpServerName } from "@/types";

interface KeyRow {
  id: string;
  server_name: McpServerName;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
}

function toApiKey(row: KeyRow): McpApiKey {
  return {
    id: row.id,
    serverName: row.server_name,
    label: row.label,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

// GET — all MCP keys for the current user, across all three servers.
// Never returns the raw key (we only ever persisted its sha256 hash).
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseServer();

    const { data, error } = await supabase
      .from("mcp_api_keys")
      .select("id, server_name, label, created_at, revoked_at")
      .eq("clerk_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json((data as KeyRow[]).map(toApiKey));
  } catch (err) {
    console.error("GET mcp-keys error:", err);
    return NextResponse.json(
      { error: "Failed to fetch API keys" },
      { status: 500 },
    );
  }
}

// POST — mint a new key for one server. The raw key is returned exactly
// once, here; only its hash is stored, so it can never be retrieved again.
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const serverName = (body as { serverName?: unknown } | null)?.serverName;

    if (!isMcpServerName(serverName)) {
      return NextResponse.json(
        { error: "serverName must be one of: satellite, weather, knowledge" },
        { status: 400 },
      );
    }

    const rawLabel = (body as { label?: unknown }).label;
    const label =
      typeof rawLabel === "string" && rawLabel.trim()
        ? rawLabel.trim().slice(0, 60)
        : null;

    // sk-aw-<3 letters>-<32 hex chars>
    const rawKey = `${keyPrefix(serverName)}${crypto.randomBytes(16).toString("hex")}`;

    // Plain sha256 hex, no salt — must match
    // hashlib.sha256(raw_key.encode()).hexdigest() in
    // backend/mcp_servers/auth.py, which is what validates keys at
    // request time. Do not add a salt or change the algorithm.
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const supabase = getSupabaseServer();

    const { data, error } = await supabase
      .from("mcp_api_keys")
      .insert({
        clerk_user_id: userId,
        server_name: serverName,
        key_hash: keyHash,
        label,
      })
      .select("id, server_name, label, created_at, revoked_at")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ...toApiKey(data as KeyRow),
      // shown once, never again
      rawKey,
    });
  } catch (err) {
    console.error("POST mcp-keys error:", err);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 },
    );
  }
}
