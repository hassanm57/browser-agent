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

    # Create table for Twitter/X handles list
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS twitter_handles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            handle TEXT NOT NULL UNIQUE,
            display_name TEXT,
            category TEXT DEFAULT 'General',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            last_scraped_at TEXT,
            last_tweet_count INTEGER DEFAULT 0
        )
    """)

    # Create table for Twitter scrape runs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS twitter_scrape_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            total_handles INTEGER NOT NULL DEFAULT 0,
            scraped_handles INTEGER NOT NULL DEFAULT 0,
            total_tweets_found INTEGER NOT NULL DEFAULT 0,
            concurrency_level INTEGER NOT NULL DEFAULT 3,
            error_message TEXT,
            log_output_text TEXT
        )
    """)

    # Create table for individual scraped tweets with metrics
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS twitter_scraped_tweets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER,
            handle TEXT NOT NULL,
            author_display_name TEXT,
            tweet_text TEXT NOT NULL,
            tweet_timestamp_text TEXT,
            tweet_time_iso TEXT,
            is_within_24h INTEGER NOT NULL DEFAULT 1,
            views_count INTEGER DEFAULT 0,
            likes_count INTEGER DEFAULT 0,
            reposts_count INTEGER DEFAULT 0,
            replies_count INTEGER DEFAULT 0,
            bookmarks_count INTEGER DEFAULT 0,
            tweet_url TEXT,
            scraped_at TEXT NOT NULL
        )
    """)

    # Clean up interrupted twitter scrape runs from previous crashes/restarts
    cursor.execute("""
        UPDATE twitter_scrape_runs
        SET status = 'cancelled', error_message = 'Interrupted by server restart'
        WHERE status = 'running'
    """)

    # Seed initial handles from R3_handles.pdf if the handles table is empty
    cursor.execute("SELECT COUNT(*) AS total_count FROM twitter_handles")
    handles_count_row = cursor.fetchone()
    total_existing_handles = handles_count_row["total_count"]

    if total_existing_handles == 0:
        current_time_iso = datetime.now().isoformat()
        
        # Initial 79 handles categorized by domain
        initial_pakistan_handles = [
            "ISSIslamabad", "CISS_Islamabad", "ciss_ajk", "CISSS_Karachi", "bttn_quetta",
            "IPRI_Pak", "IRSIslamabad", "SVI_Pakistan", "CGSS_Pakistan", "for_issi",
            "ACDC_ISSI", "CPSC_ISSI", "CAMEA_ISSI", "CassThinkers", "CRSSpak",
            "SassiUniversity", "cpgs_org", "RSIL_Pak", "IPS_Pak", "SDPIPakistan",
            "PciPakChina", "JinnahInstitute", "PIDEpk"
        ]
        
        initial_global_handles = [
            "IISS_org", "RUSI_org", "ChathamHouse", "CSIS", "RANDCorporation",
            "CNASdc", "CarnegieEndow", "BrookingsInst", "CFR_org", "AtlanticCouncil",
            "StimsonCenter", "NTI_WMD", "ArmsControlNow", "BulletinAtomic", "CSBAonline",
            "BelferCenter", "TheWilsonCenter", "USIP", "SIPRIorg", "SWP_Berlin",
            "gmfus", "CrisisGroup", "ecfr", "EU_ISS", "IFRI_",
            "PISM_Poland", "ASPI_ICPC", "LowyInstitute", "AsiaPolicy", "IISS_Asia"
        ]
        
        initial_india_handles = [
            "IDSAIndia", "orfonline", "VIFIndia", "OfficialCLAWSIN", "CENJOWS",
            "USIofIndia", "CAPS_INDIA", "nmfindia", "TakshashilaInst", "CarnegieIndia",
            "delhipolicygrp", "GatewayHouseIND", "indiafoundation", "ICWA_NewDelhi", "IPCS_org",
            "ics_delhi", "CCCS_India", "C3SIndia", "NIAS_Institute", "Synergia_Fdn",
            "RIS_NewDelhi", "namstcentre", "SAAG_org", "CSDR_India", "CSEP_Org",
            "ChintanResearch"
        ]

        for handle_name in initial_pakistan_handles:
            cursor.execute("""
                INSERT INTO twitter_handles (handle, display_name, category, is_active, created_at)
                VALUES (?, ?, 'Pakistan', 1, ?)
            """, (handle_name, handle_name, current_time_iso))

        for handle_name in initial_global_handles:
            cursor.execute("""
                INSERT INTO twitter_handles (handle, display_name, category, is_active, created_at)
                VALUES (?, ?, 'Global Think Tanks', 1, ?)
            """, (handle_name, handle_name, current_time_iso))

        for handle_name in initial_india_handles:
            cursor.execute("""
                INSERT INTO twitter_handles (handle, display_name, category, is_active, created_at)
                VALUES (?, ?, 'India Think Tanks', 1, ?)
            """, (handle_name, handle_name, current_time_iso))

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


# ==============================================================================
# TWITTER / X HANDLES & SCRAPED TWEETS DATABASE FUNCTIONS
# ==============================================================================

def get_all_twitter_handles():
    # Return all configured handles ordered alphabetically by handle name
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, handle, display_name, category, is_active, created_at, last_scraped_at, last_tweet_count
        FROM twitter_handles
        ORDER BY category ASC, handle ASC
    """)
    rows = cursor.fetchall()

    handles_list = []
    for row in rows:
        handles_list.append({
            "id": row["id"],
            "handle": row["handle"],
            "display_name": row["display_name"] if row["display_name"] else row["handle"],
            "category": row["category"],
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
            "last_scraped_at": row["last_scraped_at"],
            "last_tweet_count": row["last_tweet_count"]
        })

    connection.close()
    return handles_list


