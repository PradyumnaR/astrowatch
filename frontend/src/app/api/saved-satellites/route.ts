import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // service key bypasses RLS
);

// GET — fetch all saved satellites for current user
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("saved_satellites")
      .select("*")
      .eq("clerk_user_id", userId)
      .order("saved_at", { ascending: true });

    if (error) throw error;

    // convert snake_case → camelCase
    const satellites = data.map((row) => ({
      id: row.id,
      noradId: row.norad_id,
      satname: row.sat_name,
      savedAt: row.saved_at,
    }));

    return NextResponse.json(satellites);
  } catch (err) {
    console.error("GET saved satellites error:", err);
    return NextResponse.json(
      { error: "Failed to fetch saved satellites" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { noradId, satname } = await req.json();

    if (!noradId || !satname) {
      return NextResponse.json(
        { error: "noradId and satname required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("saved_satellites")
      .insert({
        clerk_user_id: userId,
        norad_id: noradId,
        sat_name: satname,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      id: data.id,
      noradId: data.norad_id,
      satname: data.sat_name,
      savedAt: data.saved_at,
    });
  } catch (err) {
    console.error("POST saved satellite error:", err);
    return NextResponse.json(
      { error: "Failed to save satellite" },
      { status: 500 },
    );
  }
}
