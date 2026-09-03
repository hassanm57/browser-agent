import type { CountryItem, PipelineRunRecord } from "../types";
import { Play, Square, CheckSquare, Square as EmptySquare, Globe, Loader2, AlertCircle, CheckCircle2, Calendar, Clock } from "lucide-react";

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
}

export function PipelinePage(props: PipelinePageProps) {
  // Render country selection cards using traditional for loop
  const renderedCountryCards = [];
  for (let countryIndex = 0; countryIndex < props.availableCountries.length; countryIndex++) {
    const country = props.availableCountries[countryIndex];
    
    // Check if country is currently selected using simple loop
    let isSelected = false;
    for (let selectedIndex = 0; selectedIndex < props.selectedCountries.length; selectedIndex++) {
      if (props.selectedCountries[selectedIndex] === country.name) {
        isSelected = true;
        break;
      }
    }

    let tierBadgeClass = "bg-zinc-800/60 text-zinc-400";
    if (country.is_home) {
      tierBadgeClass = "bg-emerald-500/10 text-emerald-400 font-medium";
    } else if (country.tier === "UN P5") {
      tierBadgeClass = "bg-blue-500/10 text-blue-400 font-medium";
    } else if (country.tier === "strategic") {
      tierBadgeClass = "bg-purple-500/10 text-purple-400 font-medium";
    }

    renderedCountryCards.push(
      <div
        key={country.name}
        onClick={function () {
          if (props.pipelineStatus !== "running") {
            props.onToggleCountry(country.name);
          }
        }}
        className={
          "p-3.5 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between select-none " +
          (isSelected
            ? "bg-blue-500/10 border-blue-500/40 shadow-xs text-zinc-100"
            : "bg-zinc-900/30 border-zinc-850 hover:bg-zinc-900/60 hover:border-zinc-800 text-zinc-400")
        }
      >
        <div className="flex items-center gap-3">
          <div className="text-zinc-400">
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-400" strokeWidth={1.75} />
            ) : (
              <EmptySquare className="w-4 h-4 text-zinc-600" strokeWidth={1.75} />
            )}
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200">{country.name}</div>
            <span className="text-[10px] text-zinc-500 font-mono">/{country.trends24_slug}</span>
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
    );
  }

  const isPipelineActive = props.pipelineStatus === "running";
  const recentRuns = props.recentRunsList || [];
  const latestRun = recentRuns.length > 0 ? recentRuns[0] : null;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Banner with Date and Time of Last Pipeline Run */}
      <div className="p-4 rounded-xl bg-card border border-border/50 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {isPipelineActive ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Calendar className="w-5 h-5" strokeWidth={1.75} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {isPipelineActive
                  ? "Pipeline Execution Currently Active"
                  : latestRun
                  ? `Last ran on ${formatPipelineDate(latestRun.finished_at || latestRun.started_at)}`
                  : "No pipeline runs executed yet"}
              </span>
              {latestRun && !isPipelineActive && (
                <span
                  className={
                    "text-[10px] font-mono font-medium px-2 py-0.5 rounded-full " +
                    (latestRun.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : latestRun.status === "running"
                      ? "bg-primary/10 text-primary"
                      : "bg-amber-500/10 text-amber-400")
                  }
                >
                  {latestRun.status.toUpperCase()}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isPipelineActive
                ? "Autonomous scrapers and browser agents are executing."
                : latestRun
                ? `Country: ${latestRun.country_name} • Run #${latestRun.id} permanently saved in SQLite`
                : "Select target countries below and click Run Pipeline to initiate."}
            </p>
          </div>
        </div>

        {latestRun && props.onInspectRun && !isPipelineActive && (
          <button
            onClick={() => props.onInspectRun!(latestRun.id)}
            className="px-3 py-1.5 text-xs rounded-lg bg-muted/40 hover:bg-muted/80 text-foreground transition-colors font-medium border border-border/40 shrink-0 self-start sm:self-center cursor-pointer"
          >
            Inspect Keywords →
          </button>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Pipeline Controller
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure target countries, trigger autonomous multi-source scrapers, and monitor live progress.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {isPipelineActive ? (
            <button
              onClick={props.onCancelPipeline}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-sm transition-all animate-pulse cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Cancel Pipeline</span>
            </button>
          ) : (
            <button
              onClick={props.onStartPipeline}
              disabled={props.selectedCountries.length === 0}
              className={
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all " +
                (props.selectedCountries.length > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-not-allowed")
              }
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                Run Pipeline ({props.selectedCountries.length} Countries)
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Progress & Live Activity Status Banner */}
      <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isPipelineActive ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            ) : props.pipelineStatus === "completed" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : props.pipelineStatus === "cancelled" ? (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            ) : (
              <Globe className="w-4 h-4 text-zinc-400" />
            )}
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Status: {props.pipelineStatus}
            </span>
          </div>

          <span className="text-xs font-mono font-medium text-blue-400">
            {props.pipelineProgressPercentage}%
          </span>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300 rounded-full"
            style={{ width: props.pipelineProgressPercentage + "%" }}
          ></div>
        </div>

        {/* Current Activity Subtext */}
        <div className="text-[11px] text-zinc-400 font-mono flex items-center justify-between">
          <span>{props.currentPipelineStepMessage || "System ready. Press Run Pipeline to execute."}</span>
          {isPipelineActive && (
            <span className="text-zinc-500 text-[10px]">Inspect Live Logs below for DOM events</span>
          )}
        </div>
      </div>

      {/* Country Selection Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">
              Target Countries ({props.selectedCountries.length} of {props.availableCountries.length} selected)
            </h3>
            <p className="text-[11px] text-zinc-500">
              Each country will run through trends24 scraping, news headline aggregation, X.com deep mining, and LLM synthesis.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={props.onSelectAllCountries}
              disabled={isPipelineActive}
              className="text-[11px] px-2.5 py-1 rounded bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-750 font-medium transition-colors"
            >
              Select All
            </button>
            <button
              onClick={props.onDeselectAllCountries}
              disabled={isPipelineActive}
              className="text-[11px] px-2.5 py-1 rounded bg-zinc-850 hover:bg-zinc-800 text-zinc-400 border border-zinc-750 font-medium transition-colors"
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
        <div className="p-4 rounded-xl bg-card border border-border/50 shadow-sm space-y-3 select-none">
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">
                Past Pipeline Runs & Timestamps ({recentRuns.length} Total Runs Stored)
              </h3>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Permanently stored in SQLite
            </span>
          </div>

          <div className="divide-y divide-border/40 max-h-64 overflow-y-auto">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="py-2.5 flex items-center justify-between text-xs hover:bg-muted/10 px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-muted-foreground/70">#{run.id}</span>
                  <span className="font-semibold text-foreground">{run.country_name}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <span>Ran on</span>
                    <strong className="text-foreground/90 font-medium">
                      {formatPipelineDate(run.finished_at || run.started_at)}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "text-[10px] font-mono px-2 py-0.5 rounded-full font-medium " +
                      (run.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : run.status === "running"
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-500/10 text-amber-400")
                    }
                  >
                    {run.status.toUpperCase()}
                  </span>
                  {props.onInspectRun && (
                    <button
                      onClick={() => props.onInspectRun!(run.id)}
                      className="text-[11px] text-primary hover:underline font-medium ml-2 cursor-pointer"
                    >
                      Inspect →
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
