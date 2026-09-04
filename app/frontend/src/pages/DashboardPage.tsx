import type { RawSourcesData, KeywordsData, PipelineRunRecord, NavigationTabType, CountryItem } from "../types";
import {
  Globe,
  Flame,
  MessageSquare,
  Tags,
  Play,
  ArrowRight,
  Calendar,
  Sparkles,
  Trash2
} from "lucide-react";

interface DashboardPageProps {
  rawSourcesData: RawSourcesData | null;
  keywordsData: KeywordsData | null;
  recentRunsList: PipelineRunRecord[];
  activeSourcesCount: number;
  availableCountries: CountryItem[];
  selectedCountries: string[];
  onSelectCountryOnly: (countryName: string) => void;
  onStartPipeline: () => void;
  onClearDatabase: () => void;
  isPipelineActive: boolean;
  onNavigateTab: (targetTab: NavigationTabType) => void;
}

export function formatDashboardDate(dateString?: string | null): string {
  if (!dateString) return "No runs executed yet";
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

export function DashboardPage(props: DashboardPageProps) {
  // Count trends discovered
  let totalTrendsCount = 0;
  let topTrendsList: string[] = [];
  if (props.rawSourcesData && props.rawSourcesData.x_trends24_topics) {
    totalTrendsCount = props.rawSourcesData.x_trends24_topics.length;
    topTrendsList = props.rawSourcesData.x_trends24_topics.slice(0, 6);
  }

  // Count tweets extracted across all trends
  let totalTweetsCount = 0;
  if (
    props.rawSourcesData &&
    props.rawSourcesData.x_native_explore &&
    props.rawSourcesData.x_native_explore.sample_tweets_by_trend
  ) {
    const sampleTweetsMap = props.rawSourcesData.x_native_explore.sample_tweets_by_trend;
    for (const trendKey in sampleTweetsMap) {
      if (Object.prototype.hasOwnProperty.call(sampleTweetsMap, trendKey)) {
        const tweetsForThisTrend = sampleTweetsMap[trendKey];
        totalTweetsCount = totalTweetsCount + tweetsForThisTrend.length;
      }
    }
  }

  // Count synthesized topics and total keywords count
  let totalTopicsCount = 0;
  let totalKeywordsCount = 0;
  let sampleKeywordTerms: string[] = [];
  if (props.keywordsData && props.keywordsData.topics) {
    totalTopicsCount = props.keywordsData.topics.length;
    for (let i = 0; i < props.keywordsData.topics.length; i++) {
      const topic = props.keywordsData.topics[i];
      if (topic.terms && topic.terms.length > 0) {
        totalKeywordsCount += topic.terms.length;
        for (let j = 0; j < Math.min(topic.terms.length, 3); j++) {
          if (sampleKeywordTerms.length < 8 && !sampleKeywordTerms.includes(topic.terms[j])) {
            sampleKeywordTerms.push(topic.terms[j]);
          }
        }
      }
    }
  }

  let activeScopeLabel = "Worldwide";
  if (props.selectedCountries && props.selectedCountries.length === 1) {
    activeScopeLabel = props.selectedCountries[0];
  } else if (props.selectedCountries && props.selectedCountries.length > 1) {
    if (props.availableCountries && props.selectedCountries.length === props.availableCountries.length) {
      activeScopeLabel = `All (${props.availableCountries.length} Countries)`;
    } else {
      activeScopeLabel = `${props.selectedCountries.length} Countries`;
    }
  } else {
    activeScopeLabel = "Worldwide";
  }

  const latestRun = props.recentRunsList.length > 0 ? props.recentRunsList[0] : null;

  return (
    <div className="space-y-6 max-w-6xl py-2 animate-in fade-in-50 duration-300">
      {/* Top Action & System Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40 select-none">
        <div className="flex items-center gap-2.5">
          <button
            onClick={function () {
              if (window.confirm("Are you sure you want to clear the database and all cached intelligence? This will reset all counts and start completely fresh.")) {
                props.onClearDatabase();
              }
            }}
            disabled={props.isPipelineActive}
            className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 font-medium text-xs border border-red-500/25 hover:border-red-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer disabled:opacity-40 shadow-xs"
            title="Clear all stored database runs and reset dashboard stats"
          >
            <Trash2 className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
            <span>Clear Database</span>
          </button>
        </div>

        {/* Action Buttons: Run Pipeline, View Tweets, View Keywords */}
        <div className="flex items-center flex-wrap gap-3">
          <button
            onClick={function () {
              if (props.selectedCountries && props.selectedCountries.length > 0) {
                props.onStartPipeline();
              } else {
                props.onNavigateTab("pipeline");
              }
            }}
            disabled={props.isPipelineActive}
            className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current transition-transform group-hover:scale-110" />
            <span>
              {props.isPipelineActive
                ? "Pipeline Running..."
                : `Run Pipeline (${activeScopeLabel})`}
            </span>
          </button>

          <button
            onClick={function () {
              props.onNavigateTab("tweets");
            }}
            className="group inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-card hover:bg-muted/40 text-foreground font-medium text-xs border border-border/70 hover:border-border hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer shadow-xs"
          >
            <MessageSquare className="w-3.5 h-3.5 text-purple-400 transition-transform group-hover:scale-110" />
            <span>View Tweets</span>
            {totalTweetsCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400">
                {totalTweetsCount}
              </span>
            )}
          </button>

          <button
            onClick={function () {
              props.onNavigateTab("keywords");
            }}
            className="group inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-card hover:bg-muted/40 text-foreground font-medium text-xs border border-border/70 hover:border-border hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer shadow-xs"
          >
            <Tags className="w-3.5 h-3.5 text-emerald-400 transition-transform group-hover:scale-110" />
            <span>View Keywords</span>
            {totalKeywordsCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400">
                {totalKeywordsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Target Scope & Country Quick Switcher Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-card/60 border border-border/50 shadow-xs backdrop-blur-sm select-none">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">Target Intelligence Scope:</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
              {activeScopeLabel}
            </span>
          </div>
        </div>

        {/* Big, Sleek Scope Switcher Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {["Worldwide", "United States", "China", "Russia", "United Kingdom", "Pakistan"].map(function (countryName) {
            const isCountryActive =
              (countryName === "Worldwide" &&
                (!props.selectedCountries ||
                  props.selectedCountries.length === 0 ||
                  (props.selectedCountries.length === 1 && props.selectedCountries[0] === "Worldwide"))) ||
              (props.selectedCountries &&
                props.selectedCountries.length === 1 &&
                props.selectedCountries[0] === countryName);
            return (
              <button
                key={countryName}
                onClick={function () {
                  props.onSelectCountryOnly(countryName);
                }}
                disabled={props.isPipelineActive}
                className={
                  "text-xs px-3.5 py-2 rounded-xl font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 " +
                  (isCountryActive
                    ? "bg-sky-500 text-white shadow-sm font-semibold"
                    : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border/70")
                }
              >
                {countryName}
              </button>
            );
          })}
          <button
            onClick={function () {
              props.onNavigateTab("pipeline");
            }}
            className="text-xs px-3 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1 cursor-pointer font-medium"
            title="Configure all countries in Pipeline tab"
          >
            <span>All Countries</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 4 Stat Cards using Uiverse.io Component with Borders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 select-none">
        {/* Active Sources */}
        <div className="uiverse-card hover:-translate-y-0.5 transition-all">
          <div className="title">
            <span style={{ backgroundColor: "#3b82f6" }}>
              <Globe />
            </span>
            <p className="title-text">Active Sources</p>
            <p className="percent" style={{ color: "#3b82f6" }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1792 1792" fill="currentColor" height="14" width="14">
                <path d="M1408 1216q0 26-19 45t-45 19h-896q-26 0-45-19t-19-45 19-45l448-448q19-19 45-19t45 19l448 448q19 19 19 45z" />
              </svg>
              100%
            </p>
          </div>
          <div className="data">
            <p>{props.activeSourcesCount}</p>
            <div className="range">
              <div className="fill" style={{ width: "85%", backgroundColor: "#3b82f6" }}></div>
            </div>
          </div>
        </div>

        {/* Trends Ingested */}
        <div className="uiverse-card hover:-translate-y-0.5 transition-all">
          <div className="title">
            <span style={{ backgroundColor: "#f59e0b" }}>
              <Flame />
            </span>
            <p className="title-text">Trends Ingested</p>
            <p className="percent" style={{ color: "#f59e0b" }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1792 1792" fill="currentColor" height="14" width="14">
                <path d="M1408 1216q0 26-19 45t-45 19h-896q-26 0-45-19t-19-45 19-45l448-448q19-19 45-19t45 19l448 448q19 19 19 45z" />
              </svg>
              Live
            </p>
          </div>
          <div className="data">
            <p>{totalTrendsCount}</p>
            <div className="range">
              <div className="fill" style={{ width: "70%", backgroundColor: "#f59e0b" }}></div>
            </div>
          </div>
        </div>

        {/* Tweets Mined */}
        <div className="uiverse-card hover:-translate-y-0.5 transition-all">
          <div className="title">
            <span style={{ backgroundColor: "#8b5cf6" }}>
              <MessageSquare />
            </span>
            <p className="title-text">Tweets Mined</p>
            <p className="percent" style={{ color: "#8b5cf6" }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1792 1792" fill="currentColor" height="14" width="14">
                <path d="M1408 1216q0 26-19 45t-45 19h-896q-26 0-45-19t-19-45 19-45l448-448q19-19 45-19t45 19l448 448q19 19 19 45z" />
              </svg>
              Deep
            </p>
          </div>
          <div className="data">
            <p>{totalTweetsCount}</p>
            <div className="range">
              <div className="fill" style={{ width: "90%", backgroundColor: "#8b5cf6" }}></div>
            </div>
          </div>
        </div>

        {/* Synthesized Keywords */}
        <div className="uiverse-card hover:-translate-y-0.5 transition-all">
          <div className="title">
            <span style={{ backgroundColor: "#10B981" }}>
              <Tags />
            </span>
            <p className="title-text">Synthesized Keywords</p>
            <p className="percent" style={{ color: "#10B981" }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1792 1792" fill="currentColor" height="14" width="14">
                <path d="M1408 1216q0 26-19 45t-45 19h-896q-26 0-45-19t-19-45 19-45l448-448q19-19 45-19t45 19l448 448q19 19 19 45z" />
              </svg>
              {totalTopicsCount} Topics
            </p>
          </div>
          <div className="data">
            <p>{totalKeywordsCount}</p>
            <div className="range">
              <div className="fill" style={{ width: "100%", backgroundColor: "#10B981" }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width Latest Intelligence Ingestion Snapshot */}
      <div className="w-full rounded-2xl bg-card border border-border/50 p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Latest Intelligence Ingestion</h3>
              <p className="text-xs text-muted-foreground">
                {latestRun
                  ? `Last ran on ${formatDashboardDate(latestRun.finished_at || latestRun.started_at)}`
                  : "No runs executed yet"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {latestRun && (
              <span
                className={
                  "text-[10px] font-mono px-2.5 py-1 rounded-full font-medium " +
                  (latestRun.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20")
                }
              >
                {latestRun.status.toUpperCase()}
              </span>
            )}
            <button
              onClick={() => props.onNavigateTab("sources")}
              className="text-xs text-primary hover:underline font-medium flex items-center gap-1 cursor-pointer"
            >
              <span>Sources ({props.activeSourcesCount})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Top Trends Discovered */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Discovered Trending Hashtags
            </span>
            <button
              onClick={() => props.onNavigateTab("trends")}
              className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
            >
              View all trends →
            </button>
          </div>
          {topTrendsList.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topTrendsList.map((trend, idx) => (
                <button
                  key={idx}
                  onClick={() => props.onNavigateTab("tweets")}
                  className="px-3 py-1.5 rounded-xl text-xs bg-muted/40 hover:bg-primary/15 text-foreground hover:text-primary transition-colors border border-border/40 cursor-pointer font-medium"
                >
                  {trend}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/70 italic">
              No trends ingested yet. Run the pipeline to harvest trending hashtags.
            </p>
          )}
        </div>

        {/* Extracted Keywords Preview */}
        <div className="pt-2 border-t border-border/30">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Extracted Keywords
            </span>
            <button
              onClick={() => props.onNavigateTab("keywords")}
              className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
            >
              Inspect keyword sets →
            </button>
          </div>
          {sampleKeywordTerms.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sampleKeywordTerms.map((term, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                >
                  {term}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/70 italic">
              Run the pipeline to generate targeted domain keywords.
            </p>
          )}
        </div>
      </div>

      {/* Sleek, Minimal Navigation Buttons (Subtext Removed) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 select-none">
        <button
          onClick={() => props.onNavigateTab("trends")}
          className="p-4 rounded-2xl bg-card hover:bg-muted/40 border border-border/60 hover:border-border cursor-pointer transition-all duration-200 group shadow-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Flame className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-xs font-semibold text-foreground">Trending Topics</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => props.onNavigateTab("headlines")}
          className="p-4 rounded-2xl bg-card hover:bg-muted/40 border border-border/60 hover:border-border cursor-pointer transition-all duration-200 group shadow-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Globe className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-xs font-semibold text-foreground">News Headlines</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => props.onNavigateTab("history")}
          className="p-4 rounded-2xl bg-card hover:bg-muted/40 border border-border/60 hover:border-border cursor-pointer transition-all duration-200 group shadow-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Calendar className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-xs font-semibold text-foreground">Run History</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>
    </div>
  );
}
