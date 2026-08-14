import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/server/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("google_oauth_tokens")
    .select("updated_at, scope")
    .eq("clerk_user_id", userId)
    .single();

  return NextResponse.json({
    connected: !!data,
    connectedAt: data?.updated_at ?? null,
  });
}
