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


def fetch_trends24_topics(target_country_slug):
    # We fetch country trending hashtags from trends24 without heavy browser overhead
    target_webpage_url = "https://trends24.in/" + target_country_slug + "/"
    print("[1/8] Fetching X trends from trends24: " + target_webpage_url)

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

        print("      Fetched " + str(len(extracted_trending_topics_list)) + " trending topics from trends24.")
        return extracted_trending_topics_list
    except Exception as error_message:
        print("      Warning: Could not fetch trends24: " + str(error_message))
        return []


def fetch_dawn_news_headlines():
    # Dawn is the primary English news source for Pakistan national security, defense, and foreign affairs
    print("[2/8] Fetching breaking headlines from Dawn (https://www.dawn.com/)...")
    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    extracted_headlines_list = []
    try:
        http_response_object = requests.get("https://www.dawn.com/", headers=request_headers_dictionary, timeout=15)
        http_response_object.encoding = "utf-8"
        html_soup_parser = BeautifulSoup(http_response_object.text, "html.parser")

        all_headings_collection = html_soup_parser.find_all(["h2", "h3", "a"])
        for item_index in range(len(all_headings_collection)):
            current_heading_item = all_headings_collection[item_index]
            heading_text_string = current_heading_item.get_text(strip=True)
            # Filter for foreign affairs and national security relevance
            if len(heading_text_string) > 25 and len(heading_text_string) < 150:
                if heading_text_string not in extracted_headlines_list:
                    lower_heading = heading_text_string.lower()
                    if any(keyword in lower_heading for keyword in ["pakistan", "army", "military", "strike", "attack", "iran", "israel", "china", "us", "trump", "navy", "security", "court", "forces", "lebanon", "saudi", "treaty"]):
                        if len(extracted_headlines_list) < 20:
                            extracted_headlines_list.append(heading_text_string)

        print("      Fetched " + str(len(extracted_headlines_list)) + " national & global headlines from Dawn.")
        return extracted_headlines_list
    except Exception as error_message:
        print("      Warning: Could not fetch Dawn news: " + str(error_message))
        return []


def fetch_tribune_news_headlines():
    # The Express Tribune provides in-depth coverage of regional diplomacy, economy, and military pacts
    print("[3/8] Fetching breaking headlines from Express Tribune (https://tribune.com.pk/)...")
    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    extracted_headlines_list = []
    try:
        http_response_object = requests.get("https://tribune.com.pk/", headers=request_headers_dictionary, timeout=15)
        http_response_object.encoding = "utf-8"
        html_soup_parser = BeautifulSoup(http_response_object.text, "html.parser")

        all_headings_collection = html_soup_parser.find_all(["h2", "h3", "a"])
        for item_index in range(len(all_headings_collection)):
            current_heading_item = all_headings_collection[item_index]
            heading_text_string = current_heading_item.get_text(strip=True)
            if len(heading_text_string) > 25 and len(heading_text_string) < 150:
                if heading_text_string not in extracted_headlines_list:
                    lower_heading = heading_text_string.lower()
                    if any(keyword in lower_heading for keyword in ["pakistan", "army", "military", "strike", "attack", "iran", "israel", "china", "us", "trump", "navy", "security", "forces", "iwt", "saudi", "pact"]):
                        if len(extracted_headlines_list) < 20:
                            extracted_headlines_list.append(heading_text_string)

        print("      Fetched " + str(len(extracted_headlines_list)) + " headlines from Express Tribune.")
        return extracted_headlines_list
    except Exception as error_message:
        print("      Warning: Could not fetch Tribune news: " + str(error_message))
        return []


