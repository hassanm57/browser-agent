import { useState } from "react";
import type { RawSourcesData } from "../types";
import { MessageSquare, ChevronDown, ChevronUp, ExternalLink, Hash } from "lucide-react";

interface TweetsPageProps {
  rawSourcesData: RawSourcesData | null;
}

export function TweetsPage(props: TweetsPageProps) {
  // State for which trend accordions are expanded
  const [expandedTrendsMap, setExpandedTrendsMap] = useState<Record<string, boolean>>({});

  if (
    !props.rawSourcesData ||
    !props.rawSourcesData.x_native_explore ||
    !props.rawSourcesData.x_native_explore.sample_tweets_by_trend
  ) {
    return (
      <div className="p-12 text-center text-zinc-500 space-y-3">
        <MessageSquare className="w-8 h-8 text-zinc-600 mx-auto" />
        <h3 className="text-sm font-semibold text-zinc-300">No Mined Tweets Available</h3>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          Execute the intelligence pipeline to run browser-use deep timeline scrolling and mine real tweets.
        </p>
      </div>
    );
  }

  const sampleTweetsByTrendMap = props.rawSourcesData.x_native_explore.sample_tweets_by_trend;
  const trendNamesList = [];
  for (const trendName in sampleTweetsByTrendMap) {
    if (Object.prototype.hasOwnProperty.call(sampleTweetsByTrendMap, trendName)) {
      trendNamesList.push(trendName);
    }
  }

  function toggleTrendExpansion(trendName: string) {
    const updatedMap: Record<string, boolean> = {};
    for (const key in expandedTrendsMap) {
      if (Object.prototype.hasOwnProperty.call(expandedTrendsMap, key)) {
        updatedMap[key] = expandedTrendsMap[key];
      }
    }
    updatedMap[trendName] = !updatedMap[trendName];
    setExpandedTrendsMap(updatedMap);
  }

  // Parse a raw tweet string formatted as "[Author Name | @handle] Tweet body text"
  function parseTweetString(rawTweetText: string) {
    let authorName = "Unknown Author";
    let authorHandle = "@user";
    let tweetBody = rawTweetText;

    if (rawTweetText.startsWith("[")) {
      const closingBracketIndex = rawTweetText.indexOf("]");
      if (closingBracketIndex !== -1) {
        const headerPart = rawTweetText.slice(1, closingBracketIndex);
        tweetBody = rawTweetText.slice(closingBracketIndex + 1).trim();

        const pipeSplitParts = headerPart.split("|");
        if (pipeSplitParts.length >= 2) {
          authorName = pipeSplitParts[0].trim();
          authorHandle = pipeSplitParts[1].trim();
        } else {
          authorName = headerPart.trim();
        }
      }
    }

    return {
      authorName: authorName,
      authorHandle: authorHandle,
      bodyText: tweetBody
    };
  }

  // Helper to extract first character for avatar circle
  function getInitials(name: string) {
    const trimmed = name.trim();
    if (trimmed.length === 0) return "U";
    return trimmed.charAt(0).toUpperCase();
  }

  // Render trend groups using traditional for loop
  const renderedTrendSections = [];
  let overallTweetCount = 0;

  for (let trendIndex = 0; trendIndex < trendNamesList.length; trendIndex++) {
    const trendName = trendNamesList[trendIndex];
    const tweetsForThisTrend = sampleTweetsByTrendMap[trendName] || [];
    overallTweetCount = overallTweetCount + tweetsForThisTrend.length;

    // First trend is expanded by default, rest collapsed unless clicked
    const isExpanded =
      expandedTrendsMap[trendName] !== undefined
        ? expandedTrendsMap[trendName]
        : trendIndex === 0;

    // Render tweet cards inside this trend using traditional for loop
    const renderedTweetCards = [];
    for (let tweetIndex = 0; tweetIndex < tweetsForThisTrend.length; tweetIndex++) {
      const rawString = tweetsForThisTrend[tweetIndex];
      const parsedTweet = parseTweetString(rawString);
      const userInitial = getInitials(parsedTweet.authorName);

      renderedTweetCards.push(
        <div
          key={trendName + "_tweet_" + tweetIndex}
          className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all space-y-2.5"
        >
          {/* Tweet Author Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center font-bold text-white text-xs select-none">
                {userInitial}
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <span>{parsedTweet.authorName}</span>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  {parsedTweet.authorHandle}
                </div>
              </div>
            </div>

            <a
              href={"https://x.com/search?q=" + encodeURIComponent(trendName)}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-500 hover:text-blue-400 transition-colors p-1"
              title="Search this trend on X"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Tweet Body (supports right-to-left Urdu / Arabic and English) */}
          <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap dir-auto">
            {parsedTweet.bodyText}
          </p>

          {/* Trend Tag Pill */}
          <div className="pt-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-400 bg-blue-950/40 border border-blue-800/50 px-2 py-0.5 rounded-full">
              <Hash className="w-3 h-3" />
              {trendName.replace("#", "")}
            </span>
          </div>
        </div>
      );
    }

    renderedTrendSections.push(
      <div
        key={trendName}
        className="rounded-lg bg-zinc-950 border border-zinc-800/80 overflow-hidden"
      >
        {/* Accordion Bar */}
        <div
          onClick={function () {
            toggleTrendExpansion(trendName);
          }}
          className="p-3.5 bg-zinc-900/70 border-b border-zinc-800/80 flex items-center justify-between cursor-pointer hover:bg-zinc-850 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-zinc-200">{trendName}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
              {tweetsForThisTrend.length} tweets
            </span>
          </div>

          <div className="flex items-center gap-2 text-zinc-400">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>

        {/* Tweets Grid */}
        {isExpanded && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-black/20">
            {renderedTweetCards.length > 0 ? (
              renderedTweetCards
            ) : (
              <div className="col-span-2 p-6 text-center text-xs text-zinc-500">
                No tweets extracted for this trend.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <span>Extracted Tweets</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {trendNamesList.length} trending hashtags mined · {overallTweetCount} genuine tweets parsed from X timelines.
          </p>
        </div>
      </div>

      {/* Accordions */}
      <div className="space-y-4">{renderedTrendSections}</div>
    </div>
  );
}
