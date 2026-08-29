"use client";

import { useState } from "react";
import SkyCanvas from "./SkyCanvas-v2";
import RealtimePointer from "./RealtimePointer";

type Tab = "sky-map" | "pointer";

export default function SkyPlannerTabs() {
  const [activeTab, setActiveTab] = useState<Tab>("sky-map");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 p-1 rounded-lg bg-aw-tint border border-aw-border">
        <button
          onClick={() => setActiveTab("sky-map")}
          className={`cursor-pointer flex-1 py-1.5 rounded-md
            text-[11px] font-medium transition-colors
            ${
              activeTab === "sky-map"
                ? "bg-aw-purple/20 text-aw-purple"
                : "text-aw-text-muted hover:text-aw-text-sec"
            }`}
        >
          Sky Map
        </button>
        <button
          onClick={() => setActiveTab("pointer")}
          className={`cursor-pointer flex-1 py-1.5 rounded-md
            text-[11px] font-medium transition-colors
            ${
              activeTab === "pointer"
                ? "bg-aw-purple/20 text-aw-purple"
                : "text-aw-text-muted hover:text-aw-text-sec"
            }`}
        >
          Point to Satellite
        </button>
      </div>
      {activeTab === "sky-map" ? <SkyCanvas /> : <RealtimePointer />}
    </div>
  );
}