def fetch_defense_news_headlines():
    # We parse the official Defense News RSS feed for breaking military procurement and defense posture
    print("[4/8] Fetching breaking headlines from Defense News...")
    defense_news_feed_url = "https://www.defensenews.com/arc/outboundfeeds/rss/"
    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    extracted_headlines_list = []
    try:
        http_response_object = requests.get(defense_news_feed_url, headers=request_headers_dictionary, timeout=12)
        xml_root_element = ElementTree.fromstring(http_response_object.content)
        channel_element = xml_root_element.find("channel")
        feed_items_list = channel_element.findall("item")

        for item_index in range(len(feed_items_list)):
            current_feed_item = feed_items_list[item_index]
            title_element = current_feed_item.find("title")
            if title_element is not None and title_element.text is not None:
                cleaned_headline_text = title_element.text.strip()
                if len(cleaned_headline_text) > 10 and len(extracted_headlines_list) < 15:
                    extracted_headlines_list.append(cleaned_headline_text)

        print("      Fetched " + str(len(extracted_headlines_list)) + " headlines from Defense News.")
        return extracted_headlines_list
    except Exception as error_message:
        print("      Warning: Could not fetch Defense News RSS: " + str(error_message))
        return []


def fetch_breaking_defense_headlines():
    # We parse Breaking Defense RSS for breaking weapons systems, aerospace, and defense strategy
    print("[5/8] Fetching breaking headlines from Breaking Defense...")
    breaking_defense_feed_url = "https://breakingdefense.com/feed/"
    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    extracted_headlines_list = []
    try:
        http_response_object = requests.get(breaking_defense_feed_url, headers=request_headers_dictionary, timeout=12)
        xml_root_element = ElementTree.fromstring(http_response_object.content)
        channel_element = xml_root_element.find("channel")
        feed_items_list = channel_element.findall("item")

        for item_index in range(len(feed_items_list)):
            current_feed_item = feed_items_list[item_index]
            title_element = current_feed_item.find("title")
            if title_element is not None and title_element.text is not None:
                cleaned_headline_text = title_element.text.strip()
                if len(cleaned_headline_text) > 10 and len(extracted_headlines_list) < 15:
                    extracted_headlines_list.append(cleaned_headline_text)

        print("      Fetched " + str(len(extracted_headlines_list)) + " headlines from Breaking Defense.")
        return extracted_headlines_list
    except Exception as error_message:
        print("      Warning: Could not fetch Breaking Defense RSS: " + str(error_message))
        return []


def fetch_foreign_affairs_specialized_topics():
    # We parse Foreign Affairs topic pages for defense, nuclear proliferation, and war strategy
    print("[6/8] Fetching specialized analysis from Foreign Affairs...")
    topic_urls_list = [
        "https://www.foreignaffairs.com/topics/defense-military",
        "https://www.foreignaffairs.com/topics/nuclear-weapons-proliferation",
        "https://www.foreignaffairs.com/topics/war-military-strategy"
    ]
    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    extracted_topics_list = []
    for url_index in range(len(topic_urls_list)):
        current_topic_url = topic_urls_list[url_index]
        try:
            http_response_object = requests.get(current_topic_url, headers=request_headers_dictionary, timeout=12)
            html_soup_parser = BeautifulSoup(http_response_object.text, "html.parser")
            article_links_collection = html_soup_parser.find_all("a", href=lambda href_val: href_val and "/articles/" in href_val)

            for link_index in range(len(article_links_collection)):
                current_link = article_links_collection[link_index]
                cleaned_title = current_link.get_text(strip=True)
                if len(cleaned_title) > 20 and cleaned_title not in extracted_topics_list:
                    extracted_topics_list.append(cleaned_title)
        except Exception:
            pass

    print("      Fetched " + str(len(extracted_topics_list)) + " specialized strategic essays from Foreign Affairs.")
    return extracted_topics_list


def fetch_international_wire_headlines():
    # We parse BBC World News wire RSS for breaking international diplomacy and regional conflicts
    print("[7/8] Fetching international wire headlines...")
    wire_feed_url = "https://feeds.bbci.co.uk/news/world/rss.xml"
    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    extracted_headlines_list = []
    try:
        http_response_object = requests.get(wire_feed_url, headers=request_headers_dictionary, timeout=12)
        xml_root_element = ElementTree.fromstring(http_response_object.content)
        channel_element = xml_root_element.find("channel")
        feed_items_list = channel_element.findall("item")

        for item_index in range(len(feed_items_list)):
            current_feed_item = feed_items_list[item_index]
            title_element = current_feed_item.find("title")
            if title_element is not None and title_element.text is not None:
                cleaned_headline_text = title_element.text.strip()
                if len(cleaned_headline_text) > 10 and len(extracted_headlines_list) < 15:
                    extracted_headlines_list.append(cleaned_headline_text)

        print("      Fetched " + str(len(extracted_headlines_list)) + " international wire headlines.")
        return extracted_headlines_list
    except Exception as error_message:
        print("      Warning: Could not fetch wire headlines: " + str(error_message))
        return []


