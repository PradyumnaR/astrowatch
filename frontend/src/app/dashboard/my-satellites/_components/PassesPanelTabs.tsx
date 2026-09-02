"use client";

import { useState } from "react";
import PassTable from "./PassesTable";
import PassHistoryTab from "./PassHistoryTab";

type Tab = "upcoming" | "history";

export default function PassesPanelTabs() {
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 p-1 rounded-lg bg-aw-tint border border-aw-border">
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`cursor-pointer flex-1 py-1.5 rounded-md
            text-[11px] font-medium transition-colors
            ${
              activeTab === "upcoming"
                ? "bg-aw-purple/20 text-aw-purple"
                : "text-aw-text-muted hover:text-aw-text-sec"
            }`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`cursor-pointer flex-1 py-1.5 rounded-md
            text-[11px] font-medium transition-colors
            ${
              activeTab === "history"
                ? "bg-aw-purple/20 text-aw-purple"
                : "text-aw-text-muted hover:text-aw-text-sec"
            }`}
        >
          Pass History
        </button>
      </div>
      {activeTab === "upcoming" ? <PassTable /> : <PassHistoryTab />}
    </div>
  );
}
