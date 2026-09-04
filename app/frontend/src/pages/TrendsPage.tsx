import { useState } from "react";
import type { RawSourcesData } from "../types";
import { Flame, ExternalLink, RefreshCw, Hash, Filter, Globe2 } from "lucide-react";

interface TrendsPageProps {
  rawSourcesData: RawSourcesData | null;
  onRefreshData: () => void;
}

export function TrendsPage(props: TrendsPageProps) {
  // Tab state: "relevant" shows news-filtered trends, "all" shows full unfiltered Trends24 capture
  const [activeTrendsTab, setActiveTrendsTab] = useState<"relevant" | "all">("relevant");

  if (!props.rawSourcesData) {
    return (
      <div className="p-12 text-center text-zinc-500 space-y-3">
        <Flame className="w-8 h-8 text-zinc-600 mx-auto" />
        <h3 className="text-sm font-semibold text-zinc-300">No Trends Data Available</h3>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          Execute the pipeline or select a historical run from the Run History tab to view discovered trending topics.
        </p>
      </div>
    );
  }

  // Determine lists of trends
  const allTrendsList = props.rawSourcesData.all_trends24_topics && props.rawSourcesData.all_trends24_topics.length > 0
    ? props.rawSourcesData.all_trends24_topics
    : props.rawSourcesData.x_trends24_topics || [];

  const relevantTrendsList = props.rawSourcesData.relevant_trends24_topics && props.rawSourcesData.relevant_trends24_topics.length > 0
    ? props.rawSourcesData.relevant_trends24_topics
    : props.rawSourcesData.x_trends24_topics || [];

  const displayTrendsList = activeTrendsTab === "relevant" ? relevantTrendsList : allTrendsList;

  const xExploreTopicsList =
    props.rawSourcesData.x_native_explore && props.rawSourcesData.x_native_explore.trends_observed
      ? props.rawSourcesData.x_native_explore.trends_observed
      : [];

  // Render selected trends24 items using traditional for loop
  const renderedTrends24Items = [];
  for (let topicIndex = 0; topicIndex < displayTrendsList.length; topicIndex++) {
    const topicText = displayTrendsList[topicIndex];
    const rankNumber = topicIndex + 1;
    const isTopThree = rankNumber <= 3;
    const encodedTopic = encodeURIComponent(topicText);

    renderedTrends24Items.push(
      <a
        key={topicText + "_" + rankNumber}
        href={"https://x.com/search?q=" + encodedTopic + "&f=live"}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/90 border border-zinc-800/80 group transition-all"
      >
        <div className="flex items-center gap-3">
          <span
            className={
              "w-6 h-6 rounded flex items-center justify-center text-xs font-bold font-mono " +
              (isTopThree
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "bg-zinc-800 text-zinc-400")
            }
          >
            {rankNumber}
          </span>
          <span className="text-xs font-medium text-zinc-200 group-hover:text-blue-400 transition-colors flex items-center gap-1">
            {topicText.startsWith("#") ? (
              <Hash className="w-3.5 h-3.5 text-blue-400" />
            ) : null}
            {topicText}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isTopThree && <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />}
          <ExternalLink className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
        </div>
      </a>
    );
  }

  // Render X.com Explore discovered items using traditional for loop
  const renderedExploreItems = [];
  for (let exploreIndex = 0; exploreIndex < xExploreTopicsList.length; exploreIndex++) {
    const exploreText = xExploreTopicsList[exploreIndex];
    const rankNumber = exploreIndex + 1;
    const encodedTopic = encodeURIComponent(exploreText);

    renderedExploreItems.push(
      <a
        key={exploreText + "_explore_" + rankNumber}
        href={"https://x.com/search?q=" + encodedTopic + "&f=live"}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/90 border border-zinc-800/80 group transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold font-mono bg-blue-950/40 text-blue-400 border border-blue-800/40">
            {rankNumber}
          </span>
          <span className="text-xs font-medium text-zinc-200 group-hover:text-blue-400 transition-colors">
            {exploreText}
          </span>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
      </a>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <span>Trending Topics — {props.rawSourcesData.country}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Full raw activity captured from Trends24 and cross-referenced with breaking news.
          </p>
        </div>

        <button
          onClick={props.onRefreshData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Two-Column Grid: Trends24 on Left, X Native Explore on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trends24 Section */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                Trends24 Ingestion
              </h3>
            </div>

            {/* Filter Tabs: News-Relevant vs All Captured */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <button
                onClick={function () {
                  setActiveTrendsTab("relevant");
                }}
                className={
                  "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all " +
                  (activeTrendsTab === "relevant"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200")
                }
              >
                <Filter className="w-3 h-3" />
                <span>News-Relevant ({relevantTrendsList.length})</span>
              </button>
              <button
                onClick={function () {
                  setActiveTrendsTab("all");
                }}
                className={
                  "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all " +
                  (activeTrendsTab === "all"
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200")
                }
              >
                <Globe2 className="w-3 h-3" />
                <span>All Captured ({allTrendsList.length})</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {renderedTrends24Items.length > 0 ? (
              renderedTrends24Items
            ) : (
              <div className="p-4 text-xs text-zinc-500 bg-zinc-900/30 rounded border border-zinc-800">
                No trends recorded in this category.
              </div>
            )}
          </div>
        </div>

        {/* X.com Native Explore Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Hash className="w-4 h-4 text-blue-400" />
              <span>X.com Native Explore ({xExploreTopicsList.length})</span>
            </h3>
            <span className="text-[10px] text-zinc-500 font-mono">Mined in browser</span>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {renderedExploreItems.length > 0 ? (
              renderedExploreItems
            ) : (
              <div className="p-4 text-xs text-zinc-500 bg-zinc-900/30 rounded border border-zinc-800">
                No X.com native explore trends recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
