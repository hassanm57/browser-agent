import { useState } from "react";
import type { RawSourcesData } from "../types";
import { Newspaper, ChevronDown, ChevronUp, Globe } from "lucide-react";

interface HeadlinesPageProps {
  rawSourcesData: RawSourcesData | null;
}

export function HeadlinesPage(props: HeadlinesPageProps) {
  // State to track which source cards are expanded
  const [expandedSourcesMap, setExpandedSourcesMap] = useState<Record<string, boolean>>({});

  if (!props.rawSourcesData || !props.rawSourcesData.news_sources_intel) {
    return (
      <div className="p-12 text-center text-muted-foreground space-y-3">
        <Newspaper className="w-8 h-8 text-muted-foreground/60 mx-auto" />
        <h3 className="text-sm font-semibold text-foreground">No News Headlines Ingested</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Execute the intelligence pipeline to ingest headlines from configured regional news and international RSS feeds.
        </p>
      </div>
    );
  }

  const newsIntelMap = props.rawSourcesData.news_sources_intel;
  const sourceKeysList = [];
  for (const sourceName in newsIntelMap) {
    if (Object.prototype.hasOwnProperty.call(newsIntelMap, sourceName)) {
      sourceKeysList.push(sourceName);
    }
  }

  function toggleSourceExpansion(sourceName: string) {
    const updatedMap: Record<string, boolean> = {};
    for (const key in expandedSourcesMap) {
      if (Object.prototype.hasOwnProperty.call(expandedSourcesMap, key)) {
        updatedMap[key] = expandedSourcesMap[key];
      }
    }
    updatedMap[sourceName] = !updatedMap[sourceName];
    setExpandedSourcesMap(updatedMap);
  }

  // Render cards for each source using a traditional for loop
  const renderedSourceCards = [];
  let totalHeadlinesCount = 0;

  for (let sourceIndex = 0; sourceIndex < sourceKeysList.length; sourceIndex++) {
    const sourceName = sourceKeysList[sourceIndex];
    const headlinesList = newsIntelMap[sourceName] || [];
    totalHeadlinesCount = totalHeadlinesCount + headlinesList.length;

    // By default, cards are expanded unless explicitly collapsed
    const isExpanded = expandedSourcesMap[sourceName] !== false;

    // Render headlines rows inside this source card
    const renderedHeadlineItems = [];
    const maximumHeadlines = isExpanded ? headlinesList.length : Math.min(headlinesList.length, 3);

    for (let headlineIndex = 0; headlineIndex < maximumHeadlines; headlineIndex++) {
      const headlineText = headlinesList[headlineIndex];
      renderedHeadlineItems.push(
        <li
          key={sourceName + "_headline_" + headlineIndex}
          className="flex items-start gap-2.5 text-xs text-foreground/90 py-1.5 border-b border-border/40 last:border-none"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
          <span className="leading-relaxed">{headlineText}</span>
        </li>
      );
    }

    renderedSourceCards.push(
      <div
        key={sourceName}
        className="rounded-lg bg-card border border-border overflow-hidden shadow-xs"
      >
        {/* Source Header */}
        <div
          onClick={function () {
            toggleSourceExpansion(sourceName);
          }}
          className="p-3.5 bg-muted/40 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/70 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <span className="text-xs font-semibold text-foreground">{sourceName}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
              {headlinesList.length} articles
            </span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>

        {/* Headlines Content */}
        <div className="p-3.5">
          <ul className="space-y-1">{renderedHeadlineItems}</ul>

          {headlinesList.length > 3 && (
            <button
              onClick={function () {
                toggleSourceExpansion(sourceName);
              }}
              className="mt-3 text-[11px] text-primary hover:underline font-medium select-none cursor-pointer"
            >
              {isExpanded ? "Collapse view" : "Show all " + headlinesList.length + " headlines"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            News Intelligence
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sourceKeysList.length} sources consulted · {totalHeadlinesCount} total headlines extracted.
          </p>
        </div>
      </div>

      {/* Grid of Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderedSourceCards}
      </div>
    </div>
  );
}
