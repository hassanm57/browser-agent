import asyncio
import os
import sys
import re
import datetime
from typing import List, Dict, Any, Callable, Optional

# Ensure project root is in sys.path
CURRENT_FILE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT_DIRECTORY = os.path.dirname(os.path.dirname(CURRENT_FILE_DIRECTORY))
if PROJECT_ROOT_DIRECTORY not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_DIRECTORY)

from browser_use import Browser
from browser_use.browser.events import ScrollEvent

import trends
from app.backend.database import (
    get_all_twitter_handles,
    insert_scraped_tweet,
    update_handle_last_tweet_count,
    create_twitter_scrape_run,
    update_twitter_scrape_run_progress,
    complete_twitter_scrape_run
)


def convert_metric_string_to_number(raw_metric_text: str) -> int:
    # Converts abbreviations like '1.2K' or '2.5M' or '1,234' into pure integers
    if not raw_metric_text:
        return 0
    clean_text = str(raw_metric_text).strip().replace(",", "").lower()
    try:
        if clean_text.endswith("k"):
            numeric_part = float(clean_text[:-1])
            return int(numeric_part * 1000)
        elif clean_text.endswith("m"):
            numeric_part = float(clean_text[:-1])
            return int(numeric_part * 1000000)
        else:
            return int(float(clean_text))
    except Exception:
        return 0


def check_if_timestamp_is_within_past_24_hours(timestamp_text: str) -> bool:
    # Checks if the post was made within the last 24 hours
    if not timestamp_text:
        return False
    lower_text = timestamp_text.strip().lower()

    # Any post timestamped in seconds or minutes is within 24 hours
    if lower_text.endswith("m") or lower_text.endswith("s") or "min" in lower_text or "sec" in lower_text or "now" in lower_text:
        return True

    # Check for hour indicators like '16h' or '2 hours ago'
    if "hour" in lower_text:
        return True
    if lower_text.endswith("h"):
        hour_string_part = lower_text[:-1]
        if hour_string_part.isdigit():
            hour_integer = int(hour_string_part)
            if hour_integer <= 24:
                return True
            else:
                return False

    # Check for yesterday
    if "yesterday" in lower_text:
        return True

    return False