def clean_dom_tags_and_markdown(text_string):
    # Remove [123]<div /> and similar DOM annotations injected by browser-use state serializer
    cleaned_string = re.sub(r'\[\d+\]<[^>]*>', '', text_string)
    cleaned_string = re.sub(r'\|\w+\([^)]*\)\|', '', cleaned_string)
    cleaned_string = re.sub(r'\*\s*', '', cleaned_string)
    return ' '.join(cleaned_string.split())


def parse_genuine_tweets_from_text(raw_page_state_text):
    # A genuine tweet on X always begins with an author display name and an '@' handle (e.g. @haniya_445, @creativesameeer).
    # We explicitly extract the full multi-line tweet body and filter out right-sidebar noise (e.g. GTA 6, DLSS, Entertainment).
    raw_lines_list = raw_page_state_text.split("\n")
    cleaned_lines_list = []
    for line_index in range(len(raw_lines_list)):
        cleaned_line = clean_dom_tags_and_markdown(raw_lines_list[line_index].strip())
        if len(cleaned_line) > 0:
            cleaned_lines_list.append(cleaned_line)

    extracted_tweets_list = []
    sidebar_noise_words = [
        "trending now", "what's happening", "gta 6", "dlss", "nvidia",
        "who to follow", "entertainment", "keyboard shortcuts", "view keyboard",
        "subscribe to premium", "terms of service", "privacy policy"
    ]

    current_line_pointer = 0
    total_lines_count = len(cleaned_lines_list)

    while current_line_pointer < total_lines_count:
        current_line_text = cleaned_lines_list[current_line_pointer]

        # Detect a valid Twitter handle starting with '@'
        is_user_handle = False
        if current_line_text.startswith("@") and len(current_line_text) > 2 and " " not in current_line_text:
            is_user_handle = True

        if is_user_handle:
            user_handle_string = current_line_text

            # The author's display name usually sits directly above the handle
            author_display_name = ""
            if current_line_pointer > 0:
                previous_line_text = cleaned_lines_list[current_line_pointer - 1]
                if not previous_line_text.startswith("@") and not previous_line_text.startswith("[") and len(previous_line_text) < 40:
                    author_display_name = previous_line_text

            # Advance past handle and timestamp indicators ('·', '20m', '1h', 'Replying to')
            tweet_body_pointer = current_line_pointer + 1
            while tweet_body_pointer < total_lines_count:
                peek_line = cleaned_lines_list[tweet_body_pointer]
                if peek_line == "·" or peek_line.endswith("m") or peek_line.endswith("h") or peek_line.endswith("s") or peek_line.isdigit() or "replying to" in peek_line.lower():
                    tweet_body_pointer = tweet_body_pointer + 1
                else:
                    break

            # Collect the full multi-line tweet text paragraphs
            tweet_body_lines_list = []
            while tweet_body_pointer < total_lines_count:
                candidate_line = cleaned_lines_list[tweet_body_pointer]

                # If this line is the next user's handle, stop
                if candidate_line.startswith("@") and " " not in candidate_line:
                    break

                # If the subsequent line is a handle, this current line is the next author's name, so stop
                if tweet_body_pointer + 1 < total_lines_count:
                    next_peek_line = cleaned_lines_list[tweet_body_pointer + 1]
                    if next_peek_line.startswith("@") and " " not in next_peek_line:
                        break

                # Stop if we hit any sidebar widgets or ads
                lower_candidate = candidate_line.lower()
                is_sidebar_noise = False
                for noise_index in range(len(sidebar_noise_words)):
                    if sidebar_noise_words[noise_index] in lower_candidate:
                        is_sidebar_noise = True
                        break
                if is_sidebar_noise:
                    break

                # Skip UI action buttons and metric counters
                if candidate_line in ["Reply", "Repost", "Like", "Bookmark", "Share"] or candidate_line.isdigit():
                    tweet_body_pointer = tweet_body_pointer + 1
                    continue

                tweet_body_lines_list.append(candidate_line)
                tweet_body_pointer = tweet_body_pointer + 1

                if len(tweet_body_lines_list) >= 10:
                    break

            # Join all lines into a clean full tweet body
            full_tweet_body_text = " ".join(tweet_body_lines_list).strip()

            if len(full_tweet_body_text) > 20:
                contains_noise = False
                lower_tweet = full_tweet_body_text.lower()
                for noise_index in range(len(sidebar_noise_words)):
                    if sidebar_noise_words[noise_index] in lower_tweet:
                        contains_noise = True
                        break

                if not contains_noise and full_tweet_body_text not in extracted_tweets_list:
                    if len(author_display_name) > 0:
                        formatted_tweet_string = f"[{author_display_name} | {user_handle_string}] {full_tweet_body_text}"
                    else:
                        formatted_tweet_string = f"[{user_handle_string}] {full_tweet_body_text}"
                    extracted_tweets_list.append(formatted_tweet_string)

            current_line_pointer = tweet_body_pointer
        else:
            current_line_pointer = current_line_pointer + 1

    return extracted_tweets_list


