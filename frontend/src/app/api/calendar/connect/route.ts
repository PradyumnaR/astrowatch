import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// calendar.events for creating pass reminders, calendar.readonly so the
// elicitation step (Day 6) can list which calendars the user has, rather
// than guessing at "primary".
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events", // ← add back — this is the write scope
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Random CSRF nonce — deliberately NOT the userId itself. Verified
  // against a cookie in the callback route. Using userId directly here
  // would let an attacker link their own Google account to a victim's
  // AstroWatch session by tricking them into visiting a crafted callback
  // URL with state=<victim's userId>.
  const state = randomBytes(16).toString("hex");

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline", // required to get a refresh_token back at all
    prompt: "consent", // forces the consent screen even on re-auth, which
    // is what guarantees Google actually sends a refresh_token — it's
    // normally omitted on a repeat authorization without this.
    state,
  });

  const response = NextResponse.redirect(
    `${GOOGLE_AUTH_URL}?${params.toString()}`,
  );

  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes — plenty for a user to complete the consent screen
    path: "/",
  });

  return response;
}
