import { useState, useEffect, useRef } from "react";
import {
  Terminal,
  CheckCircle2,
  Loader2,
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
  LayoutDashboard,
  PlayCircle,
  Flame,
  Globe,
  MessageSquare,
  Tags,
  History,
  Settings,
  AtSign,
  Sun,
  Moon
} from "lucide-react";
import type {
  NavigationTabType,
  CountryItem,
  SourceItem,
  KeywordsData,
  RawSourcesData,
  PipelineRunRecord,
  LogMessageItem,
  ApplicationSettings
} from "./types";
import { SidebarNav, type NavGroupData, type NavItemData } from "./components/ui/dashboard-sidebar";
import { LogPanel } from "./components/LogPanel";
import { DashboardPage } from "./pages/DashboardPage";
import { PipelinePage } from "./pages/PipelinePage";
import { TrendsPage } from "./pages/TrendsPage";
import { HeadlinesPage } from "./pages/HeadlinesPage";
import { TweetsPage } from "./pages/TweetsPage";
import { KeywordsPage } from "./pages/KeywordsPage";
import { SourcesPage } from "./pages/SourcesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TwitterHandlesPage } from "./pages/TwitterHandlesPage";

// Dynamically resolve backend host and protocol so frontend works across any PC, IP address, or domain
const backendHost = (typeof window !== "undefined" && window.location.hostname) ? window.location.hostname : "localhost";
const backendProtocol = (typeof window !== "undefined" && window.location.protocol === "https:") ? "https" : "http";
const websocketProtocol = (typeof window !== "undefined" && window.location.protocol === "https:") ? "wss" : "ws";

const BACKEND_API_BASE_URL = `${backendProtocol}://${backendHost}:8000`;
const BACKEND_WEBSOCKET_URL = `${websocketProtocol}://${backendHost}:8000/ws/pipeline`;

