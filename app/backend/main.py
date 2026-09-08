import os
import sys
import json
import asyncio
import urllib.parse
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

# We ensure project root is in sys.path so we can import modules cleanly
PROJECT_ROOT_DIRECTORY = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT_DIRECTORY not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_DIRECTORY)

from app.backend.database import (
    initialize_database,
    get_all_settings,
    update_setting_value,
    create_new_pipeline_run,
    update_pipeline_run_status,
    complete_pipeline_run_with_data,
    get_all_pipeline_runs,
    get_pipeline_run_details,
    delete_pipeline_run_by_id,
    clear_all_pipeline_runs,
    update_run_keywords_data,
    mark_active_runs_cancelled,
    get_all_twitter_handles,
    add_twitter_handle,
    update_twitter_handle,
    delete_twitter_handle,
    get_latest_twitter_scrape_run,
    get_all_scraped_tweets,
    clear_all_scraped_tweets
)
from app.backend.twitter_handles_runner import run_parallel_twitter_handles_pipeline

# Initialize the SQLite tables on startup
initialize_database()

app = FastAPI(title="Browser Agent Intelligence API", version="1.0.0")

# Enable CORS so the React frontend on Vite (localhost:5173) can talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# File paths for configuration files
SOURCES_FILE_PATH = os.path.join(PROJECT_ROOT_DIRECTORY, "sources.json")
COUNTRIES_FILE_PATH = os.path.join(PROJECT_ROOT_DIRECTORY, "countries.json")
RAW_SOURCES_FILE_PATH = os.path.join(PROJECT_ROOT_DIRECTORY, "raw_sources.json")
KEYWORDS_FILE_PATH = os.path.join(PROJECT_ROOT_DIRECTORY, "keywords.json")

# Pydantic models for request bodies
class SourceModel(BaseModel):
    name: str
    category: Optional[str] = "national_regional"
    type: str = "web"
    url: str
    enabled: bool = True

class SourceToggleModel(BaseModel):
    enabled: bool

class SettingsUpdateModel(BaseModel):
    settings: Dict[str, str]

class KeywordsUpdateModel(BaseModel):
    keywords_data: Dict[str, Any]

class TwitterHandleCreateModel(BaseModel):
    handle: str
    display_name: Optional[str] = ""
    category: Optional[str] = "General"

class TwitterHandleUpdateModel(BaseModel):
    display_name: Optional[str] = ""
    category: Optional[str] = "General"
    is_active: bool = True

class TwitterScrapeStartRequest(BaseModel):
    handles: Optional[List[str]] = None
    concurrency_level: Optional[int] = 6

# Active WebSocket connections list to broadcast live logs to the UI
active_websocket_connections: List[WebSocket] = []

async def broadcast_websocket_message(message_dictionary: Dict[str, Any]):
    # We iterate over all connected websockets and send the JSON message
    disconnected_connections = []
    for connection in active_websocket_connections:
        try:
            await connection.send_text(json.dumps(message_dictionary))
        except Exception:
            disconnected_connections.append(connection)
            
    # Clean up any dead connections
    for dead_connection in disconnected_connections:
        if dead_connection in active_websocket_connections:
            active_websocket_connections.remove(dead_connection)

@app.get("/api/health")
def get_health_status():
    return {"status": "ok", "message": "Browser Agent API is active"}

# ----------------- COUNTRIES API -----------------

