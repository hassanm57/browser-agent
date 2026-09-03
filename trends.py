import asyncio
import datetime
import json
import os
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ElementTree
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import requests
from browser_use import Browser
from browser_use.browser.events import ScrollEvent
from browser_use.llm import ChatOpenAI, UserMessage

# Load environment configuration values from .env file
load_dotenv()

# Read the local LLM connection settings
vllm_base_url_string = os.getenv("VLLM_BASE_URL")
vllm_api_key_string = os.getenv("VLLM_API_KEY")
llm_model_name_string = os.getenv("LLM_MODEL")

# Check whether the browser window should be visible or hidden
headless_environment_setting = os.getenv("HEADLESS")
if headless_environment_setting == "true":
    is_headless_mode_enabled = True
else:
    is_headless_mode_enabled = False

# Check whether to connect to the real system Chrome profile
use_real_chrome_setting = os.getenv("USE_REAL_CHROME")
if use_real_chrome_setting == "false":
    is_real_chrome_enabled = False
else:
    is_real_chrome_enabled = True


def load_countries_configuration_file():
    # We load the country configurations from countries.json so country settings are not hardcoded
    current_script_directory = os.path.dirname(os.path.abspath(__file__))
    countries_file_path = os.path.join(current_script_directory, "countries.json")

    if not os.path.exists(countries_file_path):
        print("Warning: countries.json file was not found. Using default Pakistan settings.")
        default_fallback_country = {
            "name": "Pakistan",
            "trends24_slug": "pakistan",
            "tier": "home",
            "is_home": True
        }
        return [default_fallback_country]

    opened_file_handle = open(countries_file_path, "r", encoding="utf-8")
    file_text_contents = opened_file_handle.read()
    opened_file_handle.close()

    parsed_countries_list = json.loads(file_text_contents)
    return parsed_countries_list


def find_target_country_by_name(country_search_query, available_countries_list):
    # We search through the list step by step to find a matching country name or slug
    normalized_search_query = country_search_query.strip().lower()

    for country_index in range(len(available_countries_list)):
        current_country_item = available_countries_list[country_index]
        current_country_name = current_country_item.get("name", "").strip().lower()
        current_country_slug = current_country_item.get("trends24_slug", "").strip().lower()

        if normalized_search_query == current_country_name:
            return current_country_item
        if normalized_search_query == current_country_slug:
            return current_country_item

    # If no match is found, return None so caller can handle it
    return None


def load_sources_configuration_file():
    # We dynamically load all news and intelligence sources from sources.json
    # If the user adds or removes sources in sources.json, this code automatically adapts.
    current_script_directory = os.path.dirname(os.path.abspath(__file__))
    sources_file_path = os.path.join(current_script_directory, "sources.json")

    if not os.path.exists(sources_file_path):
        print("Warning: sources.json file was not found. Using default fallback sources.")
        return []

    opened_file_handle = open(sources_file_path, "r", encoding="utf-8")
    file_text_contents = opened_file_handle.read()
    opened_file_handle.close()

    parsed_sources_list = json.loads(file_text_contents)
    return parsed_sources_list


def fetch_trends24_topics(target_country_slug):
    # We fetch country trending hashtags from trends24 without heavy browser overhead
    target_webpage_url = "https://trends24.in/" + target_country_slug + "/"
    print("[1] Fetching X trends from trends24: " + target_webpage_url)

    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        http_response_object = requests.get(target_webpage_url, headers=request_headers_dictionary, timeout=15)
        http_response_object.encoding = "utf-8"

        html_soup_parser = BeautifulSoup(http_response_object.text, "html.parser")
        ordered_lists_collection = html_soup_parser.find_all("ol")

        extracted_trending_topics_list = []
        if len(ordered_lists_collection) > 0:
            most_recent_hour_list = ordered_lists_collection[0]
            list_items_collection = most_recent_hour_list.find_all("li")

            for item_index in range(len(list_items_collection)):
                current_list_item = list_items_collection[item_index]
                cleaned_topic_text = current_list_item.get_text(strip=True)
                if len(cleaned_topic_text) > 0 and len(extracted_trending_topics_list) < 35:
                    extracted_trending_topics_list.append(cleaned_topic_text)

        print("    Fetched " + str(len(extracted_trending_topics_list)) + " trending topics from trends24.")
        return extracted_trending_topics_list
    except Exception as error_message:
        print("    Warning: Could not fetch trends24: " + str(error_message))
        return []


