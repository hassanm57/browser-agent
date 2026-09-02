# KEYWORDS.md — Country-Specific Hot News Keyword Engine

## 1. Overview

A modular engine that monitors "hot news" chatter on X (Twitter) for a defined set of countries and automatically generates high-precision, low-noise search keywords for those topics. The initial focus is **foreign affairs** — defense, diplomacy, international politics, and economic news with cross-border relevance — rather than domestic-only stories.

This engine is a **standalone module** within the `browser-agent` repo. Its only output (for now) is a structured keyword list saved as JSON locally. Downstream systems (Twitter scraper, data pipeline) will consume this output in a later phase.

---

## 2. Goals

1. Given a country, surface what is currently "hot" in foreign-affairs-relevant news and chatter.
2. Convert those trends into **precise search keywords** (10–15 per country per run).
3. Correctly expand well-known abbreviations and event names (e.g., "MIC 2026" should appear alongside "Makkah International Conference") so relevant content is not missed.
4. Minimize noise — irrelevant or off-topic keywords should be the exception, not the norm.
5. Be modular enough to run per-country independently, with no country's configuration hard-coded into another's logic.
6. Later phase: transform these keywords into Twitter boolean search queries (`x AND y OR z`). For now, output is a flat keyword list per topic.

---

## 3. Scope

### 3.1 Countries

Pakistan is the "home" country for relevance purposes, but its presence should not bias or filter what counts as relevant for other countries — each country's news is evaluated on its own terms.

**Initial country list** (expandable):

| Tier | Countries |
|------|-----------|
| Home | Pakistan |
| UN P5 | United States, Russia, China, United Kingdom, France |
| Strategic | Iran, Israel, India, North Korea |
| Gulf | Saudi Arabia, UAE (others as relevant) |
| Dynamic | Any country central to an ongoing major world event |

The list is intentionally not fixed by rigid rule — countries can be added based on relevance to current events.

### 3.2 Topics

Foreign affairs broadly:

- Defense and military
- Diplomacy and foreign policy
- International politics and geopolitics
- Economic news with international/foreign-policy relevance (trade, sanctions, agreements)

**Out of scope**: purely domestic politics or news with no foreign-affairs angle.

---

## 4. Approach

### 4.1 Trend Ingestion

The browser-use agent scrapes current trending topics as raw input signal. Sources (in priority order):

1. **trends24.com** — country-specific trending topic pages (e.g., `trends24.com/pakistan`, `trends24.com/united-states`).
2. **X/Twitter search** — the agent can also browse X directly, searching for latest news chatter per country if trends24 data is sparse or insufficient.
3. **Google News or other news aggregators** — as a supplementary signal if the above sources lack coverage for a specific country.

The agent decides which source(s) to use per country. If trends24 has good data, use it. If a country has sparse trend data (e.g., North Korea), the agent falls back to searching X or news sites directly.

### 4.2 Keyword Generation

The local LLM (**Qwen3-14B**, running on vLLM at `http://10.13.12.121:8000/v1`) processes the scraped trends and context to generate candidate keywords.

**Rules for keyword generation:**

- **Abbreviation/alias expansion** is limited to well-known, commonly-searched abbreviations — the kind a real person would type into X search (e.g., "UN" not "United Nations"). The engine should not invent abbreviations for terms that do not already have a recognized short form.
- Each keyword entry should include the full term and its known short form(s) so neither is missed (e.g., both "Makkah International Conference" and "MIC 2026").
- Output should be filtered for relevance before being finalized — **favor precision over recall**. When in doubt, leave a noisy candidate out.
- Target: **10–15 keywords per country per run**.

### 4.3 Output Construction

For this phase, the output is a **JSON file saved locally** with keyword entries grouped per country and per topic/event.

**Later phase**: these keywords will be transformed into Twitter boolean search queries (e.g., `("Pakistan Navy" AND "joint exercise") OR "PN Sea Spark"`). That transformation is not part of the current scope.

---

## 5. Output Format

A JSON file saved to the workspace root (e.g., `keywords_output.json`), structured as follows:

```json
{
  "generated_at": "2026-09-02T16:00:00+05:00",
  "countries": [
    {
      "country": "Pakistan",
      "keywords": [
        {
          "label": "Makkah International Conference 2026",
          "terms": ["Makkah International Conference", "MIC 2026"],
          "category": "diplomacy"
        },
        {
          "label": "Pakistan Navy Sea Spark Exercise",
          "terms": ["Pakistan Navy Sea Spark", "PN Sea Spark", "Sea Spark 2026"],
          "category": "defense"
        }
      ]
    },
    {
      "country": "United States",
      "keywords": [
        {
          "label": "US-China Tariff Escalation",
          "terms": ["US China tariffs", "trade war 2026", "US tariff escalation"],
          "category": "economic"
        }
      ]
    }
  ]
}
```

**Field definitions:**

| Field | Description |
|-------|-------------|
| `generated_at` | ISO 8601 timestamp of when the run completed |
| `country` | Country name (human-readable) |
| `label` | Short human-readable description of the topic or event |
| `terms` | List of keyword strings (full names + known abbreviations) |
| `category` | One of: `defense`, `diplomacy`, `politics`, `economic` |

