# AGY Session & Project Memory (`MEMORY.md`)

> **Note for AGY**: Read this file once at the start of a session or when first entering the project to load full operational context. Do not re-read this file on every subsequent instruction unless specifically requested.

---

## 1. Project Overview

- **Name**: `browser-agent`
- **Purpose**: Autonomous web browsing tasks executed via the [`browser-use`](https://github.com/browser-use/browser-use) Python library connected to a local vLLM instance serving a vision language model (`qwen3-vl`).
- **Core Strategy**: Uses an OpenAI-compatible API endpoint provided by local vLLM. DOM text-based interaction is prioritized (`use_vision=False`) to reduce token consumption and speed up local inference.

---

## 2. Directory Structure & Key Files

```text
browser-agent/
├── main.py              # Main entry point; initializes BrowserProfile, LLM, and Agent
├── trends.py            # Country-specific hot news trend fetcher & keyword generator
├── countries.json       # Country list configuration (slugs, tiers, home country)
├── KEYWORDS.md          # Architecture & plan for the Hot News Keyword Engine
├── requirements.txt     # Locked Python package dependencies
├── .env                 # Environment variables (model endpoints, headless settings)
├── .venv/               # Python 3.12 virtual environment
├── README.md            # Quickstart documentation
├── AGENTS.md            # Core AGY behavioral & code style rules
└── MEMORY.md            # Persistent project context & architecture memory (this file)
```

### File Specifics
- **`main.py`**:
  - Loads environment settings via `python-dotenv`.
  - Defines `PRESET_TASKS_DICTIONARY` for quick command line shortcuts (`x`, `followers`, `news`, `linkedin`, `quotes`).
  - Automatically runs the selected preset if a shortcut name is provided as an argument (e.g. `python main.py quotes`).
  - Uses official `Browser.from_system_chrome()` to auto-detect your real Chrome installation and active logins.
  - Falls back to isolated `Browser()` when `USE_REAL_CHROME=false`.
  - Uses `browser_use.llm.ChatOpenAI` pointed at `VLLM_BASE_URL` with `VLLM_API_KEY`, `max_completion_tokens=8192`, and `timeout=180`.
  - Configures `Agent` with `llm_timeout=180`, `use_thinking=False` (to keep local generation fast), `max_history_items=6` (to keep prompt within local 16k context), `use_vision=False`, and `max_clickable_elements_length=8000`.
- **`.env`**:
  - `VLLM_BASE_URL`: Local vLLM API endpoint (e.g. `http://10.13.12.121:8000/v1`).
  - `VLLM_API_KEY`: API key token (e.g. `EMPTY`).
  - `LLM_MODEL`: Model identifier string (`qwen3-14b`, 32k context).
  - `HEADLESS`: `true` or `false` to toggle the visible browser window.
  - `USE_REAL_CHROME`: `true` (default) to use `Browser.from_system_chrome()`.
  - `ANONYMIZED_TELEMETRY`: Set to `false`.

---

## 3. Environment & Execution Workflows

### Virtual Environment
- **Path**: `.venv`
- **Python Version**: 3.12
- **Activation**:
  ```bash
  source .venv/bin/activate
  ```

### Dependency Installation
```bash
pip install -r requirements.txt
```
*(Dependencies: `browser-use==0.13.8`, `langchain-openai==1.1.9`, `python-dotenv==1.2.2`)*

### Running the Agent
- **Default fallback task**:
  ```bash
  python main.py
  ```
- **Custom task description**:
  ```bash
  python main.py "Search for weather in Tokyo on Google and extract the temperature"
  ```

---

## 4. Coding Style & Development Constraints (`AGENTS.md`)

When adding features or modifying code in this repository, strictly adhere to these rules:

1. **Junior Engineer Clarity / "Boring" Code**:
   - Write simple, explicit, procedural, step-by-step logic.
   - Avoid clever one-liners, shorthand tricks, or functional programming patterns (`map`, `filter`, `reduce`, lambdas, currying).
   - Use standard `for` and `while` loops.
   - Favor extreme readability and clarity over minimal line counts.

2. **Structure & Architecture**:
   - Keep code concrete. Avoid deep abstractions, unnecessary design patterns, or extra helper classes.
   - Keep logic linear inside standard functions.
   - Do not create extra files unless strictly necessary.
   - Solve only the immediate problem.

3. **Naming & Documentation**:
   - Use long, fully spelled out, descriptive variable and function names (e.g., `task_words_list`, `is_headless_mode_enabled`).
   - Write simple comments explaining *why* something is done, not *what* the syntax is doing.

---

## 5. Technical Pitfalls & Hardware Notes

- **Retina Displays (macOS)**: Always keep `device_scale_factor=1.0` in `BrowserProfile` to avoid high-DPI screenshots inflating memory or coordinate errors.
- **Local vLLM Token Limits**:
  - When running locally, Qwen-VL or local LLMs can run out of context if massive HTML trees are passed.
  - `max_clickable_elements_length` must remain capped unless verified.
  - Vision (`use_vision=True`) requires additional GPU memory; if enabled in future tasks, monitor local VRAM closely.
- **Authentication Walls & Bot Detection (LinkedIn / Google)**:
  - Fresh automated browser instances lack cookies and trigger bot checks (LinkedIn full-screen login modals, Google CAPTCHA).
  - To bypass this on sites requiring login, run Chrome with remote debugging (`--remote-debugging-port=9222`) and set `CHROME_CDP_URL=http://localhost:9222`, or persist cookies using `CHROME_USER_DATA_DIR=./chrome_profile`.
- **Async Execution**: `browser-use` relies on `asyncio`; top-level script execution requires `asyncio.run()`.
