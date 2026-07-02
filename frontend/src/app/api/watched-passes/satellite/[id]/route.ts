import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

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
    console.log("params=>>", id);

    const { error } = await supabase
      .from("watched_passes")
      .delete()
      .eq("clerk_user_id", userId)
      .eq("norad_id", Number(id));

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE watched passes by satellite error:", err);
    return NextResponse.json(
      { error: "Failed to delete watched passes" },
      { status: 500 },
    );
  }
}
