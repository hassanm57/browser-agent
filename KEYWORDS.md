# KEYWORDS.md — Country-Specific Hot News & Twitter Boolean Query Engine

## 1. Executive Summary

A multi-source intelligence engine that monitors breaking foreign affairs, defense, military, and geopolitical developments across multiple sources in parallel, cross-references international news with country-specific X (Twitter) trends, and generates **high-precision, low-noise search keywords and Twitter boolean search queries**.

The initial home country is **Pakistan**, but the engine is designed to run modularly for any country configured in `countries.json` (US, China, Russia, Iran, Israel, Saudi Arabia, etc.).

---

## 2. Information Sources Architecture

Rather than relying on a single platform, the engine ingests signal from 6 targeted sources:

### A. Real-Time X/Twitter Chatter & Tweet Mining
1. **trends24.in (`https://trends24.in/{country_slug}/`)**: Fast hourly snapshot of country-specific hashtags.
2. **Native X.com Explore Tabs (`https://x.com/explore/tabs/trending` & `https://x.com/explore/tabs/news`)**:
   - Uses the authenticated Chrome browser to access live local and global trending topics directly on X.
   - For the top 5 to 10 foreign-affairs and defense trends, clicks into each trend and extracts **5 to 10 top tweets**.
   - **Why this is critical**: Real tweets reveal rich, organic search phrasing, emerging slang, secondary hashtags, and specific breaking details that aren't captured by headlines alone.
   - **Context Budget**: Only plain tweet text is kept (strip user IDs, metrics, emojis). ~50 tokens per tweet × 40 tweets = ~2,000 tokens total.

### B. Primary National Security & Regional News Sources (Pakistan & Region)
3. **Dawn News (`https://www.dawn.com/`)**: Leading English-language paper for Pakistani military, defense posture, diplomacy, and global affairs.
4. **The Express Tribune (`https://tribune.com.pk/`)**: In-depth coverage of regional security, bilateral pacts, and international geopolitics.

### C. Specialized Defense & Military News Sources
5. **Defense News (`https://www.defensenews.com/`)**: Breaking defense procurement, armed forces modernization, and international military posture.
6. **Breaking Defense (`https://breakingdefense.com/`)**: Cutting-edge weapons systems, aerospace, intelligence, and defense strategy.

### D. Strategic & Geopolitical Analysis (Foreign Affairs)
7. **Foreign Affairs Defense & Military (`https://www.foreignaffairs.com/topics/defense-military`)**
8. **Foreign Affairs Nuclear Proliferation (`https://www.foreignaffairs.com/topics/nuclear-weapons-proliferation`)**
9. **Foreign Affairs War & Strategy (`https://www.foreignaffairs.com/topics/war-military-strategy`)**

### E. Major International Wire Services
10. **BBC World News Wire (`https://feeds.bbci.co.uk/news/world/rss.xml`)**: Fast breaking reporting on global crises and international diplomacy.

---

## 3. Parallel Extraction & Context Management (The 32k Limit Strategy)

To respect the **32,768 context window** of the local model (`Qwen3-14B`) and avoid out-of-memory errors:

1. **Parallel Lightweight Workers**:
   - The 5 news websites and trends24 are processed independently in parallel.
   - Workers extract **only headline text and article titles** (10–20 clean strings per source).
   - **Zero raw HTML, ads, or scripts** are sent to the LLM.
2. **Native X.com Tweet Mining**:
   - The browser agent opens `https://x.com/explore/tabs/trending` and `https://x.com/explore/tabs/news`.
   - Filters for the top defense, military, and geopolitical trends.
   - Extracts 5 to 10 top tweets per relevant trend as plain text strings (stripping metrics, URLs, and noisy UI).
3. **Token Budgeting**:
   - 6 sources × ~20 headlines each = ~120 clean strings (~1,800 tokens).
   - Top X trends × 5 sample tweets = ~25 clean tweets (~1,500 tokens).
   - System prompt & schema instructions = ~800 tokens.
   - Output buffer for boolean queries & keywords = ~3,000 tokens.
   - **Total run context: ~7,100 tokens** (leaving over 25,000 tokens of headroom below the 32k limit).
4. **Intermediate Persistence**:
   - All extracted raw headlines and sample tweets are stored into an intermediate JSON file (`raw_intel_{country_slug}.json`) for full auditability and debugging.

---

## 4. Synthesis & Reasoning Layer (Qwen3-14B)

Once all 6 sources have been scraped and aggregated into `raw_intel_{country_slug}.json`, the consolidated digest is fed into the local LLM with strict instructions:

### A. Foreign Affairs Filtering
- Filter strictly for:
  - Defense, military operations, naval/air exercises, weapons tests
  - Bilateral diplomacy, treaties, high-level foreign delegations
  - Cross-border economic policy (sanctions, oil corridors, trade agreements, IMF/bilateral financial aid)
  - Regional conflicts and border tensions
- Discard: domestic political mudslinging, local crime, sports, celebrity gossip, and spam.

### B. Abbreviation & Alias Expansion
- Expand recognized real-world military/diplomatic acronyms (e.g., `PN` $\rightarrow$ `Pakistan Navy`, `IAEA` $\rightarrow$ `International Atomic Energy Agency`, `CENTCOM` $\rightarrow$ `US Central Command`, `IRGC` $\rightarrow$ `Islamic Revolutionary Guard Corps`).
- Include weapons designations where relevant (e.g., `J-10C`, `F-16`, `Shaheen-III`, `Patriot`, `S-400`, `Hypersonic`).

