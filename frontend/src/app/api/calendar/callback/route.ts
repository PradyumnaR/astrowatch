import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/server/supabase";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const cookieState = request.cookies.get("google_oauth_state")?.value;

  if (error) {
    // User clicked "Cancel" on Google's consent screen — not a bug
    return NextResponse.redirect(
      new URL("/dashboard/settings?calendar_error=denied", request.url),
    );
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    // Covers: missing params, expired cookie (>10min), or a genuine
    // CSRF mismatch — all three land here, not distinguished further,
    // since the user-facing action is the same either way (try again).
    return NextResponse.redirect(
      new URL("/dashboard/settings?calendar_error=invalid_state", request.url),
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`;

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Google token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings?calendar_error=exchange_failed",
        request.url,
      ),
    );
  }

  const tokens = await tokenRes.json();
  // shape: { access_token, expires_in, refresh_token?, scope, token_type }

  if (!tokens.refresh_token) {
    // With prompt=consent always set on /connect, this genuinely
    // shouldn't happen — if it does, something's misconfigured
    // upstream (e.g. prompt=consent got dropped), not something to
    // silently proceed without.
    console.error(
      "No refresh_token from Google — check prompt=consent is set in /api/calendar/connect",
    );
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings?calendar_error=no_refresh_token",
        request.url,
      ),
    );
  }

  const supabase = getSupabaseServer();
  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  const { error: dbError } = await supabase.from("google_oauth_tokens").upsert(
    {
      clerk_user_id: userId,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clerk_user_id" },
  );

  if (dbError) {
    console.error("Failed to store Google tokens:", dbError);
    return NextResponse.redirect(
      new URL("/dashboard/settings?calendar_error=storage_failed", request.url),
    );
  }

  const response = NextResponse.redirect(
    new URL("/dashboard/settings?calendar_connected=true", request.url),
  );
  response.cookies.delete("google_oauth_state");
  return response;
}
