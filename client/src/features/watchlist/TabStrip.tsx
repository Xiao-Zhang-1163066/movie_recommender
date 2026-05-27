import type { Tab } from "./types";

type Props = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export function TabStrip({ activeTab, onTabChange }: Props) {
  return (
    <div className="flex gap-2 mb-8">
      {(["watchlist", "watched"] as Tab[]).map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className="px-4 py-2 rounded-full text-sm font-semibold transition-colors"
          style={
            activeTab === tab
              ? { background: "var(--lime)", color: "#000" }
              : { background: "var(--chip-bg)", color: "var(--text-2)" }
          }
        >
          {tab === "watchlist" ? "Want to Watch" : "Watched"}
        </button>
      ))}
    </div>
  );
}
