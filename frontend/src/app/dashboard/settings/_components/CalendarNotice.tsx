"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

// The callback route only ever redirects back with one of these codes.
const ERROR_MESSAGES: Record<string, string> = {
  denied:
    "You cancelled on Google's consent screen, so nothing was connected. You can try again whenever you like.",
  invalid_state:
    "That sign-in attempt expired or couldn't be verified. Start the connection again.",
  exchange_failed:
    "Google wouldn't complete the connection. Please try again in a moment.",
  no_refresh_token:
    "Google didn't return the long-lived permission AstroWatch needs. Try connecting again.",
  storage_failed:
    "We connected to Google but couldn't save the permission. Please try again.",
};

const FALLBACK_ERROR =
  "Something went wrong connecting your Google Calendar. Please try again.";

export default function CalendarNotice({
  connected,
  errorCode,
}: {
  connected: boolean;
  errorCode?: string;
}) {
  const router = useRouter();

  if (!connected && !errorCode) return null;

  // Dropping the query params re-renders the page without the banner, so it
  // doesn't survive a refresh or reappear on a later visit.
  const dismiss = () => router.replace("/dashboard/settings");

  const isSuccess = connected && !errorCode;
  const message = isSuccess
    ? "Google Calendar connected. AstroWatch AI can now add passes to your calendar."
    : (errorCode && ERROR_MESSAGES[errorCode]) || FALLBACK_ERROR;

  return (
    <div
      role="status"
      className={[
        "rounded-xl px-3 py-2.5 flex items-start gap-2 text-[11px]",
        isSuccess
          ? "bg-aw-teal/10 border border-aw-teal/25 text-aw-teal"
          : "bg-red-500/10 border border-red-500/25 text-red-400",
      ].join(" ")}
    >
      {isSuccess && <CheckCircle2 size={13} className="flex-shrink-0 mt-px" />}
      <p className="flex-1 leading-relaxed">{message}</p>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 opacity-70 hover:opacity-100
          transition-opacity cursor-pointer"
      >
        <X size={12} />
      </button>
    </div>
  );
}
