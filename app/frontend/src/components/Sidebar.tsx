import type { NavigationTabType } from "../types";
import {
  LayoutDashboard,
  PlayCircle,
  Flame,
  Newspaper,
  MessageSquare,
  Tags,
  Globe,
  History,
  Settings,
  Terminal
} from "lucide-react";

interface SidebarProps {
  currentActiveTab: NavigationTabType;
  onSelectTab: (selectedTab: NavigationTabType) => void;
  isLogPanelOpen: boolean;
  onToggleLogPanel: () => void;
}

export function Sidebar(props: SidebarProps) {
  // Define our navigation items with labels and icons
  const navigationItemsList = [
    { id: "dashboard" as NavigationTabType, label: "Dashboard", icon: LayoutDashboard },
    { id: "pipeline" as NavigationTabType, label: "Run Pipeline", icon: PlayCircle },
    { id: "trends" as NavigationTabType, label: "Trending Topics", icon: Flame },
    { id: "headlines" as NavigationTabType, label: "News Headlines", icon: Newspaper },
    { id: "tweets" as NavigationTabType, label: "Extracted Tweets", icon: MessageSquare },
    { id: "keywords" as NavigationTabType, label: "Generated Keywords", icon: Tags },
    { id: "sources" as NavigationTabType, label: "Intel Sources", icon: Globe },
    { id: "history" as NavigationTabType, label: "Run History", icon: History },
  ];

  // We build the navigation elements array using a traditional for loop
  const renderedNavigationButtons = [];
  for (let itemIndex = 0; itemIndex < navigationItemsList.length; itemIndex++) {
    const currentItem = navigationItemsList[itemIndex];
    const isSelected = props.currentActiveTab === currentItem.id;
    const IconComponent = currentItem.icon;

    renderedNavigationButtons.push(
      <button
        key={currentItem.id}
        onClick={function () {
          props.onSelectTab(currentItem.id);
        }}
        className={
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium transition-colors text-left " +
          (isSelected
            ? "bg-zinc-800/90 text-white font-semibold border-l-2 border-accentBlue pl-2.5"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40")
        }
      >
        <IconComponent className={"w-4 h-4 " + (isSelected ? "text-accentBlue" : "text-zinc-400")} />
        <span>{currentItem.label}</span>
      </button>
    );
  }

  const isSettingsSelected = props.currentActiveTab === "settings";

  return (
    <aside className="w-56 bg-zinc-950 border-r border-zinc-800/80 flex flex-col justify-between h-screen select-none">
      {/* Top Header / Brand */}
      <div>
        <div className="p-4 border-b border-zinc-800/80 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow">
            BA
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 tracking-tight leading-none">
              Browser Agent
            </h1>
            <span className="text-[10px] text-zinc-500 font-mono">v1.0 • vLLM + Qwen3</span>
          </div>
        </div>

        {/* Primary Navigation List */}
        <nav className="p-2.5 space-y-1">
          {renderedNavigationButtons}
        </nav>
      </div>

      {/* Bottom Footer Actions: Live Log Toggle & Settings */}
      <div className="p-2.5 border-t border-zinc-800/80 space-y-1">
        <button
          onClick={props.onToggleLogPanel}
          className={
            "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors " +
            (props.isLogPanelOpen
              ? "bg-zinc-800 text-blue-400 font-semibold"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40")
          }
        >
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span>Live Logs</span>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </button>

        <button
          onClick={function () {
            props.onSelectTab("settings");
          }}
          className={
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left " +
            (isSettingsSelected
              ? "bg-zinc-800/90 text-white font-semibold border-l-2 border-accentBlue pl-2.5"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40")
          }
        >
          <Settings className={"w-4 h-4 " + (isSettingsSelected ? "text-accentBlue" : "text-zinc-400")} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
