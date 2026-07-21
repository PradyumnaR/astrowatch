import { PLAN_LIMITS } from "@/consts";
import { UserPlan } from "@/types";

export function isAtSatelliteLimit(plan: UserPlan, count: number): boolean {
  return count >= PLAN_LIMITS[plan].savedSatellites;
}

export function isAtPassLimit(plan: UserPlan, count: number): boolean {
  return count >= PLAN_LIMITS[plan].watchedPasses;
}
