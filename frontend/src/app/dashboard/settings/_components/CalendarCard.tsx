"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink } from "lucide-react";

interface CalendarStatus {
  connected: boolean;
  connectedAt: string | null;
}

export default function CalendarCard() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/calendar/status");
        if (!res.ok) throw new Error(`${res.status}`);
        setStatus((await res.json()) as CalendarStatus);
      } catch (err) {
        console.error("Failed to fetch calendar status", err);
        setError("Couldn't check your calendar connection. Refresh to retry.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchStatus();
  }, []);

  if (isLoading) {
    return <div className="h-[150px] rounded-xl bg-aw-tint animate-pulse" />;
  }

  const connected = status?.connected ?? false;

  return (
    <div className="bg-aw-tint border border-aw-border rounded-xl p-4 flex flex-col gap-4">
      {/* header */}
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex-shrink-0
            bg-aw-purple/15 border border-aw-purple/25
            flex items-center justify-center text-aw-purple"
        >
          <CalendarDays size={15} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium text-aw-text truncate">
              Google Calendar
            </p>
            {connected ? (
              <span
                className="flex-shrink-0 flex items-center gap-1.5
                  px-2 py-0.5 rounded-full
                  bg-aw-teal/10 border border-aw-teal/25
                  text-[10px] font-medium text-aw-teal"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-aw-teal" />
                Connected
              </span>
            ) : (
              <span
                className="flex-shrink-0 flex items-center gap-1.5
                  px-2 py-0.5 rounded-full
                  bg-aw-tint-hover border border-aw-border
                  text-[10px] font-medium text-aw-text-muted"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-aw-text-muted" />
                Not connected
              </span>
            )}
          </div>
          <p className="text-[11px] text-aw-text-sec mt-1 leading-relaxed">
            Let AstroWatch AI add satellite passes to your calendar when you ask
            it to — so a good pass shows up next to the rest of your evening.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="bg-red-500/10 border border-red-500/25
            rounded-lg px-3 py-2 text-[11px] text-red-400"
        >
          {error}
        </div>
      )}

      {connected ? (
        <div
          className="flex items-center justify-between gap-2
            bg-aw-tint-hover border border-aw-border rounded-lg px-2.5 py-2"
        >
          <p className="text-[10px] text-aw-text-muted">
            {status?.connectedAt
              ? `Connected ${new Date(status.connectedAt).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric", year: "numeric" },
                )}`
              : "Connected"}
          </p>
          {/* A full page navigation, not a fetch — /connect redirects to Google. */}
          <a
            href="/api/calendar/connect"
            className="flex-shrink-0 text-[10px] font-medium
              text-aw-purple hover:text-aw-purple/80
              transition-colors cursor-pointer"
          >
            Reconnect
          </a>
        </div>
      ) : (
        <a
          href="/api/calendar/connect"
          className="w-full py-2 rounded-lg
            bg-aw-purple/15 border border-aw-purple/25
            text-[11px] font-medium text-aw-purple
            hover:bg-aw-purple/25 transition-colors cursor-pointer
            flex items-center justify-center gap-1.5"
        >
          <ExternalLink size={12} />
          Connect Google Calendar
        </a>
      )}

      <p className="text-[10px] text-aw-text-muted leading-relaxed">
        You&apos;ll be sent to Google to approve access. AstroWatch only reads
        your calendar list and free/busy times, and only writes the events you
        ask it to create.
      </p>
    </div>
  );
}
