import asyncio
import datetime
import json
import os
import sys
import xml.etree.ElementTree as ElementTree
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import requests
from browser_use import Agent, Browser
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
    print("[1/5] Fetching X trends from trends24: " + target_webpage_url)

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


def fetch_defense_news_headlines():
    # We parse the official Defense News RSS feed for breaking military procurement and defense posture
    print("[2/5] Fetching breaking headlines from Defense News...")
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
    print("[3/5] Fetching breaking headlines from Breaking Defense...")
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


def fetch_foreign_affairs_topics():
    # We parse Foreign Affairs defense & military topic page for strategic international policy themes
    print("[4/5] Fetching strategic topics from Foreign Affairs...")
    foreign_affairs_url = "https://www.foreignaffairs.com/topics/defense-military"
    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    extracted_topics_list = []
    try:
        http_response_object = requests.get(foreign_affairs_url, headers=request_headers_dictionary, timeout=12)
        html_soup_parser = BeautifulSoup(http_response_object.text, "html.parser")
        article_links_collection = html_soup_parser.find_all("a", href=lambda href_value: href_value and "/articles/" in href_value)

        for link_index in range(len(article_links_collection)):
            current_article_link = article_links_collection[link_index]
            cleaned_title_text = current_article_link.get_text(strip=True)
            # Filter out short labels, menu texts, or duplicates
            if len(cleaned_title_text) > 20 and cleaned_title_text not in extracted_topics_list and len(extracted_topics_list) < 12:
                extracted_topics_list.append(cleaned_title_text)

        print("      Fetched " + str(len(extracted_topics_list)) + " strategic articles from Foreign Affairs.")
        return extracted_topics_list
    except Exception as error_message:
        print("      Warning: Could not fetch Foreign Affairs topics: " + str(error_message))
        return []


def fetch_international_wire_headlines():
    # We parse BBC World News wire RSS for breaking international diplomacy and regional conflicts
    print("[5/5] Fetching international wire headlines...")
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


async def run_x_com_tweet_mining_agent(target_country_name, target_country_slug, is_headless_enabled):
    # We launch browser-use with the user's logged-in Chrome profile to inspect live X.com explore tabs
    # and extract authentic tweet text strings for the top defense and geopolitical trends
    print("")
    print("==================================================")
    print("Running Native X.com Browser Agent (Explore & Tweets)")
    print("==================================================")

    x_intel_filename_string = "x_intel_" + target_country_slug + ".json"
    workspace_directory_path = os.getcwd()
    target_output_file_path = os.path.join(workspace_directory_path, x_intel_filename_string)

    # Detailed step-by-step instructions for the browser agent as specified in KEYWORDS.md
    browser_task_instructions = f"""
    Task: Extract Top Defense, Military, and Geopolitical Trends and Sample Tweets from X.com for {target_country_name}.

    STEP 1: Navigate to the X Explore Trending tab
    Navigate to https://x.com/explore/tabs/trending.
    Wait 3 seconds for the trending topics list to render on screen.

    STEP 2: Observe and select foreign affairs & defense trends
    Look at the visible trending items under Trending.
    Specifically select topics that relate to:
    - Defense, armed forces, naval or air exercises, weapons systems (missiles, fighter jets, naval vessels)
    - International diplomacy, foreign delegations, state visits, bilateral relations
    - Geopolitics, international conflicts, border tensions, sanctions, cross-border energy or trade
    Ignore sports, entertainment, celebrities, crypto tokens, and purely local domestic political arguments.
    Pick the top 3 to 5 most relevant foreign-affairs and defense trends.

    STEP 3: Also inspect the X Explore News tab
    Navigate to https://x.com/explore/tabs/news.
    Observe if there are additional breaking international or defense stories.
    Select any high-priority international defense or conflict trend you observe.

    STEP 4: Collect sample tweets for each selected trend
    For each selected trend (up to 3 to 5 trends):
    1. Navigate directly to https://x.com/search?q={{trend_query}}&f=top
    2. Look at the top 5 to 7 visible tweets on the search results page.
    3. Read the clean text content of each tweet. Extract only the actual text message written by the user. Do not include user profile handles, follower counts, timestamp strings, or image URLs.

    STEP 5: Save your findings to a file
    Using the write_file action, save all collected data into a JSON file named {x_intel_filename_string} with this exact structure:
    {{
      "country": "{target_country_name}",
      "trends_observed": ["trend 1", "trend 2"],
      "sample_tweets_by_trend": {{
        "trend_name": ["tweet text 1", "tweet text 2", "tweet text 3"]
      }}
    }}

    STEP 6: Complete the task
    After successfully writing {x_intel_filename_string}, call the done action.
    """

    # Initialize the local ChatOpenAI client
    language_model_client = ChatOpenAI(
        model=llm_model_name_string,
        base_url=vllm_base_url_string,
        api_key=vllm_api_key_string,
        max_completion_tokens=8192,
        timeout=180,
    )

    # Initialize browser with real system Chrome profile
    if is_real_chrome_enabled:
        browser_instance = Browser.from_system_chrome(
            headless=is_headless_enabled,
        )
    else:
        browser_instance = Browser(
            headless=is_headless_enabled,
        )

    browser_agent = Agent(
        task=browser_task_instructions,
        browser=browser_instance,
        llm=language_model_client,
        file_system_path=workspace_directory_path,
        llm_timeout=180,
        step_timeout=240,
        use_thinking=False,
        max_history_items=6,
        use_vision=False,
        max_clickable_elements_length=8000,
    )

    try:
        # We set a 120-second timeout so a browser tab conflict never hangs the whole pipeline
        await asyncio.wait_for(browser_agent.run(), timeout=120)
    except asyncio.TimeoutError:
        print("Notice: X.com browser inspection reached time limit; proceeding with gathered intelligence.")
    except Exception as agent_execution_error:
        print("Notice: Browser agent finished with message: " + str(agent_execution_error))

    # Read the output file created by the agent
    if os.path.exists(target_output_file_path):
        try:
            opened_file_handle = open(target_output_file_path, "r", encoding="utf-8")
            file_contents_string = opened_file_handle.read()
            opened_file_handle.close()
            parsed_x_intel_data = json.loads(file_contents_string)
            print("Successfully loaded X native intel from: " + target_output_file_path)
            return parsed_x_intel_data
        except Exception:
            pass

    # Check inside browseruse_agent_data subfolder in case it was placed there
    agent_data_file_path = os.path.join(workspace_directory_path, "browseruse_agent_data", x_intel_filename_string)
    if os.path.exists(agent_data_file_path):
        try:
            opened_file_handle = open(agent_data_file_path, "r", encoding="utf-8")
            file_contents_string = opened_file_handle.read()
            opened_file_handle.close()
            parsed_x_intel_data = json.loads(file_contents_string)
            return parsed_x_intel_data
        except Exception:
            pass

    print("Notice: No live X.com tweets file was generated; continuing with news and trends24 signals.")
    return {
        "country": target_country_name,
        "trends_observed": [],
        "sample_tweets_by_trend": {}
    }


