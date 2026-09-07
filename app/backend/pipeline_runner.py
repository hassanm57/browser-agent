import asyncio
import os
import sys
import json
import datetime
import urllib.parse
from typing import List, Dict, Any, Callable, Optional

# Ensure project root is in sys.path so we can import root modules directly
CURRENT_FILE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT_DIRECTORY = os.path.dirname(os.path.dirname(CURRENT_FILE_DIRECTORY))
if PROJECT_ROOT_DIRECTORY not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_DIRECTORY)

from browser_use import Browser
from browser_use.browser.events import ScrollEvent
from browser_use.llm import ChatOpenAI, UserMessage

import trends
from app.backend.database import (
    get_all_settings,
    create_new_pipeline_run,
    update_pipeline_run_status,
    complete_pipeline_run_with_data
)

# File paths where output artifacts are persisted on disk
SOURCES_FILE_PATH = os.path.join(PROJECT_ROOT_DIRECTORY, "sources.json")
COUNTRIES_FILE_PATH = os.path.join(PROJECT_ROOT_DIRECTORY, "countries.json")
RAW_SOURCES_FILE_PATH = os.path.join(PROJECT_ROOT_DIRECTORY, "raw_sources.json")
KEYWORDS_FILE_PATH = os.path.join(PROJECT_ROOT_DIRECTORY, "keywords.json")