Exact field names and schema may evolve during implementation but should stay consistent across countries.

---

## 6. Architecture

### 6.1 Project Structure

All code lives in the existing `browser-agent` repo. New files are added alongside `main.py`:

```
browser-agent/
├── main.py                  # Existing browser-use agent (unchanged)
├── keywords_engine.py       # Main entry point for the keyword engine
├── countries.json           # Country list configuration (name, trends24 slug, etc.)
├── keywords_output.json     # Generated output (overwritten each run)
├── dashboard.py             # Basic web dashboard to trigger runs and view logs
├── .env                     # Shared environment config (LLM endpoint, etc.)
├── MEMORY.md                # Project memory
├── KEYWORDS.md              # This plan document
└── requirements.txt         # Updated with any new dependencies
```

### 6.2 Tooling

| Component | Tool |
|-----------|------|
| Trend scraping | `browser-use` agent (connects to real Chrome via `Browser.from_system_chrome()`) |
| Keyword generation | Local Qwen3-14B via ChatOpenAI (same LLM setup as `main.py`) |
| Output storage | JSON file on disk |
| Dashboard | Basic Python web app (Flask or Streamlit — TBD) |
| Orchestration | Manual trigger via dashboard or CLI |

### 6.3 Execution Flow

```
[User triggers run via dashboard or CLI]
        │
        ▼
[For each country in countries.json]
        │
        ├── 1. Browser-use agent scrapes trends24.com/{country_slug}
        │      (falls back to X search or news sites if data is sparse)
        │
        ├── 2. Scraped trends are passed to the local LLM
        │      with a prompt asking for 10-15 foreign-affairs keywords
        │
        ├── 3. LLM returns structured keyword entries
        │      (label, terms with abbreviation expansion, category)
        │
        ├── 4. Results are validated and filtered for relevance
        │
        └── 5. Country results are appended to the output JSON
        │
        ▼
[keywords_output.json is written to disk]
[Dashboard displays results + logs]
```

### 6.4 Logging and Transparency

The dashboard must show **what the engine is doing at each step**. As little black-box behavior as possible:

- Which country is currently being processed
- What source the agent is scraping (trends24 URL, X search query, etc.)
- What raw trends were found
- What keywords the LLM generated
- What was filtered out and why (if applicable)
- Final keyword list per country

Logs are displayed in the dashboard in real-time and also saved to a log file for review.

### 6.5 Country Configuration

Countries are defined in `countries.json`, not hard-coded in logic:

```json
[
  {
    "name": "Pakistan",
    "trends24_slug": "pakistan",
    "is_home": true
  },
  {
    "name": "United States",
    "trends24_slug": "united-states",
    "is_home": false
  },
  {
    "name": "Iran",
    "trends24_slug": "iran",
    "is_home": false
  }
]
```

Adding a new country requires only adding a new entry to this file — no code changes.

---

## 7. Milestones (Phase 1 — MVP)

| # | Milestone | Description |
|---|-----------|-------------|
| 1 | **Validate trends24 scraping** | Confirm browser-use can reliably pull trends24 data for 2-3 pilot countries (Pakistan, US, one other). |
| 2 | **Build keyword generation step** | LLM prompt that takes raw trends and outputs structured keyword entries. Test on pilot countries. |
| 3 | **Produce JSON output** | End-to-end run: scrape → generate → save `keywords_output.json` matching the target schema. |
| 4 | **Extend to full country list** | Run across all countries in `countries.json`. Handle sparse-data countries gracefully. |
| 5 | **Basic web dashboard** | Trigger runs, view logs in real-time, inspect generated keywords per country. |

---

## 8. Success Criteria

No formal quantitative metric yet — evaluated **qualitatively**:

- Do the generated keyword sets look precise and relevant to current foreign-affairs events?
- Are well-known abbreviations correctly expanded?
- Is obvious noise or off-topic content absent from the output?
- Can a human spot-check the output against actual trending events and confirm coverage?

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Final locked country list beyond the named examples | Open |
| 2 | Exact JSON schema field names for downstream consumption | Draft in Section 5, to be finalized |
| 3 | Whether/when this module gets wired into the Twitter/X data collection pipeline | Future phase |
| 4 | Formal noise/precision metric, if one becomes needed later | Open |
| 5 | Dashboard framework choice (Flask vs Streamlit vs other) | TBD during implementation |
| 6 | Twitter boolean query transformation logic | Future phase (after keyword generation is validated) |
| 7 | How to handle countries with very sparse trends24 data | Agent falls back to X search / news sites (see Section 4.1) |

---

## 10. Constraints

- All code must follow the style rules in `AGENTS.md`: explicit, procedural, "boring" code with long descriptive variable names. No map/filter/reduce. No clever abstractions.
- The local Qwen3-14B model has a 32k context window. Prompts must stay well within this limit.
- No X API access (no paid tier). All Twitter data comes via browser-use scraping.
- The engine runs manually for now. No cron, no scheduler, no background service.