def fetch_headlines_from_configured_sources(sources_list):
    # This function processes each source defined in sources.json dynamically
    # It supports both 'rss' feed parsing and 'web' HTML scraping
    print("[2] Ingesting Headlines Dynamically from sources.json...")
    aggregated_sources_intel_dictionary = {}

    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    source_number = 1
    for source_index in range(len(sources_list)):
        source_item = sources_list[source_index]
        source_name = source_item.get("name", "Unknown Source")
        source_type = source_item.get("type", "web")
        source_url = source_item.get("url", "")
        is_source_enabled = source_item.get("enabled", True)

        if not is_source_enabled or len(source_url) == 0:
            continue

        print(f"    ({source_number}/{len(sources_list)}) Fetching: {source_name} ({source_url})")
        extracted_headlines_list = []

        try:
            if source_type == "rss":
                # Parse RSS XML feed
                http_response_object = requests.get(source_url, headers=request_headers_dictionary, timeout=12)
                xml_root_element = ElementTree.fromstring(http_response_object.content)
                channel_element = xml_root_element.find("channel")
                if channel_element is not None:
                    feed_items_list = channel_element.findall("item")
                    for item_index in range(len(feed_items_list)):
                        current_feed_item = feed_items_list[item_index]
                        title_element = current_feed_item.find("title")
                        if title_element is not None and title_element.text is not None:
                            cleaned_headline = title_element.text.strip()
                            if len(cleaned_headline) > 10 and len(extracted_headlines_list) < 20:
                                extracted_headlines_list.append(cleaned_headline)
            else:
                # Parse HTML web page
                http_response_object = requests.get(source_url, headers=request_headers_dictionary, timeout=12)
                http_response_object.encoding = "utf-8"
                html_soup_parser = BeautifulSoup(http_response_object.text, "html.parser")

                # Look for headings and article links
                headings_collection = html_soup_parser.find_all(["h1", "h2", "h3", "a"])
                for heading_index in range(len(headings_collection)):
                    heading_item = headings_collection[heading_index]
                    heading_text = heading_item.get_text(strip=True)

                    if len(heading_text) > 25 and len(heading_text) < 160:
                        if heading_text not in extracted_headlines_list:
                            # If it's a general landing page, prioritize defense/geopolitical keywords
                            lower_text = heading_text.lower()
                            is_relevant = True
                            if "foreignaffairs.com" in source_url:
                                is_relevant = True
                            elif any(k in lower_text for k in ["pakistan", "army", "military", "strike", "attack", "iran", "israel", "china", "us", "trump", "navy", "security", "court", "forces", "treaty", "pact", "russia", "border", "missile"]):
                                is_relevant = True
                            else:
                                is_relevant = False

                            if is_relevant and len(extracted_headlines_list) < 20:
                                extracted_headlines_list.append(heading_text)

            print(f"        -> Extracted {len(extracted_headlines_list)} headlines.")
        except Exception as fetch_error:
            print(f"        -> Notice: Failed to fetch {source_name}: {fetch_error}")

        # Fallback to headless browser agent if HTTP or RSS returned 0 headlines
        if len(extracted_headlines_list) == 0:
            print(f"        -> Zero headlines from {source_name}. Activating browser-agent fallback...")
            fallback_web_url = derive_web_homepage_url(source_url)
            try:
                browser_fallback_headlines = asyncio.run(
                    scrape_source_via_browser_fallback(fallback_web_url, source_name)
                )
                if len(browser_fallback_headlines) > 0:
                    extracted_headlines_list = browser_fallback_headlines[:20]
                    print(f"        -> [Browser Fallback SUCCESS] Harvested {len(extracted_headlines_list)} headlines for {source_name}.")
            except Exception as browser_fallback_error:
                print(f"        -> [Browser Fallback Notice] Could not fetch via browser: {browser_fallback_error}")

        aggregated_sources_intel_dictionary[source_name] = extracted_headlines_list
        source_number = source_number + 1

    return aggregated_sources_intel_dictionary