def extract_detailed_tweets_from_page_chunks(page_state_text: str, target_handle: str) -> List[Dict[str, Any]]:
    # In browser-use state text, each tweet is isolated inside an [ID]<article role=article /> container
    article_chunks = re.split(r'\[\d+\]<article\s+role=article\s*/>', page_state_text)
    extracted_tweets_list = []

    sidebar_and_action_stop_signals = [
        "replies,", "reposts,", "likes,", "views", "reply", "repost", "like", "bookmark", "share post",
        "play video", "search timeline", "who to follow", "what's happening", "people from anyone",
        "search filters", "trending now", "trending in", "live on x", "show more", "terms privacy"
    ]

    # Chunk index 0 is always header navigation, so we start from index 1
    for chunk_index in range(1, len(article_chunks)):
        current_chunk_text = article_chunks[chunk_index]
        raw_lines = current_chunk_text.split("\n")

        cleaned_lines = []
        for line_index in range(len(raw_lines)):
            cleaned_line = trends.clean_dom_tags_and_markdown(raw_lines[line_index].strip())
            if len(cleaned_line) > 0:
                cleaned_lines.append(cleaned_line)

        user_handle_string = ""
        author_display_name = ""
        handle_line_index = -1
        timestamp_text_found = ""

        # Scan for author handle and display name
        for line_index in range(len(cleaned_lines)):
            line_candidate = cleaned_lines[line_index]
            if line_candidate.startswith("@") and " " not in line_candidate:
                user_handle_string = line_candidate
                handle_line_index = line_index
                if line_index > 0:
                    potential_author = cleaned_lines[line_index - 1]
                    if not potential_author.startswith("@") and len(potential_author) < 50:
                        author_display_name = potential_author
                break

        # Fallback to target handle if handle was not parsed
        if not user_handle_string:
            user_handle_string = f"@{target_handle}"

        # Extract timestamp: look for relative time or date line near handle
        for line_index in range(len(cleaned_lines)):
            line_str = cleaned_lines[line_index]
            lower_line = line_str.lower()
            if lower_line.endswith("h") and lower_line[:-1].isdigit():
                timestamp_text_found = line_str
                break
            elif lower_line.endswith("m") and lower_line[:-1].isdigit():
                timestamp_text_found = line_str
                break
            elif lower_line.endswith("s") and lower_line[:-1].isdigit():
                timestamp_text_found = line_str
                break
            elif "ago" in lower_line or "yesterday" in lower_line:
                timestamp_text_found = line_str
                break
            elif any(month_name in lower_line for month_name in ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]):
                if len(line_str) < 20:
                    timestamp_text_found = line_str

        # Extract tweet body lines
        body_text_lines = []
        start_index = handle_line_index + 1 if handle_line_index != -1 else 0

        for body_index in range(start_index, len(cleaned_lines)):
            current_body_line = cleaned_lines[body_index]
            lower_body_line = current_body_line.lower()

            # Stop collecting if we hit metrics groups or sidebar widgets
            has_stop_signal = False
            for stop_signal in sidebar_and_action_stop_signals:
                if stop_signal in lower_body_line:
                    has_stop_signal = True
                    break
            if has_stop_signal:
                break

            # Stop if another handle appears
            if current_body_line.startswith("@") and " " not in current_body_line:
                break

            # Skip single dot separators or timestamps
            if current_body_line == "·" or current_body_line == timestamp_text_found:
                continue

            body_text_lines.append(current_body_line)

        combined_body_text = " ".join(body_text_lines).strip()
        combined_body_text = combined_body_text.replace("<!-- SVG content collapsed -->", "").strip()

        # Must have at least 15 characters of real body text to be considered a valid tweet
        if len(combined_body_text) < 15:
            continue

        # Ignore generic follow prompts
        if combined_body_text.lower().startswith("follow ") and len(combined_body_text) < 40:
            continue

        # Extract metrics: replies, reposts, likes, bookmarks, views
        replies_count = 0
        reposts_count = 0
        likes_count = 0
        bookmarks_count = 0
        views_count = 0

        # Method 1: Check group aria-label (e.g. 'aria-label=1 reply, 11 reposts, 21 likes, 2 bookmarks, 1191 views role=group')
        group_match = re.search(r'aria-label=([^\n>]+role=group)', current_chunk_text, re.IGNORECASE)
        if group_match:
            group_content = group_match.group(1).lower()

            replies_match = re.search(r'(\d+[\d,\.]*k?m?)\s+repl', group_content)
            if replies_match:
                replies_count = convert_metric_string_to_number(replies_match.group(1))

            reposts_match = re.search(r'(\d+[\d,\.]*k?m?)\s+repost', group_content)
            if reposts_match:
                reposts_count = convert_metric_string_to_number(reposts_match.group(1))

            likes_match = re.search(r'(\d+[\d,\.]*k?m?)\s+like', group_content)
            if likes_match:
                likes_count = convert_metric_string_to_number(likes_match.group(1))

            bookmarks_match = re.search(r'(\d+[\d,\.]*k?m?)\s+bookmark', group_content)
            if bookmarks_match:
                bookmarks_count = convert_metric_string_to_number(bookmarks_match.group(1))

            views_match = re.search(r'(\d+[\d,\.]*k?m?)\s+view', group_content)
            if views_match:
                views_count = convert_metric_string_to_number(views_match.group(1))

        # Method 2: Fallback individual button labels if group didn't match
        if replies_count == 0:
            btn_replies = re.search(r'aria-label=(\d+[\d,\.]*k?m?)\s+repl', current_chunk_text, re.IGNORECASE)
            if btn_replies:
                replies_count = convert_metric_string_to_number(btn_replies.group(1))

        if reposts_count == 0:
            btn_reposts = re.search(r'aria-label=(\d+[\d,\.]*k?m?)\s+repost', current_chunk_text, re.IGNORECASE)
            if btn_reposts:
                reposts_count = convert_metric_string_to_number(btn_reposts.group(1))

        if likes_count == 0:
            btn_likes = re.search(r'aria-label=(\d+[\d,\.]*k?m?)\s+like', current_chunk_text, re.IGNORECASE)
            if btn_likes:
                likes_count = convert_metric_string_to_number(btn_likes.group(1))

        if views_count == 0:
            btn_views = re.search(r'aria-label=(\d+[\d,\.]*k?m?)\s+view', current_chunk_text, re.IGNORECASE)
            if btn_views:
                views_count = convert_metric_string_to_number(btn_views.group(1))

        is_within_24h = check_if_timestamp_is_within_past_24_hours(timestamp_text_found)

        # Assemble the clean tweet record
        tweet_record = {
            "handle": target_handle.lstrip("@"),
            "author_display_name": author_display_name if author_display_name else target_handle,
            "tweet_text": combined_body_text,
            "tweet_timestamp_text": timestamp_text_found if timestamp_text_found else "Recent",
            "is_within_24h": is_within_24h,
            "replies_count": replies_count,
            "reposts_count": reposts_count,
            "likes_count": likes_count,
            "views_count": views_count,
            "bookmarks_count": bookmarks_count,
            "tweet_url": f"https://x.com/{target_handle.lstrip('@')}"
        }

        # Avoid duplicates within the same scraping round
        is_already_added = False
        for existing_tweet in extracted_tweets_list:
            if existing_tweet["tweet_text"] == tweet_record["tweet_text"]:
                is_already_added = True
                break

        if not is_already_added:
            extracted_tweets_list.append(tweet_record)

    return extracted_tweets_list


