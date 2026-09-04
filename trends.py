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
    # We fetch country or worldwide trending hashtags from trends24 with cache-busting to ensure 100% fresh data
    cache_buster_timestamp = int(datetime.datetime.now().timestamp())
    cleaned_slug = str(target_country_slug or "").strip().lower()
    if cleaned_slug == "" or cleaned_slug == "worldwide" or cleaned_slug == "global":
        target_webpage_url = f"https://trends24.in/?_ts={cache_buster_timestamp}"
    else:
        target_webpage_url = f"https://trends24.in/{cleaned_slug}/?_ts={cache_buster_timestamp}"
    print("[1] Fetching live X trends from trends24: " + target_webpage_url)

    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }

    try:
        http_response_object = requests.get(target_webpage_url, headers=request_headers_dictionary, timeout=15)
        http_response_object.encoding = "utf-8"

        html_soup_parser = BeautifulSoup(http_response_object.text, "html.parser")
        
        # Each hourly trend block is a div.list-container, ordered from newest to oldest
        list_containers_collection = html_soup_parser.find_all("div", class_="list-container")
        
        extracted_trending_topics_list = []
        for container_index in range(len(list_containers_collection)):
            current_container = list_containers_collection[container_index]
            ordered_list = current_container.find("ol")
            if ordered_list is None:
                continue
                
            list_items_collection = ordered_list.find_all("li")
            for item_index in range(len(list_items_collection)):
                current_list_item = list_items_collection[item_index]
                anchor_element = current_list_item.find("a")
                if anchor_element is not None:
                    cleaned_topic_text = anchor_element.get_text(strip=True)
                else:
                    cleaned_topic_text = current_list_item.get_text(strip=True)
                    
                if len(cleaned_topic_text) > 0 and cleaned_topic_text not in extracted_trending_topics_list:
                    extracted_trending_topics_list.append(cleaned_topic_text)
                    if len(extracted_trending_topics_list) >= 40:
                        break
                        
            if len(extracted_trending_topics_list) >= 40:
                break

        print("    Fetched " + str(len(extracted_trending_topics_list)) + " fresh trending topics from trends24.")
        return extracted_trending_topics_list
    except Exception as error_message:
        print("    Warning: Could not fetch trends24: " + str(error_message))
        return []


def is_bot_challenge_text(text_string):
    # Checks if text contains Cloudflare or bot verification challenge keywords
    lowercased_text_string = text_string.lower()
    bot_challenge_indicator_phrases = [
        "security verification",
        "protect against malicious bots",
        "verifies you are not a bot",
        "cloudflare",
        "performance and security by",
        "ray id",
        "just a moment",
        "attention required",
        "enable javascript and cookies",
        "checking your browser",
        "ddos protection",
        "verify you are human",
        "challenge-platform",
        "security service to protect",
        "svg content collapsed"
    ]
    for indicator_phrase in bot_challenge_indicator_phrases:
        if indicator_phrase in lowercased_text_string:
            return True
    return False


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
                            if len(cleaned_headline) > 10 and not is_bot_challenge_text(cleaned_headline) and len(extracted_headlines_list) < 20:
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
                        # Skip Cloudflare or bot verification challenge text
                        if is_bot_challenge_text(heading_text):
                            continue

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

        # If zero headlines were extracted and this is Dawn News, use Dawn's official RSS feed
        if len(extracted_headlines_list) == 0 and "dawn.com" in source_url:
            print("        -> Dawn News web blocked or empty. Attempting Dawn official RSS feed fallback (https://www.dawn.com/feed)...")
            try:
                dawn_rss_response = requests.get("https://www.dawn.com/feed", headers=request_headers_dictionary, timeout=12)
                dawn_xml_root = ElementTree.fromstring(dawn_rss_response.content)
                dawn_channel = dawn_xml_root.find("channel")
                if dawn_channel is not None:
                    dawn_items = dawn_channel.findall("item")
                    for dawn_item_index in range(len(dawn_items)):
                        dawn_item = dawn_items[dawn_item_index]
                        dawn_title = dawn_item.find("title")
                        if dawn_title is not None and dawn_title.text is not None:
                            dawn_headline = dawn_title.text.strip()
                            if len(dawn_headline) > 10 and not is_bot_challenge_text(dawn_headline):
                                if dawn_headline not in extracted_headlines_list and len(extracted_headlines_list) < 20:
                                    extracted_headlines_list.append(dawn_headline)
                    if len(extracted_headlines_list) > 0:
                        print(f"        -> [Dawn RSS Fallback SUCCESS] Harvested {len(extracted_headlines_list)} clean headlines.")
            except Exception as dawn_rss_error:
                print(f"        -> [Dawn RSS Fallback Notice] Could not fetch Dawn RSS: {dawn_rss_error}")

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


