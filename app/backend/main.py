import os
import sys
import json
import asyncio
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
    update_run_keywords_data
)

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
        "country_name": "Pakistan",
        "started_at": None,
        "finished_at": None,
        "status": "completed",
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

# ----------------- WEBSOCKET PIPELINE CONTROL -----------------

# Global pipeline control flag
current_running_task: Optional[asyncio.Task] = None

@app.websocket("/ws/pipeline")
async def pipeline_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websocket_connections.append(websocket)
    
    # Send an initial welcome log
    await websocket.send_text(json.dumps({
        "type": "log",
        "level": "INFO",
        "timestamp": "",
        "message": "Connected to Browser Agent live telemetry stream."
    }))
    
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                command_payload = json.loads(raw_text)
                command_action = command_payload.get("action")
                
                if command_action == "start":
                    selected_countries = command_payload.get("countries", ["Pakistan"])
                    await broadcast_websocket_message({
                        "type": "log",
                        "level": "INFO",
                        "timestamp": "",
                        "message": f"Pipeline start command received for countries: {', '.join(selected_countries)}"
                    })
                    await broadcast_websocket_message({
                        "type": "status",
                        "status": "running"
                    })
                    
                elif command_action == "cancel":
                    await broadcast_websocket_message({
                        "type": "log",
                        "level": "WARN",
                        "timestamp": "",
                        "message": "Pipeline cancellation requested by user."
                    })
                    await broadcast_websocket_message({
                        "type": "status",
                        "status": "cancelled"
                    })
            except Exception as parse_error:
                await websocket.send_text(json.dumps({
                    "type": "log",
                    "level": "ERROR",
                    "timestamp": "",
                    "message": f"Invalid command message: {str(parse_error)}"
                }))
    except WebSocketDisconnect:
        if websocket in active_websocket_connections:
            active_websocket_connections.remove(websocket)
