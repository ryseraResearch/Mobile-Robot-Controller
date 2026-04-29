import { useState } from "react";
import { ConfigTab }      from "./tabs/ConfigTab";
import { LeaderboardTab } from "./tabs/LeaderboardTab";
import { RaceControlTab } from "./tabs/RaceControlTab";
import "./index.css";

type Tab = "leaderboard" | "config" | "race";

const TABS: { id: Tab; label: string }[] = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "config",      label: "Config"      },
  { id: "race",        label: "Race Control" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("leaderboard");

  return (
    <div className="min-h-screen bg-[#07070f] text-[#eeeeff]">
      <header className="border-b border-[#1e1e3c] bg-[#0e0e1e] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-0">
          <span className="px-5 py-4 text-sm font-bold text-[#00c8ff] tracking-widest uppercase shrink-0">
            Line Follower Admin
          </span>
          <nav className="flex">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={"px-5 py-4 text-sm font-medium border-b-2 transition-colors " + (
                  activeTab === t.id
                    ? "border-[#00c8ff] text-[#00c8ff]"
                    : "border-transparent text-[#4a4a80] hover:text-[#8888bb]"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto">
        {activeTab === "leaderboard" && <LeaderboardTab />}
        {activeTab === "config"      && <ConfigTab />}
        {activeTab === "race"        && <RaceControlTab />}
      </main>
    </div>
  );
}