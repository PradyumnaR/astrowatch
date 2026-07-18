import ChatPanel from "./_components/ChatPanel";
import LocationDetector from "./_components/LocationDetector";
import PassList from "./_components/PassList";
import RagPanel from "./_components/RagPanel";
import SkyCanvas from "./_components/SkyCanvas-v2";
import WeatherPanel from "./_components/WeatherPanel";

export default function SkyPlannerPage({}) {
  return (
    <div className="grid grid-cols-[300px_1fr_300px] h-[calc(100dvh-50px)]">
      {/* Left sidebar */}
      <aside className="border-r border-aw-border overflow-y-auto p-4">
        <LocationDetector />
        <PassList />
      </aside>

      {/* Main content */}
      <main className="overflow-y-auto p-2 min-w-[300px] flex flex-col gap-2">
        <SkyCanvas />
        <ChatPanel />
      </main>

      {/* Right sidebar */}
      <aside className="border-l border-aw-border overflow-y-auto p-4">
        <WeatherPanel />
        <RagPanel />
      </aside>
    </div>
  );
}
