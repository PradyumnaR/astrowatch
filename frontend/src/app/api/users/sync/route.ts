import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // get full user details from Clerk
    // currentUser() gives email, name etc.
    // no extra Clerk dashboard config needed
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const email = user.emailAddresses[0]?.emailAddress ?? null;
    const first_name = user.firstName ?? null;
    const last_name = user.lastName ?? null;

    const { data: existing } = await supabase
      .from("users")
      .select("id, login_count")
      .eq("clerk_user_id", userId)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("users")
        .update({
          last_login_at: new Date().toISOString(),
          login_count: (existing.login_count ?? 0) + 1,
          email,
          first_name,
          last_name,
        })
        .eq("clerk_user_id", userId);

      if (error) throw error;

      return NextResponse.json({
        status: "updated",
        login_count: (existing.login_count ?? 0) + 1,
      });
    } else {
      const { error } = await supabase.from("users").insert({
        last_login_at: new Date().toISOString(),
        login_count: 1,
        email,
        first_name,
        last_name,
        clerk_user_id: userId,
      });

      if (error) throw error;

      return NextResponse.json({
        status: "created",
        login_count: 1,
      });
    }
  } catch (err) {
    console.error("User sync error:", err);
    return NextResponse.json({ error: "Failed to sync user" }, { status: 500 });
  }
}
