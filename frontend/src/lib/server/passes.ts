import { getSupabaseServer } from "./supabase";

export async function getWatchedPassCount(userId: string): Promise<number> {
  const supabase = getSupabaseServer();

  // only count future passes
  const now = Math.floor(Date.now() / 1000);

  const { data } = await supabase
    .from("watched_passes")
    .select("id")
    .eq("clerk_user_id", userId)
    .gt("start_utc", now);

  return data?.length ?? 0;
}

export async function isAtPassLimitServer(
  userId: string,
  limit: number,
): Promise<boolean> {
  const count = await getWatchedPassCount(userId);
  return count >= limit;
}