### C. Twitter Boolean Search Query Construction
- For each approved topic, generate a production-ready Twitter boolean query combining:
  - Required event/topic names and their abbreviations using `OR` in parentheses.
  - Required context or country qualifiers using `AND` in parentheses.
- Example:
  `("Makkah Defence Pact" OR "Makkah Defense Pact" OR "Saudi Pak defence") AND (Pakistan OR Saudi OR military)`
  `("Sea Spark" OR "PN Sea Spark" OR "Sea Spark 2026") AND ("Pakistan Navy" OR exercise)`

---

## 5. Detailed Step-by-Step Agent Prompts

### A. Native X.com Explore & Tweet Mining Agent Prompt
```text
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
1. Navigate directly to https://x.com/search?q={trend_query}&f=top
2. Look at the top 5 to 7 visible tweets on the search results page.
3. Read the clean text content of each tweet. Extract only the actual text message written by the user. Do not include user profile handles, follower counts, timestamp strings, or image URLs.

STEP 5: Save your findings to a file
Using the write_file action, save all collected data into a JSON file named x_intel_{target_country_slug}.json with this exact structure:
{
  "country": "{target_country_name}",
  "trends_observed": ["trend 1", "trend 2"],
  "sample_tweets_by_trend": {
    "trend_name": ["tweet text 1", "tweet text 2", "tweet text 3"]
  }
}

STEP 6: Complete the task
After successfully writing x_intel_{target_country_slug}.json, call the done action.
```

### B. News Wire & Defense Extraction Agent Prompt
```text
Task: Extract top breaking defense, military, and international headlines from {source_name}.

STEP 1: Navigate to the website
Navigate to {source_url}.
Wait 3 seconds for the headlines to load on the screen.

STEP 2: Identify top breaking headlines
Look at the main news headlines visible on the homepage or top stories section.
Focus on:
- Military, defense, armed forces, weapons systems, and procurement
- Wars, regional conflicts, missile strikes, military deployments
- International diplomacy, sanctions, geopolitical summits, and treaties
Ignore local domestic lifestyle, entertainment, local crime, or weather news.

STEP 3: Collect top 10 to 15 clean headline strings
Read the text of the top 10 to 15 relevant headline titles. Keep each headline clean and concise.
Do NOT use the extract tool (to avoid dumping full HTML pages into context).

STEP 4: Save headlines to a JSON file
Using the write_file action, save the list of clean headline strings into a JSON file named news_{source_slug}.json with this structure:
{
  "source": "{source_name}",
  "headlines": ["Headline 1", "Headline 2", "Headline 3"]
}

STEP 5: Complete the task
Call the done action with a short confirmation message.
```

---

## 6. Output Schema

The final output is saved to `keywords.json`:

```json
{
  "generated_at": "2026-09-03T10:30:00+05:00",
  "country": "Pakistan",
  "sources_consulted": [
    "trends24",
    "defensenews",
    "breakingdefense",
    "reuters",
    "apnews",
    "foreignaffairs"
  ],
  "total_topics": 12,
  "topics": [
    {
      "label": "Makkah Defence Pact",
      "category": "defense",
      "terms": [
        "the makkah defence pact",
        "makkah defence pact",
        "saudi pakistan defence pact"
      ],
      "twitter_query": "(\"Makkah Defence Pact\" OR \"Makkah defense pact\" OR \"Saudi Pakistan defence\") AND (Pakistan OR Saudi OR military)"
    },
    {
      "label": "Pakistan Navy Sea Spark Exercise",
      "category": "defense",
      "terms": [
        "Pakistan Navy Sea Spark",
        "PN Sea Spark",
        "Sea Spark 2026"
      ],
      "twitter_query": "(\"Sea Spark\" OR \"PN Sea Spark\" OR \"Pakistan Navy Sea Spark\") AND (Navy OR exercise OR \"Arabian Sea\")"
    },
    {
      "label": "US-Iran Naval Posture & USS Abraham Lincoln",
      "category": "defense",
      "terms": [
        "USS Abraham Lincoln",
        "Strait of Hormuz",
        "CENTCOM deployment"
      ],
      "twitter_query": "(\"USS Abraham Lincoln\" OR \"Lincoln carrier\") AND (Iran OR \"Strait of Hormuz\" OR CENTCOM)"
    }
  ]
}
```

---

## 6. Code Style & Rules (AGENTS.md Compliance)

- **Extreme Readability**: Explicit, step-by-step procedural logic written like a junior engineer.
- **No Functional Shorthand**: Zero `map`, `filter`, `reduce`, or `lambda`. Standard `for` and `while` loops with descriptive index counters.
- **Descriptive Naming**: Full English words (`extracted_headlines_list`, `target_country_slug`, `current_source_item`).
- **Clean File Footprint**: All logic consolidated cleanly in [trends.py](file:///Users/hassanmansoor57/Documents/browser-agent/trends.py) and [countries.json](file:///Users/hassanmansoor57/Documents/browser-agent/countries.json).

---

## 7. Next Step: Implementation Plan

1. **Build the Parallel Extractor**: Update `trends.py` to fetch from all 6 sources in parallel using lightweight headers, parsing out clean headline titles.
2. **Store Raw Intermediary Intel**: Write all headlines to `raw_intel_{country_slug}.json`.
3. **Execute Single LLM Synthesis**: Feed the combined digest to `Qwen3-14B` to produce the final filtered keyword list and Twitter boolean queries.
4. **Save & Verify**: Verify output against `keywords.json`.