def synthesize_keywords_and_twitter_queries(target_country_name, consolidated_intel_dictionary):
    # We pass the consolidated multi-source digest to Qwen3-14B to filter foreign affairs,
    # expand abbreviations, and generate production-ready Twitter boolean search queries.
    print("")
    print("==================================================")
    print("Synthesizing Keywords & Twitter Boolean Queries (LLM)")
    print("==================================================")

    # Format the news headlines as clean text sections
    defense_news_list = consolidated_intel_dictionary.get("defense_news_headlines", [])
    breaking_defense_list = consolidated_intel_dictionary.get("breaking_defense_headlines", [])
    foreign_affairs_list = consolidated_intel_dictionary.get("foreign_affairs_headlines", [])
    wire_news_list = consolidated_intel_dictionary.get("wire_news_headlines", [])
    trends24_list = consolidated_intel_dictionary.get("x_trends24_topics", [])
    x_native_data = consolidated_intel_dictionary.get("x_native_explore", {})

    # Build prompt sections
    news_digest_lines_list = []
    news_digest_lines_list.append("--- DEFENSE NEWS HEADLINES ---")
    for item_index in range(len(defense_news_list)):
        news_digest_lines_list.append("• " + defense_news_list[item_index])

    news_digest_lines_list.append("\n--- BREAKING DEFENSE HEADLINES ---")
    for item_index in range(len(breaking_defense_list)):
        news_digest_lines_list.append("• " + breaking_defense_list[item_index])

    news_digest_lines_list.append("\n--- FOREIGN AFFAIRS TOPICS ---")
    for item_index in range(len(foreign_affairs_list)):
        news_digest_lines_list.append("• " + foreign_affairs_list[item_index])

    news_digest_lines_list.append("\n--- INTERNATIONAL WIRE NEWS HEADLINES ---")
    for item_index in range(len(wire_news_list)):
        news_digest_lines_list.append("• " + wire_news_list[item_index])

    news_digest_lines_list.append(f"\n--- X.COM CHATTER & TRENDS ({target_country_name.upper()}) ---")
    for item_index in range(len(trends24_list)):
        news_digest_lines_list.append("• " + trends24_list[item_index])

    # Include sample tweets if available
    sample_tweets_map = x_native_data.get("sample_tweets_by_trend", {})
    if len(sample_tweets_map) > 0:
        news_digest_lines_list.append("\n--- SAMPLE TWEETS FROM X.COM ---")
        for trend_key in sample_tweets_map:
            tweets_list = sample_tweets_map[trend_key]
            news_digest_lines_list.append(f"Trend: {trend_key}")
            for tweet_index in range(len(tweets_list)):
                news_digest_lines_list.append(f"   [Tweet {tweet_index+1}]: {tweets_list[tweet_index]}")

    consolidated_intel_text = "\n".join(news_digest_lines_list)

    system_and_user_prompt = f"""You are a specialized geopolitical news intelligence engine.
Analyze the following multi-source intelligence report for the country: {target_country_name}.

DATA REPORT:
{consolidated_intel_text}

TASK:
1. Filter strictly for FOREIGN AFFAIRS topics:
   - Defense and military operations, armed forces modernization, naval/air exercises, weapons tests
   - Bilateral and multilateral diplomacy, treaties, high-level foreign delegations
   - International geopolitics, regional conflicts, border security, sanctions
   - Cross-border economic agreements (trade corridors, bilateral aid, energy/pipeline pacts)
2. Completely discard:
   - Purely domestic politics and partisan arguments
   - Entertainment, sports, celebrities, crypto tokens, local crime, and spam
3. For each relevant topic:
   - Expand recognized abbreviations and common aliases (for example, "PN Sea Spark" and "Pakistan Navy Sea Spark"). Do NOT invent fake abbreviations.
   - Include specific search terms, key actors, and weapons designations.
4. Output between 10 and 15 distinct, high-priority foreign-affairs topics.

OUTPUT REQUIREMENTS:
Respond ONLY with a valid JSON array of objects. Do not include markdown backticks, thinking text, or conversational filler.
Each object must have these exact keys:
- "label": Short clear name of the topic or event
- "category": One of "defense", "diplomacy", "politics", "economic"
- "terms": List of keyword strings including full names and well-known abbreviations

Example format:
[
  {{
    "label": "Makkah Defence Pact",
    "category": "defense",
    "terms": ["the makkah defence pact", "makkah defence pact", "saudi pakistan defence pact", "MDP 2026"]
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
    print("Multi-Source Hot News & Twitter Boolean Query Engine")
    print("==================================================")
    print("Target Country: " + target_country_name)
    print("Country Slug:   " + target_country_slug)
    print("==================================================")
    print("")

    # PHASE 1: Gather raw news and trends from all sources
    trends24_topics_list = fetch_trends24_topics(target_country_slug)
    defense_news_headlines_list = fetch_defense_news_headlines()
    breaking_defense_headlines_list = fetch_breaking_defense_headlines()
    foreign_affairs_topics_list = fetch_foreign_affairs_topics()
    wire_news_headlines_list = fetch_international_wire_headlines()

    # PHASE 2: Run X.com browser agent to inspect explore tabs and mine sample tweets
    x_native_intel_dictionary = asyncio.run(
        run_x_com_tweet_mining_agent(target_country_name, target_country_slug, is_headless_mode_enabled)
    )

    # PHASE 3: Consolidate all raw data into an intermediate audit file
    current_iso_timestamp = datetime.datetime.now().isoformat()
    consolidated_raw_intel_data = {
        "country": target_country_name,
        "slug": target_country_slug,
        "collected_at": current_iso_timestamp,
        "x_trends24_topics": trends24_topics_list,
        "defense_news_headlines": defense_news_headlines_list,
        "breaking_defense_headlines": breaking_defense_headlines_list,
        "foreign_affairs_headlines": foreign_affairs_topics_list,
        "wire_news_headlines": wire_news_headlines_list,
        "x_native_explore": x_native_intel_dictionary
    }

    raw_intel_filename = "raw_intel_" + target_country_slug + ".json"
    raw_file_handle = open(raw_intel_filename, "w", encoding="utf-8")
    raw_file_handle.write(json.dumps(consolidated_raw_intel_data, indent=2, ensure_ascii=False))
    raw_file_handle.close()
    print("")
    print("Saved consolidated raw intel to: " + raw_intel_filename)

    # PHASE 4: Feed consolidated intel to Qwen3-14B for synthesis and boolean queries
    synthesized_topics_list = synthesize_keywords_and_twitter_queries(
        target_country_name, consolidated_raw_intel_data
    )

    # PHASE 5: Format and save the final structured keywords and queries
    final_output_structure = {
        "generated_at": current_iso_timestamp,
        "country": target_country_name,
        "sources_consulted": [
            "trends24",
            "x.com_native_explore",
            "defense_news",
            "breaking_defense",
            "foreign_affairs",
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
    print("SUCCESS: Synthesis Finished")
    print("==================================================")
    print("Saved country output to: " + country_output_filename)
    print("Saved master output to:  " + master_output_filename)
    print("Total high-precision topics generated: " + str(len(synthesized_topics_list)))
    print("==================================================")
    print("")

    # Display the final generated topics with their keywords
    for topic_index in range(len(synthesized_topics_list)):
        current_topic_item = synthesized_topics_list[topic_index]
        topic_label = current_topic_item.get("label", "Unknown")
        topic_category = current_topic_item.get("category", "general")
        topic_terms = current_topic_item.get("terms", [])

        print(f"{topic_index + 1}. [{topic_category.upper()}] {topic_label}")
        print(f"   Keywords: {', '.join(topic_terms)}")
        print("")


if __name__ == "__main__":
    run_country_hot_news_pipeline()