STRATEGIC_DEFENSE_INDICATORS = [
    # Military branches, command & defense institutions
    "defense", "defence", "military", "army", "navy", "airforce", "air force",
    "marines", "armed forces", "corps", "brigade", "pentagon", "ministry of defense",
    "general", "admiral", "command", "frontline", "airbase", "garrison", "troops",
    
    # Weapons, systems & military technology
    "missile", "ballistic", "hypersonic", "cruise missile", "nuclear", "warhead",
    "uranium", "enrichment", "drone", "uav", "unmanned", "fighter jet", "stealth",
    "aircraft carrier", "warship", "destroyer", "frigate", "submarine",
    "air defense", "patriot", "thaad", "s-300", "s-400", "s-500", "iron dome",
    "artillery", "ammunition", "radar", "electronic warfare", "weapons", "arms deal",
    
    # Foreign policy, diplomacy, treaties & international pacts
    "foreign policy", "diplomacy", "diplomat", "ambassador", "foreign minister",
    "foreign ministry", "state department", "treaty", "pact", "accord", "agreement",
    "alliance", "bilateral", "trilateral", "multilateral", "summit", "sovereignty",
    "sanctions", "embargo", "boycott", "unsc", "security council",
    
    # Strategic alliances & coalitions
    "nato", "aukus", "quad", "csto", "brics", "sco", "makkah pact", "mecca pact",
    "abraham accords",
    
    # Strategic straits, waterways & conflict hotspots
    "hormuz", "strait", "taiwan", "gaza", "rafah", "west bank", "israel", "idf",
    "hamas", "hezbollah", "lebanon", "iran", "irgc", "yemen", "houthi", "red sea",
    "ukraine", "russia", "kyiv", "moscow", "crimea", "donbas", "kursk",
    "south china sea", "indo-pacific", "baltic", "black sea", "kashmir", "narowal", "loc",
    
    # Conflict, deterrence & strategic operations
    "warfare", "conflict", "escalation", "retaliation", "strike", "airstrike",
    "deterrence", "ceasefire", "drills", "exercise", "naval drills", "combat",
    "counterterrorism", "intelligence", "geopolitics"
]

ENTERTAINMENT_SPORTS_NOISE = [
    "cricket", "football", "soccer", "ipl", "world cup", "worldcup", "match",
    "tournament", "album", "song", "music", "trailer", "movie", "cinema",
    "boxoffice", "actor", "actress", "episode", "season", "drama", "biggboss",
    "birthday", "hbd", "sale", "discount", "fashion", "gaming", "game", "gamer",
    "bollywood", "hollywood", "horoscope", "comedy", "meme"
]


def is_strategic_or_defense_trend(trend_text_string):
    # Evaluates if a trend string belongs strictly to defense, military, foreign policy, or geopolitics
    cleaned_trend_text = trend_text_string.lower().replace("#", " ").replace("_", " ")

    # Reject entertainment, sports, and casual noise immediately
    for noise_phrase in ENTERTAINMENT_SPORTS_NOISE:
        if noise_phrase in cleaned_trend_text:
            return False

    # Match against strategic domain indicators
    for strategic_indicator in STRATEGIC_DEFENSE_INDICATORS:
        if strategic_indicator in cleaned_trend_text:
            return True

    return False


def filter_trends_relevant_to_news(all_trends_list, news_sources_dictionary):
    # Cross-references the full list of Trends24 topics with the hot news headlines
    # Filters Trends24 topics to retain only those strictly relevant to defense, military, foreign policy, and geopolitics
    relevant_trends_list = []

    # First pass: check direct strategic indicators and filter out noise
    for trend_index in range(len(all_trends_list)):
        current_trend = all_trends_list[trend_index]
        if is_strategic_or_defense_trend(current_trend):
            if current_trend not in relevant_trends_list:
                relevant_trends_list.append(current_trend)

    # Second pass: check overlap with strategic tokens from authoritative news headlines
    strategic_news_tokens = set()
    for source_name in news_sources_dictionary:
        headlines_list = news_sources_dictionary[source_name]
        for headline in headlines_list:
            cleaned_headline = headline.lower()
            for punctuation_char in [",", ".", ":", ";", "'", '"', "(", ")", "[", "]", "!", "?", "-", "/", "\\"]:
                cleaned_headline = cleaned_headline.replace(punctuation_char, " ")
            headline_words = cleaned_headline.split()
            for word in headline_words:
                if len(word) > 3 and is_strategic_or_defense_trend(word):
                    strategic_news_tokens.add(word)

    for trend_index in range(len(all_trends_list)):
        current_trend = all_trends_list[trend_index]
        cleaned_trend = current_trend.lower().replace("#", " ").replace("_", " ")
        trend_words = cleaned_trend.split()
        for trend_word in trend_words:
            if trend_word in strategic_news_tokens:
                if current_trend not in relevant_trends_list:
                    relevant_trends_list.append(current_trend)
                break

    return relevant_trends_list


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
            if is_bot_challenge_text(cleaned_line):
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