def add_twitter_handle(handle_string, display_name_string="", category_string="General"):
    # Strip any leading '@' or whitespace so handles are stored consistently
    clean_handle = handle_string.strip().lstrip("@")
    if not display_name_string:
        clean_display_name = clean_handle
    else:
        clean_display_name = display_name_string.strip()

    connection = get_database_connection()
    cursor = connection.cursor()
    current_time_iso = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO twitter_handles (handle, display_name, category, is_active, created_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(handle) DO UPDATE SET
            display_name = excluded.display_name,
            category = excluded.category,
            is_active = 1
    """, (clean_handle, clean_display_name, category_string.strip(), current_time_iso))

    inserted_handle_id = cursor.lastrowid
    connection.commit()
    connection.close()
    return inserted_handle_id


def update_twitter_handle(handle_identifier, display_name_string, category_string, is_active_boolean):
    connection = get_database_connection()
    cursor = connection.cursor()

    active_integer_value = 1 if is_active_boolean else 0
    cursor.execute("""
        UPDATE twitter_handles
        SET display_name = ?, category = ?, is_active = ?
        WHERE id = ?
    """, (display_name_string.strip(), category_string.strip(), active_integer_value, handle_identifier))

    connection.commit()
    connection.close()


def delete_twitter_handle(handle_identifier):
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM twitter_handles WHERE id = ?", (handle_identifier,))
    connection.commit()
    connection.close()


def create_twitter_scrape_run(total_handles_count, concurrency_level_count=3):
    connection = get_database_connection()
    cursor = connection.cursor()
    current_time_iso = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO twitter_scrape_runs (
            started_at, status, total_handles, scraped_handles, total_tweets_found, concurrency_level
        ) VALUES (?, 'running', ?, 0, 0, ?)
    """, (current_time_iso, total_handles_count, concurrency_level_count))

    scrape_run_id = cursor.lastrowid
    connection.commit()
    connection.close()
    return scrape_run_id


def update_twitter_scrape_run_progress(scrape_run_id, scraped_handles_count, total_tweets_count):
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("""
        UPDATE twitter_scrape_runs
        SET scraped_handles = ?, total_tweets_found = ?
        WHERE id = ?
    """, (scraped_handles_count, total_tweets_count, scrape_run_id))
    connection.commit()
    connection.close()


