# Browser Agent with `browser-use` and Local vLLM

This project uses [`browser-use`](https://github.com/browser-use/browser-use) to automate browser tasks using a local vision LLM (`qwen3-vl`) hosted on vLLM / llama.cpp.

---

## 🛠️ Project Structure

- `main.py` — Starter script initializing the browser agent with local vLLM endpoint.
- `.env` — Environment configuration for your model endpoint and browser options.
- `requirements.txt` — Python dependencies.
- `.venv/` — Isolated Python 3.12 virtual environment.

---

## 🚀 How to Run

### 1. Activate the Virtual Environment
```bash
source .venv/bin/activate
```

### 2. Run the Starter Script
Run with the default task:
```bash
python main.py
```

Or pass your own custom task directly:
```bash
python main.py "Search for weather in Tokyo on Google and extract the temperature"
```

---

## ⚙️ Configuration (`.env`)

You can modify settings in `.env`:

```env
# Local Model Endpoint
VLLM_BASE_URL=http://10.13.12.121:8000/v1
VLLM_API_KEY=EMPTY
LLM_MODEL=qwen3-vl

# Browser Settings
HEADLESS=false # Set to true to run silently without opening a Chrome window

# Telemetry
ANONYMIZED_TELEMETRY=false
```
