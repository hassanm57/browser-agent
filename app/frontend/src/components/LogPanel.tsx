import { useState, useRef, useEffect } from "react";
import type { LogMessageItem } from "../types";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Trash2,
  Copy,
  Check,
  Pause,
  Play
} from "lucide-react";

interface LogPanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  logsList: LogMessageItem[];
  onClearLogs: () => void;
}

export function LogPanel(props: LogPanelProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedFilterLevel, setSelectedFilterLevel] = useState<string>("ALL");
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [hasCopiedLogs, setHasCopiedLogs] = useState(false);

  const logsScrollContainerRef = useRef<HTMLDivElement>(null);

  // Automatically scroll down when new logs arrive, if auto-scroll is enabled
  useEffect(function () {
    if (isAutoScrollEnabled && logsScrollContainerRef.current) {
      logsScrollContainerRef.current.scrollTop = logsScrollContainerRef.current.scrollHeight;
    }
  }, [props.logsList, isAutoScrollEnabled]);

  // Handle copying all logs to clipboard
  function handleCopyAllLogs() {
    const formattedLogLines = [];
    for (let logIndex = 0; logIndex < props.logsList.length; logIndex++) {
      const currentLog = props.logsList[logIndex];
      formattedLogLines.push(
        "[" + currentLog.timestamp + "] [" + currentLog.level + "] " + currentLog.message
      );
    }
    const fullLogString = formattedLogLines.join("\n");
    navigator.clipboard.writeText(fullLogString);
    setHasCopiedLogs(true);
    setTimeout(function () {
      setHasCopiedLogs(false);
    }, 2000);
  }

  // Filter logs using traditional for loop without array.filter
  const filteredLogsArray = [];
  for (let logIndex = 0; logIndex < props.logsList.length; logIndex++) {
    const currentLog = props.logsList[logIndex];
    if (selectedFilterLevel === "ALL") {
      filteredLogsArray.push(currentLog);
    } else if (selectedFilterLevel === "ERROR" && currentLog.level === "ERROR") {
      filteredLogsArray.push(currentLog);
    } else if (selectedFilterLevel === "WARN" && (currentLog.level === "WARN" || currentLog.level === "ERROR")) {
      filteredLogsArray.push(currentLog);
    } else if (selectedFilterLevel === "BROWSER" && (currentLog.level === "BROWSER" || currentLog.level === "SCROLL")) {
      filteredLogsArray.push(currentLog);
    }
  }

  // Render log rows using traditional for loop without array.map
  const renderedLogRows = [];
  for (let logIndex = 0; logIndex < filteredLogsArray.length; logIndex++) {
    const logItem = filteredLogsArray[logIndex];

    let badgeColorClass = "text-zinc-400 bg-zinc-800/60 border-zinc-700";
    if (logItem.level === "STEP") {
      badgeColorClass = "text-blue-400 bg-blue-950/40 border-blue-800/60";
    } else if (logItem.level === "SUCCESS") {
      badgeColorClass = "text-emerald-400 bg-emerald-950/40 border-emerald-800/60";
    } else if (logItem.level === "WARN") {
      badgeColorClass = "text-amber-400 bg-amber-950/40 border-amber-800/60";
    } else if (logItem.level === "ERROR") {
      badgeColorClass = "text-red-400 bg-red-950/40 border-red-800/60";
    } else if (logItem.level === "BROWSER") {
      badgeColorClass = "text-purple-400 bg-purple-950/40 border-purple-800/60";
    } else if (logItem.level === "SCROLL") {
      badgeColorClass = "text-cyan-400 bg-cyan-950/40 border-cyan-800/60";
    } else if (logItem.level === "LLM") {
      badgeColorClass = "text-orange-400 bg-orange-950/40 border-orange-800/60";
    }

    renderedLogRows.push(
      <div
        key={logItem.id}
        className="flex items-start gap-2.5 py-1 px-3 hover:bg-zinc-900/60 font-mono text-[11px] leading-relaxed transition-colors"
      >
        <span className="text-zinc-500 shrink-0 select-none">{logItem.timestamp}</span>
        <span
          className={
            "px-1.5 py-0.2 rounded border text-[9px] font-semibold tracking-wide shrink-0 select-none " +
            badgeColorClass
          }
        >
          {logItem.level}
        </span>
        <span className="text-zinc-300 break-all whitespace-pre-wrap flex-1">{logItem.message}</span>
      </div>
    );
  }

  // If collapsed, display a minimal persistent bottom strip
  if (!props.isOpen) {
    const latestLogMessage =
      props.logsList.length > 0 ? props.logsList[props.logsList.length - 1].message : "No logs yet.";

    return (
      <div
        onClick={props.onToggleOpen}
        className="h-8 bg-zinc-950 border-t border-zinc-800/80 px-4 flex items-center justify-between cursor-pointer hover:bg-zinc-900 transition-colors select-none"
      >
        <div className="flex items-center gap-2 overflow-hidden text-xs text-zinc-400">
          <span className="flex items-center gap-1.5 font-semibold text-zinc-200">
            <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
            Live Logs
          </span>
          <span className="text-zinc-600">•</span>
          <span className="truncate text-zinc-400 font-mono text-[11px]">{latestLogMessage}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-mono">
            {props.logsList.length} entries
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </div>
      </div>
    );
  }

  const panelHeightClass = isMaximized ? "h-[65vh]" : "h-64";

  return (
    <div
      className={
        "bg-zinc-950 border-t border-zinc-800 flex flex-col transition-all duration-200 " +
        panelHeightClass
      }
    >
      {/* Control Bar Header */}
      <div className="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60 select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={props.onToggleOpen}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200 hover:text-white"
          >
            <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
            <span>Live Telemetry & Logs</span>
          </button>
          <span className="text-[11px] font-mono text-zinc-500">
            ({filteredLogsArray.length} displayed)
          </span>

          {/* Level Filter Buttons */}
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={function () {
                setSelectedFilterLevel("ALL");
              }}
              className={
                "px-2 py-0.5 text-[10px] rounded font-medium transition-colors " +
                (selectedFilterLevel === "ALL"
                  ? "bg-zinc-700 text-white font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800")
              }
            >
              All
            </button>
            <button
              onClick={function () {
                setSelectedFilterLevel("BROWSER");
              }}
              className={
                "px-2 py-0.5 text-[10px] rounded font-medium transition-colors " +
                (selectedFilterLevel === "BROWSER"
                  ? "bg-purple-900/60 text-purple-200 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800")
              }
            >
              Browser
            </button>
            <button
              onClick={function () {
                setSelectedFilterLevel("WARN");
              }}
              className={
                "px-2 py-0.5 text-[10px] rounded font-medium transition-colors " +
                (selectedFilterLevel === "WARN"
                  ? "bg-amber-900/60 text-amber-200 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800")
              }
            >
              Warns
            </button>
            <button
              onClick={function () {
                setSelectedFilterLevel("ERROR");
              }}
              className={
                "px-2 py-0.5 text-[10px] rounded font-medium transition-colors " +
                (selectedFilterLevel === "ERROR"
                  ? "bg-red-900/60 text-red-200 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800")
              }
            >
              Errors
            </button>
          </div>
        </div>

        {/* Action Buttons: Auto-scroll, Copy, Clear, Maximize, Close */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={function () {
              setIsAutoScrollEnabled(!isAutoScrollEnabled);
            }}
            title={isAutoScrollEnabled ? "Pause Auto-scroll" : "Resume Auto-scroll"}
            className={
              "p-1 rounded text-zinc-400 hover:text-white transition-colors " +
              (isAutoScrollEnabled ? "text-blue-400" : "text-zinc-500")
            }
          >
            {isAutoScrollEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleCopyAllLogs}
            title="Copy all logs"
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {hasCopiedLogs ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={props.onClearLogs}
            title="Clear logs"
            className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={function () {
              setIsMaximized(!isMaximized);
            }}
            title={isMaximized ? "Restore size" : "Maximize height"}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Log Output Content Body */}
      <div
        ref={logsScrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-1 space-y-0.5 divide-y divide-zinc-900 bg-black/40"
      >
        {renderedLogRows.length > 0 ? (
          renderedLogRows
        ) : (
          <div className="p-4 text-center text-xs text-zinc-600 font-mono">
            No telemetry records available matching current filter.
          </div>
        )}
      </div>
    </div>
  );
}
