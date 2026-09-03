import type { RawSourcesData, KeywordsData, PipelineRunRecord, NavigationTabType } from "../types";
import {
  Globe,
  Flame,
  MessageSquare,
  Tags,
  Play,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface DashboardPageProps {
  rawSourcesData: RawSourcesData | null;
  keywordsData: KeywordsData | null;
  recentRunsList: PipelineRunRecord[];
  activeSourcesCount: number;
  onNavigateTab: (targetTab: NavigationTabType) => void;
}

export function DashboardPage(props: DashboardPageProps) {
  // Count trends discovered
  let totalTrendsCount = 0;
  if (props.rawSourcesData && props.rawSourcesData.x_trends24_topics) {
    totalTrendsCount = props.rawSourcesData.x_trends24_topics.length;
  }

  // Count tweets extracted across all trends
  let totalTweetsCount = 0;
  if (props.rawSourcesData && props.rawSourcesData.x_native_explore && props.rawSourcesData.x_native_explore.sample_tweets_by_trend) {
    const sampleTweetsMap = props.rawSourcesData.x_native_explore.sample_tweets_by_trend;
    for (const trendKey in sampleTweetsMap) {
      if (Object.prototype.hasOwnProperty.call(sampleTweetsMap, trendKey)) {
        const tweetsForThisTrend = sampleTweetsMap[trendKey];
        totalTweetsCount = totalTweetsCount + tweetsForThisTrend.length;
      }
    }
  }

  // Count synthesized topics
  let totalKeywordsTopicsCount = 0;
  if (props.keywordsData && props.keywordsData.topics) {
    totalKeywordsTopicsCount = props.keywordsData.topics.length;
  }

  // Render recent runs table rows using a traditional for loop
  const renderedRecentRunRows = [];
  const maximumRunsToDisplay = Math.min(props.recentRunsList.length, 5);

  for (let runIndex = 0; runIndex < maximumRunsToDisplay; runIndex++) {
    const runItem = props.recentRunsList[runIndex];
    const isSuccess = runItem.status === "completed";

    renderedRecentRunRows.push(
      <tr key={runItem.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40 text-xs">
        <td className="py-2.5 px-3 font-mono text-zinc-400">#{runItem.id}</td>
        <td className="py-2.5 px-3 font-medium text-zinc-200">{runItem.country_name}</td>
        <td className="py-2.5 px-3">
          <span
            className={
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium " +
              (isSuccess
                ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                : "bg-red-950/60 text-red-400 border border-red-800/40")
            }
          >
            {isSuccess ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <AlertCircle className="w-3 h-3" />
            )}
            {runItem.status}
          </span>
        </td>
        <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">
          {runItem.started_at ? runItem.started_at.replace("T", " ").slice(0, 19) : "—"}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Intelligence Overview
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Autonomous OSINT collection and deep topic keyword synthesis.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={function () {
              props.onNavigateTab("pipeline");
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Pipeline</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Active Sources</span>
            <div className="text-2xl font-bold text-zinc-100 mt-1">{props.activeSourcesCount}</div>
            <span className="text-[10px] text-zinc-500">News & RSS feeds enabled</span>
          </div>
          <div className="w-10 h-10 rounded-md bg-blue-950/40 border border-blue-900/50 flex items-center justify-center text-blue-400">
            <Globe className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Trends Ingested</span>
            <div className="text-2xl font-bold text-zinc-100 mt-1">{totalTrendsCount}</div>
            <span className="text-[10px] text-zinc-500">From trends24 & X.com</span>
          </div>
          <div className="w-10 h-10 rounded-md bg-amber-950/40 border border-amber-900/50 flex items-center justify-center text-amber-400">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Tweets Mined</span>
            <div className="text-2xl font-bold text-zinc-100 mt-1">{totalTweetsCount}</div>
            <span className="text-[10px] text-zinc-500">Filtered & noise-free</span>
          </div>
          <div className="w-10 h-10 rounded-md bg-purple-950/40 border border-purple-900/50 flex items-center justify-center text-purple-400">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Synthesized Topics</span>
            <div className="text-2xl font-bold text-zinc-100 mt-1">{totalKeywordsTopicsCount}</div>
            <span className="text-[10px] text-zinc-500">20+ keywords per topic</span>
          </div>
          <div className="w-10 h-10 rounded-md bg-emerald-950/40 border border-emerald-900/50 flex items-center justify-center text-emerald-400">
            <Tags className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Quick Access Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div
          onClick={function () {
            props.onNavigateTab("trends");
          }}
          className="p-4 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">Hot Trending Topics</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              Explore the ranked list of national trends and X native explore topics.
            </p>
          </div>
          <div className="mt-3 text-[11px] text-blue-400 font-medium">View Trends &rarr;</div>
        </div>

        <div
          onClick={function () {
            props.onNavigateTab("tweets");
          }}
          className="p-4 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">Mined Tweets</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              Browse extracted real tweets with authors, timestamps, and hashtags.
            </p>
          </div>
          <div className="mt-3 text-[11px] text-blue-400 font-medium">View Tweets &rarr;</div>
        </div>

        <div
          onClick={function () {
            props.onNavigateTab("keywords");
          }}
          className="p-4 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">Synthesized Keywords</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              Interactively edit topic chips, add terms, and export to CSV or JSON.
            </p>
          </div>
          <div className="mt-3 text-[11px] text-blue-400 font-medium">View Keywords &rarr;</div>
        </div>
      </div>

      {/* Recent Pipeline Executions Table */}
      <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/80 overflow-hidden">
        <div className="p-3.5 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-200">Recent Pipeline Executions</h3>
          </div>
          <button
            onClick={function () {
              props.onNavigateTab("history");
            }}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-medium"
          >
            View all runs
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-[11px] font-semibold text-zinc-400">
                <th className="py-2.5 px-3">Run ID</th>
                <th className="py-2.5 px-3">Country</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Started At</th>
              </tr>
            </thead>
            <tbody>
              {renderedRecentRunRows.length > 0 ? (
                renderedRecentRunRows
              ) : (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-zinc-500">
                    No pipeline runs recorded in SQLite yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
