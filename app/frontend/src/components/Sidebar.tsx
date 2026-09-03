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
  activeSourcesCount: number;
}

export function Sidebar(props: SidebarProps) {
  // Navigation groups inspired by premium Linear/Vercel design
  const navigationGroups = [
    {
      heading: "Overview",
      items: [
        { id: "dashboard" as NavigationTabType, label: "Dashboard", icon: LayoutDashboard },
        { id: "pipeline" as NavigationTabType, label: "Run Pipeline", icon: PlayCircle },
      ]
    },
    {
      heading: "Intelligence",
      items: [
        { id: "trends" as NavigationTabType, label: "Trending Topics", icon: Flame },
        { id: "headlines" as NavigationTabType, label: "News Headlines", icon: Newspaper },
        { id: "tweets" as NavigationTabType, label: "Extracted Tweets", icon: MessageSquare },
        { id: "keywords" as NavigationTabType, label: "Keywords", icon: Tags },
      ]
    },
    {
      heading: "System",
      items: [
        { 
          id: "sources" as NavigationTabType, 
          label: "Sources", 
          icon: Globe,
          badge: props.activeSourcesCount > 0 ? String(props.activeSourcesCount) : undefined
        },
        { id: "history" as NavigationTabType, label: "History", icon: History },
        { id: "settings" as NavigationTabType, label: "Settings", icon: Settings },
      ]
    }
  ];

  // Render navigation elements using a traditional for loop (avoiding functional .map())
  const renderedNavGroups = [];
  for (let groupIndex = 0; groupIndex < navigationGroups.length; groupIndex++) {
    const currentGroup = navigationGroups[groupIndex];
    const groupItems = currentGroup.items;

    const renderedItemsInGroup = [];
    for (let itemIndex = 0; itemIndex < groupItems.length; itemIndex++) {
      const navItem = groupItems[itemIndex];
      const isSelected = props.currentActiveTab === navItem.id;
      const IconComponent = navItem.icon;

      renderedItemsInGroup.push(
        <button
          key={navItem.id}
          onClick={function () {
            props.onSelectTab(navItem.id);
          }}
          className={
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 select-none group text-left " +
            (isSelected
              ? "bg-white/10 text-white font-medium shadow-sm"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5")
          }
        >
          <div className="flex items-center gap-2.5">
            <IconComponent
              className={
                "w-4 h-4 transition-colors duration-200 " +
                (isSelected ? "text-blue-400" : "text-zinc-400 group-hover:text-zinc-200")
              }
              strokeWidth={1.75}
            />
            <span className="tracking-tight">{navItem.label}</span>
          </div>

          {navItem.badge && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-400 font-semibold">
              {navItem.badge}
            </span>
          )}
        </button>
      );
    }

    renderedNavGroups.push(
      <div key={currentGroup.heading} className="flex flex-col gap-0.5">
        <span className="px-2.5 mb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
          {currentGroup.heading}
        </span>
        <div className="space-y-0.5">{renderedItemsInGroup}</div>
      </div>
    );
  }

  return (
    <aside className="w-60 h-screen shrink-0 overflow-hidden bg-zinc-950/80 backdrop-blur-md border-r border-zinc-850 flex flex-col justify-between select-none">
      {/* Top Header / Clean Brand Indicator */}
      <div>
        <div className="h-14 px-4 border-b border-zinc-850/80 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-sm">
            B
          </div>
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">
            Browser Agent
          </span>
        </div>

        {/* Grouped Nav Items */}
        <nav className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-125px)]">
          {renderedNavGroups}
        </nav>
      </div>

      {/* Bottom Live Logs Toggle */}
      <div className="p-3 border-t border-zinc-850/80">
        <button
          onClick={props.onToggleLogPanel}
          className={
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 " +
            (props.isLogPanelOpen
              ? "bg-blue-500/15 text-blue-400 font-medium"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5")
          }
        >
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-blue-400" strokeWidth={1.75} />
            <span className="tracking-tight">Live Telemetry</span>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </button>
      </div>
    </aside>
  );
}
