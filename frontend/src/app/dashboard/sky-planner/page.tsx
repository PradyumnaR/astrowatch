import ChatPanel from "./_components/ChatPanel";
import LocationDetector from "./_components/LocationDetector";
import PassList from "./_components/PassList";
import SkyCanvas from "./_components/SkyCanvas-v2";
import WeatherPanel from "./_components/WeatherPanel";

export default function SkyPlannerPage({}) {
  return (
    <div className="grid grid-cols-[300px_1fr_300px] h-[calc(100vh-50px)]">
      {/* Left sidebar */}
      <aside className="border-r border-aw-border overflow-y-auto p-4">
        <LocationDetector />
        <PassList />
      </aside>

      {/* Main content */}
      <main className="overflow-y-auto p-4 min-w-[300px]">
        <SkyCanvas />
        <ChatPanel />
      </main>

      {/* Right sidebar */}
      <aside className="border-l border-aw-border overflow-y-auto p-4">
        <WeatherPanel />
      </aside>
    </div>
  );
}
