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


async def run_browser_task():
    # Read the task description passed from terminal arguments
    terminal_arguments_list = sys.argv
    if len(terminal_arguments_list) > 1:
        # Assemble task description from terminal arguments
        task_words_list = []
        for argument_index in range(1, len(terminal_arguments_list)):
            task_words_list.append(terminal_arguments_list[argument_index])
        browser_task_description = " ".join(task_words_list)
    else:
        # Default test task when no arguments are provided
        browser_task_description = "Go to https://news.ycombinator.com and find the title of the top story."

    print("Starting browser agent with task:")
    print(browser_task_description)
    print("")

    # Initialize the local LLM client using ChatOpenAI
    # Max completion tokens is set to 8192 to prevent structured output truncation
    language_model_client = ChatOpenAI(
        model=llm_model_name_string,
        base_url=vllm_base_url_string,
        api_key=vllm_api_key_string,
        max_completion_tokens=8192,
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
        # Prune conversation history to the last 5 steps so the local model context (16k) never overflows
        max_history_items=None,
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
