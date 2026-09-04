import { useState } from "react";
import type { CountryItem, PipelineRunRecord } from "../types";
import {
  Play,
  Square,
  CheckSquare,
  Square as EmptySquare,
  Globe,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  Flame,
  Radio,
  Cpu,
  MessageSquare
} from "lucide-react";

export function formatPipelineDate(dateString?: string | null): string {
  if (!dateString) return "No runs recorded yet";
  const dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) return dateString;

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"
  ];
  const day = dateObj.getDate();
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();

  let hours = dateObj.getHours();
  const minutes = dateObj.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${day}-${month}-${year}, ${hours}:${minutes}${ampm}`;
}

interface PipelinePageProps {
  availableCountries: CountryItem[];
  selectedCountries: string[];
  onToggleCountry: (countryName: string) => void;
  onSelectAllCountries: () => void;
  onDeselectAllCountries: () => void;
  pipelineStatus: "idle" | "running" | "completed" | "cancelled" | "error";
  currentPipelineStepMessage: string;
  pipelineProgressPercentage: number;
  onStartPipeline: () => void;
  onCancelPipeline: () => void;
  recentRunsList?: PipelineRunRecord[];
  onInspectRun?: (runId: number) => void;
  activePipelineCountry?: string | null;
  currentPipelinePhase?: string;
}

export function PipelinePage(props: PipelinePageProps) {
  const [countrySearchFilter, setCountrySearchFilter] = useState("");

  const isPipelineActive = props.pipelineStatus === "running";
  const recentRuns = props.recentRunsList || [];
  const latestRun = recentRuns.length > 0 ? recentRuns[0] : null;

  // 5 Strategic Phases definition for visual stepper updated to current news-first pipeline
  const PIPELINE_PHASES = [
    { id: "news_sources", name: "News Intel", desc: "17 Sources & Feeds", icon: Globe },
    { id: "trends24", name: "Trends24", desc: "Regional News-Filter", icon: Flame },
    { id: "llm_synthesis", name: "Query Synthesis", desc: "Boolean Query LLM", icon: Cpu },
    { id: "x_mining", name: "X.com Mining", desc: "Tabs & 10d Tweets", icon: MessageSquare },
    { id: "done", name: "15 Keywords", desc: "SQLite & JSON Export", icon: CheckCircle2 }
  ];

  // Map phase string to index for stepper progression
  function getPhaseStepIndex(phaseName?: string): number {
    if (!phaseName || phaseName === "init") return 0;
    if (phaseName === "news_sources") return 1;
    if (phaseName === "trends24") return 2;
    if (phaseName === "llm_synthesis") return 3;
    if (phaseName === "x_mining") return 4;
    if (phaseName === "done") return 5;
    return 0;
  }

  const activePhaseIndex = getPhaseStepIndex(props.currentPipelinePhase);

  // Filter countries using traditional for loop
  const filteredCountriesList: CountryItem[] = [];
  const normalizedSearch = countrySearchFilter.trim().toLowerCase();

  for (let countryIndex = 0; countryIndex < props.availableCountries.length; countryIndex++) {
    const country = props.availableCountries[countryIndex];
    if (
      normalizedSearch.length === 0 ||
      country.name.toLowerCase().includes(normalizedSearch) ||
      country.trends24_slug.toLowerCase().includes(normalizedSearch) ||
      country.tier.toLowerCase().includes(normalizedSearch)
    ) {
      filteredCountriesList.push(country);
    }
  }

  // Render country selection cards using traditional for loop
  const renderedCountryCards = [];
  for (let countryIndex = 0; countryIndex < filteredCountriesList.length; countryIndex++) {
    const country = filteredCountriesList[countryIndex];
    
    // Check if country is currently selected using simple loop
    let isSelected = false;
    for (let selectedIndex = 0; selectedIndex < props.selectedCountries.length; selectedIndex++) {
      if (props.selectedCountries[selectedIndex] === country.name) {
        isSelected = true;
        break;
      }
    }

    const isThisCountryActive = isPipelineActive && props.activePipelineCountry === country.name;

    let tierBadgeClass = "bg-muted/60 text-muted-foreground";
    if (country.tier === "global") {
      tierBadgeClass = "bg-sky-500/10 text-sky-400 font-medium border border-sky-500/30";
    } else if (country.is_home) {
      tierBadgeClass = "bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20";
    } else if (country.tier === "UN P5") {
      tierBadgeClass = "bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20";
    } else if (country.tier === "strategic") {
      tierBadgeClass = "bg-purple-500/10 text-purple-400 font-medium border border-purple-500/20";
    }

    renderedCountryCards.push(
      <div
        key={country.name}
        onClick={function () {
          if (!isPipelineActive) {
            props.onToggleCountry(country.name);
          }
        }}
        className={
          "p-3.5 rounded-xl border transition-all duration-200 select-none relative " +
          (isThisCountryActive
            ? "bg-primary/10 border-primary ring-2 ring-primary/40 shadow-md shadow-primary/10 animate-pulse"
            : isSelected
            ? "bg-primary/5 border-primary/40 shadow-xs text-foreground cursor-pointer hover:border-primary/60"
            : "bg-card/40 border-border/50 hover:bg-card hover:border-border text-muted-foreground cursor-pointer")
        }
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground">
              {isSelected ? (
                <CheckSquare className="w-4 h-4 text-primary" strokeWidth={2} />
              ) : (
                <EmptySquare className="w-4 h-4 text-muted-foreground/60" strokeWidth={1.75} />
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>{country.name}</span>
                {isThisCountryActive && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] bg-primary text-primary-foreground font-mono font-medium">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Mining
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground/80 font-mono">/{country.trends24_slug}</span>
            </div>
          </div>

          <span
            className={
              "text-[9px] font-semibold px-2 py-0.5 rounded-full tracking-wide uppercase " +
              tierBadgeClass
            }
          >
            {country.tier}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Sleek Minimal Header & Execution Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Pipeline Controller
            </h2>
            <span
              className={
                "inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full font-medium " +
                (isPipelineActive
                  ? "bg-primary/15 text-primary animate-pulse border border-primary/20"
                  : latestRun && latestRun.status === "completed"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-muted text-muted-foreground border border-border/40")
              }
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              {isPipelineActive ? "RUNNING" : latestRun ? latestRun.status.toUpperCase() : "IDLE"}
            </span>
          </div>
          {latestRun && (
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              Last run: {formatPipelineDate(latestRun.finished_at || latestRun.started_at)}
            </p>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {latestRun && props.onInspectRun && !isPipelineActive && (
            <button
              onClick={() => props.onInspectRun!(latestRun.id)}
              className="px-3 py-2 text-xs rounded-xl bg-card hover:bg-muted text-foreground transition-colors font-medium border border-border/60 cursor-pointer shadow-xs"
            >
              Inspect Keywords →
            </button>
          )}

          {isPipelineActive ? (
            <button
              onClick={props.onCancelPipeline}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Cancel Pipeline</span>
            </button>
          ) : (
            <button
              onClick={props.onStartPipeline}
              disabled={props.selectedCountries.length === 0}
              className={
                "flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all " +
                (props.selectedCountries.length > 0
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20 hover:shadow-blue-500/30 cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-not-allowed")
              }
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                Run Pipeline ({props.selectedCountries.length} {props.selectedCountries.length === 1 ? "Country" : "Countries"})
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Progress & 5-Phase Pipeline Stepper */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 space-y-4 shadow-xs">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPipelineActive ? (
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            ) : props.pipelineStatus === "completed" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : props.pipelineStatus === "cancelled" ? (
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Radio className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className="text-xs font-medium text-foreground">
              Status: <span className="capitalize">{props.pipelineStatus}</span>
            </span>
            {props.activePipelineCountry && isPipelineActive && (
              <span className="text-xs text-primary font-mono font-medium">
                • Target: {props.activePipelineCountry}
              </span>
            )}
          </div>

          <span className="text-xs font-mono font-medium text-primary">
            {props.pipelineProgressPercentage}%
          </span>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden border border-border/40 relative">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-300 rounded-full"
            style={{ width: props.pipelineProgressPercentage + "%" }}
          ></div>
        </div>

        {/* 5-Phase Visual Stepper */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
          {PIPELINE_PHASES.map((phase, phaseIndex) => {
            const PhaseIcon = phase.icon;
            const isCompleted = activePhaseIndex > phaseIndex + 1 || props.pipelineStatus === "completed";
            const isCurrent = isPipelineActive && activePhaseIndex === phaseIndex + 1;

            return (
              <div
                key={phase.id}
                className={
                  "p-2.5 rounded-xl border transition-all text-xs flex flex-col justify-between select-none " +
                  (isCurrent
                    ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/40"
                    : isCompleted
                    ? "bg-emerald-500/5 border-emerald-500/30 text-foreground"
                    : "bg-muted/20 border-border/40 text-muted-foreground")
                }
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    0{phaseIndex + 1}
                  </span>
                  {isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <PhaseIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
                  )}
                </div>
                <div>
                  <div className={"font-medium " + (isCurrent ? "text-primary font-semibold" : isCompleted ? "text-foreground" : "text-muted-foreground")}>
                    {phase.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 truncate">
                    {phase.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Current Activity: Clean live step message only when active */}
        {isPipelineActive && props.currentPipelineStepMessage && (
          <div className="text-[11px] text-muted-foreground font-mono truncate pt-1 border-t border-border/30">
            {props.currentPipelineStepMessage}
          </div>
        )}
      </div>

      {/* Target Country Selection Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>Target Countries</span>
              <span className="text-xs font-mono text-muted-foreground font-normal">
                ({props.selectedCountries.length} of {props.availableCountries.length} selected)
              </span>
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Country Input */}
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-muted-foreground absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter countries..."
                value={countrySearchFilter}
                onChange={(e) => setCountrySearchFilter(e.target.value)}
                disabled={isPipelineActive}
                className="h-7 w-36 pl-8 pr-2.5 text-xs rounded-lg bg-card border border-border/60 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-all disabled:opacity-50"
              />
            </div>

            <button
              onClick={function () {
                props.onDeselectAllCountries();
                props.onToggleCountry("Worldwide");
              }}
              disabled={isPipelineActive}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              <Globe className="w-3 h-3" />
              <span>Worldwide Only</span>
            </button>
            <button
              onClick={props.onSelectAllCountries}
              disabled={isPipelineActive}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-card hover:bg-muted text-foreground border border-border/60 font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              Select All
            </button>
            <button
              onClick={props.onDeselectAllCountries}
              disabled={isPipelineActive}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-card hover:bg-muted text-muted-foreground border border-border/60 font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              Deselect All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {renderedCountryCards}
        </div>
      </div>

      {/* Old Pipelines Execution History */}
      {recentRuns.length > 0 && (
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm space-y-3 select-none">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">
                Past Pipeline Runs & Timestamps ({recentRuns.length} Total Runs Stored)
              </h3>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              SQLite: intelligence_records.db
            </span>
          </div>

          <div className="divide-y divide-border/40 max-h-64 overflow-y-auto">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="py-2.5 flex items-center justify-between text-xs hover:bg-muted/30 px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-muted-foreground/70">#{run.id}</span>
                  <span className="font-semibold text-foreground">{run.country_name}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <span>Ran on</span>
                    <strong className="text-foreground/90 font-medium font-mono">
                      {formatPipelineDate(run.finished_at || run.started_at)}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "text-[10px] font-mono px-2.5 py-0.5 rounded-full font-medium " +
                      (run.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : run.status === "running"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20")
                    }
                  >
                    {run.status.toUpperCase()}
                  </span>
                  {props.onInspectRun && (
                    <button
                      onClick={() => props.onInspectRun!(run.id)}
                      className="text-[11px] text-primary hover:underline font-medium ml-2 cursor-pointer"
                    >
                      Inspect Keywords →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
