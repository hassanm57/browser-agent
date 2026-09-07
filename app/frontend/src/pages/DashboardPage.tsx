import type { RawSourcesData, KeywordsData, PipelineRunRecord, NavigationTabType, CountryItem, SourceItem } from "../types";
import {
  Globe,
  Flame,
  MessageSquare,
  Tags,
  Play,
  ArrowRight,
  Calendar,
  Trash2,
  ExternalLink,
  Newspaper,
  Zap
} from "lucide-react";
import { Banner } from "@/components/ui/banner";

interface DashboardPageProps {
  rawSourcesData: RawSourcesData | null;
  keywordsData: KeywordsData | null;
  recentRunsList: PipelineRunRecord[];
  activeSourcesCount: number;
  availableCountries?: CountryItem[];
  selectedCountries?: string[];
  sourcesList?: SourceItem[];
  onSelectCountryOnly?: (countryName: string) => void;
  onStartPipeline: () => void;
  onClearDatabase: () => void;
  isPipelineActive: boolean;
  onNavigateTab: (targetTab: NavigationTabType) => void;
}

function formatDashboardDate(dateString?: string | null): string {
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

function getExactNewsSourceWebsiteUrl(sourceNameString: string, sourcesList?: SourceItem[]): string {
  // If configured sources list is available, look for an exact source entry first
  if (sourcesList && sourcesList.length > 0) {
    for (let sourceIndex = 0; sourceIndex < sourcesList.length; sourceIndex++) {
      const configuredSource = sourcesList[sourceIndex];
      if (configuredSource.name.toLowerCase() === sourceNameString.toLowerCase()) {
        const configuredUrl = configuredSource.url;
        // Check if the URL is an RSS XML feed, and if so redirect to the main publication website
        if (configuredUrl.includes("defensenews.com")) {
          return "https://www.defensenews.com";
        }
        if (configuredUrl.includes("dawn.com")) {
          return "https://www.dawn.com";
        }
        if (configuredUrl.includes("breakingdefense.com")) {
          return "https://breakingdefense.com";
        }
        if (configuredUrl.includes("defenseone.com")) {
          return "https://www.defenseone.com";
        }
        if (
          configuredUrl.includes("feeds.bbci.co.uk") ||
          configuredUrl.includes("bbc.co.uk") ||
          configuredUrl.includes("bbc.com")
        ) {
          return "https://www.bbc.com/news/world";
        }
        return configuredUrl;
      }
    }
  }

  // Fallback pattern matching for all known intelligence news outlets
  const lowercasedSource = sourceNameString.toLowerCase();
  if (lowercasedSource.includes("defense news")) {
    return "https://www.defensenews.com";
  }
  if (lowercasedSource.includes("the news") || lowercasedSource.includes("thenews")) {
    return "https://www.thenews.com.pk/latest/category/world";
  }
  if (lowercasedSource.includes("dawn")) {
    return "https://www.dawn.com";
  }
  if (lowercasedSource.includes("tribune")) {
    return "https://tribune.com.pk";
  }
  if (lowercasedSource.includes("breaking defense")) {
    return "https://breakingdefense.com";
  }
  if (lowercasedSource.includes("bbc")) {
    return "https://www.bbc.com/news/world";
  }
  if (lowercasedSource.includes("reuters")) {
    return "https://www.reuters.com/world";
  }
  if (lowercasedSource.includes("defense one")) {
    return "https://www.defenseone.com";
  }
  if (lowercasedSource.includes("janes")) {
    return "https://www.janes.com/defence-intelligence-insights/defence-news";
  }
  if (lowercasedSource.includes("foreign affairs")) {
    if (lowercasedSource.includes("nuclear")) {
      return "https://www.foreignaffairs.com/topics/nuclear-weapons-proliferation";
    }
    if (lowercasedSource.includes("war")) {
      return "https://www.foreignaffairs.com/topics/war-military-strategy";
    }
    return "https://www.foreignaffairs.com/topics/defense-military";
  }
  if (lowercasedSource.includes("iiss")) {
    if (lowercasedSource.includes("nuclear")) {
      return "https://www.iiss.org/research/nuclear-arms-control-non-proliferation-and-disarmament";
    }
    return "https://www.iiss.org/research/defence-and-military-analysis";
  }
  if (lowercasedSource.includes("csis")) {
    return "https://www.csis.org";
  }
  if (lowercasedSource.includes("atlantic council")) {
    return "https://www.atlanticcouncil.org";
  }
  if (lowercasedSource.includes("diplomat")) {
    return "https://thediplomat.com/category/security";
  }

  // Generic fallback if unknown
  return "https://news.google.com";
}

export function DashboardPage(props: DashboardPageProps) {
  // Count trends discovered
  let totalTrendsCount = 0;
  if (props.rawSourcesData) {
    if (
      props.rawSourcesData.x_native_explore &&
      props.rawSourcesData.x_native_explore.trends_observed &&
      props.rawSourcesData.x_native_explore.trends_observed.length > 0
    ) {
      totalTrendsCount = props.rawSourcesData.x_native_explore.trends_observed.length;
    } else if (props.rawSourcesData.x_trends24_topics && props.rawSourcesData.x_trends24_topics.length > 0) {
      totalTrendsCount = props.rawSourcesData.x_trends24_topics.length;
    }
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

  // Count total keywords count and sample terms
  let totalKeywordsCount = 0;
  const sampleKeywordTerms: string[] = [];
  if (props.keywordsData && props.keywordsData.topics) {
    for (let i = 0; i < props.keywordsData.topics.length; i++) {
      const topic = props.keywordsData.topics[i];
      if (topic.terms && topic.terms.length > 0) {
        totalKeywordsCount += topic.terms.length;
        for (let j = 0; j < topic.terms.length; j++) {
          if (sampleKeywordTerms.length < 10 && !sampleKeywordTerms.includes(topic.terms[j])) {
            sampleKeywordTerms.push(topic.terms[j]);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Top 10 Trending Hot Topics Curation:
  // Requirements:
  // - Take top 2 from Defense News RSS
  // - Take 1 from The News International World
  // - Take 1-2 from others to fill exactly 10 total
  // ---------------------------------------------------------------------------
  interface CuratedHotTopicItem {
    headline_text: string;
    source_name: string;
    category_label: string;
    source_url: string;
  }

  const curatedHotTopicsList: CuratedHotTopicItem[] = [];
  const registeredHeadlinesSet = new Set<string>();

  const newsIntelMap =
    props.rawSourcesData && props.rawSourcesData.news_sources_intel
      ? props.rawSourcesData.news_sources_intel
      : {};

  // Filter out non-news site navigation lines
  const webNavigationJunkWordsList = [
    "subscription", "sign in", "login", "cookie", "privacy policy",
    "terms of service", "about us", "contact us"
  ];

  function isGenuineNewsHeadline(candidateText: string): boolean {
    const trimmedText = candidateText.trim();
    if (trimmedText.length < 18) {
      return false;
    }
    const lowerText = trimmedText.toLowerCase();
    for (let wordIndex = 0; wordIndex < webNavigationJunkWordsList.length; wordIndex++) {
      const junkWord = webNavigationJunkWordsList[wordIndex];
      if (lowerText.includes(junkWord)) {
        return false;
      }
    }
    return true;
  }

  function attemptAddHotTopic(sourceName: string, candidateHeadline: string, categoryLabel: string) {
    if (curatedHotTopicsList.length >= 10) {
      return;
    }
    const cleanText = candidateHeadline.trim();
    if (!isGenuineNewsHeadline(cleanText)) {
      return;
    }
    if (registeredHeadlinesSet.has(cleanText)) {
      return;
    }
    registeredHeadlinesSet.add(cleanText);
    const resolvedSourceWebsiteUrl = getExactNewsSourceWebsiteUrl(sourceName, props.sourcesList);
    curatedHotTopicsList.push({
      headline_text: cleanText,
      source_name: sourceName,
      category_label: categoryLabel,
      source_url: resolvedSourceWebsiteUrl
    });
  }

  // 1. Identify Defense News RSS and take top 2 headlines
  let defenseNewsSourceKey = "";
  for (const candidateKey in newsIntelMap) {
    if (Object.prototype.hasOwnProperty.call(newsIntelMap, candidateKey)) {
      if (candidateKey.toLowerCase().includes("defense news")) {
        defenseNewsSourceKey = candidateKey;
        break;
      }
    }
  }

  if (defenseNewsSourceKey.length > 0) {
    const defenseHeadlines = newsIntelMap[defenseNewsSourceKey] || [];
    for (let index = 0; index < defenseHeadlines.length && curatedHotTopicsList.length < 2; index++) {
      attemptAddHotTopic(defenseNewsSourceKey, defenseHeadlines[index], "Defense & Military");
    }
  }

  // 2. Identify The News International World and take top 1 headline
  let theNewsSourceKey = "";
  for (const candidateKey in newsIntelMap) {
    if (Object.prototype.hasOwnProperty.call(newsIntelMap, candidateKey)) {
      const lowerCandidate = candidateKey.toLowerCase();
      if (lowerCandidate.includes("the news") || lowerCandidate.includes("thenews")) {
        theNewsSourceKey = candidateKey;
        break;
      }
    }
  }

  if (theNewsSourceKey.length > 0) {
    const theNewsHeadlines = newsIntelMap[theNewsSourceKey] || [];
    for (let index = 0; index < theNewsHeadlines.length; index++) {
      const beforeCount = curatedHotTopicsList.length;
      attemptAddHotTopic(theNewsSourceKey, theNewsHeadlines[index], "International / Regional");
      if (curatedHotTopicsList.length > beforeCount) {
        break;
      }
    }
  }

  // 3. Take 1-2 from other sources to fill up to exactly 10 total
  const remainingOtherSourceKeysList: string[] = [];
  for (const candidateKey in newsIntelMap) {
    if (Object.prototype.hasOwnProperty.call(newsIntelMap, candidateKey)) {
      if (candidateKey !== defenseNewsSourceKey && candidateKey !== theNewsSourceKey) {
        remainingOtherSourceKeysList.push(candidateKey);
      }
    }
  }

  // Pass 1: Take 1 from each remaining source
  for (let otherIndex = 0; otherIndex < remainingOtherSourceKeysList.length; otherIndex++) {
    if (curatedHotTopicsList.length >= 10) {
      break;
    }
    const currentOtherKey = remainingOtherSourceKeysList[otherIndex];
    const sourceHeadlines = newsIntelMap[currentOtherKey] || [];
    for (let headlineIndex = 0; headlineIndex < sourceHeadlines.length; headlineIndex++) {
      const beforeCount = curatedHotTopicsList.length;
      attemptAddHotTopic(currentOtherKey, sourceHeadlines[headlineIndex], "Global Intel");
      if (curatedHotTopicsList.length > beforeCount) {
        break;
      }
    }
  }

  // Pass 2: If still under 10, take a 2nd from remaining sources
  for (let otherIndex = 0; otherIndex < remainingOtherSourceKeysList.length; otherIndex++) {
    if (curatedHotTopicsList.length >= 10) {
      break;
    }
    const currentOtherKey = remainingOtherSourceKeysList[otherIndex];
    const sourceHeadlines = newsIntelMap[currentOtherKey] || [];
    for (let headlineIndex = 0; headlineIndex < sourceHeadlines.length; headlineIndex++) {
      if (curatedHotTopicsList.length >= 10) {
        break;
      }
      attemptAddHotTopic(currentOtherKey, sourceHeadlines[headlineIndex], "Global Intel");
    }
  }

  // Render the Top 3 Podium Hot Topics items using a traditional for loop
  const renderedPodiumCards = [];
  const podiumItemCount = Math.min(curatedHotTopicsList.length, 3);
  for (let podiumIndex = 0; podiumIndex < podiumItemCount; podiumIndex++) {
    const item = curatedHotTopicsList[podiumIndex];
    const rankNumber = podiumIndex + 1;

    if (rankNumber === 1) {
      // 1st Place Podium (Most orange / deep amber-orange gold) - Entire card is clickable
      renderedPodiumCards.push(
        <a
          key={item.source_name + "_podium_" + rankNumber}
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
          title={"Visit " + item.source_name}
          className="group relative flex flex-col justify-between p-5 rounded-3xl bg-gradient-to-b from-orange-500/25 via-amber-950/40 to-zinc-950/90 hover:from-orange-500/35 shadow-xl shadow-orange-500/10 hover:shadow-[0_0_35px_rgba(249,115,22,0.25)] transition-all duration-300 gap-4 cursor-pointer select-none"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-zinc-950 font-black text-sm flex items-center justify-center shadow-[0_0_18px_rgba(249,115,22,0.6)] shrink-0">
                  1
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-orange-300 bg-orange-500/20 px-2.5 py-0.5 rounded-full">
                  <Flame className="w-3.5 h-3.5 fill-orange-400 text-orange-400" />
                  Hot
                </span>
              </div>
              <div
                className="p-2 rounded-xl text-orange-400/80 group-hover:text-orange-200 group-hover:bg-orange-500/20 transition-all shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </div>
            </div>
            <p className="text-sm font-bold text-zinc-100 group-hover:text-orange-300 transition-colors leading-relaxed line-clamp-3">
              {item.headline_text}
            </p>
          </div>
          <div className="pt-2.5 border-t border-orange-500/20 flex items-center justify-between gap-2 text-[11px]">
            <div
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-orange-300 drop-shadow-[0_0_8px_rgba(249,115,22,0.7)] group-hover:text-orange-100 group-hover:underline transition-all min-w-0"
            >
              <Globe className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="truncate">{item.source_name}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-70 group-hover:opacity-100 shrink-0" />
            </div>
          </div>
        </a>
      );
    } else if (rankNumber === 2) {
      // 2nd Place Podium (Less orange, more yellow / pure warm gold) - Entire card is clickable
      renderedPodiumCards.push(
        <a
          key={item.source_name + "_podium_" + rankNumber}
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
          title={"Visit " + item.source_name}
          className="group relative flex flex-col justify-between p-5 rounded-3xl bg-gradient-to-b from-amber-500/20 via-yellow-950/30 to-zinc-950/90 hover:from-amber-500/30 shadow-xl shadow-amber-500/10 hover:shadow-[0_0_30px_rgba(245,158,11,0.22)] transition-all duration-300 gap-4 cursor-pointer select-none"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-yellow-400 via-amber-400 to-amber-500 text-zinc-950 font-black text-sm flex items-center justify-center shadow-[0_0_16px_rgba(245,158,11,0.5)] shrink-0">
                  2
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full">
                  <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  Hot
                </span>
              </div>
              <div
                className="p-2 rounded-xl text-amber-400/80 group-hover:text-amber-200 group-hover:bg-amber-500/20 transition-all shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </div>
            </div>
            <p className="text-sm font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors leading-relaxed line-clamp-3">
              {item.headline_text}
            </p>
          </div>
          <div className="pt-2.5 border-t border-amber-500/20 flex items-center justify-between gap-2 text-[11px]">
            <div
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.7)] group-hover:text-amber-100 group-hover:underline transition-all min-w-0"
            >
              <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{item.source_name}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-70 group-hover:opacity-100 shrink-0" />
            </div>
          </div>
        </a>
      );
    } else {
      // 3rd Place Podium (Lighter yellow hue) - Entire card is clickable
      renderedPodiumCards.push(
        <a
          key={item.source_name + "_podium_" + rankNumber}
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
          title={"Visit " + item.source_name}
          className="group relative flex flex-col justify-between p-5 rounded-3xl bg-gradient-to-b from-yellow-300/15 via-zinc-900/80 to-zinc-950/90 hover:from-yellow-300/25 shadow-xl shadow-yellow-300/5 hover:shadow-[0_0_25px_rgba(250,204,21,0.2)] transition-all duration-300 gap-4 cursor-pointer select-none"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-yellow-200 via-yellow-300 to-amber-300 text-zinc-950 font-black text-sm flex items-center justify-center shadow-[0_0_15px_rgba(250,204,21,0.4)] shrink-0">
                  3
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-yellow-200 bg-yellow-300/15 px-2.5 py-0.5 rounded-full">
                  <Flame className="w-3.5 h-3.5 fill-yellow-300 text-yellow-300" />
                  Hot
                </span>
              </div>
              <div
                className="p-2 rounded-xl text-yellow-300/80 group-hover:text-yellow-100 group-hover:bg-yellow-300/20 transition-all shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </div>
            </div>
            <p className="text-sm font-semibold text-zinc-100 group-hover:text-yellow-200 transition-colors leading-relaxed line-clamp-3">
              {item.headline_text}
            </p>
          </div>
          <div className="pt-2.5 border-t border-yellow-400/20 flex items-center justify-between gap-2 text-[11px]">
            <div
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-yellow-200 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)] group-hover:text-yellow-100 group-hover:underline transition-all min-w-0"
            >
              <Globe className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
              <span className="truncate">{item.source_name}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-70 group-hover:opacity-100 shrink-0" />
            </div>
          </div>
        </a>
      );
    }
  }

  // Render Ranks 4 to 10 in a clean, compact 2-column grid using traditional for loop - Entire card is clickable
  const renderedRemainingHotTopicCards = [];
  for (let topicIndex = 3; topicIndex < curatedHotTopicsList.length; topicIndex++) {
    const item = curatedHotTopicsList[topicIndex];
    const rankNumber = topicIndex + 1;

    renderedRemainingHotTopicCards.push(
      <a
        key={item.source_name + "_" + rankNumber}
        href={item.source_url}
        target="_blank"
        rel="noreferrer"
        title={"Visit " + item.source_name}
        className="group relative flex items-center justify-between gap-3.5 p-4 rounded-2xl bg-zinc-900/40 hover:bg-zinc-850/70 shadow-md shadow-black/10 hover:shadow-[0_0_20px_rgba(59,130,246,0.08)] transition-all duration-300 cursor-pointer select-none"
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="w-7 h-7 rounded-xl bg-zinc-800/90 text-zinc-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5">
            {rankNumber}
          </span>
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors leading-relaxed line-clamp-2">
              {item.headline_text}
            </p>
            <div>
              <div
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.6)] group-hover:text-sky-200 group-hover:underline transition-all"
              >
                <Globe className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="truncate">{item.source_name}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-70 group-hover:opacity-100 shrink-0" />
              </div>
            </div>
          </div>
        </div>

        <div
          className="p-2 rounded-xl text-zinc-500 group-hover:text-sky-300 group-hover:bg-sky-500/15 transition-all shrink-0 self-center"
        >
          <ExternalLink className="w-4 h-4" />
        </div>
      </a>
    );
  }

  // Render top 10 keywords as non-interactable, compact colored boxes fitting just around the text
  const renderedProminentKeywordCards = [];
  for (let keywordIndex = 0; keywordIndex < sampleKeywordTerms.length; keywordIndex++) {
    const termString = sampleKeywordTerms[keywordIndex];

    renderedProminentKeywordCards.push(
      <div
        key={"keyword_box_" + keywordIndex}
        className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-semibold shadow-[0_0_12px_rgba(16,185,129,0.18)] select-none tracking-wide"
      >
        <span>{termString}</span>
      </div>
    );
  }

  const latestRun = props.recentRunsList.length > 0 ? props.recentRunsList[0] : null;

  return (
    <div className="space-y-6 max-w-6xl py-1 animate-in fade-in-50 duration-300 select-none">
      {/* 1. Sleek Rainbow Banner */}
      <Banner
        id="dashboard-intelligence-status"
        variant="rainbow"
        height="2.75rem"
        className="rounded-2xl border border-white/10 shadow-[0_0_25px_rgba(59,130,246,0.15)] overflow-hidden"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/20 text-primary">
            <Zap className="w-3 h-3" />
            LIVE INTEL
          </span>
          <span>
            Autonomous Agent Active — Curating real-time defense & breaking global intelligence via Strategic AI Model
          </span>
        </div>
      </Banner>

      {/* Top Header Execution Timestamp (Prominent Text Size) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5 text-sm sm:text-base font-medium text-zinc-300">
          <Calendar className="w-5 h-5 text-primary shrink-0" />
          <span>
            Last executed on:{" "}
            <strong className="text-zinc-100 font-bold">
              {latestRun
                ? formatDashboardDate(latestRun.finished_at || latestRun.started_at)
                : "No runs executed yet"}
            </strong>
          </span>
        </div>

        {latestRun && (
          <div className="flex items-center gap-2">
            <span
              className={
                "text-xs font-mono px-3.5 py-1 rounded-full font-semibold " +
                (latestRun.status === "completed"
                  ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                  : "bg-amber-500/15 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]")
              }
            >
              {latestRun.status.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* 2. Main Stat Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Active Sources */}
        <div className="p-5 rounded-3xl bg-gradient-to-b from-blue-500/10 via-zinc-900/60 to-zinc-900/40 hover:from-blue-500/20 shadow-xl shadow-black/20 hover:shadow-[0_0_30px_rgba(59,130,246,0.18)] transition-all duration-300 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/20 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.25)]">
                <Globe className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-zinc-300">Active Sources</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-extrabold text-zinc-100 font-mono tracking-tight">{props.activeSourcesCount}</p>
            <div className="w-full h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" style={{ width: "85%" }}></div>
            </div>
          </div>
        </div>

        {/* Trends Ingested */}
        <div className="p-5 rounded-3xl bg-gradient-to-b from-amber-500/10 via-zinc-900/60 to-zinc-900/40 hover:from-amber-500/20 shadow-xl shadow-black/20 hover:shadow-[0_0_30px_rgba(245,158,11,0.18)] transition-all duration-300 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                <Flame className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-zinc-300">Trends Ingested</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-extrabold text-zinc-100 font-mono tracking-tight">{totalTrendsCount}</p>
            <div className="w-full h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
              <div className="h-full rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]" style={{ width: "70%" }}></div>
            </div>
          </div>
        </div>

        {/* Tweets Mined */}
        <div className="p-5 rounded-3xl bg-gradient-to-b from-purple-500/10 via-zinc-900/60 to-zinc-900/40 hover:from-purple-500/20 shadow-xl shadow-black/20 hover:shadow-[0_0_30px_rgba(139,92,246,0.18)] transition-all duration-300 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-purple-500/20 text-purple-400 shadow-[0_0_12px_rgba(139,92,246,0.25)]">
                <MessageSquare className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-zinc-300">Tweets Mined</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-extrabold text-zinc-100 font-mono tracking-tight">{totalTweetsCount}</p>
            <div className="w-full h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
              <div className="h-full rounded-full bg-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.8)]" style={{ width: "90%" }}></div>
            </div>
          </div>
        </div>

        {/* Synthesized Keywords */}
        <div className="p-5 rounded-3xl bg-gradient-to-b from-emerald-500/10 via-zinc-900/60 to-zinc-900/40 hover:from-emerald-500/20 shadow-xl shadow-black/20 hover:shadow-[0_0_30px_rgba(16,185,129,0.18)] transition-all duration-300 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                <Tags className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-zinc-300">Synthesized Keywords</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-extrabold text-zinc-100 font-mono tracking-tight">{totalKeywordsCount}</p>
            <div className="w-full h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" style={{ width: "100%" }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Action Controls Strip (NO border box completely) */}
      <div className="w-full rounded-3xl bg-zinc-900/40 p-5 backdrop-blur-xl shadow-xl shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={function () {
                if (window.confirm("Are you sure you want to clear all stored intelligence records? This will reset all counts and start completely fresh.")) {
                  props.onClearDatabase();
                }
              }}
              disabled={props.isPipelineActive}
              className="group inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-medium text-xs shadow-md hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer disabled:opacity-40"
              title="Clear all stored intelligence runs and reset dashboard stats"
            >
              <Trash2 className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
              <span>Clear Stored Records</span>
            </button>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={function () {
                props.onStartPipeline();
              }}
              disabled={props.isPipelineActive}
              className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current transition-transform group-hover:scale-110" />
              <span>
                {props.isPipelineActive
                  ? "Pipeline Running..."
                  : "Run Pipeline"}
              </span>
            </button>

            <button
              onClick={function () {
                props.onNavigateTab("tweets");
              }}
              className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-850/80 hover:bg-zinc-800 text-zinc-200 font-medium text-xs shadow-md hover:shadow-[0_0_15px_rgba(139,92,246,0.18)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-purple-400 transition-transform group-hover:scale-110" />
              <span>View Tweets</span>
              {totalTweetsCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-semibold">
                  {totalTweetsCount}
                </span>
              )}
            </button>

            <button
              onClick={function () {
                props.onNavigateTab("keywords");
              }}
              className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-850/80 hover:bg-zinc-800 text-zinc-200 font-medium text-xs shadow-md hover:shadow-[0_0_15px_rgba(16,185,129,0.18)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
            >
              <Tags className="w-3.5 h-3.5 text-emerald-400 transition-transform group-hover:scale-110" />
              <span>View Keywords</span>
              {totalKeywordsCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
                  {totalKeywordsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 4. Top 10 Trending Hot Topics (Podium Showcase for Top 3, NO outer border box) */}
      <div className="w-full rounded-3xl bg-zinc-900/40 p-6 backdrop-blur-xl shadow-2xl shadow-black/30 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Top Trends</h3>
            </div>
          </div>

          <button
            onClick={() => props.onNavigateTab("trends")}
            className="text-xs text-amber-400 hover:text-amber-300 hover:underline font-medium flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>Explore All Trending Topics</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Podium Row for Top 3 Stories - Spaced evenly across full width */}
        {renderedPodiumCards.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
              {renderedPodiumCards}
            </div>

            {/* Remaining Stories */}
            {renderedRemainingHotTopicCards.length > 0 && (
              <div className="pt-3 space-y-3">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Additional Trending Stories
                </span>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                  {renderedRemainingHotTopicCards}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-zinc-500 bg-zinc-900/30 rounded-2xl space-y-2">
            <Newspaper className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-zinc-300 font-semibold">No Hot Topics Available Yet</p>
            <p className="text-zinc-500">Run the pipeline to ingest headlines from Defense News, The News International, and global wire feeds.</p>
          </div>
        )}
      </div>

      {/* 5. Keywords Section */}
      <div className="w-full rounded-3xl bg-zinc-900/40 p-6 backdrop-blur-xl shadow-2xl shadow-black/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shadow-[0_0_18px_rgba(16,185,129,0.25)]">
              <Tags className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Keywords</h3>
              <p className="text-xs text-zinc-400">
                Strategic AI synthesized intelligence keywords
              </p>
            </div>
          </div>

          <button
            onClick={() => props.onNavigateTab("keywords")}
            className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline font-medium cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <span>Inspect All Keywords ({totalKeywordsCount})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Compact Colored Keyword Boxes (Tight around text, non-interactable) */}
        {renderedProminentKeywordCards.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {renderedProminentKeywordCards}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic py-4">
            Run the intelligence pipeline to generate strategic keywords via Strategic AI Engine.
          </p>
        )}
      </div>

      {/* 6. Sleek Navigation Cards with Rounded Edges & Smooth Glow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 select-none">
        <button
          onClick={() => props.onNavigateTab("trends")}
          className="p-5 rounded-3xl bg-zinc-900/60 hover:bg-zinc-850/90 cursor-pointer transition-all duration-300 group shadow-lg shadow-black/20 hover:shadow-[0_0_25px_rgba(245,158,11,0.15)] flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-400 group-hover:scale-105 transition-transform shadow-[0_0_12px_rgba(245,158,11,0.15)]">
              <Flame className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-zinc-200 group-hover:text-amber-300 transition-colors">Trending Topics</p>
              <p className="text-[10px] text-zinc-500">Live hot news & X explore</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
        </button>

        <button
          onClick={() => props.onNavigateTab("headlines")}
          className="p-5 rounded-3xl bg-zinc-900/60 hover:bg-zinc-850/90 cursor-pointer transition-all duration-300 group shadow-lg shadow-black/20 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/15 text-blue-400 group-hover:scale-105 transition-transform shadow-[0_0_12px_rgba(59,130,246,0.15)]">
              <Globe className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-zinc-200 group-hover:text-blue-300 transition-colors">News Headlines</p>
              <p className="text-[10px] text-zinc-500">All 17 authoritative media feeds</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
        </button>

        <button
          onClick={() => props.onNavigateTab("history")}
          className="p-5 rounded-3xl bg-zinc-900/60 hover:bg-zinc-850/90 cursor-pointer transition-all duration-300 group shadow-lg shadow-black/20 hover:shadow-[0_0_25px_rgba(16,185,129,0.15)] flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-400 group-hover:scale-105 transition-transform shadow-[0_0_12px_rgba(16,185,129,0.15)]">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300 transition-colors">Run History</p>
              <p className="text-[10px] text-zinc-500">Archived Intelligence History</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
        </button>
      </div>
    </div>
  );
}
