import CalendarCard from "./_components/CalendarCard";
import CalendarNotice from "./_components/CalendarNotice";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    calendar_connected?: string;
    calendar_error?: string;
  }>;
}) {
  const { calendar_connected, calendar_error } = await searchParams;

  return (
    <div className="h-[calc(100dvh-50px)] overflow-y-auto">
      <div className="max-w-[900px] mx-auto p-6 flex flex-col gap-5">
        {/* header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-[18px] font-medium text-aw-text">Settings</h1>
          <p className="text-[12px] text-aw-text-sec leading-relaxed">
            Connect the accounts AstroWatch AI can act on for you.
          </p>
        </div>

        <CalendarNotice
          connected={calendar_connected === "true"}
          errorCode={calendar_error}
        />

        <CalendarCard />
      </div>
    </div>
  );
}
