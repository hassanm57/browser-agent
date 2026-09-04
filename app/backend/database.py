import sqlite3
import os
import json
from datetime import datetime

# We store the SQLite database file in the backend directory so it persists locally
BACKEND_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATABASE_FILE_PATH = os.path.join(BACKEND_DIRECTORY, "intelligence_records.db")

def get_database_connection():
    # We set detect_types and autocommit handling cleanly
    connection = sqlite3.connect(DATABASE_FILE_PATH)
    connection.row_factory = sqlite3.Row
    return connection

def initialize_database():
    connection = get_database_connection()
    cursor = connection.cursor()

    # Create the table for storing runs if it does not already exist
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            country_name TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            error_message TEXT,
            raw_sources_json TEXT,
            keywords_json TEXT,
            log_output_text TEXT
        )
    """)

    # Create the table for storing configurable user settings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS application_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL
        )
    """)

    # Default settings to seed if the table is empty
    default_settings_list = [
        ("vllm_base_url", "http://10.13.12.121:8000/v1"),
        ("vllm_api_key", "EMPTY"),
        ("llm_model_name", "qwen3-14b"),
        ("llm_maximum_tokens", "8192"),
        ("llm_timeout_seconds", "180"),
        ("headless_mode", "false"),
        ("use_real_chrome", "true"),
        ("maximum_tweets_per_trend", "20"),
        ("maximum_scroll_rounds", "12"),
        ("number_of_trends_to_mine", "5")
    ]

    for setting_tuple in default_settings_list:
        key_name = setting_tuple[0]
        default_value = setting_tuple[1]
        
        # Check if the key already exists before inserting
        cursor.execute(
            "SELECT setting_value FROM application_settings WHERE setting_key = ?",
            (key_name,)
        )
        existing_row = cursor.fetchone()
        if existing_row is None:
            cursor.execute(
                "INSERT INTO application_settings (setting_key, setting_value) VALUES (?, ?)",
                (key_name, default_value)
            )

    # Clean up any interrupted runs left in 'running' state from previous crashes/restarts
    cursor.execute("""
        UPDATE pipeline_runs
        SET status = 'cancelled', error_message = 'Interrupted by server restart'
        WHERE status = 'running'
    """)

    connection.commit()
    connection.close()

def mark_active_runs_cancelled(reason="Cancelled by user"):
    connection = get_database_connection()
    cursor = connection.cursor()
    finished_time_iso = datetime.now().isoformat()
    cursor.execute("""
        UPDATE pipeline_runs
        SET status = 'cancelled', finished_at = ?, error_message = ?
        WHERE status = 'running'
    """, (finished_time_iso, reason))
    connection.commit()
    connection.close()

def get_all_settings():
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT setting_key, setting_value FROM application_settings")
    rows = cursor.fetchall()
    
    settings_dictionary = {}
    for row in rows:
        settings_dictionary[row["setting_key"]] = row["setting_value"]
        
    connection.close()
    return settings_dictionary

def update_setting_value(setting_key, setting_value):
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("""
        INSERT INTO application_settings (setting_key, setting_value)
        VALUES (?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
    """, (setting_key, str(setting_value)))
    connection.commit()
    connection.close()

def create_new_pipeline_run(country_name):
    connection = get_database_connection()
    cursor = connection.cursor()
    current_time_iso = datetime.now().isoformat()
    
    cursor.execute("""
        INSERT INTO pipeline_runs (country_name, started_at, status)
        VALUES (?, ?, 'running')
    """, (country_name, current_time_iso))
    
    run_identifier = cursor.lastrowid
    connection.commit()
    connection.close()
    return run_identifier

def update_pipeline_run_status(run_identifier, status_name, error_message=None):
    connection = get_database_connection()
    cursor = connection.cursor()
    finished_time_iso = datetime.now().isoformat()
    
    cursor.execute("""
        UPDATE pipeline_runs
        SET status = ?, finished_at = ?, error_message = ?
        WHERE id = ?
    """, (status_name, finished_time_iso, error_message, run_identifier))
    
    connection.commit()
    connection.close()

def complete_pipeline_run_with_data(run_identifier, raw_sources_string, keywords_string, log_output_string):
    connection = get_database_connection()
    cursor = connection.cursor()
    finished_time_iso = datetime.now().isoformat()
    
    cursor.execute("""
        UPDATE pipeline_runs
        SET status = 'completed',
            finished_at = ?,
            raw_sources_json = ?,
            keywords_json = ?,
            log_output_text = ?
        WHERE id = ?
    """, (finished_time_iso, raw_sources_string, keywords_string, log_output_string, run_identifier))
    
    connection.commit()
    connection.close()

def get_all_pipeline_runs():
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, country_name, started_at, finished_at, status, error_message
        FROM pipeline_runs
        ORDER BY id DESC
    """)
    rows = cursor.fetchall()
    
    runs_list = []
    for row in rows:
        runs_list.append({
            "id": row["id"],
            "country_name": row["country_name"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "status": row["status"],
            "error_message": row["error_message"]
        })
        
    connection.close()
    return runs_list

def get_pipeline_run_details(run_identifier):
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM pipeline_runs WHERE id = ?", (run_identifier,))
    row = cursor.fetchone()
    connection.close()
    
    if row is None:
        return None
        
    return {
        "id": row["id"],
        "country_name": row["country_name"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
        "status": row["status"],
        "error_message": row["error_message"],
        "raw_sources_json": row["raw_sources_json"],
        "keywords_json": row["keywords_json"],
        "log_output_text": row["log_output_text"]
    }

def delete_pipeline_run_by_id(run_identifier):
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM pipeline_runs WHERE id = ?", (run_identifier,))
    connection.commit()
    connection.close()

def update_run_keywords_data(run_identifier, new_keywords_json_string):
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("""
        UPDATE pipeline_runs
        SET keywords_json = ?
        WHERE id = ?
    """, (new_keywords_json_string, run_identifier))
    connection.commit()
    connection.close()

def clear_all_pipeline_runs():
    # Deletes all recorded pipeline runs from the SQLite database table
    # and resets the autoincrement sequence so new runs start counting from 1
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM pipeline_runs")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name = 'pipeline_runs'")
    connection.commit()
    connection.close()