async def run_single_country_pipeline(
    target_country_name: str,
    country_index: int,
    total_countries_count: int,
    settings_dictionary: Dict[str, str],
    log_callback_function: Callable[[str, str], Any],
    progress_callback_function: Callable[[str, int, int, str, Optional[str]], Any],
    cancellation_event: asyncio.Event,
    collected_log_lines_list: List[str]
) -> Optional[Dict[str, Any]]:
    # Create run entry in SQLite database
    run_identifier = create_new_pipeline_run(target_country_name)

    async def log_and_record(level_name: str, log_message_text: str):
        timestamp_string = datetime.datetime.now().strftime("%H:%M:%S")
        formatted_line = f"[{timestamp_string}] [{level_name}] {log_message_text}"
        collected_log_lines_list.append(formatted_line)
        await log_callback_function(level_name, log_message_text)

    # 1. Look up country configuration
    available_countries_list = trends.load_countries_configuration_file()
    selected_country_data = trends.find_target_country_by_name(target_country_name, available_countries_list)

    if selected_country_data is not None:
        country_slug_name = selected_country_data.get("slug", selected_country_data.get("trends24_slug", ""))
    else:
        if target_country_name.strip().lower() in ["worldwide", "global", "all"]:
            country_slug_name = ""
        else:
            country_slug_name = target_country_name.strip().lower().replace(" ", "-")

    country_display_label = "Worldwide" if len(country_slug_name) == 0 else f"{target_country_name} (Slug: {country_slug_name})"
    await log_and_record("STEP", f"Starting intelligence pipeline for target: {country_display_label}")
    await progress_callback_function("init", 1, 5, f"Initializing pipeline for {target_country_name}...", target_country_name)

    # Check for user cancellation
    if cancellation_event.is_set():
        await log_and_record("WARN", "Pipeline execution cancelled by user.")
        update_pipeline_run_status(run_identifier, "cancelled", "Cancelled by user before scraping")
        return None

    # PHASE 1: Ingest ground truth news headlines from configured sources first
    await log_and_record("STEP", "[1/4] Ingesting authoritative headlines from configured news and RSS sources...")
    await progress_callback_function("news_sources", 1, 5, f"Ingesting ground truth news for {target_country_name}...", target_country_name)
    
    configured_sources_list = trends.load_sources_configuration_file()
    news_sources_intel_dictionary: Dict[str, List[str]] = {}

    for source_entry in configured_sources_list:
        if cancellation_event.is_set():
            break

        is_source_enabled = source_entry.get("enabled", True)
        source_name = source_entry.get("name", "Unknown Source")
        source_url = source_entry.get("url", "")
        source_type = source_entry.get("type", "web")

        if not is_source_enabled:
            continue

        # Skip X/Twitter accounts in Phase 1 (they are scraped via the real Chrome browser in the browser phase)
        if source_type in ["x_account", "twitter", "x"] or "x.com/" in source_url or "twitter.com/" in source_url:
            continue

        desktop_browser_headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9"
        }

        await log_and_record("INFO", f"Fetching {source_name} ({source_type.upper()})...")
        try:
            headlines_for_source = []
            if source_type == "rss":
                response = trends.requests.get(source_url, timeout=12, headers=desktop_browser_headers)
                if response.status_code == 200:
                    xml_root = trends.ElementTree.fromstring(response.content)
                    for item_element in xml_root.findall(".//item"):
                        title_element = item_element.find("title")
                        if title_element is not None and title_element.text:
                            clean_title = trends.clean_dom_tags_and_markdown(title_element.text)
                            if len(clean_title) > 15 and not trends.is_bot_challenge_text(clean_title) and clean_title not in headlines_for_source:
                                headlines_for_source.append(clean_title)
            else:
                response = trends.requests.get(source_url, timeout=12, headers=desktop_browser_headers)
                if response.status_code == 200:
                    html_soup = trends.BeautifulSoup(response.text, "html.parser")
                    for header_tag in html_soup.find_all(["h1", "h2", "h3", "h4", "a"]):
                        raw_text = header_tag.get_text()
                        clean_title = trends.clean_dom_tags_and_markdown(raw_text)
                        if len(clean_title) > 25 and not trends.is_bot_challenge_text(clean_title) and clean_title not in headlines_for_source:
                            lower_title = clean_title.lower()
                            is_relevant = True
                            if any(d in source_url for d in ["foreignaffairs.com", "janes.com", "csis.org", "atlanticcouncil.org", "iiss.org", "defensenews.com", "breakingdefense.com", "defenseone.com"]):
                                is_relevant = True
                            elif any(k in lower_title for k in ["pakistan", "army", "military", "strike", "attack", "iran", "israel", "china", "us", "trump", "navy", "security", "court", "forces", "treaty", "pact", "russia", "border", "missile", "defense", "defence", "nato", "taiwan", "ukraine", "hormuz", "sanctions"]):
                                is_relevant = True
                            else:
                                is_relevant = False

                            if is_relevant and len(headlines_for_source) < 20:
                                headlines_for_source.append(clean_title)

            # Fallback 1: If zero headlines extracted and source is Reuters, attempt verified Reuters RSS wire
            if len(headlines_for_source) == 0 and "reuters.com" in source_url:
                await log_and_record("INFO", "Reuters web restricted. Attempting Reuters verified RSS wire feed...")
                try:
                    reuters_feed_url = "https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-US&gl=US&ceid=US:en"
                    reuters_response = trends.requests.get(reuters_feed_url, timeout=12, headers=desktop_browser_headers)
                    if reuters_response.status_code == 200:
                        reuters_xml_root = trends.ElementTree.fromstring(reuters_response.content)
                        for r_item in reuters_xml_root.findall(".//item"):
                            r_title = r_item.find("title")
                            if r_title is not None and r_title.text:
                                clean_r_title = trends.clean_dom_tags_and_markdown(r_title.text)
                                if clean_r_title.endswith("- Reuters"):
                                    clean_r_title = clean_r_title[:-9].strip()
                                if len(clean_r_title) > 15 and not trends.is_bot_challenge_text(clean_r_title):
                                    if clean_r_title not in headlines_for_source and len(headlines_for_source) < 20:
                                        headlines_for_source.append(clean_r_title)
                        if len(headlines_for_source) > 0:
                            await log_and_record("SUCCESS", f"Reuters RSS wire harvested {len(headlines_for_source)} clean headlines!")
                except Exception as reuters_err:
                    await log_and_record("WARN", f"Reuters RSS wire error: {str(reuters_err)}")

            # Fallback 2: If zero headlines extracted and source is Dawn News, attempt official RSS feed fallback
            if len(headlines_for_source) == 0 and "dawn.com" in source_url:
                await log_and_record("INFO", "Dawn News web blocked or empty. Attempting Dawn official RSS feed fallback (https://www.dawn.com/feed)...")
                try:
                    dawn_rss_response = trends.requests.get("https://www.dawn.com/feed", timeout=12, headers=desktop_browser_headers)
                    if dawn_rss_response.status_code == 200:
                        dawn_xml_root = trends.ElementTree.fromstring(dawn_rss_response.content)
                        for dawn_item in dawn_xml_root.findall(".//item"):
                            dawn_title = dawn_item.find("title")
                            if dawn_title is not None and dawn_title.text:
                                dawn_clean_title = trends.clean_dom_tags_and_markdown(dawn_title.text)
                                if len(dawn_clean_title) > 15 and not trends.is_bot_challenge_text(dawn_clean_title):
                                    if dawn_clean_title not in headlines_for_source:
                                        headlines_for_source.append(dawn_clean_title)
                        if len(headlines_for_source) > 0:
                            await log_and_record("SUCCESS", f"Dawn RSS fallback harvested {len(headlines_for_source)} clean headlines!")
                except Exception as dawn_rss_error:
                    await log_and_record("WARN", f"Dawn RSS fallback error: {str(dawn_rss_error)}")

            # If 0 headlines extracted via HTTP/RSS, activate browser-agent fallback
            if len(headlines_for_source) == 0:
                await log_and_record("WARN", f"{source_name} returned 0 headlines via HTTP/RSS. Activating browser-agent fallback...")
                fallback_web_url = trends.derive_web_homepage_url(source_url)
                try:
                    browser_fallback_headlines = await trends.scrape_source_via_browser_fallback(fallback_web_url, source_name)
                    filtered_fallback_headlines = []
                    for h_item in browser_fallback_headlines:
                        if not trends.is_bot_challenge_text(h_item) and len(h_item) > 20:
                            filtered_fallback_headlines.append(h_item)
                    if len(filtered_fallback_headlines) > 0:
                        headlines_for_source = filtered_fallback_headlines[:20]
                        await log_and_record("SUCCESS", f"Browser fallback harvested {len(headlines_for_source)} headlines for {source_name}!")
                except Exception as fallback_error:
                    await log_and_record("WARN", f"Browser fallback error for {source_name}: {str(fallback_error)}")

            trimmed_headlines = headlines_for_source[:20]
            news_sources_intel_dictionary[source_name] = trimmed_headlines
            await log_and_record("SUCCESS", f"Extracted {len(trimmed_headlines)} headlines from {source_name}.")
        except Exception as source_fetch_error:
            await log_and_record("WARN", f"Timeout or error fetching {source_name}: {str(source_fetch_error)}")
            news_sources_intel_dictionary[source_name] = []

    if cancellation_event.is_set():
        await log_and_record("WARN", "Pipeline execution cancelled by user.")
        update_pipeline_run_status(run_identifier, "cancelled", "Cancelled by user during news ingestion")
        return None

    # Empty placeholder lists for backward compatibility in storage
    all_trends24_topics_list = []
    relevant_trends24_topics_list = []

    # PHASE 2: Launch Chrome browser to scrape configured X defense accounts and explore live trends
    await log_and_record("STEP", f"[2/4] Launching Chrome browser to scrape configured X defense accounts & explore trends...")
    await progress_callback_function("x_accounts", 2, 5, f"Scraping correspondent accounts and X trends for {target_country_name}...", target_country_name)

    is_headless = settings_dictionary.get("headless_mode", "false") == "true"
    use_real_chrome = settings_dictionary.get("use_real_chrome", "true") == "true"
    max_tweets_target = int(settings_dictionary.get("maximum_tweets_per_trend", "20"))
    max_scroll_rounds = int(settings_dictionary.get("maximum_scroll_rounds", "12"))
    trends_to_mine_count = int(settings_dictionary.get("number_of_trends_to_mine", "5"))

    x_native_intel_dictionary = {
        "country": target_country_name,
        "trends_observed": [],
        "sample_tweets_by_trend": {}
    }
    curated_x_sources_tweets: Dict[str, List[str]] = {}

    browser_mode_string = "Headless" if is_headless else "Headful Visible Window"
    await log_and_record("BROWSER", f"Launching Chrome ({browser_mode_string}, RealProfile: {use_real_chrome})...")

    if use_real_chrome:
        browser_instance = Browser.from_system_chrome(headless=is_headless)
    else:
        browser_instance = Browser(headless=is_headless)

    try:
        await browser_instance.start()

        # Step 3A: Scrape latest 10-15 tweets from configured X correspondent & OSINT accounts
        configured_x_sources_list = []
        for source_item in configured_sources_list:
            if source_item.get("enabled", True):
                s_type = source_item.get("type", "web")
                s_url = source_item.get("url", "")
                if s_type in ["x_account", "twitter", "x"] or "x.com/" in s_url or "twitter.com/" in s_url:
                    configured_x_sources_list.append(source_item)

        if len(configured_x_sources_list) > 0:
            await log_and_record("STEP", f"Scraping latest 10-15 tweets from {len(configured_x_sources_list)} defense correspondent & OSINT accounts...")
            for x_source_index in range(len(configured_x_sources_list)):
                if cancellation_event.is_set():
                    break

                x_source_entry = configured_x_sources_list[x_source_index]
                account_name = x_source_entry.get("name", "X Source")
                account_url = x_source_entry.get("url", "")

                # Handle handle redirection e.g. BBCJonathanBeale -> bealejonathan
                if "bbcjonathanbeale" in account_url.lower():
                    account_url = "https://x.com/bealejonathan"

                await log_and_record("BROWSER", f"[X Source {x_source_index + 1}/{len(configured_x_sources_list)}] Scraping latest tweets for: {account_name} ({account_url})")

                try:
                    await browser_instance.navigate_to(account_url)
                    await asyncio.sleep(4)

                    for hydration_attempt in range(5):
                        page_state_text = await browser_instance.get_state_as_text()
                        if len(page_state_text) > 400 and not page_state_text.strip().startswith("<svg"):
                            break
                        await asyncio.sleep(2)

                    collected_account_tweets: List[str] = []
                    for scroll_round in range(5):
                        if cancellation_event.is_set():
                            break

                        page_state_text = await browser_instance.get_state_as_text()
                        # Use 35-day window for specialized correspondent profiles
                        fresh_account_tweets = trends.extract_tweets_from_article_chunks(page_state_text, max_days_window=35)

                        for tweet_str in fresh_account_tweets:
                            if tweet_str not in collected_account_tweets:
                                collected_account_tweets.append(tweet_str)

                        if len(collected_account_tweets) >= 15:
                            break

                        try:
                            scroll_action = browser_instance.event_bus.dispatch(
                                ScrollEvent(direction="down", amount=1200)
                            )
                            await scroll_action
                            await asyncio.sleep(2)
                        except Exception:
                            break

                    await log_and_record("SUCCESS", f"Captured {len(collected_account_tweets)} latest tweets from {account_name}.")
                    curated_x_sources_tweets[account_name] = collected_account_tweets[:15]
                    x_native_intel_dictionary["sample_tweets_by_trend"][account_name] = collected_account_tweets[:15]
                except Exception as acc_scrape_err:
                    await log_and_record("WARN", f"Notice: Error scraping {account_name}: {str(acc_scrape_err)}")

        # Step 3B: Navigate to X Explore trending to observe active trends
        await log_and_record("BROWSER", "Navigating to https://x.com/explore/tabs/trending to observe active trends...")
        await browser_instance.navigate_to("https://x.com/explore/tabs/trending")
        await asyncio.sleep(4)

        trending_page_state_text = await browser_instance.get_state_as_text()
        for hydration_attempt in range(5):
            if len(trending_page_state_text) > 400 and not trending_page_state_text.strip().startswith("<svg"):
                break
            await asyncio.sleep(2)
            trending_page_state_text = await browser_instance.get_state_as_text()

        if len(trending_page_state_text) < 400 or trending_page_state_text.strip().startswith("<svg"):
            search_seed = "defense" if target_country_name.strip().lower() in ["worldwide", "global"] else target_country_name
            await browser_instance.navigate_to(f"https://x.com/search?q={urllib.parse.quote(search_seed)}")
            await asyncio.sleep(3)
            await browser_instance.navigate_to("https://x.com/explore/tabs/trending")
            for hydration_attempt in range(5):
                trending_page_state_text = await browser_instance.get_state_as_text()
                if len(trending_page_state_text) > 400 and not trending_page_state_text.strip().startswith("<svg"):
                    break
                await asyncio.sleep(2)

        for scroll_index in range(2):
            try:
                scroll_event_action = browser_instance.event_bus.dispatch(
                    ScrollEvent(direction="down", amount=1200)
                )
                await scroll_event_action
                await asyncio.sleep(2)
                state_chunk_text = await browser_instance.get_state_as_text()
                trending_page_state_text = trending_page_state_text + "\n" + state_chunk_text
            except Exception:
                pass

        extracted_trend_names_list: List[str] = trends.extract_x_explore_trends(trending_page_state_text)

        ui_noise_blacklist = [
            "terms of service", "privacy policy", "cookie policy",
            "accessibility", "ads info", "more", "settings", "explore",
            "log in", "sign up", "trending in", "trending with", "show more"
        ]

        # Step 3C: Navigate to X explore news tab
        await log_and_record("BROWSER", "Navigating to https://x.com/explore/tabs/news to extract live curated news topics...")
        try:
            await browser_instance.navigate_to("https://x.com/explore/tabs/news")
            await asyncio.sleep(4)

            for hydration_attempt in range(5):
                news_page_state_text = await browser_instance.get_state_as_text()
                if len(news_page_state_text) > 400 and not news_page_state_text.strip().startswith("<svg"):
                    break
                await asyncio.sleep(2)

            raw_news_lines_list = news_page_state_text.split("\n")
            extracted_x_news_topics: List[str] = []

            for line_idx in range(len(raw_news_lines_list)):
                raw_news_line = raw_news_lines_list[line_idx].strip()
                cleaned_news_line = trends.clean_dom_tags_and_markdown(raw_news_line)
                lower_news_line = cleaned_news_line.lower()

                if len(cleaned_news_line) < 15 or len(cleaned_news_line) > 160:
                    continue
                has_noise = False
                for noise_word in ui_noise_blacklist:
                    if noise_word in lower_news_line:
                        has_noise = True
                        break

                if has_noise:
                    continue
                if cleaned_news_line.endswith("posts") or cleaned_news_line.isdigit():
                    continue

                if cleaned_news_line not in extracted_trend_names_list and cleaned_news_line not in extracted_x_news_topics:
                    if trends.is_strategic_or_defense_trend(cleaned_news_line):
                        extracted_x_news_topics.append(cleaned_news_line)
                        extracted_trend_names_list.append(cleaned_news_line)

            if len(extracted_x_news_topics) > 0:
                sample_news_str = ", ".join(extracted_x_news_topics[:5])
                await log_and_record("SUCCESS", f"Extracted {len(extracted_x_news_topics)} relevant news topics from X news tab: {sample_news_str}")
        except Exception as news_tab_error:
            await log_and_record("WARN", f"Notice: Error navigating X news tab: {str(news_tab_error)}")

        x_native_intel_dictionary["trends_observed"] = extracted_trend_names_list
        sample_preview_str = ", ".join(extracted_trend_names_list[:6])
        await log_and_record("SUCCESS", f"Identified {len(extracted_trend_names_list)} total trends/news on X.com. Sample: {sample_preview_str}")

        # Step 3D: Identify relevant defense/strategic trending topics on X.com and mine top tweets
        relevant_x_trends_to_mine: List[str] = []
        for candidate_trend in extracted_trend_names_list:
            if trends.is_strategic_or_defense_trend(candidate_trend):
                if candidate_trend not in relevant_x_trends_to_mine:
                    relevant_x_trends_to_mine.append(candidate_trend)
                    if len(relevant_x_trends_to_mine) >= 5:
                        break

        for trend_index in range(len(relevant_x_trends_to_mine)):
            if cancellation_event.is_set():
                break

            current_trend_topic = relevant_x_trends_to_mine[trend_index]
            encoded_topic = urllib.parse.quote(current_trend_topic)
            trend_search_url = f"https://x.com/search?q={encoded_topic}"

            await log_and_record("BROWSER", f"[X Trend {trend_index + 1}/{len(relevant_x_trends_to_mine)}] Mining Top tweets for: {current_trend_topic}")
            try:
                await browser_instance.navigate_to(trend_search_url)
                await asyncio.sleep(4)
                for hydration_attempt in range(5):
                    page_state_text = await browser_instance.get_state_as_text()
                    if len(page_state_text) > 400 and not page_state_text.strip().startswith("<svg"):
                        break
                    await asyncio.sleep(2)

                collected_tweets_for_trend: List[str] = []
                for scroll_round in range(max_scroll_rounds):
                    if cancellation_event.is_set():
                        break

                    page_state_text = await browser_instance.get_state_as_text()
                    fresh_batch_tweets = trends.extract_tweets_from_article_chunks(page_state_text, max_days_window=10)

                    for tweet_text in fresh_batch_tweets:
                        if tweet_text not in collected_tweets_for_trend:
                            collected_tweets_for_trend.append(tweet_text)

                    if len(collected_tweets_for_trend) >= max_tweets_target:
                        break

                    try:
                        scroll_event_action = browser_instance.event_bus.dispatch(
                            ScrollEvent(direction="down", amount=1200)
                        )
                        await scroll_event_action
                        await asyncio.sleep(2)
                    except Exception:
                        break

                await log_and_record("SUCCESS", f"Captured {len(collected_tweets_for_trend)} fresh Top tweets for X trend: {current_trend_topic}")
                x_native_intel_dictionary["sample_tweets_by_trend"][current_trend_topic] = collected_tweets_for_trend[:25]
            except Exception as trend_scrape_error:
                await log_and_record("WARN", f"Notice: Error mining trend '{current_trend_topic}': {str(trend_scrape_error)}")

        # PHASE 3: Synthesize news-derived topics & Boolean X queries with Strategic AI Model
        # Passing curated_x_sources_tweets and X explore topics so ground truth and correspondent scoops are fully accounted for!
        await log_and_record("STEP", "[3/4] Synthesizing news + correspondent topics & Boolean X queries with Strategic AI Model...")
        await progress_callback_function("llm_synthesis", 3, 5, f"Synthesizing 15 crisp keywords per topic for {target_country_name}...", target_country_name)

        endpoint_url = settings_dictionary.get("vllm_base_url", "http://10.13.12.121:8000/v1")
        model_name = settings_dictionary.get("llm_model_name", "qwen3-14b")
        timeout_seconds = int(settings_dictionary.get("llm_timeout_seconds", "180"))

        await log_and_record("LLM", f"Synthesizing topics via {endpoint_url} (Model: {model_name}, Timeout: {timeout_seconds}s)...")

        synthesized_topics_list = []
        try:
            loop = asyncio.get_event_loop()
            synthesized_topics_list = await loop.run_in_executor(
                None,
                trends.synthesize_topics_from_news_and_trends,
                target_country_name,
                news_sources_intel_dictionary,
                x_native_intel_dictionary.get("trends_observed", []),
                curated_x_sources_tweets
            )
            await log_and_record("SUCCESS", f"LLM synthesis generated {len(synthesized_topics_list)} topics (15 crisp keywords each + Boolean queries).")
            for topic_preview_index in range(min(3, len(synthesized_topics_list))):
                preview_item = synthesized_topics_list[topic_preview_index]
                await log_and_record("INFO", f"  Topic {topic_preview_index + 1}: {preview_item.get('label')} -> Boolean: {preview_item.get('boolean_query')}")
        except Exception as llm_error:
            await log_and_record("ERROR", f"LLM topic synthesis failed: {str(llm_error)}")

        # PHASE 4: Mine Boolean queries on X.com (Top category) using same active browser session
        queries_to_mine_list: List[str] = []
        for topic_item in synthesized_topics_list:
            topic_query = topic_item.get("boolean_query", "").strip()
            if len(topic_query) == 0:
                topic_query = topic_item.get("label", "").strip()
            if len(topic_query) > 0 and topic_query not in queries_to_mine_list:
                queries_to_mine_list.append(topic_query)
                if len(queries_to_mine_list) >= trends_to_mine_count:
                    break

        await log_and_record("STEP", f"[4/4] Mining {len(queries_to_mine_list)} news-derived Boolean queries on X.com (Top category)...")
        await progress_callback_function("x_mining", 4, 5, f"Mining live tweets for Boolean queries for {target_country_name}...", target_country_name)

        for query_index in range(len(queries_to_mine_list)):
            if cancellation_event.is_set():
                break

            current_mining_query = queries_to_mine_list[query_index]
            encoded_query = urllib.parse.quote(current_mining_query)
            search_url = f"https://x.com/search?q={encoded_query}"

            await log_and_record("BROWSER", f"[Boolean Query {query_index + 1}/{len(queries_to_mine_list)}] Mining Top tweets for: {current_mining_query}")
            try:
                await browser_instance.navigate_to(search_url)
                await asyncio.sleep(4)

                for hydration_attempt in range(5):
                    page_state_text = await browser_instance.get_state_as_text()
                    if len(page_state_text) > 400 and not page_state_text.strip().startswith("<svg"):
                        break
                    await asyncio.sleep(2)

                collected_tweets_for_query: List[str] = []
                for scroll_round in range(max_scroll_rounds):
                    if cancellation_event.is_set():
                        break

                    page_state_text = await browser_instance.get_state_as_text()
                    fresh_batch_tweets = trends.extract_tweets_from_article_chunks(page_state_text, max_days_window=10)

                    for tweet_text in fresh_batch_tweets:
                        if tweet_text not in collected_tweets_for_query:
                            collected_tweets_for_query.append(tweet_text)

                    if len(collected_tweets_for_query) >= max_tweets_target:
                        break

                    try:
                        scroll_event_action = browser_instance.event_bus.dispatch(
                            ScrollEvent(direction="down", amount=1200)
                        )
                        await scroll_event_action
                        await asyncio.sleep(2)
                    except Exception:
                        break

                await log_and_record("SUCCESS", f"Captured {len(collected_tweets_for_query)} fresh tweets for Boolean query: {current_mining_query}")
                x_native_intel_dictionary["sample_tweets_by_trend"][current_mining_query] = collected_tweets_for_query[:25]
            except Exception as query_scrape_error:
                await log_and_record("WARN", f"Notice: Error mining query '{current_mining_query}': {str(query_scrape_error)}")

        # Attach mined tweets and relevant correspondent tweets to matching synthesized topics
        sample_tweets_map = x_native_intel_dictionary.get("sample_tweets_by_trend", {})
        for topic_item in synthesized_topics_list:
            b_query = topic_item.get("boolean_query", "")
            topic_label_lower = topic_item.get("label", "").lower()
            topic_terms = [t.lower() for t in topic_item.get("terms", [])]

            matched_topic_tweets = []
            if b_query in sample_tweets_map:
                for tw in sample_tweets_map[b_query]:
                    if tw not in matched_topic_tweets:
                        matched_topic_tweets.append(tw)

            # Check if any correspondent tweets correlate with this topic
            for acc_name, acc_tweets in curated_x_sources_tweets.items():
                for acc_tw in acc_tweets:
                    acc_tw_lower = acc_tw.lower()
                    is_correlated = False
                    for term in topic_terms:
                        if len(term) > 3 and term in acc_tw_lower:
                            is_correlated = True
                            break
                    if not is_correlated:
                        words = topic_label_lower.split()
                        match_count = 0
                        for w in words:
                            if len(w) > 4 and w in acc_tw_lower:
                                match_count += 1
                        if match_count >= 2:
                            is_correlated = True

                    if is_correlated and acc_tw not in matched_topic_tweets:
                        matched_topic_tweets.append(acc_tw)

            if len(matched_topic_tweets) > 0:
                topic_item["sample_tweets"] = matched_topic_tweets[:25]

    finally:
        try:
            await browser_instance.close()
            await log_and_record("BROWSER", "Chrome browser session cleanly closed.")
        except Exception:
            pass

    if cancellation_event.is_set():
        await log_and_record("WARN", "Pipeline execution cancelled by user.")
        update_pipeline_run_status(run_identifier, "cancelled", "Cancelled by user after browser mining")
        return None

    # PHASE 5: Consolidate raw data and save raw_sources.json and keywords.json
    await log_and_record("STEP", "[5/5] Consolidating and saving intelligence artifacts...")
    current_iso_time = datetime.datetime.now().isoformat()
    consolidated_raw_sources = {
        "country": target_country_name,
        "slug": country_slug_name,
        "collected_at": current_iso_time,
        "all_trends24_topics": all_trends24_topics_list,
        "relevant_trends24_topics": relevant_trends24_topics_list,
        "x_trends24_topics": relevant_trends24_topics_list,
        "news_sources_intel": news_sources_intel_dictionary,
        "curated_x_sources_intel": curated_x_sources_tweets,
        "x_native_explore": x_native_intel_dictionary
    }

    with open(RAW_SOURCES_FILE_PATH, "w", encoding="utf-8") as file_pointer:
        file_pointer.write(json.dumps(consolidated_raw_sources, indent=2, ensure_ascii=False))
    await log_and_record("SUCCESS", f"Saved consolidated raw intelligence to {RAW_SOURCES_FILE_PATH}")

    final_keywords_payload = {
        "generated_at": current_iso_time,
        "country": target_country_name,
        "sources_consulted": [
            "x.com_native_explore_and_tweets"
        ] + [s.get("name", "") for s in configured_sources_list if s.get("enabled", True)],
        "total_topics": len(synthesized_topics_list),
        "topics": synthesized_topics_list
    }

    raw_sources_json_string = json.dumps(consolidated_raw_sources, indent=2, ensure_ascii=False)
    keywords_json_string = json.dumps(final_keywords_payload, indent=2, ensure_ascii=False)
    full_log_output_string = "\n".join(collected_log_lines_list)

    with open(KEYWORDS_FILE_PATH, "w", encoding="utf-8") as file_pointer:
        file_pointer.write(keywords_json_string)
        
    await log_and_record("SUCCESS", f"Saved final keyword sets with Boolean queries to {KEYWORDS_FILE_PATH}")

    # Persist in SQLite
    complete_pipeline_run_with_data(
        run_identifier,
        raw_sources_json_string,
        keywords_json_string,
        full_log_output_string
    )

    await progress_callback_function("done", 5, 5, f"Pipeline complete for {target_country_name}!", target_country_name)
    await log_and_record("STEP", f"Pipeline successfully completed for {target_country_name}!")

    return {
        "run_id": run_identifier,
        "country_name": target_country_name,
        "raw_sources": consolidated_raw_sources,
        "keywords": final_keywords_payload
    }