async def scrape_single_handle_with_browser(
    browser_instance: Browser,
    handle_string: str,
    worker_index: int,
    log_callback: Callable[[str, str], Any]
) -> List[Dict[str, Any]]:
    # Navigates to a handle's X profile and extracts the latest tweets
    clean_handle = handle_string.strip().lstrip("@")
    profile_url = f"https://x.com/{clean_handle}"

    await log_callback("BROWSER", f"[Worker {worker_index}] Opening {profile_url}...")

    try:
        await browser_instance.navigate_to(profile_url)
        # Allow time for initial network requests and DOM mounting
        await asyncio.sleep(4)

        # Poll for DOM hydration (wait until content length is substantial)
        page_state_text = ""
        for hydration_attempt in range(5):
            page_state_text = await browser_instance.get_state_as_text()
            if len(page_state_text) > 400 and not page_state_text.strip().startswith("<svg"):
                break
            await asyncio.sleep(2)

        if len(page_state_text) < 300:
            await log_callback("WARN", f"[Worker {worker_index}] Empty page received for @{clean_handle}")
            return []

        # Check if handle doesn't exist or is suspended
        lower_page = page_state_text.lower()
        if "this account doesn't exist" in lower_page or "account suspended" in lower_page:
            await log_callback("WARN", f"[Worker {worker_index}] Account @{clean_handle} does not exist or is suspended.")
            return []

        all_collected_tweets_for_handle: List[Dict[str, Any]] = []

        # First pass extraction
        first_batch = extract_detailed_tweets_from_page_chunks(page_state_text, clean_handle)
        for tweet_item in first_batch:
            all_collected_tweets_for_handle.append(tweet_item)

        # Scroll down 3 times to load up to 24 tweets
        for scroll_round in range(3):
            if len(all_collected_tweets_for_handle) >= 24:
                break

            try:
                scroll_action = browser_instance.event_bus.dispatch(
                    ScrollEvent(direction="down", amount=1400)
                )
                await scroll_action
                await asyncio.sleep(2.5)

                updated_page_text = await browser_instance.get_state_as_text()
                new_batch = extract_detailed_tweets_from_page_chunks(updated_page_text, clean_handle)

                for candidate_tweet in new_batch:
                    is_duplicate = False
                    for existing_tweet in all_collected_tweets_for_handle:
                        if existing_tweet["tweet_text"] == candidate_tweet["tweet_text"]:
                            is_duplicate = True
                            break
                    if not is_duplicate:
                        all_collected_tweets_for_handle.append(candidate_tweet)

            except Exception as scroll_error:
                await log_callback("WARN", f"[Worker {worker_index}] Scroll error on @{clean_handle}: {str(scroll_error)}")
                break

        # Limit to 24 most recent tweets as requested
        trimmed_tweets_list = all_collected_tweets_for_handle[:24]
        await log_callback("SUCCESS", f"[Worker {worker_index}] Scraped {len(trimmed_tweets_list)} tweets from @{clean_handle}")
        return trimmed_tweets_list

    except Exception as navigation_error:
        await log_callback("ERROR", f"[Worker {worker_index}] Failed to scrape @{clean_handle}: {str(navigation_error)}")
        return []


async def parallel_scraper_worker(
    worker_index: int,
    handle_queue: asyncio.Queue,
    scrape_run_id: int,
    cancellation_event: asyncio.Event,
    shared_progress_dictionary: Dict[str, Any],
    log_callback: Callable[[str, str], Any],
    progress_callback: Callable[[Dict[str, Any]], Any],
    tweet_saved_callback: Callable[[Dict[str, Any]], Any]
):
    # Each parallel worker manages its own headless browser instance
    await log_callback("INFO", f"[Worker {worker_index}] Initializing headless Chrome session...")

    browser_instance = None
    try:
        # Browser.from_system_chrome(headless=True) copies profile to isolated temp directory
        browser_instance = Browser.from_system_chrome(headless=True)
        await browser_instance.start()
        await log_callback("SUCCESS", f"[Worker {worker_index}] Headless Chrome ready.")

        while not handle_queue.empty():
            if cancellation_event.is_set():
                await log_callback("WARN", f"[Worker {worker_index}] Cancellation received. Exiting worker.")
                break

            try:
                target_handle_name = handle_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

            shared_progress_dictionary["active_workers"][str(worker_index)] = f"@{target_handle_name}"
            await progress_callback(shared_progress_dictionary)

            # Scrape tweets for this handle
            scraped_tweets = await scrape_single_handle_with_browser(
                browser_instance=browser_instance,
                handle_string=target_handle_name,
                worker_index=worker_index,
                log_callback=log_callback
            )

            # Save each scraped tweet into the database
            for tweet_data in scraped_tweets:
                tweet_data["run_id"] = scrape_run_id
                insert_scraped_tweet(tweet_data)
                await tweet_saved_callback(tweet_data)

            update_handle_last_tweet_count(target_handle_name, len(scraped_tweets))

            # Update shared counter
            shared_progress_dictionary["completed_handles"] += 1
            shared_progress_dictionary["total_tweets_collected"] += len(scraped_tweets)
            update_twitter_scrape_run_progress(
                scrape_run_id,
                shared_progress_dictionary["completed_handles"],
                shared_progress_dictionary["total_tweets_collected"]
            )

            shared_progress_dictionary["active_workers"][str(worker_index)] = "Idle"
            await progress_callback(shared_progress_dictionary)
            handle_queue.task_done()

    except Exception as worker_exception:
        await log_callback("ERROR", f"[Worker {worker_index}] Fatal error: {str(worker_exception)}")

    finally:
        shared_progress_dictionary["active_workers"][str(worker_index)] = "Offline"
        if browser_instance is not None:
            try:
                await browser_instance.close()
                await log_callback("INFO", f"[Worker {worker_index}] Closed browser session cleanly.")
            except Exception:
                pass


