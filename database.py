import os
import sqlite3

from pathlib import Path
from contextlib import contextmanager
from datetime import datetime, timezone


# =====================================
# ELYX TRADING - DATABASE SYSTEM
# =====================================

DB_PATH = Path(
    os.getenv("ELYX_DB_PATH", "elyx_data.db")
)


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
    """Creates the required database tables."""

    with get_connection() as connection:

        connection.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                created_at TEXT NOT NULL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                file_path TEXT,
                status TEXT DEFAULT 'planned',
                created_at TEXT NOT NULL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)


def save_memory(user_id, content, category="general"):
    """Saves a memory for a user."""

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO memories
            (user_id, content, category, created_at)
            VALUES (?, ?, ?, ?)
        """, (
            str(user_id),
            str(content),
            str(category),
            current_time()
        ))

        return cursor.lastrowid


def get_memories(user_id, limit=20):
    """Retrieves recent memories for a user."""

    limit = max(1, min(int(limit), 100))

    with get_connection() as connection:
        rows = connection.execute("""
            SELECT id, user_id, content, category, created_at
            FROM memories
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ?
        """, (str(user_id), limit)).fetchall()

        return [dict(row) for row in rows]


def save_feature(
    name,
    description="",
    file_path="",
    status="planned"
):
    """Records a created or planned feature."""

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO features
            (name, description, file_path, status, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (
            str(name),
            str(description),
            str(file_path),
            str(status),
            current_time()
        ))

        return cursor.lastrowid


def get_features(limit=50):
    """Returns recently recorded features."""

    limit = max(1, min(int(limit), 200))

    with get_connection() as connection:
        rows = connection.execute("""
            SELECT *
            FROM features
            ORDER BY id DESC
            LIMIT ?
        """, (limit,)).fetchall()

        return [dict(row) for row in rows]


def set_setting(key, value):
    """Saves or updates a project setting."""

    with get_connection() as connection:
        connection.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key)
            DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        """, (
            str(key),
            str(value),
            current_time()
        ))


def get_setting(key, default=None):
    """Retrieves a saved project setting."""

    with get_connection() as connection:
        row = connection.execute("""
            SELECT value
            FROM settings
            WHERE key = ?
        """, (str(key),)).fetchone()

        return row["value"] if row else default
