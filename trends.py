import datetime
import json
import os
import sys
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import requests
from browser_use.llm import ChatOpenAI, UserMessage

# Load environment variables from .env file
load_dotenv()

# Read the local LLM connection settings
vllm_base_url_string = os.getenv("VLLM_BASE_URL")
vllm_api_key_string = os.getenv("VLLM_API_KEY")
llm_model_name_string = os.getenv("LLM_MODEL")


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

    # If no match is found, return None so the caller can handle it
    return None


def fetch_latest_trending_topics(target_country_slug):
    # We fetch the public trends24 page directly to avoid passing 48,000 tokens of raw ads/HTML to the LLM
    target_webpage_url = "https://trends24.in/" + target_country_slug + "/"
    print("Fetching latest trending topics from: " + target_webpage_url)

    request_headers_dictionary = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    http_response_object = requests.get(target_webpage_url, headers=request_headers_dictionary, timeout=15)
    http_response_object.encoding = "utf-8"

    # Parse HTML using BeautifulSoup to extract the first hourly list
    html_soup_parser = BeautifulSoup(http_response_object.text, "html.parser")
    ordered_lists_collection = html_soup_parser.find_all("ol")

    extracted_trending_topics_list = []

    if len(ordered_lists_collection) > 0:
        # The first ordered list corresponds to the most recent hour on trends24
        most_recent_hour_list = ordered_lists_collection[0]
        list_items_collection = most_recent_hour_list.find_all("li")

        for item_index in range(len(list_items_collection)):
            current_list_item = list_items_collection[item_index]
            cleaned_topic_text = current_list_item.get_text(strip=True)
            if len(cleaned_topic_text) > 0:
                extracted_trending_topics_list.append(cleaned_topic_text)

    print("Successfully fetched " + str(len(extracted_trending_topics_list)) + " raw trending topics.")
    return extracted_trending_topics_list