def derive_web_homepage_url(source_url):
    # Map RSS feed URLs to their actual website homepages
    if "breakingdefense.com" in source_url:
        return "https://breakingdefense.com/"
    elif "defensenews.com" in source_url:
        return "https://www.defensenews.com/"
    elif "bbci.co.uk" in source_url or "bbc.co.uk" in source_url:
        return "https://www.bbc.com/news/world"
    return source_url


async def scrape_source_via_browser_fallback(target_web_url, source_name):
    # Launches a headless browser to visit dynamic websites when HTTP/RSS feeds fail or return 0 items
    extracted_headlines = []
    browser_instance = Browser(headless=True)
    try:
        await browser_instance.start()
        await browser_instance.navigate_to(target_web_url)
        await asyncio.sleep(4)

        page_state_text = await browser_instance.get_state_as_text()
        raw_lines = page_state_text.split("\n")
        for line_index in range(len(raw_lines)):
            raw_line = raw_lines[line_index].strip()
            cleaned_line = clean_dom_tags_and_markdown(raw_line)

            # Filter out navigation noise, buttons, and short labels
            if len(cleaned_line) < 25 or len(cleaned_line) > 180:
                continue
            lower_line = cleaned_line.lower()
            if lower_line.startswith("cookie") or lower_line.startswith("accept"):
                continue
            if "sign in" in lower_line or "subscribe" in lower_line:
                continue
            if cleaned_line in extracted_headlines:
                continue

            extracted_headlines.append(cleaned_line)
    finally:
        try:
            await browser_instance.close()
        except Exception:
            pass

    return extracted_headlines


def clean_dom_tags_and_markdown(text_string):
    # Remove [123]<div /> and similar DOM annotations injected by browser-use state serializer
    cleaned_string = re.sub(r'\[\d+\]<[^>]*>', '', text_string)
    cleaned_string = re.sub(r'\|\w+\([^)]*\)\|', '', cleaned_string)
    cleaned_string = re.sub(r'\*\s*', '', cleaned_string)
    return ' '.join(cleaned_string.split())


def extract_tweets_from_article_chunks(page_state_text):
    # In browser-use state text, each tweet is rendered inside an [ID]<article role=article /> container.
    # Splitting by article containers guarantees we only extract content belonging to individual tweets,
    # completely separating each tweet from other tweets and completely isolating from the right sidebar.
    article_chunks = re.split(r'\[\d+\]<article\s+role=article\s*/>', page_state_text)
    parsed_tweets = []

    sidebar_and_action_stop_signals = [
        "replies,", "reposts,", "likes,", "views", "reply", "repost", "like", "bookmark", "share post",
        "play video", "search timeline", "who to follow", "what's happening", "people from anyone",
        "search filters", "trending now", "trending in", "live on x", "show more", "terms privacy"
    ]

    # Skip chunk index 0 as it represents the header/navigation before the first tweet article
    for chunk_index in range(1, len(article_chunks)):
        current_chunk_text = article_chunks[chunk_index]
        raw_lines = current_chunk_text.split("\n")
        cleaned_lines = []
        for line_index in range(len(raw_lines)):
            cleaned_line = clean_dom_tags_and_markdown(raw_lines[line_index].strip())
            if len(cleaned_line) > 0:
                cleaned_lines.append(cleaned_line)

        user_handle_string = ""
        author_display_name = ""
        handle_line_index = -1

        for line_index in range(len(cleaned_lines)):
            line_candidate = cleaned_lines[line_index]
            if line_candidate.startswith("@") and " " not in line_candidate:
                user_handle_string = line_candidate
                handle_line_index = line_index
                if line_index > 0:
                    potential_author_line = cleaned_lines[line_index - 1]
                    if not potential_author_line.startswith("@") and len(potential_author_line) < 40:
                        author_display_name = potential_author_line
                break

        # Ignore our own user header or Twitter system accounts
        if handle_line_index != -1 and user_handle_string.lower() not in ["@real_hm_", "@twitter", "@x"]:
            body_text_lines = []
            for body_index in range(handle_line_index + 1, len(cleaned_lines)):
                current_body_line = cleaned_lines[body_index]
                lower_body_line = current_body_line.lower()

                # Stop collecting if we hit metrics groups, action buttons, or sidebar widgets
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

                # Skip raw timestamps or dots
                if current_body_line == "·" or current_body_line.endswith("m") or current_body_line.endswith("h") or current_body_line.endswith("s") or current_body_line.isdigit():
                    continue

                body_text_lines.append(current_body_line)

            combined_body_text = " ".join(body_text_lines).strip()
            combined_body_text = combined_body_text.replace("<!-- SVG content collapsed -->", "").strip()

            # Ensure tweet has substantial content and no sidebar follow widgets
            lower_body = combined_body_text.lower()
            if lower_body.startswith("follow ") or ("follow " in lower_body and len(combined_body_text) < 40):
                continue

            if len(combined_body_text) > 15:
                if len(author_display_name) > 0 and "svg" not in author_display_name.lower():
                    formatted_tweet = f"[{author_display_name} | {user_handle_string}] {combined_body_text}"
                else:
                    formatted_tweet = f"[{user_handle_string}] {combined_body_text}"

                if formatted_tweet not in parsed_tweets:
                    parsed_tweets.append(formatted_tweet)

    return parsed_tweets


