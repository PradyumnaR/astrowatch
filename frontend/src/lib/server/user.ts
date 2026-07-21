import { getSupabaseServer } from "./supabase";
import { PLAN_LIMITS } from "@/consts";
import { type UserPlan } from "@/types";

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const supabase = getSupabaseServer();

  const { data } = await supabase
    .from("users")
    .select("plan")
    .eq("clerk_user_id", userId)
    .single();

  return (data?.plan as UserPlan) ?? "standard";
}

export async function getUserLimits(userId: string): Promise<{
  plan: UserPlan;
  satelliteLimit: number;
  passLimit: number;
}> {
  const plan = await getUserPlan(userId);

  return {
    plan,
    satelliteLimit: PLAN_LIMITS[plan].savedSatellites,
    passLimit: PLAN_LIMITS[plan].watchedPasses,
  };
}