async def run_x_com_deep_trend_and_tweet_miner(target_country_name, target_country_slug, is_headless_enabled):
    # This function uses an active headful browser session so you can see Chrome on screen
    # 1. Opens https://x.com/explore/tabs/trending and extracts active live trends
    # 2. Selects top defense/geopolitical trends
    # 3. Navigates to search results and scrolls down to load full genuine tweets
    # 4. Uses parse_genuine_tweets_from_text to filter out sidebar noise and capture full tweet bodies
    print("")
    print("==================================================")
    print("[8/8] Mining Live Trends and Tweets Directly on X.com (Headful Browser)")
    print("==================================================")

    x_native_intel_dictionary = {
        "country": target_country_name,
        "trends_observed": [],
        "sample_tweets_by_trend": {}
    }

    # Open in headful mode (visible window) as requested so you can see exactly what is loaded
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

                # Scroll down twice to trigger dynamic tweet loading in the timeline
                print("      Scrolling down timeline to load fresh tweets...")
                try:
                    await browser_instance.scroll_down(800)
                    await asyncio.sleep(2)
                    await browser_instance.scroll_down(800)
                    await asyncio.sleep(2)
                except Exception:
                    pass

                search_state_text = await browser_instance.get_state_as_text()
                genuine_tweets_list = parse_genuine_tweets_from_text(search_state_text)

                print(f"      Extracted {len(genuine_tweets_list)} genuine tweets for: {current_trend_query}")
                for t_preview in genuine_tweets_list[:2]:
                    print(f"        -> {t_preview[:120]}...")

                x_native_intel_dictionary["sample_tweets_by_trend"][current_trend_query] = genuine_tweets_list[:15]
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
    print("Synthesizing 20 Keywords per Topic with Qwen3-14B")
    print("==================================================")

    defense_news_list = consolidated_intel_dictionary.get("defense_news_headlines", [])
    breaking_defense_list = consolidated_intel_dictionary.get("breaking_defense_headlines", [])
    dawn_news_list = consolidated_intel_dictionary.get("dawn_news_headlines", [])
    tribune_news_list = consolidated_intel_dictionary.get("tribune_news_headlines", [])
    foreign_affairs_list = consolidated_intel_dictionary.get("foreign_affairs_headlines", [])
    wire_news_list = consolidated_intel_dictionary.get("wire_news_headlines", [])
    trends24_list = consolidated_intel_dictionary.get("x_trends24_topics", [])
    x_native_data = consolidated_intel_dictionary.get("x_native_explore", {})

    digest_sections_list = []

    digest_sections_list.append("--- DAWN NEWS (NATIONAL SECURITY & WORLD) ---")
    for idx in range(len(dawn_news_list)):
        digest_sections_list.append("• " + dawn_news_list[idx])

    digest_sections_list.append("\n--- EXPRESS TRIBUNE HEADLINES ---")
    for idx in range(len(tribune_news_list)):
        digest_sections_list.append("• " + tribune_news_list[idx])

    digest_sections_list.append("\n--- DEFENSE NEWS HEADLINES ---")
    for idx in range(len(defense_news_list)):
        digest_sections_list.append("• " + defense_news_list[idx])

    digest_sections_list.append("\n--- BREAKING DEFENSE HEADLINES ---")
    for idx in range(len(breaking_defense_list)):
        digest_sections_list.append("• " + breaking_defense_list[idx])

    digest_sections_list.append("\n--- FOREIGN AFFAIRS SPECIALIZED TOPICS ---")
    for idx in range(len(foreign_affairs_list)):
        digest_sections_list.append("• " + foreign_affairs_list[idx])

    digest_sections_list.append("\n--- INTERNATIONAL WIRE NEWS HEADLINES ---")
    for idx in range(len(wire_news_list)):
        digest_sections_list.append("• " + wire_news_list[idx])

    digest_sections_list.append(f"\n--- X.COM CHATTER & TRENDS ({target_country_name.upper()}) ---")
    for idx in range(len(trends24_list)):
        digest_sections_list.append("• " + trends24_list[idx])

    # Include sample tweets heavily in the prompt
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
   - IMPORTANT: Notice and look for abbreviations and nicknames (e.g., "Visionary Field Marshal", "Great Man CDF", "امہ کی شان عاصم منیر", "مرد آہن فیلڈ مارشل"). They MUST be included in our keywords, in both lowercase as well as uppercase.
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
    dawn_news_headlines_list = fetch_dawn_news_headlines()
    tribune_news_headlines_list = fetch_tribune_news_headlines()
    defense_news_headlines_list = fetch_defense_news_headlines()
    breaking_defense_headlines_list = fetch_breaking_defense_headlines()
    foreign_affairs_topics_list = fetch_foreign_affairs_specialized_topics()
    wire_news_headlines_list = fetch_international_wire_headlines()

    # PHASE 2: Run X.com browser agent to inspect explore tabs and mine sample tweets
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
        "dawn_news_headlines": dawn_news_headlines_list,
        "tribune_news_headlines": tribune_news_headlines_list,
        "defense_news_headlines": defense_news_headlines_list,
        "breaking_defense_headlines": breaking_defense_headlines_list,
        "foreign_affairs_headlines": foreign_affairs_topics_list,
        "wire_news_headlines": wire_news_headlines_list,
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

    # PHASE 5: Format and save the final structured keywords
    final_output_structure = {
        "generated_at": current_iso_timestamp,
        "country": target_country_name,
        "sources_consulted": [
            "trends24",
            "x.com_native_explore_and_tweets",
            "dawn_news",
            "express_tribune",
            "defense_news",
            "breaking_defense",
            "foreign_affairs_specialized",
            "bbc_world_wire"
        ],
        "total_topics": len(synthesized_topics_list),
        "topics": synthesized_topics_list
    }

    country_output_filename = "keywords_" + target_country_slug + ".json"
    country_file_handle = open(country_output_filename, "w", encoding="utf-8")
    country_file_handle.write(json.dumps(final_output_structure, indent=2, ensure_ascii=False))
    country_file_handle.close()

    master_output_filename = "keywords_output.json"
    master_file_handle = open(master_output_filename, "w", encoding="utf-8")
    master_file_handle.write(json.dumps(final_output_structure, indent=2, ensure_ascii=False))
    master_file_handle.close()

    print("")
    print("==================================================")
    print("SUCCESS: Keyword Synthesis Finished")
    print("==================================================")
    print("Saved country output to: " + country_output_filename)
    print("Saved master output to:  " + master_output_filename)
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