@app.get("/api/countries")
def get_configured_countries():
    if not os.path.exists(COUNTRIES_FILE_PATH):
        raise HTTPException(status_code=404, detail="countries.json not found")
    with open(COUNTRIES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
        countries_data = json.load(file_pointer)
    return countries_data

# ----------------- SOURCES API -----------------

@app.get("/api/sources")
def get_configured_sources():
    if not os.path.exists(SOURCES_FILE_PATH):
        raise HTTPException(status_code=404, detail="sources.json not found")
    with open(SOURCES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
        sources_data = json.load(file_pointer)
    return sources_data

@app.post("/api/sources")
def add_new_source(new_source: SourceModel):
    sources_data = []
    if os.path.exists(SOURCES_FILE_PATH):
        with open(SOURCES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
            sources_data = json.load(file_pointer)
            
    # Auto-detect rss if url ends with /feed or /rss or contains rss
    detected_type = new_source.type
    url_lower = new_source.url.lower()
    if "/feed" in url_lower or "/rss" in url_lower or url_lower.endswith(".xml"):
        detected_type = "rss"

    new_entry = {
        "name": new_source.name,
        "category": new_source.category or "national_regional",
        "type": detected_type,
        "url": new_source.url,
        "enabled": new_source.enabled
    }
    
    sources_data.append(new_entry)
    
    with open(SOURCES_FILE_PATH, "w", encoding="utf-8") as file_pointer:
        json.dump(sources_data, file_pointer, indent=2, ensure_ascii=False)
        
    return {"message": "Source added successfully", "source": new_entry}

@app.patch("/api/sources/{source_index}")
def update_source_status(source_index: int, toggle_data: SourceToggleModel):
    if not os.path.exists(SOURCES_FILE_PATH):
        raise HTTPException(status_code=404, detail="sources.json not found")
    with open(SOURCES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
        sources_data = json.load(file_pointer)
        
    if source_index < 0 or source_index >= len(sources_data):
        raise HTTPException(status_code=400, detail="Invalid source index")
        
    sources_data[source_index]["enabled"] = toggle_data.enabled
    
    with open(SOURCES_FILE_PATH, "w", encoding="utf-8") as file_pointer:
        json.dump(sources_data, file_pointer, indent=2, ensure_ascii=False)
        
    return {"message": "Source updated", "source": sources_data[source_index]}

@app.delete("/api/sources/{source_index}")
def remove_configured_source(source_index: int):
    if not os.path.exists(SOURCES_FILE_PATH):
        raise HTTPException(status_code=404, detail="sources.json not found")
    with open(SOURCES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
        sources_data = json.load(file_pointer)
        
    if source_index < 0 or source_index >= len(sources_data):
        raise HTTPException(status_code=400, detail="Invalid source index")
        
    removed_item = sources_data.pop(source_index)
    
    with open(SOURCES_FILE_PATH, "w", encoding="utf-8") as file_pointer:
        json.dump(sources_data, file_pointer, indent=2, ensure_ascii=False)
        
    return {"message": "Source removed", "removed_source": removed_item}

# ----------------- SETTINGS API -----------------

@app.get("/api/settings")
def get_current_settings():
    return get_all_settings()

@app.put("/api/settings")
def update_multiple_settings(update_payload: SettingsUpdateModel):
    for key_name, value_string in update_payload.settings.items():
        update_setting_value(key_name, value_string)
    return {"message": "Settings updated successfully", "settings": get_all_settings()}

# ----------------- RUNS & HISTORY API -----------------

@app.get("/api/runs")
def list_pipeline_runs():
    return get_all_pipeline_runs()

@app.get("/api/runs/latest")
def get_latest_pipeline_results():
    # If a run exists in SQLite, return the most recent one
    all_runs = get_all_pipeline_runs()
    if len(all_runs) > 0:
        latest_run_id = all_runs[0]["id"]
        run_record = get_pipeline_run_details(latest_run_id)
        if run_record:
            # Parse raw_sources and keywords if they are strings
            raw_sources = None
            keywords = None
            if run_record["raw_sources_json"]:
                try:
                    raw_sources = json.loads(run_record["raw_sources_json"])
                except Exception:
                    pass
            if run_record["keywords_json"]:
                try:
                    keywords = json.loads(run_record["keywords_json"])
                except Exception:
                    pass
            return {
                "run_id": run_record["id"],
                "country_name": run_record["country_name"],
                "started_at": run_record["started_at"],
                "finished_at": run_record["finished_at"],
                "status": run_record["status"],
                "raw_sources": raw_sources,
                "keywords": keywords
            }
            
    # Fallback: If no DB runs yet, read directly from raw_sources.json and keywords.json on disk
    raw_sources_disk = None
    keywords_disk = None
    if os.path.exists(RAW_SOURCES_FILE_PATH):
        try:
            with open(RAW_SOURCES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
                raw_sources_disk = json.load(file_pointer)
        except Exception:
            pass
    if os.path.exists(KEYWORDS_FILE_PATH):
        try:
            with open(KEYWORDS_FILE_PATH, "r", encoding="utf-8") as file_pointer:
                keywords_disk = json.load(file_pointer)
        except Exception:
            pass
            
    return {
        "run_id": None,
        "country_name": "Worldwide",
        "started_at": None,
        "finished_at": None,
        "status": "completed" if (keywords_disk and keywords_disk.get("topics")) else "idle",
        "raw_sources": raw_sources_disk,
        "keywords": keywords_disk
    }

@app.get("/api/runs/{run_identifier}")
def get_single_run(run_identifier: int):
    record = get_pipeline_run_details(run_identifier)
    if not record:
        raise HTTPException(status_code=404, detail="Run not found")
        
    raw_sources = None
    keywords = None
    if record["raw_sources_json"]:
        try:
            raw_sources = json.loads(record["raw_sources_json"])
        except Exception:
            pass
    if record["keywords_json"]:
        try:
            keywords = json.loads(record["keywords_json"])
        except Exception:
            pass

    return {
        "id": record["id"],
        "country_name": record["country_name"],
        "started_at": record["started_at"],
        "finished_at": record["finished_at"],
        "status": record["status"],
        "error_message": record["error_message"],
        "raw_sources": raw_sources,
        "keywords": keywords,
        "log_output_text": record["log_output_text"]
    }

@app.post("/api/database/clear")
@app.delete("/api/runs")
def clear_entire_database_and_all_intelligence():
    # Clears all run records in the SQLite database
    clear_all_pipeline_runs()

    # Reset on-disk JSON cache files to empty structures
    empty_raw_sources_dictionary = {
        "news_sources_intel": {},
        "curated_x_sources_intel": {},
        "x_native_explore": {
            "country": "Worldwide",
            "trends_observed": [],
            "sample_tweets_by_trend": {}
        }
    }
    empty_keywords_dictionary = {
        "generated_at": None,
        "country": "Worldwide",
        "sources_consulted": [],
        "total_topics": 0,
        "topics": []
    }

    try:
        with open(RAW_SOURCES_FILE_PATH, "w", encoding="utf-8") as file_pointer:
            json.dump(empty_raw_sources_dictionary, file_pointer, indent=2, ensure_ascii=False)
    except Exception as raw_cache_error:
        print("Warning: Could not clear raw_sources.json: " + str(raw_cache_error))

    try:
        with open(KEYWORDS_FILE_PATH, "w", encoding="utf-8") as file_pointer:
            json.dump(empty_keywords_dictionary, file_pointer, indent=2, ensure_ascii=False)
    except Exception as keywords_cache_error:
        print("Warning: Could not clear keywords.json: " + str(keywords_cache_error))

    return {
        "message": "Database and caches cleared successfully",
        "raw_sources": empty_raw_sources_dictionary,
        "keywords": empty_keywords_dictionary
    }

@app.delete("/api/runs/{run_identifier}")
def delete_single_run(run_identifier: int):
    delete_pipeline_run_by_id(run_identifier)
    return {"message": "Run deleted successfully"}

@app.put("/api/runs/{run_identifier}/keywords")
def update_keywords_for_run(run_identifier: int, payload: KeywordsUpdateModel):
    new_json_str = json.dumps(payload.keywords_data, indent=2, ensure_ascii=False)
    update_run_keywords_data(run_identifier, new_json_str)
    
    # Also update keywords.json on disk so downstream consumers see the latest
    with open(KEYWORDS_FILE_PATH, "w", encoding="utf-8") as file_pointer:
        file_pointer.write(new_json_str)
        
    return {"message": "Keywords updated"}

@app.get("/api/runs/{run_identifier}/export")
def export_keywords(run_identifier: int, format: str = Query("json", enum=["json", "csv"])):
    record = get_pipeline_run_details(run_identifier)
    keywords_data = None
    if record and record["keywords_json"]:
        try:
            keywords_data = json.loads(record["keywords_json"])
        except Exception:
            pass
            
    if not keywords_data and os.path.exists(KEYWORDS_FILE_PATH):
        with open(KEYWORDS_FILE_PATH, "r", encoding="utf-8") as file_pointer:
            keywords_data = json.load(file_pointer)
            
    if not keywords_data:
        raise HTTPException(status_code=404, detail="No keywords data available to export")
        
    if format == "json":
        return PlainTextResponse(
            content=json.dumps(keywords_data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=keywords_run_{run_identifier}.json"}
        )
        
    # Build CSV procedural string
    csv_rows = ["Topic Label,Category,Keyword Term"]
    topics_list = keywords_data.get("topics", [])
    for topic_item in topics_list:
        topic_label = topic_item.get("label", "").replace('"', '""')
        category_name = topic_item.get("category", "").replace('"', '""')
        terms_list = topic_item.get("terms", [])
        for term_string in terms_list:
            escaped_term = term_string.replace('"', '""')
            csv_rows.append(f'"{topic_label}","{category_name}","{escaped_term}"')
            
    csv_output_string = "\n".join(csv_rows)
    return PlainTextResponse(
        content=csv_output_string,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=keywords_run_{run_identifier}.csv"}
    )

# ----------------- TWITTER HANDLES & SCRAPING API -----------------

current_running_twitter_scrape_task: Optional[asyncio.Task] = None
twitter_scrape_cancellation_event: Optional[asyncio.Event] = None
current_twitter_scrape_state: Dict[str, Any] = {
    "is_running": False,
    "status": "idle",
    "total_handles": 0,
    "completed_handles": 0,
    "total_tweets_collected": 0,
    "concurrency_level": 6,
    "active_workers": {},
    "started_at": None,
    "finished_at": None
}

@app.get("/api/twitter/handles")
def get_twitter_handles_endpoint():
    # Returns all configured handles with their categories and status
    handles = get_all_twitter_handles()
    return handles

@app.post("/api/twitter/handles")
def create_twitter_handle_endpoint(payload: TwitterHandleCreateModel):
    # Adds a new handle to the database
    new_id = add_twitter_handle(
        handle_string=payload.handle,
        display_name_string=payload.display_name,
        category_string=payload.category
    )
    return {"message": "Handle saved successfully", "id": new_id}

@app.put("/api/twitter/handles/{handle_identifier}")
def update_twitter_handle_endpoint(handle_identifier: int, payload: TwitterHandleUpdateModel):
    # Updates a handle's category, display name, or active status
    update_twitter_handle(
        handle_identifier=handle_identifier,
        display_name_string=payload.display_name,
        category_string=payload.category,
        is_active_boolean=payload.is_active
    )
    return {"message": "Handle updated successfully"}

@app.delete("/api/twitter/handles/{handle_identifier}")
def delete_twitter_handle_endpoint(handle_identifier: int):
    # Deletes a handle from the database
    delete_twitter_handle(handle_identifier)
    return {"message": "Handle deleted successfully"}

@app.get("/api/twitter/tweets")
def get_twitter_tweets_endpoint(
    handle: Optional[str] = None,
    category: Optional[str] = None,
    within_24h_only: bool = False,
    sort_by: str = "time",
    search: Optional[str] = None
):
    # Query scraped tweets with optional filters for handle, category, 24h, and sorting
    tweets = get_all_scraped_tweets(
        handle_filter_string=handle,
        category_filter_string=category,
        within_24h_only_boolean=within_24h_only,
        sort_by_string=sort_by,
        search_query_string=search
    )
    return tweets

@app.delete("/api/twitter/tweets")
def clear_twitter_tweets_endpoint():
    # Deletes all recorded tweets and resets tweet counts
    clear_all_scraped_tweets()
    return {"message": "All scraped tweets cleared successfully"}

@app.get("/api/twitter/scrape/status")
def get_twitter_scrape_status_endpoint():
    # Return active in-memory progress if currently running
    if current_twitter_scrape_state["is_running"]:
        return current_twitter_scrape_state

    # Otherwise return latest completed/cancelled run from database
    latest_run = get_latest_twitter_scrape_run()
    if latest_run is not None:
        return {
            "is_running": False,
            "status": latest_run["status"],
            "total_handles": latest_run["total_handles"],
            "completed_handles": latest_run["scraped_handles"],
            "total_tweets_collected": latest_run["total_tweets_found"],
            "concurrency_level": latest_run["concurrency_level"],
            "active_workers": {},
            "started_at": latest_run["started_at"],
            "finished_at": latest_run["finished_at"]
        }

    return current_twitter_scrape_state

@app.post("/api/twitter/scrape/start")
async def start_twitter_scrape_endpoint(payload: Optional[TwitterScrapeStartRequest] = None):
    global current_running_twitter_scrape_task, twitter_scrape_cancellation_event, current_twitter_scrape_state

    if current_twitter_scrape_state["is_running"]:
        raise HTTPException(status_code=400, detail="A Twitter scrape pipeline is already actively running")

    # Determine concurrency level (default 6, max 8)
    concurrency_level = 6
    if payload and payload.concurrency_level:
        concurrency_level = max(1, min(8, payload.concurrency_level))

    # Determine handles to scrape
    handles_to_scrape = []
    if payload and payload.handles and len(payload.handles) > 0:
        handles_to_scrape = payload.handles
    else:
        # Load all active handles from database
        all_handles = get_all_twitter_handles()
        for h_item in all_handles:
            if h_item.get("is_active", True):
                handles_to_scrape.append(h_item.get("handle"))

    if len(handles_to_scrape) == 0:
        raise HTTPException(status_code=400, detail="No active Twitter handles found to scrape")

    twitter_scrape_cancellation_event = asyncio.Event()
    current_time_iso = datetime.now().isoformat()

    current_twitter_scrape_state["is_running"] = True
    current_twitter_scrape_state["status"] = "running"
    current_twitter_scrape_state["total_handles"] = len(handles_to_scrape)
    current_twitter_scrape_state["completed_handles"] = 0
    current_twitter_scrape_state["total_tweets_collected"] = 0
    current_twitter_scrape_state["concurrency_level"] = concurrency_level
    current_twitter_scrape_state["active_workers"] = {}
    current_twitter_scrape_state["started_at"] = current_time_iso
    current_twitter_scrape_state["finished_at"] = None

    for w_idx in range(1, concurrency_level + 1):
        current_twitter_scrape_state["active_workers"][str(w_idx)] = "Starting..."

    async def log_callback(level_name: str, message_text: str):
        timestamp_str = datetime.now().strftime("%H:%M:%S")
        await broadcast_websocket_message({
            "type": "twitter_scrape_log",
            "level": level_name,
            "timestamp": timestamp_str,
            "message": message_text
        })

    async def progress_callback(progress_data: Dict[str, Any]):
        current_twitter_scrape_state["completed_handles"] = progress_data.get("completed_handles", 0)
        current_twitter_scrape_state["total_tweets_collected"] = progress_data.get("total_tweets_collected", 0)
        current_twitter_scrape_state["active_workers"] = progress_data.get("active_workers", {})
        await broadcast_websocket_message({
            "type": "twitter_scrape_progress",
            "data": progress_data
        })

    async def status_callback(status_name: str):
        current_twitter_scrape_state["status"] = status_name
        await broadcast_websocket_message({
            "type": "twitter_scrape_status",
            "status": status_name
        })

    async def tweet_saved_callback(tweet_data: Dict[str, Any]):
        await broadcast_websocket_message({
            "type": "twitter_scrape_tweet",
            "tweet": tweet_data
        })

    async def background_runner_wrapper():
        global current_running_twitter_scrape_task, current_twitter_scrape_state
        try:
            await run_parallel_twitter_handles_pipeline(
                handles_to_scrape_list=handles_to_scrape,
                concurrency_level=concurrency_level,
                cancellation_event=twitter_scrape_cancellation_event,
                log_callback=log_callback,
                progress_callback=progress_callback,
                status_callback=status_callback,
                tweet_saved_callback=tweet_saved_callback
            )
        except Exception as unhandled_err:
            current_twitter_scrape_state["status"] = "error"
            await log_callback("ERROR", f"Twitter scraper error: {str(unhandled_err)}")
            await status_callback("error")
        finally:
            current_twitter_scrape_state["is_running"] = False
            current_twitter_scrape_state["finished_at"] = datetime.now().isoformat()
            current_running_twitter_scrape_task = None

    current_running_twitter_scrape_task = asyncio.create_task(background_runner_wrapper())

    return {
        "status": "started",
        "total_handles": len(handles_to_scrape),
        "concurrency_level": concurrency_level
    }

@app.post("/api/twitter/scrape/cancel")
async def cancel_twitter_scrape_endpoint():
    global current_running_twitter_scrape_task, twitter_scrape_cancellation_event, current_twitter_scrape_state

    if twitter_scrape_cancellation_event is not None:
        twitter_scrape_cancellation_event.set()

    if current_running_twitter_scrape_task is not None and not current_running_twitter_scrape_task.done():
        current_running_twitter_scrape_task.cancel()
        current_running_twitter_scrape_task = None

    current_twitter_scrape_state["is_running"] = False
    current_twitter_scrape_state["status"] = "cancelled"
    current_twitter_scrape_state["finished_at"] = datetime.now().isoformat()

    await broadcast_websocket_message({
        "type": "twitter_scrape_status",
        "status": "cancelled"
    })
    await broadcast_websocket_message({
        "type": "twitter_scrape_log",
        "level": "WARN",
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "message": "Twitter scraper cancellation processed."
    })

    return {"status": "cancelled"}

# ----------------- TRENDS & KEYWORDS HELPERS & ENDPOINTS -----------------

# List of common navigation strings to filter out non-article headlines
WEB_NAVIGATION_JUNK_WORDS_LIST = [
    "advertisement",
    "subscribe",
    "newsletter",
    "sign in",
    "login",
    "cookie",
    "privacy policy",
    "terms of service",
    "skip to content",
    "all rights reserved",
    "scroll element",
    "home page"
]

def is_genuine_news_headline(candidate_text: str) -> bool:
    # Short snippets are usually navigation elements rather than genuine news headlines
    trimmed_headline = candidate_text.strip()
    if len(trimmed_headline) < 18:
        return False

    lowercased_headline = trimmed_headline.lower()
    for junk_word in WEB_NAVIGATION_JUNK_WORDS_LIST:
        if junk_word in lowercased_headline:
            return False

    return True

def get_source_category_label(source_title: str, fallback_label: str = "Global Intel") -> str:
    # Read category dynamically from sources.json if available
    category_display_map = {
        "defense_military": "Defense & Military",
        "geopolitics_strategy": "Geopolitics & Strategy",
        "national_regional": "National / Regional",
        "international": "International / Regional",
        "global": "Global Intel"
    }
    if os.path.exists(SOURCES_FILE_PATH):
        try:
            with open(SOURCES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
                configured_sources = json.load(file_pointer)
                for source_item in configured_sources:
                    if source_item.get("name", "").strip().lower() == source_title.strip().lower():
                        raw_category = source_item.get("category", "")
                        if raw_category in category_display_map:
                            return category_display_map[raw_category]
                        elif raw_category:
                            return raw_category.replace("_", " ").title()
        except Exception:
            pass
    return fallback_label

def resolve_source_website_url(source_name_string: str) -> str:
    # 1. Dynamically search sources.json for the configured URL first
    if os.path.exists(SOURCES_FILE_PATH):
        try:
            with open(SOURCES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
                configured_sources = json.load(file_pointer)
                for source_entry in configured_sources:
                    if source_entry.get("name", "").strip().lower() == source_name_string.strip().lower():
                        configured_url = source_entry.get("url", "")
                        parsed_url = urllib.parse.urlparse(configured_url)
                        if parsed_url.scheme and parsed_url.netloc:
                            return f"{parsed_url.scheme}://{parsed_url.netloc}"
                        return configured_url
        except Exception:
            pass

    # 2. Known domain mappings fallback
    lowercased_source_name = source_name_string.lower()

    if "defense news" in lowercased_source_name:
        return "https://www.defensenews.com"
    if "the news" in lowercased_source_name or "thenews" in lowercased_source_name:
        return "https://www.thenews.com.pk/latest/category/world"
    if "dawn" in lowercased_source_name:
        return "https://www.dawn.com"
    if "tribune" in lowercased_source_name:
        return "https://tribune.com.pk"
    if "breaking defense" in lowercased_source_name:
        return "https://breakingdefense.com"
    if "bbc" in lowercased_source_name:
        return "https://www.bbc.com/news/world"
    if "reuters" in lowercased_source_name:
        return "https://www.reuters.com/world"
    if "defense one" in lowercased_source_name:
        return "https://www.defenseone.com"
    if "janes" in lowercased_source_name:
        return "https://www.janes.com/defence-intelligence-insights/defence-news"
    if "foreign affairs" in lowercased_source_name:
        return "https://www.foreignaffairs.com"
    if "iiss" in lowercased_source_name:
        return "https://www.iiss.org"
    if "csis" in lowercased_source_name:
        return "https://www.csis.org"
    if "atlantic council" in lowercased_source_name:
        return "https://www.atlanticcouncil.org"

    return "https://www.google.com"

def extract_curated_top_trends(raw_intelligence_dictionary: Dict[str, Any], requested_limit: int = 10) -> List[Dict[str, Any]]:
    # Curates top trends matching the dashboard curation:
    # 1. Take up to 2 headlines from Defense News RSS
    # 2. Take 1 headline from The News International World
    # 3. Fill up to requested_limit with other news sources using dynamic categories
    curated_trends_list = []
    seen_headlines_set = set()

    news_sources_intel_map = raw_intelligence_dictionary.get("news_sources_intel", {})
    if not news_sources_intel_map:
        return curated_trends_list

    def attempt_add_headline(source_title: str, candidate_headline: str, category_name: str):
        if len(curated_trends_list) >= requested_limit:
            return
        cleaned_text = candidate_headline.strip()
        if not is_genuine_news_headline(cleaned_text):
            return
        if cleaned_text in seen_headlines_set:
            return
        seen_headlines_set.add(cleaned_text)

        target_website_url = resolve_source_website_url(source_title)
        resolved_category = get_source_category_label(source_title, fallback_label=category_name)
        current_rank_number = len(curated_trends_list) + 1
        curated_trends_list.append({
            "rank": current_rank_number,
            "headline": cleaned_text,
            "source_name": source_title,
            "source_url": target_website_url,
            "category": resolved_category
        })

    # Step 1: Find Defense News source key
    defense_news_source_key = ""
    for candidate_source_key in news_sources_intel_map.keys():
        if "defense news" in candidate_source_key.lower():
            defense_news_source_key = candidate_source_key
            break

    if len(defense_news_source_key) > 0:
        defense_headlines = news_sources_intel_map.get(defense_news_source_key, [])
        for headline_item in defense_headlines:
            if len(curated_trends_list) >= 2:
                break
            attempt_add_headline(defense_news_source_key, headline_item, "Defense & Military")

    # Step 2: Find The News International source key
    the_news_source_key = ""
    for candidate_source_key in news_sources_intel_map.keys():
        lowered_candidate_key = candidate_source_key.lower()
        if "the news" in lowered_candidate_key or "thenews" in lowered_candidate_key:
            the_news_source_key = candidate_source_key
            break

    if len(the_news_source_key) > 0:
        the_news_headlines = news_sources_intel_map.get(the_news_source_key, [])
        for headline_item in the_news_headlines:
            initial_count = len(curated_trends_list)
            attempt_add_headline(the_news_source_key, headline_item, "International / Regional")
            if len(curated_trends_list) > initial_count:
                break

    # Step 3: Gather remaining sources and add 1 from each source until reaching requested_limit
    remaining_source_keys_list = []
    for candidate_source_key in news_sources_intel_map.keys():
        if candidate_source_key != defense_news_source_key and candidate_source_key != the_news_source_key:
            remaining_source_keys_list.append(candidate_source_key)

    # Pass 1: Add 1 headline from each remaining source
    for remaining_source_key in remaining_source_keys_list:
        if len(curated_trends_list) >= requested_limit:
            break
        source_headlines = news_sources_intel_map.get(remaining_source_key, [])
        for headline_item in source_headlines:
            initial_count = len(curated_trends_list)
            attempt_add_headline(remaining_source_key, headline_item, "Global Intel")
            if len(curated_trends_list) > initial_count:
                break

    # Pass 2: If still under requested_limit, add more headlines from any source
    if len(curated_trends_list) < requested_limit:
        for candidate_source_key in news_sources_intel_map.keys():
            if len(curated_trends_list) >= requested_limit:
                break
            source_headlines = news_sources_intel_map.get(candidate_source_key, [])
            for headline_item in source_headlines:
                if len(curated_trends_list) >= requested_limit:
                    break
                attempt_add_headline(candidate_source_key, headline_item, "Global Intel")

    return curated_trends_list

def load_latest_keywords_dictionary(specific_run_identifier: Optional[int] = None) -> tuple[Optional[int], Dict[str, Any]]:
    # Loads keywords data from SQLite by run id or latest completed run, falling back to keywords.json
    if specific_run_identifier is not None:
        run_record = get_pipeline_run_details(specific_run_identifier)
        if run_record and run_record.get("keywords_json"):
            try:
                parsed_keywords = json.loads(run_record["keywords_json"])
                return (specific_run_identifier, parsed_keywords)
            except Exception:
                pass

    # Inspect runs from SQLite starting from the most recent
    all_runs_list = get_all_pipeline_runs()
    for run_summary in all_runs_list:
        run_record = get_pipeline_run_details(run_summary["id"])
        if run_record and run_record.get("keywords_json"):
            try:
                parsed_keywords = json.loads(run_record["keywords_json"])
                if parsed_keywords and parsed_keywords.get("topics"):
                    return (run_summary["id"], parsed_keywords)
            except Exception:
                pass

    # Fallback to keywords.json file on disk
    if os.path.exists(KEYWORDS_FILE_PATH):
        try:
            with open(KEYWORDS_FILE_PATH, "r", encoding="utf-8") as file_pointer:
                file_keywords_data = json.load(file_pointer)
                if file_keywords_data and file_keywords_data.get("topics"):
                    latest_run_id = all_runs_list[0]["id"] if len(all_runs_list) > 0 else None
                    return (latest_run_id, file_keywords_data)
        except Exception:
            pass

    return (None, {})

def build_flat_keywords_list(keywords_dictionary: Dict[str, Any]) -> List[str]:
    # Gathers all keyword terms from all topics without duplicate strings
    flat_keywords_list = []
    seen_keywords_set = set()

    topics_list = keywords_dictionary.get("topics", [])
    for topic_item in topics_list:
        terms_list = topic_item.get("terms", [])
        for term_string in terms_list:
            clean_term = term_string.strip()
            if len(clean_term) > 0 and clean_term not in seen_keywords_set:
                seen_keywords_set.add(clean_term)
                flat_keywords_list.append(clean_term)

    return flat_keywords_list

@app.get("/api/trends")
@app.get("/api/trends/top")
@app.get("/api/pipeline/trends")
def get_top_trends_endpoint(
    limit: int = Query(default=10, ge=1, le=50, description="Number of top trends to return"),
    run_id: Optional[int] = Query(default=None, description="Optional pipeline run ID")
):
    raw_intelligence_data = {}
    actual_run_id = None

    if run_id is not None:
        run_record = get_pipeline_run_details(run_id)
        if run_record and run_record.get("raw_sources_json"):
            try:
                raw_intelligence_data = json.loads(run_record["raw_sources_json"])
                actual_run_id = run_id
            except Exception:
                pass

    # If no specific run requested, inspect latest run in SQLite
    if not raw_intelligence_data:
        all_runs_list = get_all_pipeline_runs()
        for run_summary in all_runs_list:
            run_record = get_pipeline_run_details(run_summary["id"])
            if run_record and run_record.get("raw_sources_json"):
                try:
                    candidate_data = json.loads(run_record["raw_sources_json"])
                    if candidate_data and candidate_data.get("news_sources_intel"):
                        raw_intelligence_data = candidate_data
                        actual_run_id = run_summary["id"]
                        break
                except Exception:
                    pass

    # Fallback to raw_sources.json on disk if database is empty
    if not raw_intelligence_data and os.path.exists(RAW_SOURCES_FILE_PATH):
        try:
            with open(RAW_SOURCES_FILE_PATH, "r", encoding="utf-8") as file_pointer:
                candidate_data = json.load(file_pointer)
                if candidate_data and candidate_data.get("news_sources_intel"):
                    raw_intelligence_data = candidate_data
        except Exception:
            raw_intelligence_data = {}

    if not raw_intelligence_data or not raw_intelligence_data.get("news_sources_intel"):
        raise HTTPException(status_code=404, detail="No trends data available. Please run the pipeline first.")

    curated_trends = extract_curated_top_trends(raw_intelligence_data, requested_limit=limit)
    updated_at_timestamp = raw_intelligence_data.get("collected_at", "")
    sources_count = len(raw_intelligence_data.get("news_sources_intel", {}))

    return {
        "run_id": actual_run_id,
        "total_trends": len(curated_trends),
        "updated_at": updated_at_timestamp,
        "sources_consulted_count": sources_count,
        "trends": curated_trends
    }

@app.get("/api/keywords")
@app.get("/api/pipeline/keywords")
def get_keywords_endpoint(
    run_id: Optional[int] = Query(default=None, description="Optional pipeline run ID"),
    flat: bool = Query(default=False, description="If true, returns a flat list of keywords"),
    format: str = Query(default="json", description="Output format: 'json' or 'csv'")
):
    run_identifier, keywords_data = load_latest_keywords_dictionary(specific_run_identifier=run_id)

    if not keywords_data:
        raise HTTPException(status_code=404, detail="No keywords data found. Please run the pipeline first.")

    flat_keywords = build_flat_keywords_list(keywords_data)

    if format == "csv":
        csv_rows = ["Topic Label,Category,Keyword Term"]
        topics_list = keywords_data.get("topics", [])
        for topic_item in topics_list:
            topic_label = topic_item.get("label", "").replace('"', '""')
            category_name = topic_item.get("category", "").replace('"', '""')
            terms_list = topic_item.get("terms", [])
            for term_string in terms_list:
                escaped_term = term_string.replace('"', '""')
                csv_rows.append(f'"{topic_label}","{category_name}","{escaped_term}"')
        csv_content = "\n".join(csv_rows)
        return PlainTextResponse(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=intelligence_keywords.csv"}
        )

    if flat:
        return {
            "run_id": run_identifier,
            "generated_at": keywords_data.get("generated_at", ""),
            "total_keywords": len(flat_keywords),
            "keywords": flat_keywords
        }

    # Standard detailed JSON output
    formatted_topics = []
    topics_list = keywords_data.get("topics", [])
    topic_counter = 1
    for topic_item in topics_list:
        formatted_topics.append({
            "topic_id": topic_counter,
            "label": topic_item.get("label", ""),
            "category": topic_item.get("category", ""),
            "boolean_query": topic_item.get("boolean_query", ""),
            "terms": topic_item.get("terms", []),
            "sample_tweets": topic_item.get("sample_tweets", [])
        })
        topic_counter = topic_counter + 1

    return {
        "run_id": run_identifier,
        "generated_at": keywords_data.get("generated_at", ""),
        "total_topics": len(formatted_topics),
        "total_keywords": len(flat_keywords),
        "topics": formatted_topics,
        "flat_keywords_list": flat_keywords
    }

@app.get("/api/keywords/csv")
def get_keywords_csv_endpoint(
    run_id: Optional[int] = Query(default=None, description="Optional pipeline run ID")
):
    return get_keywords_endpoint(run_id=run_id, flat=False, format="csv")

from app.backend.pipeline_runner import run_multi_country_pipeline_orchestrator

# ----------------- WEBSOCKET & PIPELINE EXECUTION -----------------

# Global pipeline execution handles
current_running_pipeline_task: Optional[asyncio.Task] = None
pipeline_cancellation_event: Optional[asyncio.Event] = None

# In-memory dictionary tracking live pipeline execution progress
current_pipeline_progress_state: Dict[str, Any] = {
    "is_running": False,
    "status": "idle",
    "phase": "Idle",
    "current_step": 0,
    "total_steps": 0,
    "progress_percentage": 0,
    "detail": "Pipeline is idle and ready to run.",
    "started_at": None,
    "finished_at": None
}

class PipelineStartRequest(BaseModel):
    countries: List[str] = ["Worldwide"]

async def send_log_to_websockets(level_name: str, message_text: str):
    timestamp_string = datetime.now().strftime("%H:%M:%S")
    await broadcast_websocket_message({
        "type": "log",
        "level": level_name,
        "timestamp": timestamp_string,
        "message": message_text
    })

async def send_progress_to_websockets(
    phase_name: str,
    current_step_number: int,
    total_steps_count: int,
    detail_text: str,
    country_name: Optional[str] = None
):
    current_pipeline_progress_state["phase"] = phase_name
    current_pipeline_progress_state["current_step"] = current_step_number
    current_pipeline_progress_state["total_steps"] = total_steps_count
    current_pipeline_progress_state["detail"] = detail_text
    if total_steps_count > 0:
        computed_percentage = int((current_step_number / total_steps_count) * 100)
        current_pipeline_progress_state["progress_percentage"] = min(100, computed_percentage)

    await broadcast_websocket_message({
        "type": "progress",
        "phase": phase_name,
        "current_step": current_step_number,
        "total_steps": total_steps_count,
        "detail": detail_text,
        "country": country_name
    })

async def send_status_to_websockets(status_string: str):
    current_pipeline_progress_state["status"] = status_string
    if status_string == "running":
        current_pipeline_progress_state["is_running"] = True
    elif status_string in ["completed", "cancelled", "error", "idle"]:
        current_pipeline_progress_state["is_running"] = False

    await broadcast_websocket_message({
        "type": "status",
        "status": status_string
    })

async def send_result_to_websockets(result_dictionary: Dict[str, Any]):
    await broadcast_websocket_message({
        "type": "result",
        "data": result_dictionary
    })

async def trigger_pipeline_job(countries_list: List[str]):
    global current_running_pipeline_task, pipeline_cancellation_event

    if current_running_pipeline_task is not None and not current_running_pipeline_task.done():
        await send_log_to_websockets("WARN", "A pipeline execution is already in progress.")
        return {"status": "already_running"}

    pipeline_cancellation_event = asyncio.Event()

    async def execute_task_wrapper():
        global current_running_pipeline_task
        current_pipeline_progress_state["is_running"] = True
        current_pipeline_progress_state["status"] = "running"
        current_pipeline_progress_state["phase"] = "Starting"
        current_pipeline_progress_state["detail"] = "Initializing intelligence gathering..."
        current_pipeline_progress_state["started_at"] = datetime.now().isoformat()
        current_pipeline_progress_state["finished_at"] = None

        try:
            await run_multi_country_pipeline_orchestrator(
                selected_countries_list=countries_list,
                log_callback_function=send_log_to_websockets,
                progress_callback_function=send_progress_to_websockets,
                status_callback_function=send_status_to_websockets,
                result_callback_function=send_result_to_websockets,
                cancellation_event=pipeline_cancellation_event
            )
            current_pipeline_progress_state["status"] = "completed"
            current_pipeline_progress_state["phase"] = "Completed"
            current_pipeline_progress_state["detail"] = "Pipeline completed successfully."
            current_pipeline_progress_state["progress_percentage"] = 100
        except asyncio.CancelledError:
            mark_active_runs_cancelled("Cancelled by user")
            current_pipeline_progress_state["status"] = "cancelled"
            current_pipeline_progress_state["phase"] = "Cancelled"
            current_pipeline_progress_state["detail"] = "Pipeline was cancelled by user."
            await send_log_to_websockets("WARN", "Pipeline task was successfully aborted.")
            await send_status_to_websockets("cancelled")
        except Exception as unhandled_error:
            mark_active_runs_cancelled(f"Failed: {str(unhandled_error)}")
            current_pipeline_progress_state["status"] = "error"
            current_pipeline_progress_state["phase"] = "Error"
            current_pipeline_progress_state["detail"] = str(unhandled_error)
            await send_log_to_websockets("ERROR", f"Unhandled pipeline exception: {str(unhandled_error)}")
            await send_status_to_websockets("error")
        finally:
            current_pipeline_progress_state["is_running"] = False
            current_pipeline_progress_state["finished_at"] = datetime.now().isoformat()
            current_running_pipeline_task = None

    current_running_pipeline_task = asyncio.create_task(execute_task_wrapper())
    return {"status": "started", "countries": countries_list}

async def abort_pipeline_job():
    global current_running_pipeline_task, pipeline_cancellation_event

    if pipeline_cancellation_event is not None:
        pipeline_cancellation_event.set()

    if current_running_pipeline_task is not None and not current_running_pipeline_task.done():
        current_running_pipeline_task.cancel()
        current_running_pipeline_task = None

    current_pipeline_progress_state["is_running"] = False
    current_pipeline_progress_state["status"] = "cancelled"
    current_pipeline_progress_state["phase"] = "Cancelled"
    current_pipeline_progress_state["detail"] = "Pipeline cancellation requested."
    current_pipeline_progress_state["finished_at"] = datetime.now().isoformat()

    mark_active_runs_cancelled("Cancelled by user")
    await send_log_to_websockets("WARN", "Pipeline cancellation request processed.")
    await send_status_to_websockets("cancelled")
    return {"status": "cancelled"}

@app.get("/api/pipeline/status")
@app.get("/api/status")
def get_pipeline_status_endpoint():
    latest_run_id = None
    latest_run_finished_at = None
    latest_run_started_at = None
    latest_run_status = "idle"

    all_runs_list = get_all_pipeline_runs()
    if len(all_runs_list) > 0:
        latest_run_record = all_runs_list[0]
        latest_run_id = latest_run_record.get("id")
        latest_run_started_at = latest_run_record.get("started_at")
        latest_run_finished_at = latest_run_record.get("finished_at")
        latest_run_status = latest_run_record.get("status", "idle")

    # If the pipeline is not currently executing in memory, report the persistent run state
    reported_status = current_pipeline_progress_state["status"]
    reported_phase = current_pipeline_progress_state["phase"]
    reported_percentage = current_pipeline_progress_state["progress_percentage"]
    reported_detail = current_pipeline_progress_state["detail"]

    if not current_pipeline_progress_state["is_running"]:
        if latest_run_status in ["completed", "cancelled", "error"]:
            reported_status = latest_run_status
            if latest_run_status == "completed":
                reported_phase = "Completed"
                reported_percentage = 100
                reported_detail = "Pipeline completed successfully."
            elif latest_run_status == "cancelled":
                reported_phase = "Cancelled"
                reported_detail = "Pipeline execution was cancelled."
            elif latest_run_status == "error":
                reported_phase = "Error"

    return {
        "is_running": current_pipeline_progress_state["is_running"],
        "status": reported_status,
        "current_phase": reported_phase,
        "current_step": current_pipeline_progress_state["current_step"],
        "total_steps": current_pipeline_progress_state["total_steps"],
        "progress_percentage": reported_percentage,
        "detail": reported_detail,
        "started_at": current_pipeline_progress_state["started_at"] or latest_run_started_at,
        "finished_at": current_pipeline_progress_state["finished_at"] or latest_run_finished_at,
        "latest_run_id": latest_run_id,
        "latest_run_finished_at": latest_run_finished_at
    }

@app.post("/api/pipeline/start")
async def api_start_pipeline(request_payload: Optional[PipelineStartRequest] = None):
    target_countries = ["Worldwide"]
    if request_payload is not None and request_payload.countries:
        target_countries = request_payload.countries
    result = await trigger_pipeline_job(target_countries)
    return result

@app.post("/api/pipeline/cancel")
async def api_cancel_pipeline():
    result = await abort_pipeline_job()
    return result

@app.websocket("/ws/pipeline")
async def pipeline_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websocket_connections.append(websocket)

    # Send initial welcome log
    current_time_string = datetime.now().strftime("%H:%M:%S")
    await websocket.send_text(json.dumps({
        "type": "log",
        "level": "INFO",
        "timestamp": current_time_string,
        "message": "Connected to Browser Agent live telemetry stream."
    }))

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                command_payload = json.loads(raw_text)
                command_action = command_payload.get("action")

                if command_action == "start":
                    selected_countries = command_payload.get("countries", ["Worldwide"])
                    await trigger_pipeline_job(selected_countries)

                elif command_action == "cancel":
                    await abort_pipeline_job()

            except Exception as parse_error:
                await websocket.send_text(json.dumps({
                    "type": "log",
                    "level": "ERROR",
                    "timestamp": datetime.now().strftime("%H:%M:%S"),
                    "message": f"Invalid command message: {str(parse_error)}"
                }))
    except WebSocketDisconnect:
        if websocket in active_websocket_connections:
            active_websocket_connections.remove(websocket)
