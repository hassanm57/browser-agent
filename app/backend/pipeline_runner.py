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
        country_slug_name = selected_country_data.get("trends24_slug", target_country_name.lower())
    else:
        country_slug_name = target_country_name.strip().lower().replace(" ", "-")

    await log_and_record("STEP", f"Starting intelligence pipeline for target country: {target_country_name} (Slug: {country_slug_name})")
    await progress_callback_function("init", 1, 6, f"Initializing pipeline for {target_country_name}...", target_country_name)

    # Check for user cancellation
    if cancellation_event.is_set():
        await log_and_record("WARN", "Pipeline execution cancelled by user.")
        update_pipeline_run_status(run_identifier, "cancelled", "Cancelled by user before scraping")
        return None

    # PHASE 1: Ingest ground truth news headlines from configured sources first
    await log_and_record("STEP", "[1/5] Ingesting authoritative headlines from configured news and RSS sources...")
    await progress_callback_function("news_sources", 2, 6, f"Ingesting ground truth news for {target_country_name}...", target_country_name)
    
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

        await log_and_record("INFO", f"Fetching {source_name} ({source_type.upper()})...")
        try:
            headlines_for_source = []
            if source_type == "rss":
                response = trends.requests.get(source_url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
                if response.status_code == 200:
                    xml_root = trends.ElementTree.fromstring(response.content)
                    for item_element in xml_root.findall(".//item"):
                        title_element = item_element.find("title")
                        if title_element is not None and title_element.text:
                            clean_title = trends.clean_dom_tags_and_markdown(title_element.text)
                            if len(clean_title) > 15 and clean_title not in headlines_for_source:
                                headlines_for_source.append(clean_title)
            else:
                response = trends.requests.get(source_url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
                if response.status_code == 200:
                    html_soup = trends.BeautifulSoup(response.text, "html.parser")
                    for header_tag in html_soup.find_all(["h1", "h2", "h3", "h4", "a"]):
                        raw_text = header_tag.get_text()
                        clean_title = trends.clean_dom_tags_and_markdown(raw_text)
                        if len(clean_title) > 25 and clean_title not in headlines_for_source:
                            headlines_for_source.append(clean_title)

            # If 0 headlines extracted via HTTP/RSS, activate browser-agent fallback
            if len(headlines_for_source) == 0:
                await log_and_record("WARN", f"{source_name} returned 0 headlines via HTTP/RSS. Activating browser-agent fallback...")
                fallback_web_url = trends.derive_web_homepage_url(source_url)
                try:
                    browser_fallback_headlines = await trends.scrape_source_via_browser_fallback(fallback_web_url, source_name)
                    if len(browser_fallback_headlines) > 0:
                        headlines_for_source = browser_fallback_headlines[:20]
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

    # PHASE 2: Ingest ALL trends from Trends24, then filter for news-relevant trends
    await log_and_record("STEP", f"[2/5] Ingesting all Trends24 topics and filtering for news-relevance ({country_slug_name})...")
    await progress_callback_function("trends24", 3, 6, f"Capturing all Trends24 topics & filtering for {target_country_name}...", target_country_name)
    
    all_trends24_topics_list = []
    try:
        all_trends24_topics_list = trends.fetch_trends24_topics(country_slug_name)
        await log_and_record("SUCCESS", f"Captured all {len(all_trends24_topics_list)} raw trending topics from Trends24.")
    except Exception as trends24_error:
        await log_and_record("WARN", f"Failed to fetch trends24: {str(trends24_error)}. Continuing with fallback seeds.")

    # Cross-reference Trends24 topics with the news headlines
    relevant_trends24_topics_list = trends.filter_trends_relevant_to_news(
        all_trends24_topics_list, news_sources_intel_dictionary
    )
    if len(relevant_trends24_topics_list) > 0:
        sample_relevant_preview = ", ".join(relevant_trends24_topics_list[:6])
        await log_and_record("SUCCESS", f"Filtered {len(relevant_trends24_topics_list)} news-relevant trends from Trends24. Sample: {sample_relevant_preview}")
    else:
        await log_and_record("INFO", "No direct lexical trend-news overlap found. Relying on primary ground truth news headlines.")

    if cancellation_event.is_set():
        await log_and_record("WARN", "Pipeline execution cancelled by user.")
        update_pipeline_run_status(run_identifier, "cancelled", "Cancelled by user after trends24")
        return None

    # PHASE 3: Synthesize news-derived topics and high-precision Boolean X queries with Qwen3-14B
    await log_and_record("STEP", "[3/5] Synthesizing news-derived topics & Boolean X queries (15 crisp keywords each) with Qwen3-14B...")
    await progress_callback_function("llm_synthesis", 4, 6, f"Synthesizing 15 crisp keywords per topic for {target_country_name}...", target_country_name)

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
            relevant_trends24_topics_list
        )
        await log_and_record("SUCCESS", f"LLM synthesis generated {len(synthesized_topics_list)} news-derived topics (15 crisp keywords each + Boolean queries).")
        for topic_preview_index in range(min(3, len(synthesized_topics_list))):
            preview_item = synthesized_topics_list[topic_preview_index]
            await log_and_record("INFO", f"  Topic {topic_preview_index + 1}: {preview_item.get('label')} -> Boolean: {preview_item.get('boolean_query')}")
    except Exception as llm_error:
        await log_and_record("ERROR", f"LLM topic synthesis failed: {str(llm_error)}")

    if cancellation_event.is_set():
        await log_and_record("WARN", "Pipeline execution cancelled by user.")
        update_pipeline_run_status(run_identifier, "cancelled", "Cancelled by user after LLM synthesis")
        return None

    # PHASE 4: Launch Chrome browser to mine latest tweets on X.com using the news-derived Boolean queries
    await log_and_record("STEP", "[4/5] Mining latest tweets on X.com via news-derived Boolean queries (using &f=live)...")
    await progress_callback_function("x_mining", 5, 6, f"Mining latest tweets for news queries for {target_country_name}...", target_country_name)

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

    browser_mode_string = "Headless" if is_headless else "Headful Visible Window"
    await log_and_record("BROWSER", f"Launching Chrome ({browser_mode_string}, RealProfile: {use_real_chrome})...")

    if use_real_chrome:
        browser_instance = Browser.from_system_chrome(headless=is_headless)
    else:
        browser_instance = Browser(headless=is_headless)

    try:
        await browser_instance.start()
        await log_and_record("BROWSER", "Navigating to https://x.com/explore/tabs/trending to observe active trends...")
        await browser_instance.navigate_to("https://x.com/explore/tabs/trending")
        await asyncio.sleep(4)

        # Extract explore text to identify active live hashtags
        trending_page_state_text = await browser_instance.get_state_as_text()
        extracted_trend_names_list: List[str] = []

        ui_noise_blacklist = [
            "terms of service", "privacy policy", "cookie policy",
            "accessibility", "ads info", "more", "settings", "explore",
            "log in", "sign up", "trending in", "trending with", "show more"
        ]

        raw_state_lines_list = trending_page_state_text.split("\n")
        for line_index in range(len(raw_state_lines_list)):
            current_raw_line = raw_state_lines_list[line_index].strip()
            if current_raw_line.startswith("#") and len(current_raw_line) > 2:
                clean_hashtag = current_raw_line.split()[0].strip()
                if clean_hashtag not in extracted_trend_names_list:
                    extracted_trend_names_list.append(clean_hashtag)
            elif "Trending with" in current_raw_line or "Trending in" in current_raw_line:
                if line_index + 1 < len(raw_state_lines_list):
                    next_line_text = raw_state_lines_list[line_index + 1].strip()
                    lowered_text = next_line_text.lower()
                    if (
                        len(next_line_text) > 2
                        and not next_line_text.startswith("[")
                        and not any(noise in lowered_text for noise in ui_noise_blacklist)
                        and next_line_text not in extracted_trend_names_list
                    ):
                        extracted_trend_names_list.append(next_line_text)

        # Merge in the latest freshly harvested trends24 topics
        for live_trend_item in relevant_trends24_topics_list:
            if live_trend_item not in extracted_trend_names_list:
                extracted_trend_names_list.append(live_trend_item)

        x_native_intel_dictionary["trends_observed"] = extracted_trend_names_list
        sample_preview_str = ", ".join(extracted_trend_names_list[:6])
        await log_and_record("SUCCESS", f"Identified {len(extracted_trend_names_list)} trends on X.com explore. Sample: {sample_preview_str}")

        # Derive queries to mine: prioritize Boolean queries generated from the news topics
        queries_to_mine_list: List[str] = []
        for topic_item in synthesized_topics_list:
            topic_query = topic_item.get("boolean_query", "").strip()
            if len(topic_query) == 0:
                topic_query = topic_item.get("label", "").strip()
            if len(topic_query) > 0 and topic_query not in queries_to_mine_list:
                queries_to_mine_list.append(topic_query)
                if len(queries_to_mine_list) >= trends_to_mine_count:
                    break

        # Fallback to defense indicators if no topic queries
        if len(queries_to_mine_list) == 0:
            for fallback_trend in relevant_trends24_topics_list[:trends_to_mine_count]:
                queries_to_mine_list.append(fallback_trend)

        await log_and_record("INFO", f"Selected {len(queries_to_mine_list)} news-derived Boolean queries to mine on X.com using Latest tab (&f=live).")

        for query_index in range(len(queries_to_mine_list)):
            if cancellation_event.is_set():
                break

            current_mining_query = queries_to_mine_list[query_index]
            encoded_query = urllib.parse.quote(current_mining_query)
            # Use &f=live to strictly open Twitter's Latest tab (reverse chronological, recent tweets)
            search_url = f"https://x.com/search?q={encoded_query}&f=live"

            await log_and_record("BROWSER", f"Mining latest tweets [{query_index + 1}/{len(queries_to_mine_list)}]: {current_mining_query}")
            
            try:
                await browser_instance.navigate_to(search_url)
                await asyncio.sleep(4)

                collected_tweets_for_query: List[str] = []

                # Progressive scrolling loop
                for scroll_round in range(max_scroll_rounds):
                    if cancellation_event.is_set():
                        break

                    page_state_text = await browser_instance.get_state_as_text()
                    fresh_batch_tweets = trends.extract_tweets_from_article_chunks(page_state_text)

                    for tweet_text in fresh_batch_tweets:
                        if tweet_text not in collected_tweets_for_query:
                            collected_tweets_for_query.append(tweet_text)

                    await log_and_record("SCROLL", f"  Scroll round {scroll_round + 1}/{max_scroll_rounds}: {len(collected_tweets_for_query)} fresh tweets accumulated for query")

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

                await log_and_record("SUCCESS", f"Captured {len(collected_tweets_for_query)} fresh tweets for: {current_mining_query}")
                x_native_intel_dictionary["sample_tweets_by_trend"][current_mining_query] = collected_tweets_for_query[:25]
            except Exception as query_scrape_error:
                await log_and_record("WARN", f"Notice: Error mining query '{current_mining_query}': {str(query_scrape_error)}")

        # Attach mined tweets to matching synthesized topics
        sample_tweets_map = x_native_intel_dictionary.get("sample_tweets_by_trend", {})
        for topic_item in synthesized_topics_list:
            b_query = topic_item.get("boolean_query", "")
            if b_query in sample_tweets_map:
                topic_item["sample_tweets"] = sample_tweets_map[b_query]

    finally:
        # We always close the browser session to release Chrome resources
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
        "x_native_explore": x_native_intel_dictionary
    }

    with open(RAW_SOURCES_FILE_PATH, "w", encoding="utf-8") as file_pointer:
        file_pointer.write(json.dumps(consolidated_raw_sources, indent=2, ensure_ascii=False))
    await log_and_record("SUCCESS", f"Saved consolidated raw intelligence to {RAW_SOURCES_FILE_PATH}")

    final_keywords_payload = {
        "generated_at": current_iso_time,
        "country": target_country_name,
        "sources_consulted": [
            "trends24",
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

    await progress_callback_function("done", 6, 6, f"Pipeline complete for {target_country_name}!", target_country_name)
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