export default function App() {
  // Navigation & Shell State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeWorkspace, setActiveWorkspace] = useState("Trendline");
  const [currentActiveTab, setCurrentActiveTab] = useState<NavigationTabType>("dashboard");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);

  // Theme state: "dark" or "light"
  const [currentTheme, setCurrentTheme] = useState<"dark" | "light">(function () {
    const savedThemeFromStorage = localStorage.getItem("trendline_theme");
    if (savedThemeFromStorage === "light") {
      return "light";
    }
    return "dark";
  });

  // Apply theme to document element and persist to localStorage
  useEffect(function () {
    if (currentTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      document.documentElement.style.colorScheme = "dark";
      localStorage.setItem("trendline_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      document.documentElement.style.colorScheme = "light";
      localStorage.setItem("trendline_theme", "light");
    }
  }, [currentTheme]);

  function handleToggleTheme() {
    if (currentTheme === "dark") {
      setCurrentTheme("light");
    } else {
      setCurrentTheme("dark");
    }
  }

  // Global ⌘K shortcut listener
  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (event.key === "Escape") {
        setIsSearchOpen(false);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Data States
  const [availableCountries, setAvailableCountries] = useState<CountryItem[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [sourcesList, setSourcesList] = useState<SourceItem[]>([]);
  const [recentRunsList, setRecentRunsList] = useState<PipelineRunRecord[]>([]);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);

  const [rawSourcesData, setRawSourcesData] = useState<RawSourcesData | null>(null);
  const [keywordsData, setKeywordsData] = useState<KeywordsData | null>(null);
  const [totalScrapedTweetsCount, setTotalScrapedTweetsCount] = useState<number>(0);

  const [currentSettings, setCurrentSettings] = useState<ApplicationSettings>({
    vllm_base_url: "http://10.13.12.121:8000/v1",
    vllm_api_key: "EMPTY",
    llm_model_name: "qwen3-14b",
    llm_maximum_tokens: "8192",
    llm_timeout_seconds: "180",
    headless_mode: "false",
    use_real_chrome: "true",
    maximum_tweets_per_trend: "20",
    maximum_scroll_rounds: "12",
    number_of_trends_to_mine: "5"
  });

  // Pipeline Execution States
  const [pipelineStatus, setPipelineStatus] = useState<
    "idle" | "running" | "completed" | "cancelled" | "error"
  >("idle");
  const [pipelineProgressPercentage, setPipelineProgressPercentage] = useState(0);
  const [currentPipelineStepMessage, setCurrentPipelineStepMessage] = useState("");
  const [activePipelineCountry, setActivePipelineCountry] = useState<string | null>(null);
  const [currentPipelinePhase, setCurrentPipelinePhase] = useState<string>("init");
  const [logsList, setLogsList] = useState<LogMessageItem[]>([]);

  // WebSocket reference
  const websocketRef = useRef<WebSocket | null>(null);

  // Helper to append a log message
  function addLogMessage(
    level: LogMessageItem["level"],
    messageText: string,
    customTimestamp?: string
  ) {
    const timestampString =
      customTimestamp || new Date().toTimeString().split(" ")[0];
    const newLogItem: LogMessageItem = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: timestampString,
      level: level,
      message: messageText
    };
    setLogsList(function (previousLogs) {
      return [...previousLogs, newLogItem];
    });
  }

  // 1. Initialize WebSocket Connection
  useEffect(function () {
    let reconnectTimeoutId: any = null;

    function connectWebSocket() {
      try {
        const socketInstance = new WebSocket(BACKEND_WEBSOCKET_URL);
        websocketRef.current = socketInstance;

        socketInstance.onopen = function () {
          addLogMessage("SUCCESS", "Connected to live WebSocket telemetry stream.");
        };

        socketInstance.onmessage = function (event) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "log") {
              addLogMessage(data.level || "INFO", data.message, data.timestamp);
            } else if (data.type === "progress") {
              setCurrentPipelineStepMessage(data.detail || "");
              if (data.phase) {
                setCurrentPipelinePhase(data.phase);
              }
              if (data.country) {
                setActivePipelineCountry(data.country);
              }
              if (data.total_steps && data.total_steps > 0) {
                const calculatedPct = Math.round((data.current_step / data.total_steps) * 100);
                setPipelineProgressPercentage(calculatedPct);
              }
            } else if (data.type === "status") {
              setPipelineStatus(data.status);
              if (data.status === "completed") {
                setPipelineProgressPercentage(100);
                setActivePipelineCountry(null);
                setCurrentPipelinePhase("done");
                fetchLatestData();
              } else if (data.status === "cancelled" || data.status === "error") {
                setActivePipelineCountry(null);
              }
            }
          } catch (e) {
            console.error("Error parsing websocket message", e);
          }
        };

        socketInstance.onclose = function () {
          // Reconnect after 3 seconds if disconnected
          reconnectTimeoutId = setTimeout(connectWebSocket, 3000);
        };

        socketInstance.onerror = function () {
          socketInstance.close();
        };
      } catch (err) {
        console.error("WebSocket connection error", err);
      }
    }

    connectWebSocket();

    return function () {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
    };
  }, []);

  // 2. Fetch initial data from FastAPI backend
  function fetchCountries() {
    fetch(BACKEND_API_BASE_URL + "/api/countries")
      .then(function (res) {
        return res.json();
      })
      .then(function (countries: CountryItem[]) {
        setAvailableCountries(countries);
        // By default, select Worldwide as primary global scope
        let hasWorldwide = false;
        for (let i = 0; i < countries.length; i++) {
          if (countries[i].name.toLowerCase() === "worldwide") {
            hasWorldwide = true;
            break;
          }
        }
        if (hasWorldwide) {
          setSelectedCountries(["Worldwide"]);
        } else if (countries.length > 0) {
          setSelectedCountries([countries[0].name]);
        }
      })
      .catch(function (err) {
        console.error("Failed to load countries", err);
      });
  }

  function fetchSources() {
    fetch(BACKEND_API_BASE_URL + "/api/sources")
      .then(function (res) {
        return res.json();
      })
      .then(function (sources: SourceItem[]) {
        setSourcesList(sources);
      })
      .catch(function (err) {
        console.error("Failed to load sources", err);
      });
  }

  function fetchSettings() {
    fetch(BACKEND_API_BASE_URL + "/api/settings")
      .then(function (res) {
        return res.json();
      })
      .then(function (settingsData: ApplicationSettings) {
        if (settingsData && Object.keys(settingsData).length > 0) {
          setCurrentSettings(settingsData);
        }
      })
      .catch(function (err) {
        console.error("Failed to load settings", err);
      });
  }

  function fetchRuns() {
    fetch(BACKEND_API_BASE_URL + "/api/runs")
      .then(function (res) {
        return res.json();
      })
      .then(function (runs: PipelineRunRecord[]) {
        setRecentRunsList(runs);
      })
      .catch(function (err) {
        console.error("Failed to load runs", err);
      });
  }

  function fetchLatestData() {
    fetch(BACKEND_API_BASE_URL + "/api/runs/latest")
      .then(function (res) {
        return res.json();
      })
      .then(function (result) {
        if (result) {
          setActiveRunId(result.run_id || null);
          setRawSourcesData(result.raw_sources || null);
          setKeywordsData(result.keywords || null);
        }
      })
      .catch(function (err) {
        console.error("Failed to load latest results", err);
      });
  }

  function handleClearDatabase() {
    fetch(BACKEND_API_BASE_URL + "/api/database/clear", {
      method: "POST",
    })
      .then(function (res) {
        return res.json();
      })
      .then(function () {
        setActiveRunId(null);
        setRawSourcesData(null);
        setKeywordsData(null);
        setRecentRunsList([]);
        fetchRuns();
        fetchLatestData();
      })
      .catch(function (err) {
        console.error("Failed to clear database", err);
      });
  }

  function fetchScrapedTweetsCount() {
    fetch(BACKEND_API_BASE_URL + "/api/twitter/tweets?within_24h_only=false")
      .then(function (res) {
        return res.json();
      })
      .then(function (tweets) {
        if (Array.isArray(tweets)) {
          setTotalScrapedTweetsCount(tweets.length);
        }
      })
      .catch(function (err) {
        console.error("Failed to load scraped tweets count", err);
      });
  }

  useEffect(function () {
    fetchCountries();
    fetchSources();
    fetchSettings();
    fetchRuns();
    fetchLatestData();
    fetchScrapedTweetsCount();
  }, []);

  // Pipeline Country Toggle Handlers
  function handleToggleCountry(countryName: string) {
    const updated = [];
    let found = false;
    for (let i = 0; i < selectedCountries.length; i++) {
      if (selectedCountries[i] === countryName) {
        found = true;
      } else {
        updated.push(selectedCountries[i]);
      }
    }
    if (!found) {
      updated.push(countryName);
    }
    setSelectedCountries(updated);
  }

  function handleSelectAllCountries() {
    const allNames: string[] = [];
    for (let i = 0; i < availableCountries.length; i++) {
      allNames.push(availableCountries[i].name);
    }
    setSelectedCountries(allNames);
  }

  function handleDeselectAllCountries() {
    setSelectedCountries([]);
  }

  function handleSelectCountryOnly(countryName: string) {
    setSelectedCountries([countryName]);
  }

  // Pipeline Execution Control
  function handleStartPipeline() {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      setPipelineStatus("running");
      setPipelineProgressPercentage(5);
      setCurrentPipelinePhase("init");
      setActivePipelineCountry(null);
      setCurrentPipelineStepMessage("Initializing browser and sources scraper...");
      setIsLogPanelOpen(true); // Open live log drawer so user sees everything transparently

      websocketRef.current.send(
        JSON.stringify({
          action: "start",
          countries: ["Worldwide"]
        })
      );
    } else {
      addLogMessage("ERROR", "WebSocket connection is not active. Make sure backend is running.");
    }
  }

  function handleCancelPipeline() {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(
        JSON.stringify({
          action: "cancel"
        })
      );
    }
  }

  // Global Keyboard shortcuts: ⌘+Enter to start pipeline, Esc to cancel
  useEffect(function () {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        if (pipelineStatus !== "running" && selectedCountries.length > 0) {
          event.preventDefault();
          handleStartPipeline();
        }
      } else if (event.key === "Escape") {
        if (pipelineStatus === "running") {
          event.preventDefault();
          handleCancelPipeline();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return function () {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pipelineStatus, selectedCountries]);

  // Sources Handlers
  function handleToggleSource(sourceIndex: number, enabled: boolean) {
    fetch(BACKEND_API_BASE_URL + "/api/sources/" + sourceIndex, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: enabled })
    })
      .then(function () {
        fetchSources();
      })
      .catch(function (err) {
        console.error("Failed to toggle source", err);
      });
  }

  function handleDeleteSource(sourceIndex: number) {
    fetch(BACKEND_API_BASE_URL + "/api/sources/" + sourceIndex, {
      method: "DELETE"
    })
      .then(function () {
        fetchSources();
      })
      .catch(function (err) {
        console.error("Failed to delete source", err);
      });
  }

  function handleAddSource(newSource: SourceItem) {
    fetch(BACKEND_API_BASE_URL + "/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSource)
    })
      .then(function () {
        fetchSources();
      })
      .catch(function (err) {
        console.error("Failed to add source", err);
      });
  }

  // Save Settings Handler
  function handleSaveSettings(updatedSettings: ApplicationSettings) {
    setCurrentSettings(updatedSettings);
    fetch(BACKEND_API_BASE_URL + "/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: updatedSettings })
    }).catch(function (err) {
      console.error("Failed to update settings", err);
    });
  }

  // Save Keywords Handler
  function handleSaveKeywords(updatedKeywords: KeywordsData) {
    setKeywordsData(updatedKeywords);
    const targetRunId = activeRunId || (recentRunsList.length > 0 ? recentRunsList[0].id : 1);
    fetch(BACKEND_API_BASE_URL + "/api/runs/" + targetRunId + "/keywords", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords_data: updatedKeywords })
    }).catch(function (err) {
      console.error("Failed to persist keywords update", err);
    });
  }

  // Select Historical Run Handler
  function handleSelectHistoricalRun(runId: number) {
    fetch(BACKEND_API_BASE_URL + "/api/runs/" + runId)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        setActiveRunId(data.id);
        if (data.raw_sources) {
          setRawSourcesData(data.raw_sources);
        }
        if (data.keywords) {
          setKeywordsData(data.keywords);
        }
        setCurrentActiveTab("keywords");
      })
      .catch(function (err) {
        console.error("Failed to load historical run", err);
      });
  }

  function handleDeleteHistoricalRun(runId: number) {
    fetch(BACKEND_API_BASE_URL + "/api/runs/" + runId, {
      method: "DELETE"
    })
      .then(function () {
        fetchRuns();
      })
      .catch(function (err) {
        console.error("Failed to delete historical run", err);
      });
  }

  // Count active sources
  let activeSourcesCount = 0;
  for (let i = 0; i < sourcesList.length; i++) {
    if (sourcesList[i].enabled) {
      activeSourcesCount++;
    }
  }

  // Count trends discovered
  let totalTrendsCount = 0;
  if (rawSourcesData) {
    if (rawSourcesData.x_native_explore && rawSourcesData.x_native_explore.trends_observed) {
      totalTrendsCount = rawSourcesData.x_native_explore.trends_observed.length;
    } else if (rawSourcesData.x_trends24_topics) {
      totalTrendsCount = rawSourcesData.x_trends24_topics.length;
    }
  }

  // Count news headlines ingested across all outlets
  let totalHeadlinesCount = 0;
  if (rawSourcesData && rawSourcesData.news_sources_intel) {
    for (const sourceKey in rawSourcesData.news_sources_intel) {
      if (Object.prototype.hasOwnProperty.call(rawSourcesData.news_sources_intel, sourceKey)) {
        totalHeadlinesCount += rawSourcesData.news_sources_intel[sourceKey].length;
      }
    }
  }

  // Count tweets extracted across all trends
  let totalTweetsCount = 0;
  if (
    rawSourcesData &&
    rawSourcesData.x_native_explore &&
    rawSourcesData.x_native_explore.sample_tweets_by_trend
  ) {
    const sampleTweetsMap = rawSourcesData.x_native_explore.sample_tweets_by_trend;
    for (const trendKey in sampleTweetsMap) {
      if (Object.prototype.hasOwnProperty.call(sampleTweetsMap, trendKey)) {
        totalTweetsCount += sampleTweetsMap[trendKey].length;
      }
    }
  }

  // Count total keywords
  let totalKeywordsCount = 0;
  if (keywordsData && keywordsData.topics) {
    for (let i = 0; i < keywordsData.topics.length; i++) {
      if (keywordsData.topics[i].terms) {
        totalKeywordsCount += keywordsData.topics[i].terms.length;
      }
    }
  }

  // Count total past runs
  const totalRunsCount = recentRunsList.length;

  // Title dictionary for clean breadcrumb
  const tabTitlesDictionary: Record<NavigationTabType, string> = {
    dashboard: "Dashboard",
    pipeline: "Run Pipeline",
    trends: "Trending Topics",
    headlines: "News Headlines",
    tweets: "Extracted Tweets",
    keywords: "Keywords",
    twitter_handles: "Twitter Scraper",
    sources: "Intel Sources",
    history: "Run History",
    settings: "Settings"
  };

  const isPipelineActive = pipelineStatus === "running";

  // Group navigation definitions matching the user's dashboard-sidebar component
  const browserAgentNavGroups: NavGroupData[] = [
    {
      items: [
        { id: "search", title: "Search", icon: Search, shortcut: "⌘K" },
        { id: "dashboard", title: "Dashboard", icon: LayoutDashboard },
        {
          id: "pipeline",
          title: "Run Pipeline",
          icon: PlayCircle,
          badge: pipelineStatus === "running" ? "RUNNING" : undefined,
          badgeClassName: "bg-rose-500/15 text-rose-400 font-semibold animate-pulse"
        },
      ]
    },
    {
      heading: "Intelligence",
      items: [
        {
          id: "trends",
          title: "Trending Topics",
          icon: Flame,
          badge: totalTrendsCount > 0 ? String(totalTrendsCount) : undefined,
          badgeClassName: "bg-amber-500/15 text-amber-400 font-semibold"
        },
        {
          id: "headlines",
          title: "News Headlines",
          icon: Globe,
          badge: totalHeadlinesCount > 0 ? String(totalHeadlinesCount) : undefined,
          badgeClassName: "bg-blue-500/15 text-blue-400 font-semibold"
        },
        {
          id: "tweets",
          title: "Extracted Tweets",
          icon: MessageSquare,
          badge: totalTweetsCount > 0 ? String(totalTweetsCount) : undefined,
          badgeClassName: "bg-purple-500/15 text-purple-400 font-semibold"
        },
        {
          id: "keywords",
          title: "Keywords",
          icon: Tags,
          badge: totalKeywordsCount > 0 ? String(totalKeywordsCount) : undefined,
          badgeClassName: "bg-amber-500/15 text-amber-300 font-semibold"
        },
        {
          id: "twitter_handles",
          title: "Twitter Scraper",
          icon: AtSign,
          badge: totalScrapedTweetsCount > 0 ? String(totalScrapedTweetsCount) : undefined,
          badgeClassName: "bg-sky-500/15 text-sky-400 font-semibold"
        },
      ]
    },
    {
      heading: "Management",
      items: [
        {
          id: "sources",
          title: "Sources",
          icon: Globe,
          badge: activeSourcesCount > 0 ? String(activeSourcesCount) : undefined,
          badgeClassName: "bg-blue-500/15 text-blue-400 font-semibold"
        },
        {
          id: "history",
          title: "Run History",
          icon: History,
          badge: totalRunsCount > 0 ? String(totalRunsCount) : undefined,
          badgeClassName: "bg-rose-500/15 text-rose-400 font-semibold"
        },
      ]
    }
  ];

  const browserAgentBottomItems: NavItemData[] = [
    { id: "settings", title: "Settings", icon: Settings, shortcut: "⌘," },
  ];

  // Search items list for ⌘K quick jumps
  const searchablePages = [
    { id: "dashboard", label: "Dashboard", desc: "Overview stats and recent pipeline runs" },
    { id: "pipeline", label: "Run Pipeline", desc: "Trigger autonomous intelligence pipeline" },
    { id: "trends", label: "Trending Topics", desc: "Hot news headlines and X.com explore trends" },
    { id: "headlines", label: "News Headlines", desc: "Ingested news headlines across all configured sources" },
    { id: "tweets", label: "Extracted Tweets", desc: "Live tweets mined directly from X.com search timelines" },
    { id: "keywords", label: "Synthesized Keywords", desc: "High-precision keywords generated via Strategic AI Engine" },
    { id: "twitter_handles", label: "Twitter Scraper", desc: "Multi-browser tweet scraper" },
    { id: "sources", label: "Sources Management", desc: "Configure, toggle, and add news sites & RSS feeds" },
    { id: "history", label: "Run History", desc: "Inspect and export past intelligence pipeline runs" },
    { id: "settings", label: "Application Settings", desc: "Model server endpoint, browser options, and scraping thresholds" },
  ];

  const filteredSearchPages = [];
  for (let pageIndex = 0; pageIndex < searchablePages.length; pageIndex++) {
    const pageItem = searchablePages[pageIndex];
    if (
      searchQuery.trim() === "" ||
      pageItem.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pageItem.desc.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      filteredSearchPages.push(pageItem);
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      {/* shadcn Collapsible Sidebar Container */}
      <div
        className={
          "h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden bg-card/50 border-r border-border/50 " +
          (isSidebarOpen ? "w-[260px] opacity-100" : "w-0 opacity-0 border-none")
        }
      >
        <SidebarNav
          className="w-[260px] border-none bg-transparent"
          activeId={currentActiveTab}
          onSelect={function (tabId) {
            if (tabId === "search") {
              setIsSearchOpen(true);
              return;
            }
            setCurrentActiveTab(tabId as NavigationTabType);
          }}
          activeWorkspace={activeWorkspace}
          onWorkspaceSelect={setActiveWorkspace}
          navGroups={browserAgentNavGroups}
          bottomItems={browserAgentBottomItems}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col min-w-0 transition-all duration-300 h-screen overflow-hidden">
        {/* Top Header Bar */}
        <div className="h-14 border-b border-border/50 flex items-center px-4 justify-between bg-card shrink-0 select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={function () {
                setIsSidebarOpen(!isSidebarOpen);
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors"
              title={isSidebarOpen ? "Collapse Sidebar" : "Open Sidebar"}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} />
              ) : (
                <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
              )}
            </button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate font-semibold text-foreground/90">{activeWorkspace}</span>
              <span>/</span>
              <span className="font-medium text-foreground truncate">
                {tabTitlesDictionary[currentActiveTab]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={function () {
                setIsSearchOpen(true);
              }}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs text-muted-foreground transition-colors border border-border/40 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>Search intelligence or tabs...</span>
              <kbd className="h-4 px-1 text-[10px] font-mono text-muted-foreground/60 bg-background/50 border border-border/50 rounded">
                ⌘K
              </kbd>
            </button>

            {/* Run status badge */}
            <div
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide " +
                (isPipelineActive
                  ? "bg-primary/10 text-primary"
                  : pipelineStatus === "completed"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : pipelineStatus === "cancelled"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-black/5 dark:bg-white/5 text-muted-foreground")
              }
            >
              {isPipelineActive ? (
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
              ) : pipelineStatus === "completed" ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : pipelineStatus === "cancelled" ? (
                <AlertCircle className="w-3 h-3 text-amber-400" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              )}
              <span>{pipelineStatus.toUpperCase()}</span>
            </div>

            {/* Live Logs Toggle */}
            <button
              onClick={function () {
                setIsLogPanelOpen(!isLogPanelOpen);
              }}
              className={
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer " +
                (isLogPanelOpen
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5")
              }
              title="Toggle Live Telemetry"
            >
              <Terminal className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="hidden sm:inline">Logs</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5"></span>
            </button>

            {/* Theme Mode Toggle (Light / Dark) */}
            <button
              onClick={handleToggleTheme}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 cursor-pointer"
              title={currentTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme mode"
            >
              {currentTheme === "dark" ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" strokeWidth={1.75} />
              )}
              <span className="hidden sm:inline">
                {currentTheme === "dark" ? "Light" : "Dark"}
              </span>
            </button>
          </div>
        </div>

        {/* Main View Port */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-black/[0.02] dark:bg-white/[0.02]">
          <div key={currentActiveTab} className="max-w-7xl mx-auto animate-in fade-in-50 slide-in-from-bottom-2 duration-200">
            {currentActiveTab === "dashboard" && (
              <DashboardPage
                rawSourcesData={rawSourcesData}
                keywordsData={keywordsData}
                recentRunsList={recentRunsList}
                activeSourcesCount={activeSourcesCount}
                availableCountries={availableCountries}
                selectedCountries={selectedCountries}
                sourcesList={sourcesList}
                onSelectCountryOnly={handleSelectCountryOnly}
                onStartPipeline={handleStartPipeline}
                onClearDatabase={handleClearDatabase}
                isPipelineActive={isPipelineActive}
                onNavigateTab={function (tab) {
                  setCurrentActiveTab(tab);
                }}
              />
            )}

          {currentActiveTab === "pipeline" && (
            <PipelinePage
              availableCountries={availableCountries}
              selectedCountries={selectedCountries}
              onToggleCountry={handleToggleCountry}
              onSelectAllCountries={handleSelectAllCountries}
              onDeselectAllCountries={handleDeselectAllCountries}
              pipelineStatus={pipelineStatus}
              currentPipelineStepMessage={currentPipelineStepMessage}
              pipelineProgressPercentage={pipelineProgressPercentage}
              onStartPipeline={handleStartPipeline}
              onCancelPipeline={handleCancelPipeline}
              recentRunsList={recentRunsList}
              onInspectRun={handleSelectHistoricalRun}
              activePipelineCountry={activePipelineCountry}
              currentPipelinePhase={currentPipelinePhase}
            />
          )}

          {currentActiveTab === "trends" && (
            <TrendsPage rawSourcesData={rawSourcesData} onRefreshData={fetchLatestData} />
          )}

          {currentActiveTab === "headlines" && (
            <HeadlinesPage rawSourcesData={rawSourcesData} />
          )}

          {currentActiveTab === "tweets" && (
            <TweetsPage rawSourcesData={rawSourcesData} />
          )}

          {currentActiveTab === "keywords" && (
            <KeywordsPage
              keywordsData={keywordsData}
              onSaveKeywords={handleSaveKeywords}
              activeRunId={activeRunId}
            />
          )}

          {currentActiveTab === "twitter_handles" && (
            <TwitterHandlesPage
              backendApiBaseUrl={BACKEND_API_BASE_URL}
              onTweetsCountChange={setTotalScrapedTweetsCount}
            />
          )}

          {currentActiveTab === "sources" && (
            <SourcesPage
              sourcesList={sourcesList}
              onToggleSource={handleToggleSource}
              onDeleteSource={handleDeleteSource}
              onAddSource={handleAddSource}
            />
          )}

          {currentActiveTab === "history" && (
            <HistoryPage
              runsList={recentRunsList}
              activeRunId={activeRunId}
              onSelectRun={handleSelectHistoricalRun}
              onDeleteRun={handleDeleteHistoricalRun}
            />
          )}

            {currentActiveTab === "settings" && (
              <SettingsPage
                currentSettings={currentSettings}
                onSaveSettings={handleSaveSettings}
                currentTheme={currentTheme}
                onToggleTheme={handleToggleTheme}
              />
            )}
          </div>
        </main>

        {/* Collapsible Live Log Panel */}
        <LogPanel
          isOpen={isLogPanelOpen}
          onToggleOpen={function () {
            setIsLogPanelOpen(!isLogPanelOpen);
          }}
          logsList={logsList}
          onClearLogs={function () {
            setLogsList([]);
          }}
        />
      </div>

      {/* ⌘K Command Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/80 backdrop-blur-sm px-4">
          <div className="fixed inset-0" onClick={() => setIsSearchOpen(false)} />
          <div className="relative w-full max-w-xl bg-card border border-border/60 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center px-4 border-b border-border/50">
              <Search className="w-[18px] h-[18px] text-muted-foreground/70 mr-3 shrink-0" strokeWidth={1.5} />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent py-4 outline-none text-[14px] text-foreground placeholder:text-muted-foreground/50"
                placeholder="Search projects, docs, or actions..."
              />
              <kbd
                onClick={() => setIsSearchOpen(false)}
                className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 ml-2 text-[10px] font-medium font-mono text-muted-foreground/70 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-[4px] cursor-pointer hover:text-foreground hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
              >
                ESC
              </kbd>
              <button
                onClick={() => setIsSearchOpen(false)}
                className="ml-3 p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
              >
                <X className="w-[18px] h-[18px]" strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-2 max-h-72 overflow-y-auto">
              {filteredSearchPages.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No matching tabs or commands found for "{searchQuery}".
                </div>
              ) : (
                filteredSearchPages.map((pageItem) => (
                  <button
                    key={pageItem.id}
                    onClick={() => {
                      setCurrentActiveTab(pageItem.id as NavigationTabType);
                      setIsSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">
                        {pageItem.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {pageItem.desc}
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground/60 font-mono">Jump →</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