async def run_parallel_twitter_handles_pipeline(
    handles_to_scrape_list: List[str],
    concurrency_level: int = 3,
    cancellation_event: Optional[asyncio.Event] = None,
    log_callback: Optional[Callable[[str, str], Any]] = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    status_callback: Optional[Callable[[str], Any]] = None,
    tweet_saved_callback: Optional[Callable[[Dict[str, Any]], Any]] = None
) -> Dict[str, Any]:
    # Main orchestrator for parallel Twitter scraping
    if cancellation_event is None:
        cancellation_event = asyncio.Event()

    # Fallback dummy callbacks if None provided
    async def dummy_log(level, msg):
        print(f"[{level}] {msg}")

    async def dummy_progress(data):
        pass

    async def dummy_status(status):
        pass

    async def dummy_tweet(tweet):
        pass

    actual_log = log_callback if log_callback is not None else dummy_log
    actual_progress = progress_callback if progress_callback is not None else dummy_progress
    actual_status = status_callback if status_callback is not None else dummy_status
    actual_tweet_saved = tweet_saved_callback if tweet_saved_callback is not None else dummy_tweet

    total_handles_count = len(handles_to_scrape_list)
    await actual_status("running")
    await actual_log("STEP", f"Starting parallel Twitter scraping for {total_handles_count} handles using {concurrency_level} parallel browser instances...")

    # Record scrape run in database
    scrape_run_id = create_twitter_scrape_run(total_handles_count, concurrency_level)

    # Populate queue with handles
    handle_queue = asyncio.Queue()
    for handle_name in handles_to_scrape_list:
        await handle_queue.put(handle_name)

    shared_progress = {
        "run_id": scrape_run_id,
        "status": "running",
        "total_handles": total_handles_count,
        "completed_handles": 0,
        "total_tweets_collected": 0,
        "concurrency_level": concurrency_level,
        "active_workers": {}
    }

    for worker_idx in range(1, concurrency_level + 1):
        shared_progress["active_workers"][str(worker_idx)] = "Starting..."

    await actual_progress(shared_progress)

    # Launch N parallel worker tasks
    worker_tasks_list = []
    for worker_index in range(1, concurrency_level + 1):
        task = asyncio.create_task(
            parallel_scraper_worker(
                worker_index=worker_index,
                handle_queue=handle_queue,
                scrape_run_id=scrape_run_id,
                cancellation_event=cancellation_event,
                shared_progress_dictionary=shared_progress,
                log_callback=actual_log,
                progress_callback=actual_progress,
                tweet_saved_callback=actual_tweet_saved
            )
        )
        worker_tasks_list.append(task)

    # Await all workers to finish their assigned queue items
    await asyncio.gather(*worker_tasks_list, return_exceptions=True)

    if cancellation_event.is_set():
        shared_progress["status"] = "cancelled"
        complete_twitter_scrape_run(scrape_run_id, status_name="cancelled", error_message="Cancelled by user")
        await actual_status("cancelled")
        await actual_log("WARN", "Parallel scraping pipeline cancelled by user.")
    else:
        shared_progress["status"] = "completed"
        complete_twitter_scrape_run(scrape_run_id, status_name="completed")
        await actual_status("completed")
        await actual_log("SUCCESS", f"All {total_handles_count} handles processed! Total tweets saved: {shared_progress['total_tweets_collected']}")

    await actual_progress(shared_progress)

    return {
        "run_id": scrape_run_id,
        "status": shared_progress["status"],
        "total_handles": total_handles_count,
        "completed_handles": shared_progress["completed_handles"],
        "total_tweets_collected": shared_progress["total_tweets_collected"]
    }