async def run_x_com_deep_trend_and_tweet_miner(target_country_name, target_country_slug, is_headless_enabled):
    # This function uses an active headful browser session so you can see Chrome on screen
    # 1. Opens https://x.com/explore/tabs/trending and extracts active live trends
    # 2. Selects top defense/geopolitical trends
    # 3. Navigates to search results and progressively scrolls down until AT LEAST 20 genuine tweets are collected
    # 4. Uses extract_tweets_from_article_chunks to isolate tweets and filter out sidebar noise
    print("")
    print("==================================================")
    print("[3] Mining Live Trends and Tweets Directly on X.com (Headful Browser)")
    print("==================================================")

    x_native_intel_dictionary = {
        "country": target_country_name,
        "trends_observed": [],
        "sample_tweets_by_trend": {}
    }

    if is_real_chrome_enabled:
        browser_instance = Browser.from_system_chrome(
            headless=False,
        )
    else:
        browser_instance = Browser(
            headless=False,
        )

    try:
        print("Launching visible Chrome window and navigating to https://x.com/explore/tabs/trending...")
        await browser_instance.start()
        await browser_instance.navigate_to("https://x.com/explore/tabs/trending")
        await asyncio.sleep(5)

        # Extract page text to identify trending hashtags
        trending_page_state_text = await browser_instance.get_state_as_text()
        extracted_trend_names_list = []

        raw_state_lines_list = trending_page_state_text.split("\n")
        for line_index in range(len(raw_state_lines_list)):
            current_raw_line = raw_state_lines_list[line_index].strip()
            if current_raw_line.startswith("#") and len(current_raw_line) > 2:
                if current_raw_line not in extracted_trend_names_list:
                    extracted_trend_names_list.append(current_raw_line)
            elif "Trending with" in current_raw_line or "Trending in" in current_raw_line:
                if line_index + 1 < len(raw_state_lines_list):
                    next_line_text = raw_state_lines_list[line_index + 1].strip()
                    if len(next_line_text) > 3 and not next_line_text.startswith("[") and next_line_text not in extracted_trend_names_list:
                        extracted_trend_names_list.append(next_line_text)

        # Ensure our primary national security trends are included
        seed_priority_trends = [
            "#VisionaryFieldMarshal",
            "#GreatManCDF",
            "#امہ_کی_شان_عاصم_منیر",
            "#مرد_آہن_فیلڈ_مارشل",
            "Makkah Defence Pact",
            "Pakistan Navy Sea Spark"
        ]
        for seed_index in range(len(seed_priority_trends)):
            current_seed = seed_priority_trends[seed_index]
            if current_seed not in extracted_trend_names_list:
                extracted_trend_names_list.append(current_seed)

        x_native_intel_dictionary["trends_observed"] = extracted_trend_names_list
        print("Discovered " + str(len(extracted_trend_names_list)) + " trending topics on X.com.")
        print("Sample trends: " + ", ".join(extracted_trend_names_list[:6]))
        print("")

        # Select top 5 trends to search and extract genuine tweets
        selected_trends_to_mine_list = extracted_trend_names_list[:5]

        for trend_index in range(len(selected_trends_to_mine_list)):
            current_trend_query = selected_trends_to_mine_list[trend_index]
            encoded_query_string = urllib.parse.quote(current_trend_query)
            search_url_string = "https://x.com/search?q=" + encoded_query_string + "&f=top"

            print(f"Mining tweets for trend [{trend_index + 1}/5]: {current_trend_query}")
            try:
                await browser_instance.navigate_to(search_url_string)
                await asyncio.sleep(4)

                collected_tweets_for_trend = []
                # Progressively scroll down to dynamically load tweets until at least 20 tweets are captured
                for scroll_round in range(12):
                    page_state_text = await browser_instance.get_state_as_text()
                    fresh_batch_tweets = extract_tweets_from_article_chunks(page_state_text)

                    for tweet_item in fresh_batch_tweets:
                        if tweet_item not in collected_tweets_for_trend:
                            collected_tweets_for_trend.append(tweet_item)

                    print(f"      Scroll round {scroll_round + 1}: {len(collected_tweets_for_trend)} unique tweets collected so far...")

                    if len(collected_tweets_for_trend) >= 20:
                        break

                    try:
                        scroll_action_event = browser_instance.event_bus.dispatch(
                            ScrollEvent(direction="down", amount=1200)
                        )
                        await scroll_action_event
                        await asyncio.sleep(2)
                    except Exception:
                        break

                print(f"      -> Successfully extracted {len(collected_tweets_for_trend)} genuine tweets for: {current_trend_query}")
                for preview_index in range(min(2, len(collected_tweets_for_trend))):
                    print(f"         {preview_index + 1}. {collected_tweets_for_trend[preview_index][:120]}...")

                x_native_intel_dictionary["sample_tweets_by_trend"][current_trend_query] = collected_tweets_for_trend[:25]
            except Exception as trend_error:
                print(f"      Notice: Skipping trend due to network timeout: {trend_error}")

            await asyncio.sleep(2)

        await browser_instance.stop()
        print("Successfully completed headful X.com trend and tweet extraction!")
    except Exception as browser_error:
        print("Notice: X.com browser inspection encountered: " + str(browser_error))
        try:
            await browser_instance.stop()
        except Exception:
            pass

    return x_native_intel_dictionary


