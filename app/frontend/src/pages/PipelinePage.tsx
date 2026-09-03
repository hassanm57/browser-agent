import type { CountryItem } from "../types";
import { Play, Square, CheckSquare, Square as EmptySquare, Globe, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

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

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Pipeline Controller
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure target countries, trigger autonomous multi-source scrapers, and monitor live progress.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {isPipelineActive ? (
            <button
              onClick={props.onCancelPipeline}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-sm transition-all animate-pulse"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Cancel Pipeline</span>
            </button>
          ) : (
            <button
              onClick={props.onStartPipeline}
              disabled={props.selectedCountries.length === 0}
              className={
                "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold shadow-sm transition-all " +
                (props.selectedCountries.length > 0
                  ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed")
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
    </div>
  );
}