def filter_and_generate_keywords_with_llm(target_country_name, raw_trending_topics_list):
    # We use Qwen3-14B to analyze raw trends and filter specifically for foreign-affairs relevance
    print("")
    print("Passing raw trends to Qwen3-14B for foreign affairs filtering and keyword expansion...")

    # Format the trends as a simple numbered list string
    formatted_trends_lines_list = []
    for trend_index in range(len(raw_trending_topics_list)):
        current_trend = raw_trending_topics_list[trend_index]
        formatted_trends_lines_list.append(str(trend_index + 1) + ". " + current_trend)

    all_trends_text_block = "\n".join(formatted_trends_lines_list)

    system_and_user_prompt = f"""You are a specialized geopolitical news intelligence engine.
Analyze the following list of current Twitter/X trending topics for the country: {target_country_name}.

TASK:
1. Filter strictly for FOREIGN AFFAIRS topics:
   - Defense and military operations
   - Bilateral and multilateral diplomacy
   - International politics, treaties, and geopolitics
   - Cross-border economic news (sanctions, international trade, major foreign investments)
2. Exclude purely domestic politics, entertainment, sports, celebrity gossip, and general spam.
3. For each relevant topic, expand known abbreviations and common short forms (for example, "PN Sea Spark" and "Pakistan Navy Sea Spark"). Do not invent fake abbreviations.
4. Select the top 10 to 15 most important foreign-affairs topics.

CURRENT TRENDING TOPICS FOR {target_country_name.upper()}:
{all_trends_text_block}

OUTPUT REQUIREMENTS:
Respond ONLY with a valid JSON array of objects. Do not include markdown code block backticks, thinking blocks, or conversational filler.
Each object must have these exact keys:
- "label": Short clear name of the topic or event
- "terms": List of keyword strings including full names and well-known abbreviations
- "category": One of "defense", "diplomacy", "politics", "economic"

Example format:
[
  {{
    "label": "Makkah Defence Pact",
    "terms": ["the makkah defence pact", "makkah defence pact", "saudi pakistan defence pact"],
    "category": "defense"
  }}
]
"""

    # Initialize the local ChatOpenAI client
    language_model_client = ChatOpenAI(
        model=llm_model_name_string,
        base_url=vllm_base_url_string,
        api_key=vllm_api_key_string,
        max_completion_tokens=8192,
        timeout=180,
    )

    import asyncio

    async def call_llm():
        user_message_object = UserMessage(content=system_and_user_prompt)
        model_response_object = await language_model_client.ainvoke([user_message_object])
        return model_response_object.completion

    raw_model_completion_text = asyncio.run(call_llm())

    # Clean any accidental markdown backticks or whitespace
    cleaned_json_text = raw_model_completion_text.strip()
    if cleaned_json_text.startswith("```json"):
        cleaned_json_text = cleaned_json_text[7:]
    if cleaned_json_text.startswith("```"):
        cleaned_json_text = cleaned_json_text[3:]
    if cleaned_json_text.endswith("```"):
        cleaned_json_text = cleaned_json_text[:-3]
    cleaned_json_text = cleaned_json_text.strip()

    try:
        parsed_keywords_list = json.loads(cleaned_json_text)
        return parsed_keywords_list
    except Exception as parse_error:
        print("Warning: Could not parse LLM output as strict JSON directly. Raw output preview:")
        print(cleaned_json_text[:300])
        # Attempt to locate JSON array brackets
        first_bracket_index = cleaned_json_text.find("[")
        last_bracket_index = cleaned_json_text.rfind("]")
        if first_bracket_index != -1 and last_bracket_index != -1:
            bracket_substring = cleaned_json_text[first_bracket_index:last_bracket_index + 1]
            try:
                parsed_keywords_list = json.loads(bracket_substring)
                return parsed_keywords_list
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
    print("Country-Specific Hot News Keyword Engine")
    print("==================================================")
    print("Target Country: " + target_country_name)
    print("Slug:           " + target_country_slug)
    print("==================================================")
    print("")

    # Step 1: Fetch raw trending topics from trends24
    raw_trending_topics_list = fetch_latest_trending_topics(target_country_slug)

    # Save raw trends file
    raw_trends_filename = "trends_" + target_country_slug + ".json"
    raw_trends_output_data = {
        "country": target_country_name,
        "fetched_at": datetime.datetime.now().isoformat(),
        "total_trends_found": len(raw_trending_topics_list),
        "trends": raw_trending_topics_list
    }

    raw_file_handle = open(raw_trends_filename, "w", encoding="utf-8")
    raw_file_handle.write(json.dumps(raw_trends_output_data, indent=2, ensure_ascii=False))
    raw_file_handle.close()
    print("Saved raw trends to: " + raw_trends_filename)

    # Step 2: Pass raw trends to Qwen3-14B to filter foreign affairs & expand abbreviations
    structured_keywords_list = filter_and_generate_keywords_with_llm(target_country_name, raw_trending_topics_list)

    # Step 3: Format and save the final structured keywords JSON matching KEYWORDS.md schema
    current_iso_timestamp = datetime.datetime.now().isoformat()
    final_output_structure = {
        "generated_at": current_iso_timestamp,
        "country": target_country_name,
        "total_topics_extracted": len(structured_keywords_list),
        "keywords": structured_keywords_list
    }

    country_output_filename = "keywords_" + target_country_slug + ".json"
    country_file_handle = open(country_output_filename, "w", encoding="utf-8")
    country_file_handle.write(json.dumps(final_output_structure, indent=2, ensure_ascii=False))
    country_file_handle.close()

    # Also update the master keywords_output.json file
    master_output_filename = "keywords_output.json"
    master_file_handle = open(master_output_filename, "w", encoding="utf-8")
    master_file_handle.write(json.dumps(final_output_structure, indent=2, ensure_ascii=False))
    master_file_handle.close()

    print("")
    print("==================================================")
    print("SUCCESS: Keyword Engine Finished")
    print("==================================================")
    print("Saved country keywords to: " + country_output_filename)
    print("Saved master output to:    " + master_output_filename)
    print("Total foreign affairs topics identified: " + str(len(structured_keywords_list)))
    print("==================================================")
    print("")

    # Display the extracted topics in a clear, readable table format
    for topic_index in range(len(structured_keywords_list)):
        current_topic_item = structured_keywords_list[topic_index]
        topic_label = current_topic_item.get("label", "Unknown")
        topic_category = current_topic_item.get("category", "General")
        topic_terms = current_topic_item.get("terms", [])
        terms_joined_string = ", ".join(topic_terms)

        print(str(topic_index + 1) + ". [" + topic_category.upper() + "] " + topic_label)
        print("   Search Terms: " + terms_joined_string)
        print("")


if __name__ == "__main__":
    run_country_hot_news_pipeline()
