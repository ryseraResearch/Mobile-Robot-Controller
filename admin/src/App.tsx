import { useState } from "react";
import { ConfigTab }      from "./tabs/ConfigTab";
import { LeaderboardTab } from "./tabs/LeaderboardTab";
import { RaceControlTab } from "./tabs/RaceControlTab";
import "./index.css";

type Tab = "leaderboard" | "config" | "race";

const TABS: { id: Tab; label: string }[] = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "config",      label: "Config"      },
  { id: "race",        label: "Race Start"  },
];

export default function App() {
  const [activeTab, setActiveTab]       = useState<Tab>("leaderboard");
  const [pendingRacer, setPendingRacer] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#0A0808] text-[#F0ECEC]">
      <header className="border-b border-[#2E1A1A] bg-[#120C0C] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-0">
          <span className="px-5 py-4 text-sm font-black text-[#FF1744] tracking-widest uppercase shrink-0">
            ROBORACE
          </span>
          <nav className="flex">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={"relative px-5 py-4 text-sm font-medium border-b-2 transition-colors " + (
                  activeTab === t.id
                    ? "border-[#FF1744] text-[#FF1744]"
                    : "border-transparent text-[#5A3A3A] hover:text-[#9A7070]"
                )}
              >
                {t.label}
                {t.id === "race" && pendingRacer && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FF9100] animate-pulse" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto">
        {activeTab === "leaderboard" && <LeaderboardTab />}
        {activeTab === "config"      && <ConfigTab />}
        {activeTab === "race"        && (
          <RaceControlTab
            pendingRacer={pendingRacer}
            onRacerUpdate={setPendingRacer}
          />
        )}
      </main>
    </div>
  );
}
