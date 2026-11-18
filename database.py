import os
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from contextlib import contextmanager

DB_PATH = Path(os.getenv("ELYX_DB_PATH", "elyx_data.db"))


def current_time():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row

    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                created_at TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'planned',
                created_at TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT NOT NULL
            )
        """)


def save_memory(user_id, content, category="general"):
    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO memories (user_id, content, category, created_at)
            VALUES (?, ?, ?, ?)
        """, (str(user_id), str(content), str(category), current_time()))

        return cursor.lastrowid


def get_memories(user_id, limit=20):
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT id, user_id, content, category, created_at
            FROM memories
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ?
        """, (str(user_id), max(1, int(limit)))).fetchall()

        return [dict(row) for row in rows]


def save_feature(name, description="", status="planned"):
    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO features (name, description, status, created_at)
            VALUES (?, ?, ?, ?)
        """, (str(name), str(description), str(status), current_time()))

        return cursor.lastrowid


def get_features(status=None, limit=50):
    with get_connection() as conn:
        if status:
            rows = conn.execute("""
                SELECT id, name, description, status, created_at
                FROM features
                WHERE status = ?
                ORDER BY id DESC
                LIMIT ?
            """, (str(status), max(1, int(limit)))).fetchall()
        else:
            rows = conn.execute("""
                SELECT id, name, description, status, created_at
                FROM features
                ORDER BY id DESC
                LIMIT ?
            """, (max(1, int(limit)),)).fetchall()

        return [dict(row) for row in rows]


def set_setting(key, value):
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        """, (str(key), str(value), current_time()))

        return True


def get_setting(key, default=None):
    with get_connection() as conn:
        row = conn.execute("""
            SELECT value
            FROM settings
            WHERE key = ?
        """, (str(key),)).fetchone()

        return row["value"] if row else default
