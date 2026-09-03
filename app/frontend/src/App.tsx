import { useState, useEffect, useRef } from "react";
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
import { Sidebar } from "./components/Sidebar";
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

const BACKEND_API_BASE_URL = "http://localhost:8000";
const BACKEND_WEBSOCKET_URL = "ws://localhost:8000/ws/pipeline";

export default function App() {
  // Navigation State
  const [currentActiveTab, setCurrentActiveTab] = useState<NavigationTabType>("dashboard");
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);

  // Data States
  const [availableCountries, setAvailableCountries] = useState<CountryItem[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [sourcesList, setSourcesList] = useState<SourceItem[]>([]);
  const [recentRunsList, setRecentRunsList] = useState<PipelineRunRecord[]>([]);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);

  const [rawSourcesData, setRawSourcesData] = useState<RawSourcesData | null>(null);
  const [keywordsData, setKeywordsData] = useState<KeywordsData | null>(null);

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
              if (data.total_steps && data.total_steps > 0) {
                const calculatedPct = Math.round((data.current_step / data.total_steps) * 100);
                setPipelineProgressPercentage(calculatedPct);
              }
            } else if (data.type === "status") {
              setPipelineStatus(data.status);
              if (data.status === "completed") {
                setPipelineProgressPercentage(100);
                fetchLatestData();
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
        // By default, select all countries as requested by the user
        const allNames: string[] = [];
        for (let i = 0; i < countries.length; i++) {
          allNames.push(countries[i].name);
        }
        setSelectedCountries(allNames);
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
          setActiveRunId(result.run_id);
          if (result.raw_sources) {
            setRawSourcesData(result.raw_sources);
          }
          if (result.keywords) {
            setKeywordsData(result.keywords);
          }
        }
      })
      .catch(function (err) {
        console.error("Failed to load latest results", err);
      });
  }

  useEffect(function () {
    fetchCountries();
    fetchSources();
    fetchSettings();
    fetchRuns();
    fetchLatestData();
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

  // Pipeline Execution Control
  function handleStartPipeline() {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      setPipelineStatus("running");
      setPipelineProgressPercentage(5);
      setCurrentPipelineStepMessage("Initializing browser and sources scraper...");
      setIsLogPanelOpen(true); // Open live log drawer so user sees everything transparently

      websocketRef.current.send(
        JSON.stringify({
          action: "start",
          countries: selectedCountries
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
    const targetRunId = activeRunId || 1;
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Fixed Left Sidebar */}
      <Sidebar
        currentActiveTab={currentActiveTab}
        onSelectTab={function (tab) {
          setCurrentActiveTab(tab);
        }}
        isLogPanelOpen={isLogPanelOpen}
        onToggleLogPanel={function () {
          setIsLogPanelOpen(!isLogPanelOpen);
        }}
      />

      {/* Main Content Area + Collapsible Bottom Log Panel */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Main View Port */}
        <main className="flex-1 overflow-y-auto p-6 bg-zinc-950/95">
          {currentActiveTab === "dashboard" && (
            <DashboardPage
              rawSourcesData={rawSourcesData}
              keywordsData={keywordsData}
              recentRunsList={recentRunsList}
              activeSourcesCount={activeSourcesCount}
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
            />
          )}
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
    </div>
  );
}
