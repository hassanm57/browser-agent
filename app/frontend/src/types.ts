// Type definitions for the Trendline Intelligence Dashboard

export type NavigationTabType =
  | "dashboard"
  | "pipeline"
  | "trends"
  | "headlines"
  | "tweets"
  | "keywords"
  | "twitter_handles"
  | "sources"
  | "history"
  | "settings";

export interface TwitterHandleItem {
  id: number;
  handle: string;
  display_name: string;
  category: string;
  is_active: boolean;
  created_at: string;
  last_scraped_at: string | null;
  last_tweet_count: number;
}

export interface TwitterScrapedTweetItem {
  id: number;
  run_id: number | null;
  handle: string;
  author_display_name: string;
  tweet_text: string;
  tweet_timestamp_text: string;
  tweet_time_iso: string;
  is_within_24h: boolean;
  views_count: number;
  likes_count: number;
  reposts_count: number;
  replies_count: number;
  bookmarks_count: number;
  tweet_url: string;
  scraped_at: string;
  handle_category?: string;
}

export interface TwitterScrapeProgressItem {
  is_running: boolean;
  status: "idle" | "starting" | "running" | "completed" | "cancelled" | "error";
  total_handles: number;
  completed_handles: number;
  total_tweets_collected: number;
  concurrency_level: number;
  active_workers: Record<string, string>;
  started_at: string | null;
  finished_at: string | null;
  elapsed_seconds?: number;
  scheduler?: TwitterScheduleStatus;
}

export interface TwitterScheduleStatus {
  is_active: boolean;
  interval_minutes: number;
  concurrency_level: number;
  seconds_remaining: number;
  next_run_timestamp: string | null;
  last_run_timestamp: string | null;
  total_cycles_completed: number;
  is_scraping_now: boolean;
}

export interface CountryItem {
  name: string;
  slug?: string;
  trends24_slug?: string;
  tier: string;
  is_home: boolean;
}

export interface SourceItem {
  name: string;
  category: string;
  type: string; // "web" or "rss"
  url: string;
  enabled: boolean;
}

export interface KeywordTopicItem {
  label: string;
  category: string;
  terms: string[];
  boolean_query?: string;
  sample_tweets?: string[];
}

export interface KeywordsData {
  generated_at: string;
  country: string;
  sources_consulted: string[];
  total_topics: number;
  topics: KeywordTopicItem[];
}

export interface RawSourcesData {
  country: string;
  slug: string;
  collected_at: string;
  all_trends24_topics?: string[];
  relevant_trends24_topics?: string[];
  x_trends24_topics: string[];
  news_sources_intel: Record<string, string[]>;
  x_native_explore: {
    country: string;
    trends_observed: string[];
    sample_tweets_by_trend: Record<string, string[]>;
  };
}

export interface PipelineRunRecord {
  id: number;
  country_name: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "cancelled" | "error";
  error_message?: string | null;
}

export interface LogMessageItem {
  id: string;
  timestamp: string;
  level: "INFO" | "STEP" | "SUCCESS" | "WARN" | "ERROR" | "BROWSER" | "SCROLL" | "LLM";
  message: string;
}

export interface ApplicationSettings {
  vllm_base_url: string;
  vllm_api_key: string;
  llm_model_name: string;
  llm_maximum_tokens: string;
  llm_timeout_seconds: string;
  headless_mode: string;
  use_real_chrome: string;
  maximum_tweets_per_trend: string;
  maximum_scroll_rounds: string;
  number_of_trends_to_mine: string;
}