async def run_multi_country_pipeline_orchestrator(
    selected_countries_list: List[str],
    log_callback_function: Callable[[str, str], Any],
    progress_callback_function: Callable[[str, int, int, str, Optional[str]], Any],
    status_callback_function: Callable[[str], Any],
    result_callback_function: Callable[[Dict[str, Any]], Any],
    cancellation_event: asyncio.Event
):
    # Set status to running
    await status_callback_function("running")
    settings_dictionary = get_all_settings()

    collected_all_logs: List[str] = []
    latest_completed_result = None

    total_countries = len(selected_countries_list)
    if total_countries == 0:
        selected_countries_list = ["Worldwide"]
        total_countries = 1

    for country_index in range(total_countries):
        if cancellation_event.is_set():
            break

        country_name = selected_countries_list[country_index]
        country_result = await run_single_country_pipeline(
            target_country_name=country_name,
            country_index=country_index,
            total_countries_count=total_countries,
            settings_dictionary=settings_dictionary,
            log_callback_function=log_callback_function,
            progress_callback_function=progress_callback_function,
            cancellation_event=cancellation_event,
            collected_log_lines_list=collected_all_logs
        )

        if country_result is not None:
            latest_completed_result = country_result

    if cancellation_event.is_set():
        await status_callback_function("cancelled")
    else:
        await status_callback_function("completed")
        if latest_completed_result is not None:
            await result_callback_function(latest_completed_result)
