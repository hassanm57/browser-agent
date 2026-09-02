import asyncio
import os
import sys
from dotenv import load_dotenv
from browser_use import Agent, Browser
from browser_use.llm import ChatOpenAI

# Load environment configuration from .env file
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

# Pre-saved tasks dictionary for easy command line shortcuts
PRESET_TASKS_DICTIONARY = {
    "x": "Go to https://x.com/home, click on Profile, and check my notifications",
    "followers": "Go to https://x.com/real_hM_/followers and list my recent followers",
    "news": "Go to https://news.ycombinator.com and find the top story",
    "linkedin": "Go to https://www.linkedin.com/feed/ and find the top post",
    "quotes": """1. Go to https://quotes.toscrape.com/
2. Use extract action with the query "first 3 quotes with their authors"
3. Save results to quotes.csv using write_file action
4. Search DuckDuckGo for the first quote and find when it was written""",
}


async def run_browser_task():
    # Read the task description passed from terminal arguments
    terminal_arguments_list = sys.argv
    if len(terminal_arguments_list) > 1:
        # Check if the user passed a single word matching one of our preset shortcuts
        first_argument_word = terminal_arguments_list[1].lower()
        if len(terminal_arguments_list) == 2 and first_argument_word in PRESET_TASKS_DICTIONARY:
            print(f"Using pre-saved task preset: '{first_argument_word}'")
            browser_task_description = PRESET_TASKS_DICTIONARY[first_argument_word]
        else:
            # Otherwise, combine all words into a custom task description
            task_words_list = []
            for argument_index in range(1, len(terminal_arguments_list)):
                task_words_list.append(terminal_arguments_list[argument_index])
            browser_task_description = " ".join(task_words_list)
    else:
        # Default test task when no arguments are provided
        browser_task_description = PRESET_TASKS_DICTIONARY["quotes"]

    print("Starting browser agent with task:")
    print(browser_task_description)
    print("")

    # Initialize the local LLM client using ChatOpenAI
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
        print("Using real system Chrome browser with your active profile and logins.")
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
        task=browser_task_description,
        browser=browser_instance,
        llm=language_model_client,
        # Save output files (like CSVs) directly in the current workspace directory
        file_system_path=os.getcwd(),
        # Allow up to 180 seconds for local model responses instead of the default 75s
        llm_timeout=180,
        step_timeout=240,
        # Turn off verbose chain-of-thought to drastically speed up response time on local GPUs
        use_thinking=False,
        # Prune conversation history to the last 6 steps so the local model context (16k) never overflows
        max_history_items=6,
        # Vision is disabled so the agent operates on textual DOM elements for local hardware efficiency
        use_vision=False,
        # Limit DOM elements size so web pages do not exceed context window limits
        max_clickable_elements_length=8000,
    )

    # Execute the agent task
    agent_history_result = await browser_agent.run()

    print("")
    print("Agent completed the task. Final result:")
    final_result_text = agent_history_result.final_result()
    print(final_result_text)


if __name__ == "__main__":
    # asyncio.run is required because browser-use is asynchronous
    asyncio.run(run_browser_task())
