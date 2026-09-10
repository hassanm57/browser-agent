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
  Plus,
  X,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  AlertCircle,
  Timer,
  ChevronDown
} from "lucide-react";
import type { TwitterHandleItem, TwitterScrapedTweetItem, TwitterScrapeProgressItem, TwitterScheduleStatus } from "../types";

interface TwitterHandlesPageProps {
  backendApiBaseUrl: string;
  onHandlesCountChange?: (count: number) => void;
  onTweetsCountChange?: (count: number) => void;
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

  // Modal state for viewing a single tweet in full detail
  const [selectedTweetForModal, setSelectedTweetForModal] = useState<TwitterScrapedTweetItem | null>(null);
  const [hasCopiedModalText, setHasCopiedModalText] = useState<boolean>(false);

  // Scraper launch state & re-run confirmation modal
  const [isStartingScrape, setIsStartingScrape] = useState<boolean>(false);
  const [isConfirmingRerunModalOpen, setIsConfirmingRerunModalOpen] = useState<boolean>(false);

  // Live elapsed time tracking in seconds
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState<number>(0);

  // Recurring scheduler state
  const [scheduleStatus, setScheduleStatus] = useState<TwitterScheduleStatus>({
    is_active: false,
    interval_minutes: 15,
    concurrency_level: 6,
    seconds_remaining: 0,
    next_run_timestamp: null,
    last_run_timestamp: null,
    total_cycles_completed: 0,
    is_scraping_now: false
  });
  const [isTimerPopoverOpen, setIsTimerPopoverOpen] = useState<boolean>(false);
  const [selectedIntervalMinutes, setSelectedIntervalMinutes] = useState<number>(15);
  const [customIntervalInput, setCustomIntervalInput] = useState<string>("");
  const [isStartingSchedule, setIsStartingSchedule] = useState<boolean>(false);

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

