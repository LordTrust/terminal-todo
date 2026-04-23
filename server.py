from __future__ import annotations

import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DB_DIR = BASE_DIR / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.environ.get("DATABASE_PATH", DB_DIR / "terminal_todo.db"))

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")

DEFAULT_THEME = {
    "accent": "#ff9e3d",
    "background": "#101315",
    "panel": "#171c1f",
    "text": "#ebf2ed",
    "done": "#5d7a68",
    "sortOpenFirst": True,
}

SAMPLE_TASKS = [
    {
        "text": "Terminal Look & Feel genießen",
        "done": False,
        "color": "#ff9e3d",
        "open_symbol": "[ ]",
        "done_symbol": "[X]",
    },
    {
        "text": "Hostinger Docker Deployment vorbereiten",
        "done": True,
        "color": "#68b984",
        "open_symbol": ">",
        "done_symbol": "✓",
    },
]


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                color TEXT NOT NULL,
                open_symbol TEXT NOT NULL,
                done_symbol TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.commit()

    ensure_default_settings()
    seed_tasks_if_empty()


def ensure_default_settings() -> None:
    with get_connection() as conn:
        for key, value in DEFAULT_THEME.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
                (key, str(value).lower() if isinstance(value, bool) else str(value)),
            )
        conn.commit()


def seed_tasks_if_empty() -> None:
    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) AS count FROM tasks").fetchone()["count"]
        if count:
            return

        now = int(time.time() * 1000)
        for index, task in enumerate(SAMPLE_TASKS):
            timestamp = now - (len(SAMPLE_TASKS) - index) * 1000
            conn.execute(
                """
                INSERT INTO tasks(id, text, done, color, open_symbol, done_symbol, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    task["text"],
                    int(task["done"]),
                    task["color"],
                    task["open_symbol"],
                    task["done_symbol"],
                    timestamp,
                    timestamp,
                ),
            )
        conn.commit()


def row_to_task(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "text": row["text"],
        "done": bool(row["done"]),
        "color": row["color"],
        "symbols": {
            "open": row["open_symbol"],
            "done": row["done_symbol"],
        },
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def get_tasks() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks ORDER BY created_at DESC"
        ).fetchall()
    return [row_to_task(row) for row in rows]


def get_theme() -> dict[str, Any]:
    with get_connection() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()

    theme = {**DEFAULT_THEME}
    for row in rows:
        value = row["value"]
        if row["key"] == "sortOpenFirst":
            theme[row["key"]] = value.lower() == "true"
        else:
            theme[row["key"]] = value
    return theme


@app.get("/health")
def health() -> tuple[str, int]:
    return "ok", 200


@app.get("/api/bootstrap")
def api_bootstrap():
    return jsonify({"tasks": get_tasks(), "theme": get_theme()})


@app.post("/api/tasks")
def api_create_task():
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", "")).strip()
    color = str(payload.get("color", DEFAULT_THEME["accent"]))
    symbols = payload.get("symbols") or {}
    open_symbol = str(symbols.get("open") or "[ ]").strip() or "[ ]"
    done_symbol = str(symbols.get("done") or "[X]").strip() or "[X]"

    if not text:
        return jsonify({"error": "Task text is required."}), 400

    now = int(time.time() * 1000)
    task_id = str(uuid.uuid4())

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO tasks(id, text, done, color, open_symbol, done_symbol, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (task_id, text, 0, color, open_symbol, done_symbol, now, now),
        )
        conn.commit()

    return jsonify({"ok": True, "task": next(task for task in get_tasks() if task["id"] == task_id)})


@app.patch("/api/tasks/<task_id>")
def api_update_task(task_id: str):
    payload = request.get_json(silent=True) or {}
    allowed_fields = {
        "text": "text",
        "done": "done",
        "color": "color",
    }

    updates: dict[str, Any] = {}
    for payload_key, db_key in allowed_fields.items():
        if payload_key in payload:
            value = payload[payload_key]
            if payload_key == "text":
                value = str(value).strip()
                if not value:
                    return jsonify({"error": "Task text cannot be empty."}), 400
            if payload_key == "done":
                value = int(bool(value))
            else:
                value = str(value)
            updates[db_key] = value

    symbols = payload.get("symbols")
    if symbols is not None:
        open_symbol = str(symbols.get("open", "")).strip()
        done_symbol = str(symbols.get("done", "")).strip()
        if open_symbol:
            updates["open_symbol"] = open_symbol
        if done_symbol:
            updates["done_symbol"] = done_symbol

    if not updates:
        return jsonify({"error": "No valid updates provided."}), 400

    updates["updated_at"] = int(time.time() * 1000)
    assignments = ", ".join(f"{key} = ?" for key in updates.keys())
    params = list(updates.values()) + [task_id]

    with get_connection() as conn:
        cursor = conn.execute(f"UPDATE tasks SET {assignments} WHERE id = ?", params)
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Task not found."}), 404

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify({"ok": True, "task": row_to_task(row)})


@app.delete("/api/tasks/<task_id>")
def api_delete_task(task_id: str):
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Task not found."}), 404
    return jsonify({"ok": True})


@app.delete("/api/tasks")
def api_delete_done_tasks():
    only_done = request.args.get("done") == "1"
    if not only_done:
        return jsonify({"error": "Only done-task bulk deletion is supported."}), 400

    with get_connection() as conn:
        conn.execute("DELETE FROM tasks WHERE done = 1")
        conn.commit()
    return jsonify({"ok": True})


@app.patch("/api/settings")
def api_update_settings():
    payload = request.get_json(silent=True) or {}
    allowed_keys = {"accent", "background", "panel", "text", "done", "sortOpenFirst"}
    incoming = {key: payload[key] for key in allowed_keys if key in payload}

    if not incoming:
        return jsonify({"error": "No valid settings provided."}), 400

    with get_connection() as conn:
        for key, value in incoming.items():
            stored_value = str(value).lower() if isinstance(value, bool) else str(value)
            conn.execute(
                "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, stored_value),
            )
        conn.commit()

    return jsonify({"ok": True, "theme": get_theme()})


@app.get("/")
def serve_index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:path>")
def serve_static(path: str):
    return send_from_directory(BASE_DIR, path)


init_db()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
