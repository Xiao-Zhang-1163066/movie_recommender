import { useSearchParams } from "react-router-dom";
import type { Tab } from "./types";

export function useActiveTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: Tab =
    searchParams.get("tab") === "watched" ? "watched" : "watchlist";

  function setActiveTab(tab: Tab) {
    setSearchParams({ tab });
  }

  return { activeTab, setActiveTab };
}
