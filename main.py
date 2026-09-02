import asyncio
import os
import sys
from dotenv import load_dotenv
from browser_use import Agent, BrowserProfile
from browser_use.llm import ChatOpenAI

# Load variables from the .env file so we do not hardcode credentials in code
load_dotenv()

# Read the connection details directly from the .env file
vllm_base_url_string = os.getenv("VLLM_BASE_URL")
vllm_api_key_string = os.getenv("VLLM_API_KEY")
llm_model_name_string = os.getenv("LLM_MODEL")

# Check whether the user wants to see the browser window or run in the background
headless_environment_setting = os.getenv("HEADLESS")
if headless_environment_setting == "true":
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

    # Standardize the browser window size and device scale - resoulution and stuff.
    
    # This prevents Mac Retina displays from producing gigantic screenshots that exceed the model context
    browser_configuration_profile = BrowserProfile( 
        headless=is_headless_mode_enabled,
        viewport={"width": 1920, "height": 1080},
        device_scale_factor=1.0,
    )

    # Create the agent that will look at web pages and decide what to click and type
    browser_agent = Agent(
        task=browser_task_description,
        llm=language_model_client,
        browser_profile=browser_configuration_profile,
        # Vision is disabled so the agent operates purely on textual DOM elements
        # This drastically reduces token consumption and speeds up inference on local hardware
        use_vision=False,
        # Limit the DOM elements text size so large web pages do not blow past the token limit
        max_clickable_elements_length=12000,
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
