"use client";
import { useState } from "react";
import BrowseTab from "./BrowseTab";
import MySatellitesTab from "./MySatellitesTab";

type Tab = "browse" | "my-satellites";

export default function SidebarTabs() {
  const [activeTab, setActiveTab] = useState<Tab>("browse");

  return (
    <div className="flex flex-col gap-3 h-full">
      {/**Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04] border border-aw-border">
        <button
          onClick={() => setActiveTab("browse")}
          className={`flex-1 py-1.5 rounded-md
            text-[11px] font-medium transition-colors
            ${
              activeTab === "browse"
                ? "bg-aw-purple/20 text-aw-purple"
                : "text-white/30 hover:text-white/60"
            }`}
        >
          Browse
        </button>
        <button
          onClick={() => setActiveTab("my-satellites")}
          className={`flex-1 py-1.5 rounded-md
            text-[11px] font-medium transition-colors
            ${
              activeTab === "my-satellites"
                ? "bg-aw-purple/20 text-aw-purple"
                : "text-white/30 hover:text-white/60"
            }`}
        >
          My satellites
        </button>
      </div>
      {/* tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "browse" ? <BrowseTab /> : <MySatellitesTab />}
      </div>
    </div>
  );
}
