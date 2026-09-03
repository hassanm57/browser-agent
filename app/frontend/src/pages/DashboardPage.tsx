import type { RawSourcesData, KeywordsData, PipelineRunRecord, NavigationTabType } from "../types";
import {
  Globe,
  Flame,
  MessageSquare,
  Tags
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

  // Count synthesized topics
  let totalKeywordsTopicsCount = 0;
  if (props.keywordsData && props.keywordsData.topics) {
    totalKeywordsTopicsCount = props.keywordsData.topics.length;
  }

  return (
    <div className="space-y-10 max-w-6xl py-2">
      {/* 4 Prominent Stat Displays (Icon first on left, bigger icons, bigger stats, no border outline) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 select-none">
        {/* Active Sources */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-card/40 hover:bg-card/70 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 shadow-inner">
            <Globe className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-4xl font-extrabold text-foreground tracking-tight">
              {props.activeSourcesCount}
            </div>
            <div className="text-sm font-semibold text-foreground/90 mt-0.5">
              Active Sources
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              News & RSS feeds
            </div>
          </div>
        </div>

        {/* Trends Ingested */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-card/40 hover:bg-card/70 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
            <Flame className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-4xl font-extrabold text-foreground tracking-tight">
              {totalTrendsCount}
            </div>
            <div className="text-sm font-semibold text-foreground/90 mt-0.5">
              Trends Ingested
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              trends24 & X.com
            </div>
          </div>
        </div>

        {/* Tweets Mined */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-card/40 hover:bg-card/70 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 shadow-inner">
            <MessageSquare className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-4xl font-extrabold text-foreground tracking-tight">
              {totalTweetsCount}
            </div>
            <div className="text-sm font-semibold text-foreground/90 mt-0.5">
              Tweets Mined
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Clean timeline posts
            </div>
          </div>
        </div>

        {/* Synthesized Topics */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-card/40 hover:bg-card/70 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
            <Tags className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-4xl font-extrabold text-foreground tracking-tight">
              {totalKeywordsTopicsCount}
            </div>
            <div className="text-sm font-semibold text-foreground/90 mt-0.5">
              Synthesized Topics
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              20+ terms per topic
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-side Big Action Buttons */}
      <div className="pt-2">
        <div className="flex flex-wrap items-center gap-5">
          <button
            className="fancy-action-btn"
            onClick={function () {
              props.onNavigateTab("tweets");
            }}
          >
            <span className="transition"></span>
            <span className="gradient"></span>
            <span className="label">View Tweets</span>
          </button>

          <button
            className="fancy-action-btn"
            onClick={function () {
              props.onNavigateTab("keywords");
            }}
          >
            <span className="transition"></span>
            <span className="gradient"></span>
            <span className="label">View Keywords</span>
          </button>
        </div>
      </div>
    </div>
  );
}
