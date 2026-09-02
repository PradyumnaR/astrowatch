import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { getUserLimits } from "@/lib/server/user";
import { isAtPassLimitServer } from "@/lib/server/passes";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // scope=past → Pass History tab (completed passes only, most recent
    // first). Default (no param) → the existing upcoming-passes behavior,
    // unchanged, used by PassesTable's ★-badge lookup and the Sky Planner
    // "My passes" tab.
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope");

    const { data, error } = await supabase
      .from("watched_passes")
      .select("*")
      .eq("clerk_user_id", userId)
      .order("start_utc", { ascending: scope !== "past" });

    if (error) throw error;

    const nowSec = Math.floor(Date.now() / 1000);
    const filtered =
      scope === "past"
        ? data.filter((p) => p.start_utc <= nowSec)
        : // auto filter out past passes which are more than 1 hour old —
          // 1 hour from now, to avoid showing passes about to start/that
          // just started as still "upcoming"
          data.filter((p) => p.start_utc > nowSec + 3600);

    // map snake_case → camelCase
    const passes = filtered.map((row) => ({
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

    // get plan + limits in one call
    const { passLimit } = await getUserLimits(userId);
    // check limit
    const atLimit = await isAtPassLimitServer(userId, passLimit);

    if (atLimit) {
      return NextResponse.json(
        {
          error: "limit_reached",
          message: `You have reached the ${passLimit} pass limit.`,
        },
        { status: 403 },
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