      // Keep parent tab badge in sync with total scraped tweets count
      if (props.onTweetsCountChange) {
        try {
          const totalCountResponse = await fetch(backendUrl + "/api/twitter/tweets?within_24h_only=false");
          if (totalCountResponse.ok) {
            const allTweetsData = await totalCountResponse.json();
            if (Array.isArray(allTweetsData)) {
              props.onTweetsCountChange(allTweetsData.length);
            }
          }
        } catch (countError) {
          // Non-critical background count sync error
        }
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
        if (data.scheduler) {
          setScheduleStatus(data.scheduler);
        }
      }
    } catch (statusError) {
      console.error("Error checking scrape status:", statusError);
    }
  };

  // Fetch recurring scheduler status
  const fetchScheduleStatus = async () => {
    try {
      const response = await fetch(backendUrl + "/api/twitter/schedule/status");
      if (response.ok) {
        const data = await response.json();
        setScheduleStatus(data);
      }
    } catch (scheduleError) {
      console.error("Error checking schedule status:", scheduleError);
    }
  };

  // Initial load
  useEffect(() => {
    fetchHandlesList();
    fetchTweetsList();
    fetchScrapeStatus();
    fetchScheduleStatus();
  }, []);

  // Refresh tweets when filters change
  useEffect(() => {
    fetchTweetsList();
  }, [sortByOption, isWithin24HoursOnly, selectedCategoryFilter, searchQuery]);

  // Live WebSocket connection for real-time twitter scraper events
  useEffect(() => {
    let socketInstance: WebSocket | null = null;
    let shouldKeepReconnecting = true;
    let reconnectTimerId: any = null;

    const setupScrapeWebSocket = () => {
      try {
        const websocketUrl = backendUrl.replace(/^http/, "ws") + "/ws/pipeline";
        socketInstance = new WebSocket(websocketUrl);

        socketInstance.onmessage = (messageEvent) => {
          try {
            const parsedData = JSON.parse(messageEvent.data);
            if (parsedData.type === "twitter_scrape_progress" && parsedData.data) {
              const progressPayload = parsedData.data;
              setScrapeProgress((previousProgress) => ({
                ...previousProgress,
                is_running: true,
                status: "running",
                completed_handles:
                  progressPayload.completed_handles !== undefined
                    ? progressPayload.completed_handles
                    : previousProgress.completed_handles,
                total_tweets_collected:
                  progressPayload.total_tweets_collected !== undefined
                    ? progressPayload.total_tweets_collected
                    : previousProgress.total_tweets_collected,
                active_workers: progressPayload.active_workers || previousProgress.active_workers,
                total_handles: progressPayload.total_handles || previousProgress.total_handles
              }));
              setIsStartingScrape(false);
            } else if (parsedData.type === "twitter_scrape_status") {
              const newStatusString = parsedData.status;
              if (
                newStatusString === "completed" ||
                newStatusString === "cancelled" ||
                newStatusString === "error"
              ) {
                setIsStartingScrape(false);
                fetchScrapeStatus();
                fetchScheduleStatus();
                fetchTweetsList();
                fetchHandlesList();
              }
            } else if (parsedData.type === "twitter_scrape_tweet") {
              fetchTweetsList();
            } else if (parsedData.type === "twitter_schedule_status" && parsedData.data) {
              setScheduleStatus(parsedData.data);
            } else if (parsedData.type === "twitter_schedule_tick" && parsedData.data) {
              setScheduleStatus((previousSchedule) => ({
                ...previousSchedule,
                ...parsedData.data
              }));
            }
          } catch (jsonParseError) {
            // Ignore parse errors on non-json stream frames
          }
        };

        socketInstance.onclose = () => {
          if (shouldKeepReconnecting) {
            reconnectTimerId = setTimeout(setupScrapeWebSocket, 3000);
          }
        };

        socketInstance.onerror = () => {
          // Fall back gracefully to background polling
        };
      } catch (connectionError) {
        console.error("Error connecting to scraper WebSocket:", connectionError);
      }
    };

    setupScrapeWebSocket();

    return () => {
      shouldKeepReconnecting = false;
      if (reconnectTimerId) {
        clearTimeout(reconnectTimerId);
      }
      if (socketInstance) {
        socketInstance.close();
      }
    };
  }, [backendUrl]);

  // Fast poll status while scraping is actively running or launching
  useEffect(() => {
    let pollingIntervalId: any = null;
    if (scrapeProgress.is_running || isStartingScrape) {
      pollingIntervalId = setInterval(() => {
        fetchScrapeStatus();
        fetchTweetsList();
        fetchHandlesList();
      }, 1500);
    }
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [scrapeProgress.is_running, isStartingScrape]);

  // Live elapsed timer that increments every second while scraping is active,
  // or updates to the final elapsed duration when the scrape run finishes
  useEffect(() => {
    let timerIntervalId: any = null;

    if (scrapeProgress.is_running && scrapeProgress.started_at) {
      const updateRunningTimer = () => {
        const startMillis = new Date(scrapeProgress.started_at!).getTime();
        const currentMillis = Date.now();
        const secondsDifference = Math.max(0, Math.floor((currentMillis - startMillis) / 1000));
        setLiveElapsedSeconds(secondsDifference);
      };

      updateRunningTimer();
      timerIntervalId = setInterval(updateRunningTimer, 1000);
    } else if (scrapeProgress.started_at && scrapeProgress.finished_at) {
      const startMillis = new Date(scrapeProgress.started_at).getTime();
      const finishMillis = new Date(scrapeProgress.finished_at).getTime();
      const totalSeconds = Math.max(0, Math.floor((finishMillis - startMillis) / 1000));
      setLiveElapsedSeconds(totalSeconds);
    } else if (scrapeProgress.elapsed_seconds !== undefined && scrapeProgress.elapsed_seconds > 0) {
      setLiveElapsedSeconds(scrapeProgress.elapsed_seconds);
    }

    return () => {
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
      }
    };
  }, [
    scrapeProgress.is_running,
    scrapeProgress.started_at,
    scrapeProgress.finished_at,
    scrapeProgress.elapsed_seconds
  ]);

  // Helper function to format seconds into digital clock display: mm:ss or hh:mm:ss
  const formatStopwatchDisplay = (totalSecondsCount: number): string => {
    if (totalSecondsCount < 0) {
      return "00:00";
    }

    const hoursCount = Math.floor(totalSecondsCount / 3600);
    const remainingSecondsAfterHours = totalSecondsCount % 3600;
    const minutesCount = Math.floor(remainingSecondsAfterHours / 60);
    const secondsCount = remainingSecondsAfterHours % 60;

    const paddedMinutes = String(minutesCount).padStart(2, "0");
    const paddedSeconds = String(secondsCount).padStart(2, "0");

    if (hoursCount > 0) {
      const paddedHours = String(hoursCount).padStart(2, "0");
      return paddedHours + ":" + paddedMinutes + ":" + paddedSeconds;
    }

    return paddedMinutes + ":" + paddedSeconds;
  };

  // Helper function to format seconds into readable text: e.g. "4m 32s" or "45s"
  const formatElapsedDurationText = (totalSecondsCount: number): string => {
    if (totalSecondsCount <= 0) {
      return "0s";
    }

    const hoursCount = Math.floor(totalSecondsCount / 3600);
    const remainingSecondsAfterHours = totalSecondsCount % 3600;
    const minutesCount = Math.floor(remainingSecondsAfterHours / 60);
    const secondsCount = remainingSecondsAfterHours % 60;

    if (hoursCount > 0) {
      return hoursCount + "h " + minutesCount + "m " + secondsCount + "s";
    }

    if (minutesCount > 0) {
      return minutesCount + "m " + secondsCount + "s";
    }

    return secondsCount + "s";
  };

  // Close modals when user presses the Escape key
  useEffect(() => {
    const handleEscapeKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        setSelectedTweetForModal(null);
        setIsConfirmingRerunModalOpen(false);
        setIsTimerPopoverOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscapeKeyDown);
    return () => {
      window.removeEventListener("keydown", handleEscapeKeyDown);
    };
  }, []);

  // Close timer popover when user clicks outside
  useEffect(() => {
    if (!isTimerPopoverOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const targetElement = event.target as HTMLElement;
      if (!targetElement.closest(".timer-popover-container")) {
        setIsTimerPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isTimerPopoverOpen]);

  // Periodic heartbeat poll for schedule status while schedule is active
  useEffect(() => {
    let schedulePollingIntervalId: any = null;
    if (scheduleStatus.is_active) {
      schedulePollingIntervalId = setInterval(() => {
        fetchScheduleStatus();
      }, 5000);
    }
    return () => {
      if (schedulePollingIntervalId) {
        clearInterval(schedulePollingIntervalId);
      }
    };
  }, [scheduleStatus.is_active, backendUrl]);

  // Start recurring schedule
  const handleStartSchedule = async (intervalMinutesToUse: number) => {
    setIsStartingSchedule(true);
    setIsTimerPopoverOpen(false);

    try {
      const response = await fetch(backendUrl + "/api/twitter/schedule/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interval_minutes: intervalMinutesToUse,
          concurrency_level: concurrencyLevel
        })
      });

      if (response.ok) {
        const scheduleResult = await response.json();
        setScheduleStatus(scheduleResult);
        await fetchScrapeStatus();
      }
    } catch (schedStartError) {
      console.error("Error starting schedule:", schedStartError);
    } finally {
      setIsStartingSchedule(false);
    }
  };

  // Stop recurring schedule
  const handleStopSchedule = async () => {
    try {
      const response = await fetch(backendUrl + "/api/twitter/schedule/stop", {
        method: "POST"
      });
      if (response.ok) {
        const stoppedResult = await response.json();
        setScheduleStatus(stoppedResult);
        await fetchScrapeStatus();
      }
    } catch (stopError) {
      console.error("Error stopping schedule:", stopError);
    }
  };

  // Copy tweet text to clipboard
  const handleCopyTweetText = async () => {
    if (selectedTweetForModal !== null) {
      try {
        await navigator.clipboard.writeText(selectedTweetForModal.tweet_text);
        setHasCopiedModalText(true);
        setTimeout(() => {
          setHasCopiedModalText(false);
        }, 2000);
      } catch (copyError) {
        console.error("Failed to copy tweet text to clipboard:", copyError);
      }
    }
  };

  // Perform the actual HTTP POST request to launch the scraper
  const executeStartScraping = async () => {
    setIsStartingScrape(true);
    setIsConfirmingRerunModalOpen(false);

    // Optimistically update progress so the UI immediately reveals the running banner & disabled button
    const optimisticTotalHandles = handlesList.length > 0 ? handlesList.length : 80;
    const initialWorkersMap: Record<string, string> = {};
    for (let workerIndexNumber = 1; workerIndexNumber <= concurrencyLevel; workerIndexNumber++) {
      initialWorkersMap[String(workerIndexNumber)] = "Launching Chrome...";
    }

    setLiveElapsedSeconds(0);

    setScrapeProgress({
      is_running: true,
      status: "starting",
      total_handles: optimisticTotalHandles,
      completed_handles: 0,
      total_tweets_collected: tweetsList.length,
      concurrency_level: concurrencyLevel,
      active_workers: initialWorkersMap,
      started_at: new Date().toISOString(),
      finished_at: null
    });

    try {
      const response = await fetch(backendUrl + "/api/twitter/scrape/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concurrency_level: concurrencyLevel
        })
      });

      if (response.ok) {
        const startResult = await response.json();
        setScrapeProgress(startResult);
      } else {
        await fetchScrapeStatus();
      }
    } catch (startError) {
      console.error("Error starting twitter scrape:", startError);
    } finally {
      setIsStartingScrape(false);
    }
  };

  // Triggered when user clicks Run / Re-run Scraper button
  const handleStartScrapingClick = () => {
    // If scraper is already running or launching, do nothing
    if (scrapeProgress.is_running || isStartingScrape) {
      return;
    }

    // If we already ran it and have results, show graceful confirmation modal with choices
    if (tweetsList.length > 0) {
      setIsConfirmingRerunModalOpen(true);
      return;
    }

    // Otherwise, launch scraping immediately
    executeStartScraping();
  };

  // Re-run option: clear previous tweets first, then start scraping fresh
  const handleClearAndRunFresh = async () => {
    setIsConfirmingRerunModalOpen(false);
    try {
      await fetch(backendUrl + "/api/twitter/tweets", { method: "DELETE" });
      setTweetsList([]);
      if (props.onTweetsCountChange) {
        props.onTweetsCountChange(0);
      }
    } catch (clearErr) {
      console.error("Error clearing tweets before fresh run:", clearErr);
    }
    executeStartScraping();
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
      if (props.onTweetsCountChange) {
        props.onTweetsCountChange(0);
      }
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
        onClick={() => {
          setSelectedTweetForModal(tweet);
          setHasCopiedModalText(false);
        }}
        className="p-3.5 rounded-lg border border-border/60 bg-card/60 hover:bg-card/90 hover:border-border transition-all space-y-2.5 flex flex-col justify-between shadow-xs cursor-pointer group"
      >
        {/* Tweet Header */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="font-semibold text-foreground text-xs truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              @{tweet.handle}
            </span>
            {tweet.author_display_name && tweet.author_display_name !== tweet.handle && (
              <span className="text-muted-foreground truncate max-w-[120px] hidden sm:inline">({tweet.author_display_name})</span>
            )}
            <span className="text-muted-foreground">·</span>
            <span className="shrink-0">{tweet.tweet_timestamp_text}</span>
            {tweet.is_within_24h && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 shrink-0">24h</span>
            )}
          </div>
          <a
            href={"https://x.com/" + tweet.handle}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            className="hover:text-foreground text-muted-foreground shrink-0 transition-colors p-0.5"
            title="View on X"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Tweet Content */}
        <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
          {tweet.tweet_text}
        </p>

        {/* Minimal inline metrics row */}
        <div className="flex items-center gap-4 pt-2 border-t border-border/30 text-[11px] text-muted-foreground mt-auto">
          <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Replies">
            <MessageCircle className="w-3 h-3 text-sky-500 dark:text-sky-400 fill-sky-500/20 dark:fill-sky-400/20" />
            <span className="text-foreground/80 font-medium">{tweet.replies_count.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Reposts">
            <Repeat2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span className="text-foreground/80 font-medium">{tweet.reposts_count.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Likes">
            <Heart className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 fill-rose-500/25 dark:fill-rose-400/25" />
            <span className="text-foreground/80 font-medium">{tweet.likes_count.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Views">
            <Eye className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span className="text-foreground/80 font-medium">{tweet.views_count.toLocaleString()}</span>
          </span>
          {tweet.bookmarks_count > 0 && (
            <span className="flex items-center gap-1.5 hover:text-foreground transition-colors" title="Bookmarks">
              <Bookmark className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 fill-amber-500/25 dark:fill-amber-400/25" />
              <span className="text-foreground/80 font-medium">{tweet.bookmarks_count.toLocaleString()}</span>
            </span>
          )}
          {tweet.handle_category && (
            <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[90px]">
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
            <span className="text-foreground/90 font-medium">{hItem.last_tweet_count} tweets</span>
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
                ? "border-emerald-500/30 text-emerald-500 dark:text-emerald-400 bg-emerald-500/10"
                : "border-border text-muted-foreground bg-muted/40")
            }
          >
            {hItem.is_active ? "Active" : "Disabled"}
          </button>
        </td>
        <td className="py-2.5 px-3 text-right">
          <button
            onClick={() => handleDeleteHandle(hItem.id)}
            className="text-muted-foreground hover:text-rose-500 transition-colors p-1 cursor-pointer"
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
        <span
          key={workerId}
          className="inline-flex items-center gap-1.5 text-[11px] text-foreground/90 bg-muted/70 border border-border/60 px-2 py-0.5 rounded"
        >
          <span className="text-muted-foreground font-mono text-[10px]">W{workerId}:</span>
          <span className="text-foreground font-medium truncate max-w-[140px]">{currentTask}</span>
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
          "px-2.5 py-1 rounded text-xs transition-colors cursor-pointer " +
          (isSelected
            ? "bg-muted text-foreground font-medium border border-border/60"
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
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            <span>Multi-browser tweet scraper</span>
            {!scrapeProgress.is_running && scrapeProgress.finished_at && liveElapsedSeconds > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-zinc-400">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  Last run: {formatElapsedDurationText(liveElapsedSeconds)} total elapsed
                </span>
              </>
            )}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Concurrency Selector */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Browsers:</span>
            <select
              value={concurrencyLevel}
              disabled={scrapeProgress.is_running || scheduleStatus.is_active}
              onChange={(e) => setConcurrencyLevel(Number(e.target.value))}
              className="bg-card border border-border/50 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            >
              <option value={2}>2 browsers</option>
              <option value={3}>3 browsers</option>
              <option value={4}>4 browsers</option>
              <option value={5}>5 browsers</option>
              <option value={6}>6 browsers</option>
              <option value={8}>8 browsers</option>
            </select>
          </div>

          {/* Start / Cancel / Scheduled Scrape Buttons */}
          {scheduleStatus.is_active ? (
            <button
              onClick={handleStopSchedule}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Schedule
            </button>
          ) : scrapeProgress.is_running ? (
            <button
              onClick={handleCancelScraping}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Cancel
            </button>
          ) : isStartingScrape || isStartingSchedule ? (
            <button
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground border border-border opacity-90 cursor-not-allowed"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
              Launching...
            </button>
          ) : (
            <div className="relative inline-flex timer-popover-container rounded-md shadow-xs">
              {/* Left action button: Run Scraper (Run Once) */}
              <button
                onClick={handleStartScrapingClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer border-r border-background/20"
                title="Run single scrape immediately"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {tweetsList.length > 0 ? "Re-run Scraper" : "Run Scraper"}
              </button>

              {/* Right trigger button: Open Timer Popover */}
              <button
                onClick={() => setIsTimerPopoverOpen(!isTimerPopoverOpen)}
                className="flex items-center px-2 py-1.5 rounded-r-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer"
                title="Set recurring scraping timer"
              >
                <Timer className="w-3.5 h-3.5" />
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
              </button>

              {/* Timer Popover Menu */}
              {isTimerPopoverOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-card border border-border rounded-lg shadow-xl z-50 text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Timer className="w-3.5 h-3.5 text-blue-500" />
                      <span>Recurring Schedule</span>
                    </div>
                    <button
                      onClick={() => setIsTimerPopoverOpen(false)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Repeats scraping automatically to fetch fresh tweets. Browsers shut down between runs to save RAM. New tweets stack automatically.
                  </p>

                  {/* Interval Presets */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Interval presets:</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[15, 30, 45, 60].map((presetMinutes) => (
                        <button
                          key={presetMinutes}
                          type="button"
                          onClick={() => {
                            setSelectedIntervalMinutes(presetMinutes);
                            setCustomIntervalInput("");
                          }}
                          className={`px-2 py-1 rounded text-xs text-center border transition-colors cursor-pointer ${
                            selectedIntervalMinutes === presetMinutes && customIntervalInput === ""
                              ? "bg-primary text-primary-foreground border-primary font-medium"
                              : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          {presetMinutes}m
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Interval Input */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Custom interval (minutes):</label>
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      placeholder="e.g. 20"
                      value={customIntervalInput}
                      onChange={(inputEvent) => {
                        const valueString = inputEvent.target.value;
                        setCustomIntervalInput(valueString);
                        const numericValue = parseInt(valueString, 10);
                        if (!isNaN(numericValue) && numericValue > 0) {
                          setSelectedIntervalMinutes(numericValue);
                        }
                      }}
                      className="w-full bg-muted/40 border border-border rounded px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Start Schedule Button */}
                  <button
                    onClick={() => handleStartSchedule(selectedIntervalMinutes)}
                    className="w-full py-1.5 px-3 rounded-md bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Start Schedule (Every {selectedIntervalMinutes}m)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleClearTweets}
            disabled={scrapeProgress.is_running || scheduleStatus.is_active || isStartingScrape || tweetsList.length === 0}
            className="text-xs text-muted-foreground hover:text-rose-500 transition-colors px-2 py-1 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            title="Clear all scraped tweets"
          >
            Clear Tweets
          </button>
        </div>
      </div>

      {/* Recurring Schedule Active Banner with live countdown and Stop button */}
      {scheduleStatus.is_active && (
        <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="font-semibold text-emerald-500 dark:text-emerald-400">
                Recurring Schedule Active ({scheduleStatus.interval_minutes}m interval)
              </span>
              <span className="text-muted-foreground text-xs">
                {scheduleStatus.is_scraping_now || scrapeProgress.is_running ? (
                  <span className="text-blue-400 font-medium">Scraping fresh tweets in progress...</span>
                ) : (
                  <span className="font-mono">
                    Next scrape in: <span className="font-bold text-foreground text-xs bg-background/60 border border-border/40 px-1.5 py-0.5 rounded">{formatStopwatchDisplay(scheduleStatus.seconds_remaining)}</span>
                  </span>
                )}
              </span>
              {scheduleStatus.total_cycles_completed > 0 && (
                <span className="text-muted-foreground text-[11px] bg-background/50 border border-border/40 px-2 py-0.5 rounded">
                  Cycle {scheduleStatus.total_cycles_completed} completed
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleStopSchedule}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            Stop Schedule
          </button>
        </div>
      )}

      {/* Live Scraping Progress Banner with real-time Elapsed Time */}
      {scrapeProgress.is_running && (
        <div className="p-3.5 rounded-lg border border-border/60 bg-card/90 space-y-2.5 text-xs shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
              {scrapeProgress.completed_handles === 0
                ? "Launching " + (scrapeProgress.concurrency_level || 6) + " parallel browser instances..."
                : "Scraping in progress..."}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-foreground font-mono text-[11px] bg-muted border border-border/60 px-2 py-0.5 rounded">
                <Clock className="w-3 h-3 text-blue-500 animate-pulse" />
                <span>Elapsed: {formatStopwatchDisplay(liveElapsedSeconds)}</span>
              </span>
              <span>
                {scrapeProgress.completed_handles} / {scrapeProgress.total_handles} handles (
                {scrapeProgress.total_tweets_collected} tweets)
              </span>
            </div>
          </div>

          {/* Slim progress bar with minimum visual progress while starting */}
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-300"
              style={{
                width:
                  scrapeProgress.total_handles > 0
                    ? `${Math.max(
                        scrapeProgress.completed_handles === 0 ? 4 : 0,
                        (scrapeProgress.completed_handles / scrapeProgress.total_handles) * 100
                      )}%`
                    : "4%"
              }}
            />
          </div>

          {/* Active worker statuses */}
          {renderedActiveWorkers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/30 text-[11px] text-muted-foreground">
              <span className="text-muted-foreground font-medium shrink-0">Workers:</span>
              {renderedActiveWorkers}
            </div>
          )}
        </div>
      )}

      {/* Completed or Cancelled Scrape Summary Banner with Total Time Elapsed */}
      {!scrapeProgress.is_running && scrapeProgress.finished_at && liveElapsedSeconds > 0 && (
        <div className="p-3 rounded-lg border border-border/60 bg-card/90 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2">
            {scrapeProgress.status === "completed" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
            )}
            <span className="text-foreground font-medium">
              {scrapeProgress.status === "completed"
                ? "Scrape pipeline finished"
                : "Scrape pipeline stopped"}
            </span>
            <span className="text-muted-foreground">
              ({scrapeProgress.completed_handles} of {scrapeProgress.total_handles} handles, {scrapeProgress.total_tweets_collected} tweets extracted)
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-foreground font-mono text-[11px] bg-muted border border-border/60 px-2.5 py-1 rounded">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span>Total Time Elapsed: {formatElapsedDurationText(liveElapsedSeconds)}</span>
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

      {/* Interactive Full Tweet Modal */}
      {selectedTweetForModal !== null && (
        <div
          onClick={() => setSelectedTweetForModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
        >
          <div
            onClick={(modalClickEvent) => modalClickEvent.stopPropagation()}
            className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4 max-h-[88vh] flex flex-col text-foreground animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-foreground shrink-0 border border-border">
                  {selectedTweetForModal.handle.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">
                      @{selectedTweetForModal.handle}
                    </span>
                    {selectedTweetForModal.author_display_name &&
                      selectedTweetForModal.author_display_name !== selectedTweetForModal.handle && (
                        <span className="text-xs text-muted-foreground">
                          ({selectedTweetForModal.author_display_name})
                        </span>
                      )}
                    {selectedTweetForModal.is_within_24h && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                        24h
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span>{selectedTweetForModal.tweet_timestamp_text}</span>
                    {selectedTweetForModal.handle_category && (
                      <>
                        <span>·</span>
                        <span>{selectedTweetForModal.handle_category}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyTweetText}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border bg-muted/60 hover:bg-muted text-foreground transition-colors cursor-pointer"
                  title="Copy tweet text"
                >
                  {hasCopiedModalText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <a
                  href={"https://x.com/" + selectedTweetForModal.handle}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border bg-muted/60 hover:bg-muted text-foreground transition-colors"
                  title="Open on X"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Open on X</span>
                </a>

                <button
                  type="button"
                  onClick={() => setSelectedTweetForModal(null)}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-1 cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body - Full Un-truncated Tweet Text */}
            <div className="overflow-y-auto pr-2 py-1 max-h-[55vh] select-text">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-normal">
                {selectedTweetForModal.tweet_text}
              </p>
            </div>

            {/* Modal Footer - Engagement Metrics */}
            <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-5 flex-wrap">
                <span className="flex items-center gap-1.5" title="Replies">
                  <MessageCircle className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 fill-sky-500/20 dark:fill-sky-400/20" />
                  <span className="text-foreground font-semibold">
                    {selectedTweetForModal.replies_count.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground text-[11px] hidden sm:inline">replies</span>
                </span>

                <span className="flex items-center gap-1.5" title="Reposts">
                  <Repeat2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span className="text-foreground font-semibold">
                    {selectedTweetForModal.reposts_count.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground text-[11px] hidden sm:inline">reposts</span>
                </span>

                <span className="flex items-center gap-1.5" title="Likes">
                  <Heart className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 fill-rose-500/25 dark:fill-rose-400/25" />
                  <span className="text-foreground font-semibold">
                    {selectedTweetForModal.likes_count.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground text-[11px] hidden sm:inline">likes</span>
                </span>

                <span className="flex items-center gap-1.5" title="Views">
                  <Eye className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  <span className="text-foreground font-semibold">
                    {selectedTweetForModal.views_count.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground text-[11px] hidden sm:inline">views</span>
                </span>

                {selectedTweetForModal.bookmarks_count > 0 && (
                  <span className="flex items-center gap-1.5" title="Bookmarks">
                    <Bookmark className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 fill-amber-500/25 dark:fill-amber-400/25" />
                    <span className="text-foreground font-semibold">
                      {selectedTweetForModal.bookmarks_count.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground text-[11px] hidden sm:inline">bookmarks</span>
                  </span>
                )}
              </div>

              <span className="text-[11px] text-muted-foreground hidden md:inline">
                Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] text-muted-foreground font-mono">Esc</kbd> to close
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Re-run Confirmation Modal */}
      {isConfirmingRerunModalOpen && (
        <div
          onClick={() => setIsConfirmingRerunModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
        >
          <div
            onClick={(modalEvent) => modalEvent.stopPropagation()}
            className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-5 space-y-4 text-foreground animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-foreground" />
                <h3 className="font-semibold text-sm text-foreground">Re-run Twitter Scraper</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmingRerunModalOpen(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Explanation */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              You already have <strong className="text-foreground font-semibold">{tweetsList.length} scraped tweets</strong> across <strong className="text-foreground font-semibold">{handlesList.length} handles</strong>.
              How would you like to run the scraper?
            </p>

            {/* Options */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => executeStartScraping()}
                className="w-full flex flex-col items-start p-3 rounded-lg border border-border bg-muted/40 hover:bg-muted hover:border-border transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Refresh All Handles (Recommended)
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">Keep Existing</span>
                </div>
                <span className="text-[11px] text-muted-foreground mt-1">
                  Updates views, likes, and repost counts for existing tweets, and collects any new tweets posted.
                </span>
              </button>

              <button
                type="button"
                onClick={handleClearAndRunFresh}
                className="w-full flex flex-col items-start p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/50 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-300 group-hover:text-rose-700 dark:group-hover:text-rose-200 transition-colors">
                    Clear & Run Fresh
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-300 font-medium">Wipe & Scrape</span>
                </div>
                <span className="text-[11px] text-muted-foreground mt-1">
                  Clears previous tweets from the database and runs a fresh scrape from scratch across all handles.
                </span>
              </button>
            </div>

            {/* Footer / Cancel */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsConfirmingRerunModalOpen(false)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-muted/60 hover:bg-muted text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
