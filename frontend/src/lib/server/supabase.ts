import { createClient } from "@supabase/supabase-js";

// singleton Supabase client for API routes
// uses service key — server only, never expose to browser
export function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}
