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
def check_if_timestamp_is_within_past_24_hours(timestamp_text: str) -> bool:
    if not timestamp_text:
        return False

    clean_text = timestamp_text.strip().lower()

    # Historical years (2006 up to previous year) are definitively NOT in the past 24 hours
    current_year_number = datetime.datetime.now().year
    for past_year_int in range(2006, current_year_number):
        if str(past_year_int) in clean_text:
            return False

    # Relative seconds or minutes: e.g. '45s', '12m', '15 mins ago'
    seconds_or_minutes_match = re.match(r'^(\d+)[sm]$', clean_text)
    if seconds_or_minutes_match:
        return True

    # Relative hours: e.g. '18h', '24h'
    hours_match = re.match(r'^(\d+)h$', clean_text)
    if hours_match:
        hour_integer = int(hours_match.group(1))
        return hour_integer <= 24

    # Literal keywords
    if clean_text in ["now", "just now", "yesterday"]:
        return True

    # Multi-word relative strings
    hours_ago_match = re.match(r'^(\d+)\s+hours?\s+ago$', clean_text)
    if hours_ago_match:
        hour_integer = int(hours_ago_match.group(1))
        return hour_integer <= 24

    minutes_ago_match = re.match(r'^(\d+)\s+(mins?|minutes?)\s+ago$', clean_text)
    if minutes_ago_match:
        return True

    # Absolute dates (e.g. 'Sep 8', 'Sep 7') - only true if matching today or yesterday
    today_date = datetime.datetime.now().date()
    yesterday_date = today_date - datetime.timedelta(days=1)

    for target_date in [today_date, yesterday_date]:
        month_abbreviation = target_date.strftime("%b").lower()
        day_number_string = str(target_date.day)
        day_padded_string = target_date.strftime("%d")

        date_patterns_list = [
            f"{month_abbreviation} {day_number_string}",
            f"{month_abbreviation} {day_padded_string}",
            f"{day_number_string} {month_abbreviation}",
            f"{day_padded_string} {month_abbreviation}"
        ]

        for date_pattern in date_patterns_list:
            if date_pattern in clean_text:
                year_match = re.search(r'\b\d{4}\b', clean_text)
                if year_match:
                    return str(target_date.year) in clean_text
                return True

    return False


