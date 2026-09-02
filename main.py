import asyncio
import os
import sys
from dotenv import load_dotenv
from browser_use import Agent, BrowserProfile
from browser_use.llm import ChatOpenAI

# Load variables from the .env file so we do not hardcode credentials in code
load_dotenv()

# Read the connection details for our local LLM server
vllm_base_url_string = os.getenv("VLLM_BASE_URL", "http://10.13.12.121:8000/v1")
vllm_api_key_string = os.getenv("VLLM_API_KEY", "EMPTY")
llm_model_name_string = os.getenv("LLM_MODEL", "qwen3-vl")

# Check whether the user wants to see the browser window or run in the background
headless_environment_setting = os.getenv("HEADLESS", "false")
if headless_environment_setting.lower() == "true":
    is_headless_mode_enabled = True
else:
    is_headless_mode_enabled = False


async def run_browser_task():
    # If the user passed words in the terminal, combine them into our task description
    terminal_arguments_list = sys.argv
    if len(terminal_arguments_list) > 1:
        # We start at index 1 because index 0 is always the filename itself
        task_words_list = []
        for argument_index in range(1, len(terminal_arguments_list)):
            task_words_list.append(terminal_arguments_list[argument_index])
        browser_task_description = " ".join(task_words_list)
    else:
        # A simple fallback task so the script can be tested immediately with zero arguments
        browser_task_description = "Go to https://news.ycombinator.com and find the title of the top story."

    print("Starting browser agent with the following task:")
    print(browser_task_description)
    print("")

    # We use ChatOpenAI because vLLM provides an OpenAI-compatible API endpoint
    language_model_client = ChatOpenAI(
        model=llm_model_name_string,
        base_url=vllm_base_url_string,
        api_key=vllm_api_key_string,
    )

    # Configure the browser profile so we can control visibility
    browser_configuration_profile = BrowserProfile(
        headless=is_headless_mode_enabled,
    )

    # Create the agent that will look at web pages and decide what to click and type
    browser_agent = Agent(
        task=browser_task_description,
        llm=language_model_client,
        browser_profile=browser_configuration_profile,
        # Qwen3-VL is a vision model, so enabling vision allows it to see page screenshots
        use_vision=True,
    )

    # Let the agent execute the steps until it finishes the task
    agent_history_result = await browser_agent.run()

    print("")
    print("Agent completed the task. Final result:")
    final_result_text = agent_history_result.final_result()
    print(final_result_text)


if __name__ == "__main__":
    # asyncio.run is needed because browser-use is built on asynchronous Python
    asyncio.run(run_browser_task())
