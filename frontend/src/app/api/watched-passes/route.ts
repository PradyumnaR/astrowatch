import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

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
      .from("watched_passes")
      .select("*")
      .eq("clerk_user_id", userId)
      .order("start_utc", { ascending: true });

    if (error) throw error;

    const now = Math.floor(Date.now() / 1000);
    const future = data.filter((p) => p.start_utc > now);

    // map snake_case → camelCase
    const passes = future.map((row) => ({
      id: row.id,
      noradId: row.norad_id,
      satname: row.sat_name,
      startUTC: row.start_utc,
      passData: row.pass_data,
      savedAt: row.saved_at,
    }));

    return NextResponse.json(passes);
  } catch (err) {
    console.error("GET watched passes error:", err);
    return NextResponse.json(
      { error: "Failed to fetch watched passes" },
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

    const { noradId, satname, startUTC, passData } = await req.json();

    if (!noradId || !satname || !startUTC || !passData) {
      return NextResponse.json(
        { error: "noradId, satname, startUTC, passData required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("watched_passes")
      .insert({
        clerk_user_id: userId,
        norad_id: noradId,
        sat_name: satname,
        start_utc: startUTC,
        pass_data: passData,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      id: data.id,
      noradId: data.norad_id,
      satname: data.sat_name,
      startUTC: data.start_utc,
      passData: data.pass_data,
      savedAt: data.saved_at,
    });
  } catch (err) {
    console.log("Faile to save pass", err);
    return NextResponse.json(
      { error: "Failed to save watched pass" },
      { status: 500 },
    );
  }
}
