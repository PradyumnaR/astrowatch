import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/server/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE — revoke a key. Soft delete (revoked_at = now()) so the row
// stays as an audit trail, and so backend/mcp_servers/auth.py keeps
// rejecting the hash rather than losing track of it.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // reject malformed ids before Postgres does — a uuid cast error
    // would otherwise surface as an opaque 500
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const supabase = getSupabaseServer();

    const { data, error } = await supabase
      .from("mcp_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("clerk_user_id", userId) // security — can't revoke someone else's key
      .is("revoked_at", null) // idempotent: don't reset an existing revocation
      .select("id");

    if (error) throw error;

    // no row matched: wrong owner, unknown id, or already revoked.
    // Deliberately not distinguishing these — that would leak whether
    // an id exists on another account.
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE mcp-key error:", err);
    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 },
    );
  }
}