def extract_detailed_tweets_from_page_chunks(page_state_text: str, target_handle: str) -> List[Dict[str, Any]]:
    article_chunks = re.split(r'\[\d+\]<article\s+role=article\s*/>', page_state_text)
    extracted_tweets_list = []

    for chunk_index in range(1, len(article_chunks)):
        current_chunk_text = article_chunks[chunk_index]

        # Step 1: Isolate the tweet content by cleanly cutting off before the metrics container (role=group)
        if "role=group" in current_chunk_text:
            group_position_index = current_chunk_text.find("role=group")
            line_break_before_group = current_chunk_text.rfind("\n", 0, group_position_index)
            if line_break_before_group != -1:
                content_part_text = current_chunk_text[:line_break_before_group]
            else:
                content_part_text = current_chunk_text[:group_position_index]
        else:
            content_part_text = current_chunk_text

        # Step 2: Extract engagement metrics (replies, reposts, likes, views, bookmarks)
        replies_count = 0
        reposts_count = 0
        likes_count = 0
        bookmarks_count = 0
        views_count = 0

        group_match = re.search(r'aria-label=([^\n>]+role=group)', current_chunk_text, re.IGNORECASE)
        if group_match:
            group_content_string = group_match.group(1).lower()

            replies_match = re.search(r'(\d+[\d,\.]*k?m?)\s+repl', group_content_string)
            if replies_match:
                replies_count = convert_metric_string_to_number(replies_match.group(1))

            reposts_match = re.search(r'(\d+[\d,\.]*k?m?)\s+repost', group_content_string)
            if reposts_match:
                reposts_count = convert_metric_string_to_number(reposts_match.group(1))

            likes_match = re.search(r'(\d+[\d,\.]*k?m?)\s+like', group_content_string)
            if likes_match:
                likes_count = convert_metric_string_to_number(likes_match.group(1))

            bookmarks_match = re.search(r'(\d+[\d,\.]*k?m?)\s+bookmark', group_content_string)
            if bookmarks_match:
                bookmarks_count = convert_metric_string_to_number(bookmarks_match.group(1))

            views_match = re.search(r'(\d+[\d,\.]*k?m?)\s+view', group_content_string)
            if views_match:
                views_count = convert_metric_string_to_number(views_match.group(1))

        # Fallback individual button labels
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

        # Step 3: Extract timestamp accurately
        timestamp_text_found = ""

        # Method A: Link aria-label with relative token or date
        time_link_match = re.search(
            r'<a\s+[^>]*aria-label="?([a-zA-Z]{3}\s+\d{1,2}(?:,\s+\d{4})?|\d+[smh])"?\s+role=link',
            content_part_text,
            re.IGNORECASE
        )
        if time_link_match:
            timestamp_text_found = time_link_match.group(1).strip()

        # Split cleaned lines from content_part_text
        raw_lines = content_part_text.split("\n")
        cleaned_lines = []
        for line_index in range(len(raw_lines)):
            cleaned_line = trends.clean_dom_tags_and_markdown(raw_lines[line_index].strip())
            if len(cleaned_line) > 0:
                cleaned_lines.append(cleaned_line)

        # Scan for author handle and display name
        user_handle_string = ""
        author_display_name = ""
        handle_line_index = -1

        for line_index in range(len(cleaned_lines)):
            line_candidate = cleaned_lines[line_index]
            if line_candidate.startswith("@") and " " not in line_candidate:
                user_handle_string = line_candidate
                handle_line_index = line_index
                if line_index > 0:
                    potential_author = cleaned_lines[line_index - 1]
                    if (not potential_author.startswith("@") and 
                        len(potential_author) < 50 and 
                        potential_author.lower() not in ["pinned", "pinned post"]):
                        author_display_name = potential_author
                break

        if not user_handle_string:
            user_handle_string = f"@{target_handle}"

        # Method B: Scan lines near author handle for explicit timestamp format
        if not timestamp_text_found:
            for line_index in range(min(12, len(cleaned_lines))):
                line_str = cleaned_lines[line_index]
                lower_line = line_str.lower()
                if len(line_str) > 25:
                    continue

                if re.match(r'^\d+[smh]$', lower_line):
                    timestamp_text_found = line_str
                    break
                elif re.match(r'^(yesterday|now)$', lower_line):
                    timestamp_text_found = line_str
                    break
                elif re.match(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?$', line_str, re.IGNORECASE):
                    timestamp_text_found = line_str
                    break
                elif "·" in line_str:
                    sub_tokens = line_str.split("·")
                    for sub_token in sub_tokens:
                        cleaned_sub_token = sub_token.strip()
                        if re.match(r'^\d+[smh]$', cleaned_sub_token.lower()):
                            timestamp_text_found = cleaned_sub_token
                            break
                        elif re.match(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?$', cleaned_sub_token, re.IGNORECASE):
                            timestamp_text_found = cleaned_sub_token
                            break
                    if timestamp_text_found:
                        break

        # Step 4: Extract tweet body lines
        body_text_lines = []
        start_index = handle_line_index + 1 if handle_line_index != -1 else 0

        header_noise_words = [
            "pinned", "pinned post", "more", "grok actions", "show more",
            "show this thread", "·", "translate post", "translated from"
        ]

        for body_index in range(start_index, len(cleaned_lines)):
            current_body_line = cleaned_lines[body_index]
            lower_body_line = current_body_line.lower()

            if current_body_line == timestamp_text_found:
                continue
            if current_body_line in header_noise_words:
                continue
            if lower_body_line in header_noise_words:
                continue

            # Stop if another handle or follow recommendation appears
            if current_body_line.startswith("@") and " " not in current_body_line:
                break
            if lower_body_line.startswith("follow @"):
                break

            # Skip standalone metric numbers e.g. "15 28 41K" or "10 20 7.5K" or "26"
            if re.match(r'^(\d+[\d,\.]*[KMBkmb]?\s*)+$', current_body_line):
                continue

            # Skip trailing preview domain cards e.g. "youtube.com" or "stimson.org"
            if re.match(r'^[a-zA-Z0-9-]+\.(?:com|org|net|edu|gov|pk|in|uk|io)\b', lower_body_line) and len(current_body_line) < 35:
                continue

            body_text_lines.append(current_body_line)

        combined_body_text = " ".join(body_text_lines).strip()
        combined_body_text = combined_body_text.replace("<!-- SVG content collapsed -->", "").strip()

        # Step 5: Clean leaked date prefixes or trailing domain cards
        date_prefix_match = re.match(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?\s*', combined_body_text, re.IGNORECASE)
        if date_prefix_match:
            if not timestamp_text_found or timestamp_text_found == "Recent":
                timestamp_text_found = date_prefix_match.group(0).strip()
            combined_body_text = combined_body_text[date_prefix_match.end():].strip()

        # Strip trailing metric counter sequences at the end of the text
        combined_body_text = re.sub(r'\s+(\d+[\d,\.]*[KMBkmb]?\s*){1,5}$', '', combined_body_text).strip()

        # Strip trailing date + domain card attached to the end of the text
        combined_body_text = re.sub(
            r'\s+(?:24h\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?(\s+[a-zA-Z0-9-]+\.(?:com|org|net|edu|gov|pk|in|uk|io))?$',
            '',
            combined_body_text,
            flags=re.IGNORECASE
        ).strip()
        combined_body_text = re.sub(
            r'\s+[a-zA-Z0-9-]+\.(?:com|org|net|edu|gov|pk|in|uk|io)$',
            '',
            combined_body_text,
            flags=re.IGNORECASE
        ).strip()

        if len(combined_body_text) < 15:
            continue

        # Final 24h classification check
        is_within_24h = check_if_timestamp_is_within_past_24_hours(timestamp_text_found)

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

        # Deduplicate within this scraping run
        is_already_added = False
        for existing_tweet in extracted_tweets_list:
            if existing_tweet["tweet_text"] == tweet_record["tweet_text"]:
                is_already_added = True
                break

        if not is_already_added:
            extracted_tweets_list.append(tweet_record)

    return extracted_tweets_list


async def expand_all_show_more_buttons(browser_instance: Browser):
    # Clicks all visible 'Show more' buttons on the page so long-form tweets are fully revealed for extraction
    try:
        current_page = await browser_instance.get_current_page()
        await current_page.evaluate("""
            const candidateButtons = Array.from(document.querySelectorAll('button, div[role="button"], span'));
            for (const btn of candidateButtons) {
                const buttonText = (btn.innerText || '').trim();
                if (buttonText === 'Show more' || buttonText === 'Show this thread') {
                    try {
                        btn.click();
                    } catch(e) {}
                }
            }
        """)
        await asyncio.sleep(0.5)
    except Exception:
        pass


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

        # Expand any truncated tweets on the page by clicking 'Show more'
        await expand_all_show_more_buttons(browser_instance)
        page_state_text = await browser_instance.get_state_as_text()

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

                # Expand any 'Show more' buttons revealed after scrolling
                await expand_all_show_more_buttons(browser_instance)

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
    shared_progress_dictionary["active_workers"][str(worker_index)] = "Launching Chrome..."
    await progress_callback(shared_progress_dictionary)
    await log_callback("INFO", f"[Worker {worker_index}] Initializing headless Chrome session...")

    browser_instance = None
    try:
        # Browser.from_system_chrome(headless=True) copies profile to isolated temp directory
        browser_instance = Browser.from_system_chrome(headless=True)
        await browser_instance.start()
        shared_progress_dictionary["active_workers"][str(worker_index)] = "Browser ready"
        await progress_callback(shared_progress_dictionary)
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
