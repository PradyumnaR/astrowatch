import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("users")
      .select("plan, email, first_name, login_count")
      .eq("clerk_user_id", userId)
      .single();

    if (error || !data) {
      // user not synced yet → default standard
      return NextResponse.json({ plan: "standard" });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("GET user error:", err);
    return NextResponse.json(
      { plan: "standard" }, // safe default
      { status: 200 },
    );
  }
}
