import asyncio
import json
import os
import sys
from dotenv import load_dotenv
from browser_use import Agent, Browser
from browser_use.llm import ChatOpenAI

# Load configuration values from the .env file
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

    # If no exact match is found, return None so the caller can handle it
    return None


async def run_trends_extraction_task():
    # Read the target country from command line arguments or default to Pakistan
    terminal_arguments_list = sys.argv
    if len(terminal_arguments_list) > 1:
        # Combine all argument words into a single country search query
        argument_words_list = []
        for argument_index in range(1, len(terminal_arguments_list)):
            argument_words_list.append(terminal_arguments_list[argument_index])
        requested_country_query = " ".join(argument_words_list)
    else:
        # Default pilot country for Milestone 1
        requested_country_query = "pakistan"

    # Load all supported countries from configuration
    available_countries_list = load_countries_configuration_file()
    selected_country_data = find_target_country_by_name(requested_country_query, available_countries_list)

    if selected_country_data is not None:
        target_country_name = selected_country_data.get("name")
        target_country_slug = selected_country_data.get("trends24_slug")
    else:
        # If the user passed a country not in the list, construct slug directly from the query
        target_country_name = requested_country_query.title()
        target_country_slug = requested_country_query.strip().lower().replace(" ", "-")

    target_trends_url = "https://trends24.in/" + target_country_slug + "/"
    output_filename_string = "trends_" + target_country_slug + ".json"

    print("==================================================")
    print("Country-Specific Hot News Engine - Trend Ingestion")
    print("==================================================")
    print("Target Country: " + target_country_name)
    print("Trends24 URL:   " + target_trends_url)
    print("Output File:    " + output_filename_string)
    print("==================================================")
    print("")

    # Construct explicit step-by-step instructions for the browser agent
    # We explicitly instruct the agent not to use the 'extract' tool because trends24 pages
    # contain 24 columns of raw HTML (48,000+ tokens) which exceeds local LLM context limits.
    # The agent can easily read the first column from the visible browser state and call write_file directly.
    browser_task_instructions = f"""
    1. Go to {target_trends_url}
    2. Look at the trending topics and hashtags listed under the first column (the most recent hour).
    3. Do NOT use the extract tool.
    4. Directly save the list of top 20 to 30 trending topics from the first column into a JSON file named {output_filename_string} using the write_file action. The JSON file must follow this exact format:
    {{"country": "{target_country_name}", "trends": ["topic 1", "topic 2"]}}
    5. After writing the file, call the done action.
    """

    print("Task instructions for browser agent:")
    print(browser_task_instructions)
    print("")

    # Initialize the local LLM client
    # Max completion tokens is set to 8192 to prevent structured output truncation
    # Timeout is set to 180 seconds to allow local GPUs sufficient generation time
    language_model_client = ChatOpenAI(
        model=llm_model_name_string,
        base_url=vllm_base_url_string,
        api_key=vllm_api_key_string,
        max_completion_tokens=8192,
        timeout=180,
    )

    # Initialize the browser
    # Browser.from_system_chrome() reuses your real Chrome installation and active logins
    if is_real_chrome_enabled:
        print("Using real system Chrome browser profile.")
        browser_instance = Browser.from_system_chrome(
            headless=is_headless_mode_enabled,
        )
    else:
        print("Using isolated clean browser session.")
        browser_instance = Browser(
            headless=is_headless_mode_enabled,
        )

    # Create the browser-use agent
    browser_agent = Agent(
        task=browser_task_instructions,
        browser=browser_instance,
        llm=language_model_client,
        # Save output files directly into the workspace root
        file_system_path=os.getcwd(),
        # Allow up to 180 seconds for local model responses instead of default 75s
        llm_timeout=180,
        step_timeout=240,
        # Disable verbose thinking to significantly speed up response time on local GPUs
        use_thinking=False,
        # Prune conversation history to the last 6 steps so local 32k context window never overflows
        max_history_items=6,
        # Vision is disabled so the agent operates on textual DOM elements for local hardware efficiency
        use_vision=False,
        # Limit DOM elements size so web pages do not exceed context window limits
        max_clickable_elements_length=8000,
    )

    # Execute the agent task
    agent_history_result = await browser_agent.run()

    print("")
    print("==================================================")
    print("Agent Execution Finished")
    print("==================================================")
    final_result_text = agent_history_result.final_result()
    print("Final result:")
    print(final_result_text)
    print("")

    # Check if the output file was successfully written
    workspace_directory_path = os.getcwd()
    expected_output_file_path = os.path.join(workspace_directory_path, output_filename_string)

    if os.path.exists(expected_output_file_path):
        print("Success: Generated trends file exists at:")
        print(expected_output_file_path)
    else:
        # Check inside browseruse_agent_data subfolder in case the agent created it there
        agent_data_directory_path = os.path.join(workspace_directory_path, "browseruse_agent_data", output_filename_string)
        if os.path.exists(agent_data_directory_path):
            import shutil
            shutil.copyfile(agent_data_directory_path, expected_output_file_path)
            print("Copied trends file from agent data directory to root workspace:")
            print(expected_output_file_path)
        else:
            print("Notice: Output file was not found at expected location.")


if __name__ == "__main__":
    # asyncio.run is required because browser-use is asynchronous
    asyncio.run(run_trends_extraction_task())
