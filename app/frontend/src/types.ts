// Type definitions for the Browser Agent Intelligence Dashboard

export type NavigationTabType =
  | "dashboard"
  | "pipeline"
  | "trends"
  | "headlines"
  | "tweets"
  | "keywords"
  | "sources"
  | "history"
  | "settings";

export interface CountryItem {
  name: string;
  trends24_slug: string;
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
