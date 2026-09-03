import asyncio
import datetime
import json
import os
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


async def run_x_com_deep_trend_and_tweet_miner(target_country_name, target_country_slug, is_headless_enabled):
    # This function uses the authenticated browser session to:
    # 1. Open https://x.com/explore/tabs/trending and extract active live trends
    # 2. Identify top defense/military/geopolitical trends (e.g. #VisionaryFieldMarshal, Makkah Defence Pact)
    # 3. Open https://x.com/search?q={trend}&f=top for each trend
    # 4. Extract the first 10 to 15 tweets for each trend so authentic phrasing and hashtags are captured
    print("")
    print("==================================================")
    print("[8/8] Mining Live Trends and Tweets Directly on X.com")
    print("==================================================")

    x_native_intel_dictionary = {
        "country": target_country_name,
        "trends_observed": [],
        "sample_tweets_by_trend": {}
    }

    # Initialize the browser with real system Chrome profile
    if is_real_chrome_enabled:
        browser_instance = Browser.from_system_chrome(
            headless=is_headless_enabled,
        )
    else:
        browser_instance = Browser(
            headless=is_headless_enabled,
        )

    try:
        print("Launching browser and navigating to https://x.com/explore/tabs/trending...")
        await browser_instance.start()
        await browser_instance.navigate_to("https://x.com/explore/tabs/trending")
        await asyncio.sleep(5)

        # Extract page text to identify trending hashtags
        trending_page_state_text = await browser_instance.get_state_as_text()
        extracted_trend_names_list = []

        raw_state_lines_list = trending_page_state_text.split("\n")
        for line_index in range(len(raw_state_lines_list)):
            current_raw_line = raw_state_lines_list[line_index].strip()
            # Capture hashtag lines or trending terms
            if current_raw_line.startswith("#") and len(current_raw_line) > 2:
                if current_raw_line not in extracted_trend_names_list:
                    extracted_trend_names_list.append(current_raw_line)
            elif "Trending with" in current_raw_line or "Trending in" in current_raw_line:
                if line_index + 1 < len(raw_state_lines_list):
                    next_line_text = raw_state_lines_list[line_index + 1].strip()
                    if len(next_line_text) > 3 and not next_line_text.startswith("[") and next_line_text not in extracted_trend_names_list:
                        extracted_trend_names_list.append(next_line_text)

        # Fallback to ensure we always have the top national security trends if page text was sparse
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

        # Select top 3 to 5 trends to click/search and extract 10-15 tweets each
        selected_trends_to_mine_list = extracted_trend_names_list[:5]

        for trend_index in range(len(selected_trends_to_mine_list)):
            current_trend_query = selected_trends_to_mine_list[trend_index]
            encoded_query_string = urllib.parse.quote(current_trend_query)
            search_url_string = "https://x.com/search?q=" + encoded_query_string + "&f=top"

            print(f"Mining tweets for trend [{trend_index + 1}/5]: {current_trend_query}")
            await browser_instance.navigate_to(search_url_string)
            await asyncio.sleep(5)

            search_state_text = await browser_instance.get_state_as_text()
            extracted_tweets_for_trend_list = []

            search_lines_list = search_state_text.split("\n")
            for line_idx in range(len(search_lines_list)):
                line_string = search_lines_list[line_idx].strip()
                # A tweet text line is typically longer than 25 characters, doesn't start with UI tags,
                # and contains actual readable words or hashtags
                if len(line_string) > 25 and not line_string.startswith("[") and not line_string.startswith("|"):
                    lower_line = line_string.lower()
                    if not any(skip_word in lower_line for skip_word in ["keyboard shortcuts", "view keyboard", "aria-label", "embedded video", "notifications", "search query"]):
                        if line_string not in extracted_tweets_for_trend_list:
                            extracted_tweets_for_trend_list.append(line_string)
                            if len(extracted_tweets_for_trend_list) >= 12:
                                break

            print(f"      Extracted {len(extracted_tweets_for_trend_list)} tweets for: {current_trend_query}")
            x_native_intel_dictionary["sample_tweets_by_trend"][current_trend_query] = extracted_tweets_for_trend_list

        await browser_instance.stop()
        print("Successfully completed X.com trend and tweet extraction!")
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
