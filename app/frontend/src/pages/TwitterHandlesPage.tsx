import React, { useState, useEffect } from "react";
import {
  AtSign,
  Play,
  Square,
  RefreshCw,
  Search,
  Trash2,
  ExternalLink,
  MessageCircle,
  Repeat2,
  Heart,
  Eye,
  Bookmark,
  Plus
} from "lucide-react";
import type { TwitterHandleItem, TwitterScrapedTweetItem, TwitterScrapeProgressItem } from "../types";

interface TwitterHandlesPageProps {
  backendApiBaseUrl: string;
  onHandlesCountChange?: (count: number) => void;
}

export function TwitterHandlesPage(props: TwitterHandlesPageProps) {
  const backendUrl = props.backendApiBaseUrl;

  // Active view: "tweets" or "handles"
  const [activeSubTab, setActiveSubTab] = useState<"tweets" | "handles">("tweets");

  // Data state
  const [handlesList, setHandlesList] = useState<TwitterHandleItem[]>([]);
  const [tweetsList, setTweetsList] = useState<TwitterScrapedTweetItem[]>([]);
  const [isLoadingHandles, setIsLoadingHandles] = useState<boolean>(false);
  const [isLoadingTweets, setIsLoadingTweets] = useState<boolean>(false);

  // Scrape execution state - 6 browser instances by default
  const [concurrencyLevel, setConcurrencyLevel] = useState<number>(6);
  const [scrapeProgress, setScrapeProgress] = useState<TwitterScrapeProgressItem>({
    is_running: false,
    status: "idle",
    total_handles: 0,
    completed_handles: 0,
    total_tweets_collected: 0,
    concurrency_level: 6,
    active_workers: {},
    started_at: null,
    finished_at: null
  });

  // Tweets filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("All");
  const [isWithin24HoursOnly, setIsWithin24HoursOnly] = useState<boolean>(true);
  const [sortByOption, setSortByOption] = useState<string>("views");

  // Handle management form state
  const [newHandleInput, setNewHandleInput] = useState<string>("");
  const [newCategoryInput, setNewCategoryInput] = useState<string>("Pakistan");
  const [selectedHandleCategoryFilter, setSelectedHandleCategoryFilter] = useState<string>("All");

  // Fetch handles list from backend
  const fetchHandlesList = async () => {
    setIsLoadingHandles(true);
    try {
      const response = await fetch(backendUrl + "/api/twitter/handles");
      if (response.ok) {
        const data = await response.json();
        setHandlesList(data);
        if (props.onHandlesCountChange) {
          props.onHandlesCountChange(data.length);
        }
      }
    } catch (fetchError) {
      console.error("Error fetching twitter handles:", fetchError);
    } finally {
      setIsLoadingHandles(false);
    }
  };

  // Fetch tweets list from backend
  const fetchTweetsList = async () => {
    setIsLoadingTweets(true);
    try {
      let queryUrl = backendUrl + "/api/twitter/tweets?sort_by=" + sortByOption;
      if (isWithin24HoursOnly) {
        queryUrl += "&within_24h_only=true";
      } else {
        queryUrl += "&within_24h_only=false";
      }
      if (selectedCategoryFilter !== "All") {
        queryUrl += "&category=" + encodeURIComponent(selectedCategoryFilter);
      }
      if (searchQuery.trim().length > 0) {
        queryUrl += "&search=" + encodeURIComponent(searchQuery.trim());
      }

      const response = await fetch(queryUrl);
      if (response.ok) {
        const data = await response.json();
        setTweetsList(data);
      }
    } catch (fetchError) {
      console.error("Error fetching scraped tweets:", fetchError);
    } finally {
      setIsLoadingTweets(false);
    }
  };

  // Fetch scraping status
  const fetchScrapeStatus = async () => {
    try {
      const response = await fetch(backendUrl + "/api/twitter/scrape/status");
      if (response.ok) {
        const data = await response.json();
        setScrapeProgress(data);
      }
    } catch (statusError) {
      console.error("Error checking scrape status:", statusError);
    }
  };

  // Initial load
  useEffect(() => {
    fetchHandlesList();
    fetchTweetsList();
    fetchScrapeStatus();
  }, []);

  // Refresh tweets when filters change
  useEffect(() => {
    fetchTweetsList();
  }, [sortByOption, isWithin24HoursOnly, selectedCategoryFilter, searchQuery]);

  // Poll status while scraping is running
  useEffect(() => {
    let pollingIntervalId: any = null;
    if (scrapeProgress.is_running) {
      pollingIntervalId = setInterval(() => {
        fetchScrapeStatus();
        fetchTweetsList();
        fetchHandlesList();
      }, 3000);
    }
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [scrapeProgress.is_running]);

  // Start parallel scraping
  const handleStartScraping = async () => {
    try {
      const response = await fetch(backendUrl + "/api/twitter/scrape/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concurrency_level: concurrencyLevel
        })
      });
      if (response.ok) {
        fetchScrapeStatus();
      }
    } catch (startError) {
      console.error("Error starting twitter scrape:", startError);
    }
  };

  // Cancel running scrape
  const handleCancelScraping = async () => {
    try {
      await fetch(backendUrl + "/api/twitter/scrape/cancel", { method: "POST" });
      fetchScrapeStatus();
    } catch (cancelError) {
      console.error("Error cancelling twitter scrape:", cancelError);
    }
  };

  // Clear all scraped tweets
  const handleClearTweets = async () => {
    if (!window.confirm("Are you sure you want to clear all scraped tweets?")) {
      return;
    }
    try {
      await fetch(backendUrl + "/api/twitter/tweets", { method: "DELETE" });
      setTweetsList([]);
      fetchHandlesList();
      fetchScrapeStatus();
    } catch (clearError) {
      console.error("Error clearing tweets:", clearError);
    }
  };

  // Add new handle
  const handleAddHandleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHandle = newHandleInput.trim().replace("@", "");
    if (cleanHandle.length === 0) {
      return;
    }

    try {
      const response = await fetch(backendUrl + "/api/twitter/handles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: cleanHandle,
          display_name: cleanHandle,
          category: newCategoryInput
        })
      });

      if (response.ok) {
        setNewHandleInput("");
        fetchHandlesList();
      }
    } catch (addError) {
      console.error("Error adding handle:", addError);
    }
  };

  // Toggle handle active/inactive
  const handleToggleHandleActive = async (handleItem: TwitterHandleItem) => {
    try {
      await fetch(backendUrl + "/api/twitter/handles/" + handleItem.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: handleItem.display_name,
          category: handleItem.category,
          is_active: !handleItem.is_active
        })
      });
      fetchHandlesList();
    } catch (toggleError) {
      console.error("Error toggling handle:", toggleError);
    }
  };

  // Delete handle
  const handleDeleteHandle = async (handleId: number) => {
    try {
      await fetch(backendUrl + "/api/twitter/handles/" + handleId, { method: "DELETE" });
      fetchHandlesList();
    } catch (deleteError) {
      console.error("Error deleting handle:", deleteError);
    }
  };

  // Build list of filtered handles using a traditional loop (avoiding functional .filter())
  const filteredHandlesList: TwitterHandleItem[] = [];
  for (let i = 0; i < handlesList.length; i++) {
    const handleItem = handlesList[i];
    if (selectedHandleCategoryFilter === "All" || handleItem.category === selectedHandleCategoryFilter) {
      filteredHandlesList.push(handleItem);
    }
  }

  // Render tweet cards using traditional loop (avoiding functional .map())
  const renderedTweetCards = [];
  for (let tweetIndex = 0; tweetIndex < tweetsList.length; tweetIndex++) {
    const tweet = tweetsList[tweetIndex];
    renderedTweetCards.push(
      <div
        key={tweet.id}
        className="p-3.5 rounded-lg border border-border/60 bg-card/60 hover:bg-card/90 hover:border-border transition-all space-y-2.5 flex flex-col justify-between shadow-xs"
      >
        {/* Tweet Header */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="font-semibold text-foreground text-xs truncate">
              @{tweet.handle}
            </span>
            {tweet.author_display_name && tweet.author_display_name !== tweet.handle && (
              <span className="text-zinc-500 truncate max-w-[120px] hidden sm:inline">({tweet.author_display_name})</span>
            )}
            <span className="text-zinc-600">·</span>
            <span className="shrink-0">{tweet.tweet_timestamp_text}</span>
            {tweet.is_within_24h && (
              <span className="text-emerald-400 font-medium text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 shrink-0">24h</span>
            )}
          </div>
          <a
            href={"https://x.com/" + tweet.handle}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground text-zinc-500 shrink-0 transition-colors p-0.5"
            title="View on X"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Tweet Content */}
        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-5">
          {tweet.tweet_text}
        </p>

        {/* Minimal inline metrics row */}
        <div className="flex items-center gap-4 pt-2 border-t border-border/30 text-[11px] text-muted-foreground mt-auto">
          <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Replies">
            <MessageCircle className="w-3 h-3 text-sky-400 fill-sky-400/20 drop-shadow-[0_0_5px_rgba(56,189,248,0.7)]" />
            <span className="text-zinc-400 font-medium">{tweet.replies_count.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Reposts">
            <Repeat2 className="w-3.5 h-3.5 text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.7)]" />
            <span className="text-zinc-400 font-medium">{tweet.reposts_count.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Likes">
            <Heart className="w-3 h-3 text-rose-400 fill-rose-400/25 drop-shadow-[0_0_5px_rgba(244,63,94,0.75)]" />
            <span className="text-zinc-400 font-medium">{tweet.likes_count.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Views">
            <Eye className="w-3 h-3 text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.65)]" />
            <span className="text-zinc-400 font-medium">{tweet.views_count.toLocaleString()}</span>
          </span>
          {tweet.bookmarks_count > 0 && (
            <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Bookmarks">
              <Bookmark className="w-3 h-3 text-amber-400 fill-amber-400/25 drop-shadow-[0_0_5px_rgba(251,191,36,0.75)]" />
              <span className="text-zinc-400 font-medium">{tweet.bookmarks_count.toLocaleString()}</span>
            </span>
          )}
          {tweet.handle_category && (
            <span className="ml-auto text-[10px] text-zinc-500 truncate max-w-[90px]">
              {tweet.handle_category}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Render handles table rows using traditional loop
  const renderedHandleRows = [];
  for (let hIndex = 0; hIndex < filteredHandlesList.length; hIndex++) {
    const hItem = filteredHandlesList[hIndex];
    renderedHandleRows.push(
      <tr
        key={hItem.id}
        className="border-b border-border/30 hover:bg-muted/20 text-xs transition-colors"
      >
        <td className="py-2.5 px-3 font-medium text-foreground">
          <div className="flex items-center gap-2">
            <a
              href={"https://x.com/" + hItem.handle}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline flex items-center gap-1"
            >
              @{hItem.handle}
            </a>
          </div>
        </td>
        <td className="py-2.5 px-3 text-muted-foreground">{hItem.category}</td>
        <td className="py-2.5 px-3 text-muted-foreground">
          {hItem.last_scraped_at ? new Date(hItem.last_scraped_at).toLocaleDateString() : "Never"}
        </td>
        <td className="py-2.5 px-3 text-muted-foreground">
          {hItem.last_tweet_count > 0 ? (
            <span className="text-zinc-300 font-medium">{hItem.last_tweet_count} tweets</span>
          ) : (
            "—"
          )}
        </td>
        <td className="py-2.5 px-3">
          <button
            onClick={() => handleToggleHandleActive(hItem)}
            className={
              "px-2 py-0.5 rounded text-[11px] font-medium border transition-colors " +
              (hItem.is_active
                ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                : "border-zinc-700 text-zinc-500 bg-zinc-800/40")
            }
          >
            {hItem.is_active ? "Active" : "Disabled"}
          </button>
        </td>
        <td className="py-2.5 px-3 text-right">
          <button
            onClick={() => handleDeleteHandle(hItem.id)}
            className="text-zinc-500 hover:text-rose-400 transition-colors p-1"
            title="Delete handle"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>
    );
  }

  // Active workers list rendered with traditional loop
  const renderedActiveWorkers = [];
  if (scrapeProgress.is_running && scrapeProgress.active_workers) {
    const workerKeys = Object.keys(scrapeProgress.active_workers);
    for (let w = 0; w < workerKeys.length; w++) {
      const workerId = workerKeys[w];
      const currentTask = scrapeProgress.active_workers[workerId];
      renderedActiveWorkers.push(
        <span key={workerId} className="text-xs text-zinc-400">
          Worker {workerId}: <span className="text-foreground font-medium">{currentTask}</span>
          {w < workerKeys.length - 1 ? "  ·  " : ""}
        </span>
      );
    }
  }

  // Category filter buttons rendered using a traditional loop
  const availableCategoriesList = ["All", "Pakistan", "Global Think Tanks", "India Think Tanks"];
  const categoryFilterButtons = [];
  for (let cIndex = 0; cIndex < availableCategoriesList.length; cIndex++) {
    const categoryName = availableCategoriesList[cIndex];
    const isSelected = selectedHandleCategoryFilter === categoryName;
    categoryFilterButtons.push(
      <button
        key={categoryName}
        onClick={() => setSelectedHandleCategoryFilter(categoryName)}
        className={
          "px-2.5 py-1 rounded text-xs transition-colors " +
          (isSelected
            ? "bg-zinc-800 text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground")
        }
      >
        {categoryName}
      </button>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <AtSign className="w-5 h-5 text-foreground" />
            <h1 className="text-xl font-semibold text-foreground tracking-tight">
              Twitter Scraper
            </h1>
            <span className="text-xs text-muted-foreground ml-1">
              ({handlesList.length} handles)
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Multi-browser tweet scraper
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Concurrency Selector */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Browsers:</span>
            <select
              value={concurrencyLevel}
              disabled={scrapeProgress.is_running}
              onChange={(e) => setConcurrencyLevel(Number(e.target.value))}
              className="bg-card border border-border/50 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-zinc-500"
            >
              <option value={2}>2 browsers</option>
              <option value={3}>3 browsers</option>
              <option value={4}>4 browsers</option>
              <option value={5}>5 browsers</option>
              <option value={6}>6 browsers</option>
              <option value={8}>8 browsers</option>
            </select>
          </div>

          {/* Start / Cancel Scrape Buttons */}
          {scrapeProgress.is_running ? (
            <button
              onClick={handleCancelScraping}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Cancel
            </button>
          ) : (
            <button
              onClick={handleStartScraping}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Run Scraper
            </button>
          )}

          <button
            onClick={handleClearTweets}
            disabled={scrapeProgress.is_running || tweetsList.length === 0}
            className="text-xs text-muted-foreground hover:text-rose-400 transition-colors px-2 py-1 disabled:opacity-40"
            title="Clear all scraped tweets"
          >
            Clear Tweets
          </button>
        </div>
      </div>

      {/* Live Scraping Progress Banner */}
      {scrapeProgress.is_running && (
        <div className="p-3.5 rounded-lg border border-border/40 bg-card/60 space-y-2 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Scraping in progress...
            </span>
            <span>
              {scrapeProgress.completed_handles} / {scrapeProgress.total_handles} handles (
              {scrapeProgress.total_tweets_collected} tweets)
            </span>
          </div>

          {/* Slim progress bar */}
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-foreground h-1.5 rounded-full transition-all duration-300"
              style={{
                width:
                  scrapeProgress.total_handles > 0
                    ? `${(scrapeProgress.completed_handles / scrapeProgress.total_handles) * 100}%`
                    : "0%"
              }}
            />
          </div>
        </div>
      )}

      {/* Sub-view Navigation Tabs */}
      <div className="flex items-center gap-6 border-b border-border/40 text-xs">
        <button
          onClick={() => setActiveSubTab("tweets")}
          className={
            "pb-2.5 font-medium transition-colors border-b-2 " +
            (activeSubTab === "tweets"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground")
          }
        >
          Scraped Tweets ({tweetsList.length})
        </button>
        <button
          onClick={() => setActiveSubTab("handles")}
          className={
            "pb-2.5 font-medium transition-colors border-b-2 " +
            (activeSubTab === "handles"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground")
          }
        >
          Configured Handles ({handlesList.length})
        </button>
      </div>

      {/* VIEW 1: SCRAPED TWEETS FEED */}
      {activeSubTab === "tweets" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tweets or handles..."
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-card border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-zinc-500 text-xs"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              {/* Category Filter */}
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="bg-card border border-border/50 rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
              >
                <option value="All">All Categories</option>
                <option value="Pakistan">Pakistan</option>
                <option value="Global Think Tanks">Global Think Tanks</option>
                <option value="India Think Tanks">India Think Tanks</option>
              </select>

              {/* Sort Filter */}
              <select
                value={sortByOption}
                onChange={(e) => setSortByOption(e.target.value)}
                className="bg-card border border-border/50 rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
              >
                <option value="views">Most Views</option>
                <option value="time">Newest First</option>
                <option value="likes">Most Likes</option>
                <option value="reposts">Most Reposts</option>
                <option value="replies">Most Comments</option>
              </select>

              {/* 24h Glowing Circle Toggle */}
              <button
                type="button"
                onClick={() => setIsWithin24HoursOnly(!isWithin24HoursOnly)}
                title={isWithin24HoursOnly ? "Past 24 Hours (Active - click to show all)" : "Filter by Past 24 Hours"}
                aria-label="Filter past 24 hours"
                className={
                  "relative flex items-center justify-center shrink-0 w-8 h-8 rounded-full text-[11px] font-bold transition-all " +
                  (isWithin24HoursOnly
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.55)] ring-2 ring-emerald-500/30"
                    : "bg-card text-muted-foreground border border-border/50 hover:text-foreground hover:border-zinc-500")
                }
              >
                {isWithin24HoursOnly && (
                  <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400/20 pointer-events-none" />
                )}
                <span className="relative z-10">24h</span>
              </button>
            </div>
          </div>

          {/* Tweets Feed */}
          {isLoadingTweets ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
              Loading tweets...
            </div>
          ) : tweetsList.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground space-y-2">
              <AtSign className="w-6 h-6 mx-auto text-zinc-600" />
              <p className="font-medium text-foreground">No scraped tweets available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{renderedTweetCards}</div>
          )}
        </div>
      )}

      {/* VIEW 2: CONFIGURED HANDLES MANAGEMENT */}
      {activeSubTab === "handles" && (
        <div className="space-y-4">
          {/* Add Handle Bar */}
          <form
            onSubmit={handleAddHandleSubmit}
            className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border/40 bg-card/40 text-xs"
          >
            <div className="flex-1 min-w-[180px]">
              <input
                type="text"
                value={newHandleInput}
                onChange={(e) => setNewHandleInput(e.target.value)}
                placeholder="Enter handle e.g. ISSIslamabad"
                className="w-full px-3 py-1.5 rounded bg-background border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-zinc-500 text-xs"
              />
            </div>
            <select
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              className="bg-background border border-border/50 rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="Pakistan">Pakistan</option>
              <option value="Global Think Tanks">Global Think Tanks</option>
              <option value="India Think Tanks">India Think Tanks</option>
              <option value="General">General</option>
            </select>
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Handle
            </button>
          </form>

          {/* Category Filter for Handles */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Filter:</span>
            {categoryFilterButtons}
          </div>

          {/* Handles Table */}
          {isLoadingHandles ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
              Loading handles...
            </div>
          ) : (
            <div className="border border-border/40 rounded-lg overflow-hidden bg-card/40">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/30 text-[11px] text-muted-foreground font-medium">
                    <th className="py-2.5 px-3">Handle</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Last Scraped</th>
                    <th className="py-2.5 px-3">Latest Tweets</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>{renderedHandleRows}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