def synthesize_keywords_with_llm(target_country_name, consolidated_intel_dictionary):
    # We pass the full multi-source digest into Qwen3-14B to filter foreign affairs,
    # analyze tweets and headlines, and generate 20 comprehensive search keywords for each topic.
    print("")
    print("==================================================")
    print("[4] Synthesizing 20 Keywords per Topic with Qwen3-14B")
    print("==================================================")

    digest_sections_list = []

    # Ingest all news headlines from sources.json
    configured_news_sources_dictionary = consolidated_intel_dictionary.get("news_sources_intel", {})
    for source_name_key in configured_news_sources_dictionary:
        headlines_list = configured_news_sources_dictionary[source_name_key]
        if len(headlines_list) > 0:
            digest_sections_list.append(f"\n--- {source_name_key.upper()} ---")
            for idx in range(len(headlines_list)):
                digest_sections_list.append("• " + headlines_list[idx])

    # Ingest trends24 topics
    trends24_list = consolidated_intel_dictionary.get("x_trends24_topics", [])
    if len(trends24_list) > 0:
        digest_sections_list.append(f"\n--- X.COM CHATTER & TRENDS ({target_country_name.upper()}) ---")
        for idx in range(len(trends24_list)):
            digest_sections_list.append("• " + trends24_list[idx])

    # Ingest extracted authentic tweets from X.com
    x_native_data = consolidated_intel_dictionary.get("x_native_explore", {})
    sample_tweets_map = x_native_data.get("sample_tweets_by_trend", {})
    if len(sample_tweets_map) > 0:
        digest_sections_list.append("\n--- AUTHENTIC TWEETS EXTRACTED FROM X.COM ---")
        for trend_key in sample_tweets_map:
            tweets_list = sample_tweets_map[trend_key]
            digest_sections_list.append(f"Trend: {trend_key}")
            for t_idx in range(len(tweets_list)):
                digest_sections_list.append(f"   [Tweet {t_idx+1}]: {tweets_list[t_idx]}")

    full_intel_digest_string = "\n".join(digest_sections_list)

    system_and_user_prompt = f"""You are an elite geopolitical intelligence and social search keyword engineer.
Analyze the following multi-source intelligence report for the country: {target_country_name}.

DATA REPORT:
{full_intel_digest_string}

TASK:
1. Filter strictly for FOREIGN AFFAIRS, DEFENSE, and GEOPOLITICAL topics:
   - Defense, armed forces modernization, military pacts, naval/air exercises, weapons tests
   - Bilateral and multilateral diplomacy, strategic partnerships, foreign delegations, treaties
   - Regional conflicts, border security, maritime security, sanctions, energy corridors
2. Discard purely domestic party politics, sports, celebrities, crypto, local crime, and gossip.
3. Pay HEAVY attention to the authentic tweets extracted from X.com:
   - Notice hidden keywords, specific military terms, pact names (like "Makkah Defence Pact"), military leadership titles, and related hashtags.
4. FOR EACH TOPIC, GENERATE APPROXIMATELY 20 HIGH-PRECISION KEYWORDS / SEARCH TERMS.
   - Do not stop at 3 or 4 terms. Provide a comprehensive list of ~20 terms per topic so downstream Twitter scrapers will not miss anything.
   - Include: full official names, common abbreviations, nicknames, key leaders, related organizations, weapons systems, and relevant hashtags (in English and Urdu/local where applicable).
5. Output 10 to 12 distinct, high-priority foreign-affairs topics.

OUTPUT REQUIREMENTS:
Respond ONLY with a valid JSON array of objects. Do not include markdown backticks, thinking text, or conversational filler.
Each object must have these exact keys:
- "label": Short clear title of the topic or event
- "category": One of "defense", "diplomacy", "politics", "economic"
- "terms": Array of approximately 20 keyword strings

Example structure:
[
  {{
    "label": "Makkah Defence Pact",
    "category": "defense",
    "terms": [
      "Makkah Defence Pact", "Makkah Defense Pact", "the makkah defence pact", "MDP 2026",
      "Saudi Pakistan defence pact", "Saudi Pak military cooperation", "VisionaryFieldMarshal",
      "#VisionaryFieldMarshal", "#GreatManCDF", "General Asim Munir", "Field Marshal Asim Munir",
      "Islamic Military Counter Terrorism Coalition", "IMCTC", "Riyadh Islamabad defense",
      "Pakistan Armed Forces Saudi Arabia", "GCC security pact", "Makkah security agreement",
      "#امہ_کی_شان_عاصم_منیر", "#مرد_آہن_فیلڈ_مارشل", "Pakistan Saudi bilateral security"
    ]
  }}
]
"""

    language_model_client = ChatOpenAI(
        model=llm_model_name_string,
        base_url=vllm_base_url_string,
        api_key=vllm_api_key_string,
        max_completion_tokens=8192,
        timeout=180,
    )

    async def call_llm():
        user_message_object = UserMessage(content=system_and_user_prompt)
        model_response_object = await language_model_client.ainvoke([user_message_object])
        return model_response_object.completion

    raw_model_completion_text = asyncio.run(call_llm())

    # Clean markdown formatting backticks if present
    cleaned_json_text = raw_model_completion_text.strip()
    if cleaned_json_text.startswith("```json"):
        cleaned_json_text = cleaned_json_text[7:]
    if cleaned_json_text.startswith("```"):
        cleaned_json_text = cleaned_json_text[3:]
    if cleaned_json_text.endswith("```"):
        cleaned_json_text = cleaned_json_text[:-3]
    cleaned_json_text = cleaned_json_text.strip()

    try:
        parsed_topics_list = json.loads(cleaned_json_text)
        return parsed_topics_list
    except Exception:
        first_bracket_index = cleaned_json_text.find("[")
        last_bracket_index = cleaned_json_text.rfind("]")
        if first_bracket_index != -1 and last_bracket_index != -1:
            bracket_substring = cleaned_json_text[first_bracket_index:last_bracket_index + 1]
            try:
                parsed_topics_list = json.loads(bracket_substring)
                return parsed_topics_list
            except Exception:
                pass
        return []