def complete_twitter_scrape_run(scrape_run_id, status_name="completed", error_message=None, log_output_string=""):
    connection = get_database_connection()
    cursor = connection.cursor()
    finished_time_iso = datetime.now().isoformat()

    cursor.execute("""
        UPDATE twitter_scrape_runs
        SET status = ?, finished_at = ?, error_message = ?, log_output_text = ?
        WHERE id = ?
    """, (status_name, finished_time_iso, error_message, log_output_string, scrape_run_id))

    connection.commit()
    connection.close()


def get_latest_twitter_scrape_run():
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, started_at, finished_at, status, total_handles, scraped_handles, total_tweets_found, concurrency_level, error_message
        FROM twitter_scrape_runs
        ORDER BY id DESC
        LIMIT 1
    """)
    row = cursor.fetchone()
    connection.close()

    if row is None:
        return None

    return {
        "id": row["id"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
        "status": row["status"],
        "total_handles": row["total_handles"],
        "scraped_handles": row["scraped_handles"],
        "total_tweets_found": row["total_tweets_found"],
        "concurrency_level": row["concurrency_level"],
        "error_message": row["error_message"]
    }


def insert_scraped_tweet(tweet_data_dictionary):
    connection = get_database_connection()
    cursor = connection.cursor()
    current_time_iso = datetime.now().isoformat()

    # Extract all tweet fields explicitly
    run_identifier = tweet_data_dictionary.get("run_id")
    handle_string = tweet_data_dictionary.get("handle", "").lstrip("@")
    author_name_string = tweet_data_dictionary.get("author_display_name", "")
    body_text_string = tweet_data_dictionary.get("tweet_text", "")
    timestamp_text_string = tweet_data_dictionary.get("tweet_timestamp_text", "")
    time_iso_string = tweet_data_dictionary.get("tweet_time_iso", current_time_iso)
    is_within_24h_int = 1 if tweet_data_dictionary.get("is_within_24h", True) else 0
    views_int = int(tweet_data_dictionary.get("views_count", 0))
    likes_int = int(tweet_data_dictionary.get("likes_count", 0))
    reposts_int = int(tweet_data_dictionary.get("reposts_count", 0))
    replies_int = int(tweet_data_dictionary.get("replies_count", 0))
    bookmarks_int = int(tweet_data_dictionary.get("bookmarks_count", 0))
    url_string = tweet_data_dictionary.get("tweet_url", "")

    # Prevent saving duplicate tweets for the same handle and text content
    cursor.execute("""
        SELECT id FROM twitter_scraped_tweets
        WHERE handle = ? AND tweet_text = ?
        LIMIT 1
    """, (handle_string, body_text_string))
    existing_tweet_row = cursor.fetchone()

    if existing_tweet_row is None:
        cursor.execute("""
            INSERT INTO twitter_scraped_tweets (
                run_id, handle, author_display_name, tweet_text, tweet_timestamp_text,
                tweet_time_iso, is_within_24h, views_count, likes_count,
                reposts_count, replies_count, bookmarks_count, tweet_url, scraped_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            run_identifier, handle_string, author_name_string, body_text_string, timestamp_text_string,
            time_iso_string, is_within_24h_int, views_int, likes_int,
            reposts_int, replies_int, bookmarks_int, url_string, current_time_iso
        ))
    else:
        # Gracefully refresh engagement metrics and 24h classification when re-scraping
        existing_tweet_id = existing_tweet_row["id"]
        cursor.execute("""
            UPDATE twitter_scraped_tweets
            SET run_id = ?,
                author_display_name = ?,
                tweet_timestamp_text = ?,
                is_within_24h = ?,
                views_count = ?,
                likes_count = ?,
                reposts_count = ?,
                replies_count = ?,
                bookmarks_count = ?,
                scraped_at = ?
            WHERE id = ?
        """, (
            run_identifier, author_name_string, timestamp_text_string,
            is_within_24h_int, views_int, likes_int,
            reposts_int, replies_int, bookmarks_int, current_time_iso,
            existing_tweet_id
        ))

    # Update handle metadata with latest scraping timestamp
    cursor.execute("""
        UPDATE twitter_handles
        SET last_scraped_at = ?
        WHERE handle = ?
    """, (current_time_iso, handle_string))

    connection.commit()
    connection.close()


