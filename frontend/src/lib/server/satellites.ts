import { getSupabaseServer } from "./supabase";

export async function getSavedSatelliteCount(userId: string): Promise<number> {
  const supabase = getSupabaseServer();

  const { data } = await supabase
    .from("saved_satellites")
    .select("id")
    .eq("clerk_user_id", userId);

  return data?.length ?? 0;
}

export async function isAtSatelliteLimitServer(
  userId: string,
  limit: number,
): Promise<boolean> {
  const count = await getSavedSatelliteCount(userId);
  return count >= limit;
}
