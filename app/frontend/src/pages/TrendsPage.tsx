import type { RawSourcesData } from "../types";
import { Flame, ExternalLink, RefreshCw, Hash } from "lucide-react";

interface TrendsPageProps {
  rawSourcesData: RawSourcesData | null;
  onRefreshData: () => void;
}

export function TrendsPage(props: TrendsPageProps) {
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

  const trends24TopicsList = props.rawSourcesData.x_trends24_topics || [];
  const xExploreTopicsList =
    props.rawSourcesData.x_native_explore && props.rawSourcesData.x_native_explore.trends_observed
      ? props.rawSourcesData.x_native_explore.trends_observed
      : [];

  // Render trends24 ranked items using traditional for loop
  const renderedTrends24Items = [];
  for (let topicIndex = 0; topicIndex < trends24TopicsList.length; topicIndex++) {
    const topicText = trends24TopicsList[topicIndex];
    const rankNumber = topicIndex + 1;
    const isTopThree = rankNumber <= 3;
    const encodedTopic = encodeURIComponent(topicText);

    renderedTrends24Items.push(
      <a
        key={topicText + "_" + rankNumber}
        href={"https://x.com/search?q=" + encodedTopic}
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
        href={"https://x.com/search?q=" + encodedTopic}
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
            Ranked national trends scraped from trends24 and confirmed on X.com Explore.
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

      {/* Two-Column Grid: trends24 on Left, X Native Explore on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* trends24 Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>trends24 Ingested ({trends24TopicsList.length})</span>
            </h3>
            <span className="text-[10px] text-zinc-500 font-mono">Aggregated hourly</span>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {renderedTrends24Items.length > 0 ? (
              renderedTrends24Items
            ) : (
              <div className="p-4 text-xs text-zinc-500 bg-zinc-900/30 rounded border border-zinc-800">
                No trends24 topics recorded.
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
            <span className="text-[10px] text-zinc-500 font-mono">Mined in headful browser</span>
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