def validate_tweet_date_margin(cleaned_lines, reference_date=None):
    # Strictly enforces a 10-day date margin: [Today - 10 days, Today].
    # Rejects tweets from past historical years (e.g. 2010 through previous year),
    # relative dates older than 10 days (e.g. 11d, 30d), and older months outside the 10-day window.
    if reference_date is None:
        reference_date = datetime.date.today()

    current_year_number = reference_date.year

    # 1. Immediate rejection for past historical years (e.g. 2010 through current_year - 1)
    for past_year_int in range(2010, current_year_number):
        past_year_str = str(past_year_int)
        for check_index in range(min(8, len(cleaned_lines))):
            if past_year_str in cleaned_lines[check_index]:
                return False, ""

    # Build the set of acceptable month-day strings for the last 10 days
    acceptable_date_strings = []
    for day_offset in range(11):
        target_day = reference_date - datetime.timedelta(days=day_offset)
        month_abbr = target_day.strftime("%b").lower()
        month_full = target_day.strftime("%B").lower()
        day_num = str(target_day.day)
        day_pad = target_day.strftime("%d")

        acceptable_date_strings.append(f"{month_abbr} {day_num}")
        acceptable_date_strings.append(f"{month_abbr} {day_pad}")
        acceptable_date_strings.append(f"{month_full} {day_num}")

    month_names_list = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

    detected_date_label = ""

    # Check header lines where timestamp tokens live
    for line_index in range(min(6, len(cleaned_lines))):
        current_line = cleaned_lines[line_index].strip()
        lower_line = current_line.lower()

        # Relative seconds, minutes, hours -> posted today
        if re.match(r'^\d+[smh]$', lower_line):
            detected_date_label = current_line
            return True, detected_date_label

        # Relative days: "1d" through "10d"
        day_match = re.match(r'^(\d+)d$', lower_line)
        if day_match:
            days_count = int(day_match.group(1))
            if days_count <= 10:
                detected_date_label = current_line
                return True, detected_date_label
            else:
                return False, ""

        # Explicit acceptable month-day strings
        for acceptable_date in acceptable_date_strings:
            if acceptable_date in lower_line:
                detected_date_label = current_line
                return True, detected_date_label

        # Check if an older month outside the window is mentioned
        for month_name in month_names_list:
            if re.search(r'\b' + month_name + r'[a-z]*\s+\d{1,2}\b', lower_line):
                return False, ""

    # Check for dot separator lines e.g. "· 2h" or "· 5d"
    for line_index in range(min(6, len(cleaned_lines))):
        current_line = cleaned_lines[line_index]
        if "·" in current_line:
            parts = current_line.split("·")
            for part in parts:
                cleaned_part = part.strip().lower()
                if re.match(r'^\d+[smh]$', cleaned_part):
                    return True, part.strip()
                day_match = re.match(r'^(\d+)d$', cleaned_part)
                if day_match:
                    if int(day_match.group(1)) <= 10:
                        return True, part.strip()
                    else:
                        return False, ""
                for acceptable_date in acceptable_date_strings:
                    if acceptable_date in cleaned_part:
                        return True, part.strip()

    return True, detected_date_label


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

            # Strictly enforce date margin: only tweets from Today down to 10 days ago
            is_valid_date, detected_tweet_date = validate_tweet_date_margin(cleaned_lines)
            if not is_valid_date:
                continue

            # Ensure tweet has substantial content and no sidebar follow widgets
            lower_body = combined_body_text.lower()
            if lower_body.startswith("follow ") or ("follow " in lower_body and len(combined_body_text) < 40):
                continue

            if len(combined_body_text) > 15:
                date_tag = f" | {detected_tweet_date}" if len(detected_tweet_date) > 0 else ""
                if len(author_display_name) > 0 and "svg" not in author_display_name.lower():
                    formatted_tweet = f"[{author_display_name} | {user_handle_string}{date_tag}] {combined_body_text}"
                else:
                    formatted_tweet = f"[{user_handle_string}{date_tag}] {combined_body_text}"

                if formatted_tweet not in parsed_tweets:
                    parsed_tweets.append(formatted_tweet)

    return parsed_tweets