def update_handle_last_tweet_count(handle_string, tweets_count):
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("""
        UPDATE twitter_handles
        SET last_tweet_count = ?
        WHERE handle = ?
    """, (tweets_count, handle_string.lstrip("@")))
    connection.commit()
    connection.close()


def get_all_scraped_tweets(handle_filter_string=None, category_filter_string=None, within_24h_only_boolean=False, sort_by_string="views", search_query_string=""):
    connection = get_database_connection()
    cursor = connection.cursor()

    query_sql = """
        SELECT 
            t.id, t.run_id, t.handle, t.author_display_name, t.tweet_text,
            t.tweet_timestamp_text, t.tweet_time_iso, t.is_within_24h,
            t.views_count, t.likes_count, t.reposts_count, t.replies_count,
            t.bookmarks_count, t.tweet_url, t.scraped_at,
            h.category AS handle_category
        FROM twitter_scraped_tweets t
        LEFT JOIN twitter_handles h ON t.handle = h.handle
        WHERE 1 = 1
    """
    query_parameters = []

    if handle_filter_string and handle_filter_string.strip():
        query_sql += " AND LOWER(t.handle) = LOWER(?)"
        query_parameters.append(handle_filter_string.strip().lstrip("@"))

    if category_filter_string and category_filter_string.strip():
        query_sql += " AND h.category = ?"
        query_parameters.append(category_filter_string.strip())

    if within_24h_only_boolean:
        query_sql += " AND t.is_within_24h = 1"

    if search_query_string and search_query_string.strip():
        query_sql += " AND (LOWER(t.tweet_text) LIKE ? OR LOWER(t.handle) LIKE ? OR LOWER(t.author_display_name) LIKE ?)"
        wildcard_search = f"%{search_query_string.strip().lower()}%"
        query_parameters.append(wildcard_search)
        query_parameters.append(wildcard_search)
        query_parameters.append(wildcard_search)

    # Apply sorting
    if sort_by_string == "likes":
        query_sql += " ORDER BY t.likes_count DESC, t.id DESC"
    elif sort_by_string == "views":
        query_sql += " ORDER BY t.views_count DESC, t.id DESC"
    elif sort_by_string == "reposts":
        query_sql += " ORDER BY t.reposts_count DESC, t.id DESC"
    elif sort_by_string == "replies":
        query_sql += " ORDER BY t.replies_count DESC, t.id DESC"
    else:
        # Default order by newest scraped ID first
        query_sql += " ORDER BY t.id DESC"

    cursor.execute(query_sql, query_parameters)
    rows = cursor.fetchall()

    tweets_list = []
    for row in rows:
        tweets_list.append({
            "id": row["id"],
            "run_id": row["run_id"],
            "handle": row["handle"],
            "author_display_name": row["author_display_name"] if row["author_display_name"] else row["handle"],
            "tweet_text": row["tweet_text"],
            "tweet_timestamp_text": row["tweet_timestamp_text"],
            "tweet_time_iso": row["tweet_time_iso"],
            "is_within_24h": bool(row["is_within_24h"]),
            "views_count": row["views_count"],
            "likes_count": row["likes_count"],
            "reposts_count": row["reposts_count"],
            "replies_count": row["replies_count"],
            "bookmarks_count": row["bookmarks_count"],
            "tweet_url": row["tweet_url"],
            "scraped_at": row["scraped_at"],
            "handle_category": row["handle_category"] if row["handle_category"] else "General"
        })

    connection.close()
    return tweets_list


def clear_all_scraped_tweets():
    connection = get_database_connection()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM twitter_scraped_tweets")
    cursor.execute("DELETE FROM twitter_scrape_runs")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name = 'twitter_scraped_tweets'")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name = 'twitter_scrape_runs'")
    cursor.execute("UPDATE twitter_handles SET last_tweet_count = 0")
    connection.commit()
    connection.close()