def run_country_hot_news_pipeline():
    # Read the country argument or default to Pakistan
    terminal_arguments_list = sys.argv
    if len(terminal_arguments_list) > 1:
        argument_words_list = []
        for argument_index in range(1, len(terminal_arguments_list)):
            argument_words_list.append(terminal_arguments_list[argument_index])
        requested_country_query = " ".join(argument_words_list)
    else:
        requested_country_query = "pakistan"

    # Look up country details from countries.json
    available_countries_list = load_countries_configuration_file()
    selected_country_data = find_target_country_by_name(requested_country_query, available_countries_list)

    if selected_country_data is not None:
        target_country_name = selected_country_data.get("name")
        target_country_slug = selected_country_data.get("trends24_slug")
    else:
        target_country_name = requested_country_query.title()
        target_country_slug = requested_country_query.strip().lower().replace(" ", "-")

    print("==================================================")
    print("Multi-Source Hot News & Comprehensive Keyword Engine")
    print("==================================================")
    print("Target Country: " + target_country_name)
    print("Country Slug:   " + target_country_slug)
    print("==================================================")
    print("")

    # PHASE 1: Gather raw news and trends from all sources
    trends24_topics_list = fetch_trends24_topics(target_country_slug)

    # Load and ingest all configured sources from sources.json
    configured_sources_list = load_sources_configuration_file()
    news_sources_intel_dictionary = fetch_headlines_from_configured_sources(configured_sources_list)

    # PHASE 2: Run X.com browser agent to inspect explore tabs and mine at least 20 sample tweets per trend
    x_native_intel_dictionary = asyncio.run(
        run_x_com_deep_trend_and_tweet_miner(target_country_name, target_country_slug, is_headless_mode_enabled)
    )

    # PHASE 3: Consolidate all raw data into raw_sources.json
    current_iso_timestamp = datetime.datetime.now().isoformat()
    consolidated_raw_sources_data = {
        "country": target_country_name,
        "slug": target_country_slug,
        "collected_at": current_iso_timestamp,
        "x_trends24_topics": trends24_topics_list,
        "news_sources_intel": news_sources_intel_dictionary,
        "x_native_explore": x_native_intel_dictionary
    }

    raw_sources_filename = "raw_sources.json"
    raw_file_handle = open(raw_sources_filename, "w", encoding="utf-8")
    raw_file_handle.write(json.dumps(consolidated_raw_sources_data, indent=2, ensure_ascii=False))
    raw_file_handle.close()
    print("")
    print("Saved consolidated raw intelligence to: " + raw_sources_filename)

    # PHASE 4: Feed consolidated intel to Qwen3-14B for 20 keywords per topic
    synthesized_topics_list = synthesize_keywords_with_llm(
        target_country_name, consolidated_raw_sources_data
    )

    # PHASE 5: Format and save the final structured keywords strictly into keywords.json
    final_output_structure = {
        "generated_at": current_iso_timestamp,
        "country": target_country_name,
        "sources_consulted": [
            "trends24",
            "x.com_native_explore_and_tweets"
        ] + [s.get("name") for s in configured_sources_list if s.get("enabled")],
        "total_topics": len(synthesized_topics_list),
        "topics": synthesized_topics_list
    }

    keywords_output_filename = "keywords.json"
    keywords_file_handle = open(keywords_output_filename, "w", encoding="utf-8")
    keywords_file_handle.write(json.dumps(final_output_structure, indent=2, ensure_ascii=False))
    keywords_file_handle.close()

    print("")
    print("==================================================")
    print("SUCCESS: Keyword Synthesis Finished")
    print("==================================================")
    print("Saved output to: " + keywords_output_filename)
    print("Total high-precision topics generated: " + str(len(synthesized_topics_list)))
    print("==================================================")
    print("")

    # Display the final generated topics with their 20 keywords
    for topic_index in range(len(synthesized_topics_list)):
        current_topic_item = synthesized_topics_list[topic_index]
        topic_label = current_topic_item.get("label", "Unknown")
        topic_category = current_topic_item.get("category", "general")
        topic_terms = current_topic_item.get("terms", [])

        print(f"{topic_index + 1}. [{topic_category.upper()}] {topic_label} ({len(topic_terms)} keywords)")
        print(f"   Keywords: {', '.join(topic_terms)}")
        print("")


if __name__ == "__main__":
    run_country_hot_news_pipeline()
