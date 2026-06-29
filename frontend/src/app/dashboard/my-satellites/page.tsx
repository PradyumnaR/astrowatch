"use client";

import { useAstroStore } from "@/stores/astrowatch";
import SidebarTabs from "./_components/SidebarTabs";
import { useEffect } from "react";
import { SavedSatellite } from "@/types";
import PassTable from "./_components/PassesTable";
import WeeklyHighlights from "./_components/WeeklyHighlights";

export default function MySatellitesPage({}) {
  const { setSavedSatellites, setLoadingSaved } = useAstroStore();

  useEffect(() => {
    async function fetchSavedSatellites() {
      setLoadingSaved(true);

      try {
        const res = await fetch("/api/saved-satellites");
        const data = (await res.json()) as SavedSatellite[];

        setSavedSatellites(data);
      } catch (err) {
        console.log("Failed to fetch saved satellites", err);
      } finally {
        setLoadingSaved(false);
      }
    }

    fetchSavedSatellites();
  }, []);

  return (
    <div className="grid grid-cols-[300px_1fr_300px] h-[calc(100vh-50px)]">
      <aside className="border-r border-aw-border overflow-y-auto p-4">
        <SidebarTabs />
      </aside>
      {/* main */}
      <main className="overflow-y-auto p-4">
        <PassTable />
      </main>

      {/* right sidebar */}
      <aside
        className="border-l border-aw-border
        overflow-y-auto p-4"
      >
        <WeeklyHighlights />
      </aside>
    </div>
  );
}
