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
  Play,
  Search,
  Download,
  X
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
  const [searchQueryText, setSearchQueryText] = useState("");
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [hasCopiedLogs, setHasCopiedLogs] = useState(false);
  const [panelHeight, setPanelHeight] = useState(300);
  const [isDraggingResize, setIsDraggingResize] = useState(false);

  const logsScrollContainerRef = useRef<HTMLDivElement>(null);

  // Automatically scroll down when new logs arrive, if auto-scroll is enabled
  useEffect(function () {
    if (isAutoScrollEnabled && logsScrollContainerRef.current) {
      logsScrollContainerRef.current.scrollTop = logsScrollContainerRef.current.scrollHeight;
    }
  }, [props.logsList, isAutoScrollEnabled]);

  // Handle drag resizing of the log panel
  useEffect(function () {
    function handleMouseMove(event: MouseEvent) {
      if (!isDraggingResize) return;
      const windowHeight = window.innerHeight;
      const calculatedHeight = windowHeight - event.clientY;
      if (calculatedHeight >= 140 && calculatedHeight <= windowHeight * 0.75) {
        setPanelHeight(calculatedHeight);
      }
    }

    function handleMouseUp() {
      setIsDraggingResize(false);
    }

    if (isDraggingResize) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return function () {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingResize]);

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

  // Handle downloading all logs as a text file
  function handleDownloadLogs() {
    const formattedLogLines = [];
    for (let logIndex = 0; logIndex < props.logsList.length; logIndex++) {
      const currentLog = props.logsList[logIndex];
      formattedLogLines.push(
        "[" + currentLog.timestamp + "] [" + currentLog.level + "] " + currentLog.message
      );
    }
    const fullLogString = formattedLogLines.join("\n");
    const blobObject = new Blob([fullLogString], { type: "text/plain" });
    const downloadUrl = URL.createObjectURL(blobObject);
    const anchorElement = document.createElement("a");
    anchorElement.href = downloadUrl;
    anchorElement.download = `pipeline_telemetry_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    anchorElement.click();
    URL.revokeObjectURL(downloadUrl);
  }

  // Calculate counts for each level using traditional for loops
  let stepCount = 0;
  let browserCount = 0;
  let llmCount = 0;
  let successCount = 0;
  let warnCount = 0;
  let errorCount = 0;

  for (let logIndex = 0; logIndex < props.logsList.length; logIndex++) {
    const currentLogLevel = props.logsList[logIndex].level;
    if (currentLogLevel === "STEP") {
      stepCount++;
    } else if (currentLogLevel === "BROWSER" || currentLogLevel === "SCROLL") {
      browserCount++;
    } else if (currentLogLevel === "LLM") {
      llmCount++;
    } else if (currentLogLevel === "SUCCESS") {
      successCount++;
    } else if (currentLogLevel === "WARN") {
      warnCount++;
    } else if (currentLogLevel === "ERROR") {
      errorCount++;
    }
  }

  // Filter logs using traditional for loop without array.filter
  const filteredLogsArray = [];
  const normalizedSearch = searchQueryText.trim().toLowerCase();

  for (let logIndex = 0; logIndex < props.logsList.length; logIndex++) {
    const currentLog = props.logsList[logIndex];

    // Filter by category
    let matchesLevel = false;
    if (selectedFilterLevel === "ALL") {
      matchesLevel = true;
    } else if (selectedFilterLevel === "STEP" && currentLog.level === "STEP") {
      matchesLevel = true;
    } else if (selectedFilterLevel === "BROWSER" && (currentLog.level === "BROWSER" || currentLog.level === "SCROLL")) {
      matchesLevel = true;
    } else if (selectedFilterLevel === "LLM" && currentLog.level === "LLM") {
      matchesLevel = true;
    } else if (selectedFilterLevel === "SUCCESS" && currentLog.level === "SUCCESS") {
      matchesLevel = true;
    } else if (selectedFilterLevel === "WARN" && currentLog.level === "WARN") {
      matchesLevel = true;
    } else if (selectedFilterLevel === "ERROR" && currentLog.level === "ERROR") {
      matchesLevel = true;
    }

    // Filter by search query
    let matchesSearch = true;
    if (normalizedSearch.length > 0) {
      const messageText = currentLog.message.toLowerCase();
      const levelText = currentLog.level.toLowerCase();
      if (!messageText.includes(normalizedSearch) && !levelText.includes(normalizedSearch)) {
        matchesSearch = false;
      }
    }

    if (matchesLevel && matchesSearch) {
      filteredLogsArray.push(currentLog);
    }
  }

  // Render log rows using traditional for loop without array.map
  const renderedLogRows = [];
  for (let logIndex = 0; logIndex < filteredLogsArray.length; logIndex++) {
    const logItem = filteredLogsArray[logIndex];

    let badgeColorClass = "text-zinc-400 bg-zinc-800/60 border-zinc-700/60";
    if (logItem.level === "STEP") {
      badgeColorClass = "text-blue-400 bg-blue-950/50 border-blue-800/60";
    } else if (logItem.level === "SUCCESS") {
      badgeColorClass = "text-emerald-400 bg-emerald-950/50 border-emerald-800/60";
    } else if (logItem.level === "WARN") {
      badgeColorClass = "text-amber-400 bg-amber-950/50 border-amber-800/60";
    } else if (logItem.level === "ERROR") {
      badgeColorClass = "text-red-400 bg-red-950/50 border-red-800/60";
    } else if (logItem.level === "BROWSER") {
      badgeColorClass = "text-purple-400 bg-purple-950/50 border-purple-800/60";
    } else if (logItem.level === "SCROLL") {
      badgeColorClass = "text-cyan-400 bg-cyan-950/50 border-cyan-800/60";
    } else if (logItem.level === "LLM") {
      badgeColorClass = "text-orange-400 bg-orange-950/50 border-orange-800/60";
    }

    renderedLogRows.push(
      <div
        key={logItem.id}
        className="flex items-start gap-2.5 py-1 px-3 hover:bg-white/[0.04] font-mono text-[11px] leading-relaxed transition-colors group"
      >
        <span className="text-muted-foreground/60 shrink-0 select-none text-[10px] pt-0.5">
          {logItem.timestamp}
        </span>
        <span
          className={
            "px-1.5 py-0.2 rounded border text-[9px] font-semibold tracking-wide shrink-0 select-none " +
            badgeColorClass
          }
        >
          {logItem.level}
        </span>
        <span className="text-zinc-200 break-all whitespace-pre-wrap flex-1 group-hover:text-white">
          {logItem.message}
        </span>
      </div>
    );
  }

  // If collapsed, display a sleek persistent bottom strip
  if (!props.isOpen) {
    const latestLogMessage =
      props.logsList.length > 0 ? props.logsList[props.logsList.length - 1].message : "System idle. Ready to stream.";

    return (
      <div
        onClick={props.onToggleOpen}
        className="h-8 bg-card/90 backdrop-blur-md border-t border-border/60 px-4 flex items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors select-none"
      >
        <div className="flex items-center gap-2 overflow-hidden text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <ChevronUp className="w-3.5 h-3.5 text-primary" />
            Live Telemetry & Logs
          </span>
          <span className="text-border">•</span>
          <span className="truncate text-muted-foreground font-mono text-[11px]">{latestLogMessage}</span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[10px] bg-muted/70 text-foreground px-2 py-0.5 rounded-full font-mono font-medium border border-border/40">
            {props.logsList.length} entries
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </div>
      </div>
    );
  }

  const effectiveHeightStyle = isMaximized ? { height: "70vh" } : { height: `${panelHeight}px` };

  return (
    <div
      style={effectiveHeightStyle}
      className="bg-card/95 backdrop-blur-xl border-t border-border/70 flex flex-col transition-all shadow-2xl relative select-none"
    >
      {/* Top Drag Resize Handle */}
      <div
        onMouseDown={() => setIsDraggingResize(true)}
        className="h-1.5 w-full bg-transparent hover:bg-primary/30 active:bg-primary cursor-row-resize flex items-center justify-center transition-colors group absolute top-0 left-0 right-0 z-10"
        title="Drag up or down to resize"
      >
        <div className="w-8 h-0.5 bg-border rounded-full group-hover:bg-primary"></div>
      </div>

      {/* Control Bar Header */}
      <div className="h-10 px-3 border-b border-border/60 flex items-center justify-between bg-muted/20 gap-3 pt-1">
        {/* Left Side: Collapse Button & Title */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={props.onToggleOpen}
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5 text-primary" />
            <span>Telemetry</span>
          </button>
          <span className="text-[10px] font-mono text-muted-foreground">
            ({filteredLogsArray.length}/{props.logsList.length})
          </span>
        </div>

        {/* Middle Section: Filter Chips */}
        <div className="hidden lg:flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setSelectedFilterLevel("ALL")}
            className={
              "px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors cursor-pointer " +
              (selectedFilterLevel === "ALL"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
            }
          >
            All ({props.logsList.length})
          </button>
          <button
            onClick={() => setSelectedFilterLevel("STEP")}
            className={
              "px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors cursor-pointer " +
              (selectedFilterLevel === "STEP"
                ? "bg-blue-600 text-white font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-blue-400")
            }
          >
            Steps ({stepCount})
          </button>
          <button
            onClick={() => setSelectedFilterLevel("BROWSER")}
            className={
              "px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors cursor-pointer " +
              (selectedFilterLevel === "BROWSER"
                ? "bg-purple-600 text-white font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-purple-400")
            }
          >
            Browser ({browserCount})
          </button>
          <button
            onClick={() => setSelectedFilterLevel("LLM")}
            className={
              "px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors cursor-pointer " +
              (selectedFilterLevel === "LLM"
                ? "bg-orange-600 text-white font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-orange-400")
            }
          >
            LLM ({llmCount})
          </button>
          <button
            onClick={() => setSelectedFilterLevel("SUCCESS")}
            className={
              "px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors cursor-pointer " +
              (selectedFilterLevel === "SUCCESS"
                ? "bg-emerald-600 text-white font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-emerald-400")
            }
          >
            Success ({successCount})
          </button>
          <button
            onClick={() => setSelectedFilterLevel("WARN")}
            className={
              "px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors cursor-pointer " +
              (selectedFilterLevel === "WARN"
                ? "bg-amber-600 text-white font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-amber-400")
            }
          >
            Warns ({warnCount})
          </button>
          <button
            onClick={() => setSelectedFilterLevel("ERROR")}
            className={
              "px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors cursor-pointer " +
              (selectedFilterLevel === "ERROR"
                ? "bg-red-600 text-white font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-red-400")
            }
          >
            Errors ({errorCount})
          </button>
        </div>

        {/* Right Section: Search & Actions */}
        <div className="flex items-center gap-1.5">
          {/* Quick Search Input */}
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-muted-foreground absolute left-2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQueryText}
              onChange={(e) => setSearchQueryText(e.target.value)}
              className="h-6 w-28 sm:w-40 pl-7 pr-6 text-[11px] font-mono rounded-md bg-background/70 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-all"
            />
            {searchQueryText.length > 0 && (
              <button
                onClick={() => setSearchQueryText("")}
                className="absolute right-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Auto Scroll Toggle */}
          <button
            onClick={() => setIsAutoScrollEnabled(!isAutoScrollEnabled)}
            title={isAutoScrollEnabled ? "Pause Auto-scroll" : "Resume Auto-scroll"}
            className={
              "p-1.5 rounded-md transition-colors cursor-pointer " +
              (isAutoScrollEnabled
                ? "text-primary bg-primary/10 hover:bg-primary/20"
                : "text-muted-foreground hover:bg-muted/60")
            }
          >
            {isAutoScrollEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          {/* Copy Logs Button */}
          <button
            onClick={handleCopyAllLogs}
            title="Copy all logs"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            {hasCopiedLogs ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Download Logs Button */}
          <button
            onClick={handleDownloadLogs}
            title="Export logs as TXT"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Clear Logs Button */}
          <button
            onClick={props.onClearLogs}
            title="Clear logs"
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Maximize Toggle */}
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "Restore size" : "Maximize height"}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
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
        className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5 divide-y divide-border/20 bg-background/50 select-text"
      >
        {renderedLogRows.length > 0 ? (
          renderedLogRows
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground font-mono">
            No telemetry records match the current filter or search query.
          </div>
        )}
      </div>
    </div>
  );
}

