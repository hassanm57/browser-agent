import { useState } from "react";
import type { RawSourcesData } from "../types";
import { Flame, Newspaper, ExternalLink, RefreshCw, Hash, Search, Filter } from "lucide-react";

interface TrendsPageProps {
  rawSourcesData: RawSourcesData | null;
  onRefreshData: () => void;
}

interface NewsHeadlineEntry {
  headline_text: string;
  source_name: string;
  global_index: number;
}

export function TrendsPage(props: TrendsPageProps) {
  // Filter state for Trending Hot News: filter by selected outlet or keyword search
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>("ALL");
  const [searchQueryFilter, setSearchQueryFilter] = useState<string>("");

  if (!props.rawSourcesData) {
    return (
      <div className="p-12 text-center text-zinc-500 space-y-3">
        <Flame className="w-8 h-8 text-zinc-600 mx-auto" />
        <h3 className="text-sm font-semibold text-zinc-300">No Trends Data Available</h3>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          Execute the pipeline or select a historical run from the Run History tab to view discovered trending topics and hot news.
        </p>
      </div>
    );
  }

  // Extract all news headlines across all configured authoritative news sources
  const newsIntelMap = props.rawSourcesData.news_sources_intel || {};
  const newsSourceNamesList: string[] = [];

  for (const sourceKey in newsIntelMap) {
    if (Object.prototype.hasOwnProperty.call(newsIntelMap, sourceKey)) {
      newsSourceNamesList.push(sourceKey);
    }
  }

  // Flatten all headlines across all news sources using traditional nested for loops
  const allFlattenedHeadlinesList: NewsHeadlineEntry[] = [];
  let currentHeadlineCounter = 1;

  for (let sourceIndex = 0; sourceIndex < newsSourceNamesList.length; sourceIndex++) {
    const currentSourceName = newsSourceNamesList[sourceIndex];
    const headlinesForCurrentSource = newsIntelMap[currentSourceName] || [];

    for (let headlineIndex = 0; headlineIndex < headlinesForCurrentSource.length; headlineIndex++) {
      const singleHeadlineText = headlinesForCurrentSource[headlineIndex];
      allFlattenedHeadlinesList.push({
        headline_text: singleHeadlineText,
        source_name: currentSourceName,
        global_index: currentHeadlineCounter
      });
      currentHeadlineCounter = currentHeadlineCounter + 1;
    }
  }

  // Filter headlines based on user's selected source and text search
  const filteredHeadlinesList: NewsHeadlineEntry[] = [];
  const normalizedSearchQuery = searchQueryFilter.trim().toLowerCase();

  for (let itemIndex = 0; itemIndex < allFlattenedHeadlinesList.length; itemIndex++) {
    const currentHeadlineEntry = allFlattenedHeadlinesList[itemIndex];

    // Check if it matches the selected news source filter
    let doesSourceMatch = false;
    if (selectedSourceFilter === "ALL") {
      doesSourceMatch = true;
    } else if (currentHeadlineEntry.source_name === selectedSourceFilter) {
      doesSourceMatch = true;
    }

    // Check if it matches the search keyword
    let doesSearchMatch = false;
    if (normalizedSearchQuery.length === 0) {
      doesSearchMatch = true;
    } else {
      const lowerHeadline = currentHeadlineEntry.headline_text.toLowerCase();
      const lowerSource = currentHeadlineEntry.source_name.toLowerCase();
      if (lowerHeadline.includes(normalizedSearchQuery) || lowerSource.includes(normalizedSearchQuery)) {
        doesSearchMatch = true;
      }
    }

    if (doesSourceMatch && doesSearchMatch) {
      filteredHeadlinesList.push(currentHeadlineEntry);
    }
  }

  // Render the filtered hot news items using traditional for loop
  const renderedHotNewsItems = [];
  for (let renderIndex = 0; renderIndex < filteredHeadlinesList.length; renderIndex++) {
    const headlineEntry = filteredHeadlinesList[renderIndex];
    const rankNumber = renderIndex + 1;
    const isTopThree = rankNumber <= 3;
    const encodedHeadline = encodeURIComponent(headlineEntry.headline_text);
    const googleSearchUrl = "https://www.google.com/search?q=" + encodedHeadline;

    renderedHotNewsItems.push(
      <div
        key={headlineEntry.source_name + "_" + headlineEntry.global_index + "_" + renderIndex}
        className="flex items-start justify-between p-3 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/90 border border-zinc-800/80 group transition-all gap-3"
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span
            className={
              "w-6 h-6 rounded flex items-center justify-center text-xs font-bold font-mono mt-0.5 shrink-0 " +
              (isTopThree
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "bg-zinc-800 text-zinc-400")
            }
          >
            {rankNumber}
          </span>
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-zinc-200 group-hover:text-amber-300 transition-colors leading-relaxed">
              {headlineEntry.headline_text}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950/40 text-blue-400 border border-blue-900/50 font-medium">
                {headlineEntry.source_name}
              </span>
              {isTopThree && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                  <Flame className="w-3 h-3 fill-amber-500" />
                  Hot
                </span>
              )}
            </div>
          </div>
        </div>

        <a
          href={googleSearchUrl}
          target="_blank"
          rel="noreferrer"
          title="Search this headline online"
          className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  // Build options for source selector using traditional for loop
  const renderedSourceDropdownOptions = [];
  renderedSourceDropdownOptions.push(
    <option key="ALL" value="ALL" className="bg-zinc-900 text-zinc-200">
      All Sources ({allFlattenedHeadlinesList.length})
    </option>
  );

  for (let sourceIndex = 0; sourceIndex < newsSourceNamesList.length; sourceIndex++) {
    const sourceName = newsSourceNamesList[sourceIndex];
    const headlinesCount = (newsIntelMap[sourceName] || []).length;

    renderedSourceDropdownOptions.push(
      <option key={sourceName} value={sourceName} className="bg-zinc-900 text-zinc-200">
        {sourceName} ({headlinesCount})
      </option>
    );
  }

  // Extract topics observed from native X Explore
  const xExploreTopicsList =
    props.rawSourcesData.x_native_explore && props.rawSourcesData.x_native_explore.trends_observed
      ? props.rawSourcesData.x_native_explore.trends_observed
      : [];

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
          <span className="text-xs font-medium text-zinc-200 group-hover:text-blue-400 transition-colors flex items-center gap-1">
            {exploreText.startsWith("#") ? (
              <Hash className="w-3.5 h-3.5 text-blue-400" />
            ) : null}
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
            <span>Trending Topics & Hot News — {props.rawSourcesData.country}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Latest hot news headlines extracted from verified news sources paired with live X.com explore trends.
          </p>
        </div>

        <button
          onClick={props.onRefreshData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Two-Column Grid: Trending Hot News on Left, X Native Explore on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trending Hot News Section */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                Trending Hot News
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                {filteredHeadlinesList.length} articles
              </span>
            </div>

            {/* Source Outlet Dropdown Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-zinc-400" />
              <select
                value={selectedSourceFilter}
                onChange={function (event) {
                  setSelectedSourceFilter(event.target.value);
                }}
                className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-2 py-1 outline-none focus:border-amber-500/50"
              >
                {renderedSourceDropdownOptions}
              </select>
            </div>
          </div>

          {/* Quick Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQueryFilter}
              onChange={function (event) {
                setSearchQueryFilter(event.target.value);
              }}
              placeholder="Filter headlines by keyword..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-zinc-900/60 border border-zinc-800 text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-700 transition-colors"
            />
          </div>

          {/* Headlines List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {renderedHotNewsItems.length > 0 ? (
              renderedHotNewsItems
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-900/30 rounded-lg border border-zinc-800 space-y-2">
                <Newspaper className="w-6 h-6 text-zinc-600 mx-auto" />
                <p>No matching news headlines found.</p>
                {searchQueryFilter.length > 0 && (
                  <button
                    onClick={function () {
                      setSearchQueryFilter("");
                      setSelectedSourceFilter("ALL");
                    }}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
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