async def run_x_com_deep_trend_and_tweet_miner(target_country_name, target_country_slug, is_headless_enabled, trends24_topics_list=None, topics_with_boolean_queries_list=None):
    # This function uses an active headful browser session so you can see Chrome on screen
    # 1. Opens https://x.com/explore/tabs/trending and extracts active live trends
    # 2. Mines tweets using news-derived Boolean queries or top defense/geopolitical trends
    # 3. Navigates to search results using &f=live (Latest tab) and scrolls until AT LEAST 20 fresh tweets are collected
    # 4. Uses extract_tweets_from_article_chunks to isolate tweets and reject historical past-year tweets
    print("")
    print("==================================================")
    print("[4] Mining Latest Tweets on X.com via Boolean Queries (Headful Browser)")
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

        if trends24_topics_list is None:
            trends24_topics_list = []

        ui_noise_blacklist = [
            "what's happening",
            "trending",
            "show more",
            "follow",
            "who to follow",
            "terms of service",
            "privacy policy",
            "cookie policy",
            "accessibility",
            "ads info",
            "more",
            "posts",
            "explore",
            "entertainment",
            "sports",
            "news",
            "only on x"
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
                    has_noise = False
                    for noise_word in ui_noise_blacklist:
                        if noise_word in lowered_text:
                            has_noise = True
                            break
                    if len(next_line_text) > 2 and not next_line_text.startswith("[") and not has_noise:
                        if next_line_text not in extracted_trend_names_list:
                            extracted_trend_names_list.append(next_line_text)

        # Merge in the latest freshly harvested trends24 topics so we always have the freshest country trends
        for live_trend_item in trends24_topics_list:
            if live_trend_item not in extracted_trend_names_list:
                extracted_trend_names_list.append(live_trend_item)

        x_native_intel_dictionary["trends_observed"] = extracted_trend_names_list
        print("Discovered " + str(len(extracted_trend_names_list)) + " trending topics on X.com.")
        print("Sample trends: " + ", ".join(extracted_trend_names_list[:6]))
        print("")

        # Step A: Identify relevant defense & foreign policy trending hashtags directly on X.com
        relevant_x_hashtags_to_mine = []
        for candidate_trend in extracted_trend_names_list:
            if is_strategic_or_defense_trend(candidate_trend):
                if candidate_trend not in relevant_x_hashtags_to_mine:
                    relevant_x_hashtags_to_mine.append(candidate_trend)
                    if len(relevant_x_hashtags_to_mine) >= 4:
                        break

        # Fallback to relevant Trends24 defense topics if X explore had few explicit defense hashtags right now
        if len(relevant_x_hashtags_to_mine) < 3 and trends24_topics_list is not None:
            for trend24_item in trends24_topics_list:
                if is_strategic_or_defense_trend(trend24_item):
                    if trend24_item not in relevant_x_hashtags_to_mine:
                        relevant_x_hashtags_to_mine.append(trend24_item)
                        if len(relevant_x_hashtags_to_mine) >= 4:
                            break

        if len(relevant_x_hashtags_to_mine) > 0:
            preview_hashtags_str = ", ".join(relevant_x_hashtags_to_mine)
            print(f"Identified {len(relevant_x_hashtags_to_mine)} relevant defense/foreign policy hashtags on X: {preview_hashtags_str}")
        else:
            print("No explicit defense hashtags on X explore at this moment; proceeding to news Boolean queries.")

        # Step B: Mine fresh tweets from each relevant X trending hashtag
        for hashtag_index in range(len(relevant_x_hashtags_to_mine)):
            current_hashtag = relevant_x_hashtags_to_mine[hashtag_index]
            encoded_hashtag = urllib.parse.quote(current_hashtag)
            hashtag_search_url = f"https://x.com/search?q={encoded_hashtag}&f=live"

            print(f"Mining latest tweets for X trending hashtag [{hashtag_index + 1}/{len(relevant_x_hashtags_to_mine)}]: {current_hashtag}")
            try:
                await browser_instance.navigate_to(hashtag_search_url)
                await asyncio.sleep(4)

                collected_tweets_for_hashtag = []
                for scroll_round in range(12):
                    page_state_text = await browser_instance.get_state_as_text()
                    fresh_batch_tweets = extract_tweets_from_article_chunks(page_state_text)

                    for tweet_item in fresh_batch_tweets:
                        if tweet_item not in collected_tweets_for_hashtag:
                            collected_tweets_for_hashtag.append(tweet_item)

                    print(f"      Hashtag scroll {scroll_round + 1}: {len(collected_tweets_for_hashtag)} fresh tweets collected so far...")

                    if len(collected_tweets_for_hashtag) >= 20:
                        break

                    try:
                        scroll_action_event = browser_instance.event_bus.dispatch(
                            ScrollEvent(direction="down", amount=1200)
                        )
                        await scroll_action_event
                        await asyncio.sleep(2)
                    except Exception:
                        break

                print(f"      -> Successfully extracted {len(collected_tweets_for_hashtag)} fresh tweets for hashtag: {current_hashtag}")
                x_native_intel_dictionary["sample_tweets_by_trend"][current_hashtag] = collected_tweets_for_hashtag[:25]
            except Exception as hashtag_error:
                print(f"      Notice: Skipping hashtag due to error: {hashtag_error}")

            await asyncio.sleep(2)

        # Step C: Derive and mine news-derived Boolean queries synthesized by LLM
        queries_to_mine_list = []
        if topics_with_boolean_queries_list is not None and len(topics_with_boolean_queries_list) > 0:
            for topic_candidate_item in topics_with_boolean_queries_list:
                boolean_query_candidate = topic_candidate_item.get("boolean_query", "").strip()
                if len(boolean_query_candidate) == 0:
                    boolean_query_candidate = topic_candidate_item.get("label", "").strip()
                if len(boolean_query_candidate) > 0 and boolean_query_candidate not in queries_to_mine_list:
                    queries_to_mine_list.append(boolean_query_candidate)
                    if len(queries_to_mine_list) >= 5:
                        break

        if len(queries_to_mine_list) == 0:
            normalized_country_name = target_country_name.strip().lower()
            if normalized_country_name in ["worldwide", "global", "all"]:
                targeted_fallback_queries = [
                    '"defense pact" OR "military agreement" OR "security alliance"',
                    '"foreign policy" OR "bilateral security" OR "defense treaty"',
                    '"joint military exercise" OR "air defense" OR "naval drills"',
                    '"arms deal" OR "weapons procurement" OR "defense modernization"',
                    '"maritime security" OR "strait security" OR "regional conflict"'
                ]
            else:
                targeted_fallback_queries = [
                    f'"{target_country_name} defense pact" OR "{target_country_name} military agreement"',
                    f'"{target_country_name} foreign policy" OR "{target_country_name} strategic alliance"',
                    f'"{target_country_name} armed forces" OR "{target_country_name} defense modernization"',
                    f'"{target_country_name} joint military exercise" OR "{target_country_name} security treaty"',
                    f'"{target_country_name} border security" OR "{target_country_name} defense bilateral"'
                ]
            for fallback_query in targeted_fallback_queries:
                if len(queries_to_mine_list) < 5 and fallback_query not in queries_to_mine_list:
                    queries_to_mine_list.append(fallback_query)

        print(f"Mining latest tweets for {len(queries_to_mine_list)} news-derived Boolean queries...")

        for query_index in range(len(queries_to_mine_list)):
            current_trend_query = queries_to_mine_list[query_index]
            encoded_query_string = urllib.parse.quote(current_trend_query)
            search_url_string = "https://x.com/search?q=" + encoded_query_string + "&f=live"

            print(f"Mining latest tweets for Boolean query [{query_index + 1}/{len(queries_to_mine_list)}]: {current_trend_query}")
            try:
                await browser_instance.navigate_to(search_url_string)
                await asyncio.sleep(4)

                collected_tweets_for_trend = []
                for scroll_round in range(12):
                    page_state_text = await browser_instance.get_state_as_text()
                    fresh_batch_tweets = extract_tweets_from_article_chunks(page_state_text)

                    for tweet_item in fresh_batch_tweets:
                        if tweet_item not in collected_tweets_for_trend:
                            collected_tweets_for_trend.append(tweet_item)

                    print(f"      Scroll round {scroll_round + 1}: {len(collected_tweets_for_trend)} fresh tweets collected so far...")

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

                print(f"      -> Successfully extracted {len(collected_tweets_for_trend)} fresh tweets for Boolean query: {current_trend_query}")
                for preview_index in range(min(2, len(collected_tweets_for_trend))):
                    print(f"         {preview_index + 1}. {collected_tweets_for_trend[preview_index][:120]}...")

                x_native_intel_dictionary["sample_tweets_by_trend"][current_trend_query] = collected_tweets_for_trend[:25]
            except Exception as trend_error:
                print(f"      Notice: Skipping query due to network timeout: {trend_error}")

            await asyncio.sleep(2)

        await browser_instance.stop()
        print("Successfully completed headful X.com tweet extraction using Latest tab!")
    except Exception as browser_error:
        print("Notice: X.com browser inspection encountered: " + str(browser_error))
        try:
            await browser_instance.stop()
        except Exception:
            pass

    return x_native_intel_dictionary


def synthesize_topics_from_news_and_trends(target_country_name, news_sources_intel_dictionary, relevant_trends_list):
    # This function synthesizes 10 to 12 strategic topics directly from authoritative news headlines,
    # enriched by confirmed news-relevant X trends, and formulates high-precision Boolean search queries for each topic.
    print("")
    print("==================================================")
    print("[3] Synthesizing News-Derived Topics & Boolean X Queries with Qwen3-14B")
    print("==================================================")

    digest_sections_list = []

    # Ingest all authoritative news headlines first (Ground Truth)
    for source_name_key in news_sources_intel_dictionary:
        headlines_list = news_sources_intel_dictionary[source_name_key]
        if len(headlines_list) > 0:
            digest_sections_list.append(f"\n--- AUTHORITATIVE NEWS SOURCE: {source_name_key.upper()} ---")
            for headline_index in range(len(headlines_list)):
                digest_sections_list.append("• " + headlines_list[headline_index])

    # Ingest confirmed news-relevant trending topics
    if len(relevant_trends_list) > 0:
        digest_sections_list.append(f"\n--- CONFIRMED NEWS-RELEVANT X TRENDS ({target_country_name.upper()}) ---")
        for trend_index in range(len(relevant_trends_list)):
            digest_sections_list.append("• " + relevant_trends_list[trend_index])

    full_intel_digest_string = "\n".join(digest_sections_list)

    system_and_user_prompt = f"""You are the Chief Worldwide Geopolitical & Defense Intelligence Specialist and Social Search Keyword Engineer.
Analyze the following multi-source news and intelligence dossier for the target scope: {target_country_name} (Worldwide & International Strategic Scope).

INTELLIGENCE DOSSIER (GLOBAL HEADLINES, RSS FEEDS, AND NEWS-RELEVANT TRENDS):
{full_intel_digest_string}

CORE MISSION OBJECTIVES:
The primary directive is to synthesize hot, breaking, and critically important WORLDWIDE news topics and generate actionable keyword tracking matrices and precise Boolean search queries.
The topics MUST BE DERIVED DIRECTLY FROM THE NEWS HEADLINES. Discard unrelated social gossip, memes, domestic partisan squabbles, entertainment, and sports. Focus on high-impact global coverage across Europe, North America, the Indo-Pacific, Middle East, and Eurasia.

TOPIC SELECTION DIRECTIVES - STRICTLY PRIORITIZE:
1. FOREIGN & GLOBAL POLICIES:
   - Major diplomatic agreements, bilateral and multilateral strategic partnerships, foreign ministry negotiations.
   - International summits (UN, G7, BRICS, SCO, ASEAN), high-level state delegations, and diplomatic accords.
   - International sanctions regimes, export controls on critical tech, and diplomatic sovereignty disputes.

2. DEFENSE & MILITARY STRATEGY:
   - Armed forces modernization programs, military doctrine shifts, and force deployments.
   - Naval task forces, carrier strike groups, air defense interceptor deployments, and frontline military posture.
   - Joint multinational military exercises, combat drills, and defense readiness maneuvers.
   - Defense budget allocations, defense industrial base capacity, and major arms trade deals.

3. GLOBAL AGREEMENTS & DEFENSE PACTS TO STRENGTHEN DEFENSE:
   - Mutual defense treaties, bilateral security pacts, and collective security alliances (e.g., NATO expansions/initiatives, AUKUS Pillar 1 & 2 developments, Quad defense pacts, CSTO accords, Gulf security pacts).
   - Bilateral military cooperation pacts, intelligence-sharing frameworks, and mutual logistics support agreements.
   - International defense technology sharing, co-development agreements, and defense procurement accords.

4. STRATEGIC DETERRENCE & EMERGING WARFARE TECH:
   - Nuclear non-proliferation, nuclear modernization, and strategic deterrence posture.
   - Hypersonic missile systems, integrated air and missile defense (IAMD), and anti-satellite (ASAT) capabilities.
   - Military artificial intelligence (AI), autonomous drone swarms (UAV/USV), electronic warfare (EW), and cyber defense.

5. REGIONAL CONFLICT FLASHPOINTS & MARITIME CHOKEPOINTS:
   - Freedom of navigation operations, strait security (Hormuz, Bab-el-Mandeb, Malacca, Taiwan Strait, Black Sea).
   - Border security operations, cross-border escalation dynamics, and counter-terrorism military campaigns.

KEYWORD & BOOLEAN QUERY REQUIREMENTS:
1. Generate between 10 to 12 distinct, high-priority strategic topics based on the ingested news.
2. For EACH topic, provide:
   - "boolean_query": Formulate an exact, high-precision Boolean search query formatted for X.com (Twitter) search using quotation marks and OR logic, e.g.:
     ("NATO" OR "Article 5") ("Eastern Flank" OR "deterrence")
     ("AUKUS" OR "Hypersonic") ("defense pact" OR "Indo-Pacific")
     ("Strait of Hormuz" OR "Red Sea") ("maritime security" OR "naval escort")
   - "terms": Array of EXACTLY 15 CRISP, HIGH-IMPACT search keywords and phrases (official treaty/pact names, commanders, weapons systems, hashtags, regional terminology). NO generic fluff, keep each keyword crisp, punchy, and highly targeted.

OUTPUT FORMAT:
Respond ONLY with a valid, clean JSON array of objects. Do NOT include markdown backticks (```json), thinking reasoning, or preamble text.
Each object must have these exact keys:
- "label": Short, descriptive title of the news topic or defense development
- "category": Exactly one of "defense", "diplomacy", "politics", "economic"
- "boolean_query": High-precision Boolean search query formatted for X.com search
- "terms": Array of exactly 15 crisp keyword and search phrase strings

Representative example structure:
[
  {{
    "label": "NATO Collective Defense and Eastern Flank Modernization",
    "category": "defense",
    "boolean_query": "(\\"NATO\\" OR \\"Article 5\\") (\\"Eastern Flank\\" OR \\"deterrence\\")",
    "terms": [
      "NATO Collective Defense", "Article 5 NATO", "NATO Eastern Flank", "NATO Defense Spending 2%",
      "Rapid Reaction Force", "NATO Joint Drills", "Steadfast Defender", "NATO Summit 2026",
      "Mark Rutte NATO", "European Deterrence Initiative", "NATO Air Shielding", "Patriot Missile Deployment",
      "Baltic Defense Line", "Suwalki Gap Security", "#NATOSummit"
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

    parsed_topics_list = []
    try:
        parsed_topics_list = json.loads(cleaned_json_text)
    except Exception:
        first_bracket_index = cleaned_json_text.find("[")
        last_bracket_index = cleaned_json_text.rfind("]")
        if first_bracket_index != -1 and last_bracket_index != -1:
            bracket_substring = cleaned_json_text[first_bracket_index:last_bracket_index + 1]
            try:
                parsed_topics_list = json.loads(bracket_substring)
            except Exception:
                pass

    # Ensure every topic has a valid boolean_query and strictly cap at 15 crisp keywords
    for topic_index in range(len(parsed_topics_list)):
        topic_item = parsed_topics_list[topic_index]
        existing_boolean_query = topic_item.get("boolean_query", "").strip()
        topic_terms = topic_item.get("terms", [])

        # Cap strictly at 15 crisp keywords
        topic_item["terms"] = topic_terms[:15]

        if len(existing_boolean_query) == 0:
            if len(topic_terms) >= 2:
                topic_item["boolean_query"] = f'("{topic_terms[0]}" OR "{topic_terms[1]}") ("defense" OR "policy")'
            elif len(topic_terms) == 1:
                topic_item["boolean_query"] = f'"{topic_terms[0]}"'
            else:
                topic_item["boolean_query"] = f'"{topic_item.get("label", target_country_name)}"'

    return parsed_topics_list


def synthesize_keywords_with_llm(target_country_name, consolidated_intel_dictionary):
    # Compatibility wrapper that delegates to synthesize_topics_from_news_and_trends
    news_intel = consolidated_intel_dictionary.get("news_sources_intel", {})
    relevant_trends = consolidated_intel_dictionary.get("relevant_trends24_topics", [])
    if len(relevant_trends) == 0:
        relevant_trends = consolidated_intel_dictionary.get("x_trends24_topics", [])

    return synthesize_topics_from_news_and_trends(target_country_name, news_intel, relevant_trends)


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

    # PHASE 1: Ingest ground truth news headlines first from configured sources
    print("[1] Ingesting Authoritative News Headlines...")
    configured_sources_list = load_sources_configuration_file()
    news_sources_intel_dictionary = fetch_headlines_from_configured_sources(configured_sources_list)

    # PHASE 2: Ingest all trends from Trends24, then filter for news-relevant trends
    print("[2] Ingesting All Trends24 Topics & Filtering for News-Relevance...")
    all_trends24_topics_list = fetch_trends24_topics(target_country_slug)
    relevant_trends24_topics_list = filter_trends_relevant_to_news(
        all_trends24_topics_list, news_sources_intel_dictionary
    )
    print(f"    Total Trends24 topics captured: {len(all_trends24_topics_list)}")
    print(f"    News-relevant trends filtered: {len(relevant_trends24_topics_list)}")
    if len(relevant_trends24_topics_list) > 0:
        print("    Sample relevant trends: " + ", ".join(relevant_trends24_topics_list[:5]))

    # PHASE 3: Synthesize news-derived topics and high-precision Boolean X queries
    synthesized_topics_list = synthesize_topics_from_news_and_trends(
        target_country_name, news_sources_intel_dictionary, relevant_trends24_topics_list
    )

    # PHASE 4: Mine X.com using the generated Boolean queries & fetch LATEST tweets (&f=live)
    x_native_intel_dictionary = asyncio.run(
        run_x_com_deep_trend_and_tweet_miner(
            target_country_name,
            target_country_slug,
            is_headless_mode_enabled,
            trends24_topics_list=relevant_trends24_topics_list,
            topics_with_boolean_queries_list=synthesized_topics_list
        )
    )

    # Attach collected fresh tweets to their corresponding topics
    sample_tweets_map = x_native_intel_dictionary.get("sample_tweets_by_trend", {})
    for topic_index in range(len(synthesized_topics_list)):
        topic_item = synthesized_topics_list[topic_index]
        topic_boolean_query = topic_item.get("boolean_query", "")
        if topic_boolean_query in sample_tweets_map:
            topic_item["sample_tweets"] = sample_tweets_map[topic_boolean_query]

    # PHASE 5: Consolidate and persist raw intelligence and structured keywords
    current_iso_timestamp = datetime.datetime.now().isoformat()
    consolidated_raw_sources_data = {
        "country": target_country_name,
        "slug": target_country_slug,
        "collected_at": current_iso_timestamp,
        "all_trends24_topics": all_trends24_topics_list,
        "relevant_trends24_topics": relevant_trends24_topics_list,
        "x_trends24_topics": relevant_trends24_topics_list,
        "news_sources_intel": news_sources_intel_dictionary,
        "x_native_explore": x_native_intel_dictionary
    }

    raw_sources_filename = "raw_sources.json"
    raw_file_handle = open(raw_sources_filename, "w", encoding="utf-8")
    raw_file_handle.write(json.dumps(consolidated_raw_sources_data, indent=2, ensure_ascii=False))
    raw_file_handle.close()
    print("")
    print("Saved consolidated raw intelligence to: " + raw_sources_filename)

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
    print("SUCCESS: Pipeline Finished")
    print("==================================================")
    print("Saved output to: " + keywords_output_filename)
    print("Total high-precision topics generated: " + str(len(synthesized_topics_list)))
    print("==================================================")
    print("")

    # Display the final generated topics with their Boolean query and keywords
    for topic_index in range(len(synthesized_topics_list)):
        current_topic_item = synthesized_topics_list[topic_index]
        topic_label = current_topic_item.get("label", "Unknown")
        topic_category = current_topic_item.get("category", "general")
        topic_boolean_query = current_topic_item.get("boolean_query", "")
        topic_terms = current_topic_item.get("terms", [])

        print(f"{topic_index + 1}. [{topic_category.upper()}] {topic_label} ({len(topic_terms)} keywords)")
        print(f"   Boolean Query: {topic_boolean_query}")
        print(f"   Keywords: {', '.join(topic_terms[:8])}...")
        print("")


if __name__ == "__main__":
    run_country_hot_news_pipeline()

