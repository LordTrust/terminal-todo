from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from datetime import date, timedelta
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
        "due_date": None,
        "recurrence_rule": None,
        "recurrence_anchor": None,
    },
    {
        "text": "Hostinger Docker Deployment vorbereiten",
        "done": True,
        "color": "#68b984",
        "open_symbol": ">",
        "done_symbol": "✓",
        "due_date": None,
        "recurrence_rule": None,
        "recurrence_anchor": None,
    },
]


class ValidationError(Exception):
    pass


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_task_columns(conn: sqlite3.Connection) -> set[str]:
    return {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}


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

        columns = get_task_columns(conn)
        migrations = {
            "due_date": "ALTER TABLE tasks ADD COLUMN due_date TEXT",
            "recurrence_rule": "ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT",
            "recurrence_anchor": "ALTER TABLE tasks ADD COLUMN recurrence_anchor TEXT",
            "last_completed_at": "ALTER TABLE tasks ADD COLUMN last_completed_at INTEGER",
        }
        for column, statement in migrations.items():
            if column not in columns:
                conn.execute(statement)

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
                INSERT INTO tasks(
                    id, text, done, color, open_symbol, done_symbol,
                    created_at, updated_at, due_date, recurrence_rule, recurrence_anchor
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    task["due_date"],
                    task["recurrence_rule"],
                    task["recurrence_anchor"],
                ),
            )
        conn.commit()


def parse_iso_date(value: str | None) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValidationError("Ungültiges Datum. Erwartet YYYY-MM-DD.") from exc


def to_iso_date(value: date | None) -> str | None:
    return value.isoformat() if value else None


def add_months(value: date, months: int) -> date:
    month_index = (value.year * 12 + (value.month - 1)) + months
    year = month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def is_workday(value: date) -> bool:
    return value.weekday() < 5


def shift_to_workday(value: date, direction: str) -> date:
    delta = -1 if direction == "previous_workday" else 1
    current = value
    while not is_workday(current):
        current += timedelta(days=delta)
    return current


def nth_workday_of_month(year: int, month: int, nth: int) -> date:
    counter = 0
    for day in range(1, last_day_of_month(year, month) + 1):
        current = date(year, month, day)
        if is_workday(current):
            counter += 1
            if counter == nth:
                return current
    raise ValidationError(f"Monat {month:02d}/{year} hat keinen {nth}. Arbeitstag.")


def last_workday_of_month(year: int, month: int) -> date:
    current = date(year, month, last_day_of_month(year, month))
    while not is_workday(current):
        current -= timedelta(days=1)
    return current


def days_before_month_end(year: int, month: int, days_before: int) -> date:
    current = date(year, month, last_day_of_month(year, month)) - timedelta(days=days_before)
    if current.month != month:
        raise ValidationError("Zu viele Tage vor Monatsende für diesen Monat.")
    return current


def ordinal_weekday_of_month(year: int, month: int, weekday: int, ordinal: int) -> date:
    matches = [
        date(year, month, day)
        for day in range(1, last_day_of_month(year, month) + 1)
        if date(year, month, day).weekday() == weekday
    ]
    if not matches:
        raise ValidationError("Kein passender Wochentag in diesem Monat gefunden.")
    if ordinal == -1:
        return matches[-1]
    if 1 <= ordinal <= len(matches):
        return matches[ordinal - 1]
    raise ValidationError("Ungültige Wochentag-Position im Monat.")


def monthly_day_of_month(year: int, month: int, day_of_month: int, shift: str) -> date:
    day = min(day_of_month, last_day_of_month(year, month))
    current = date(year, month, day)
    if shift == "none" or is_workday(current):
        return current
    if shift not in {"previous_workday", "next_workday"}:
        raise ValidationError("Ungültige Wochenend-Regel.")
    return shift_to_workday(current, shift)


def apply_workday_shift(value: date, shift: str) -> date:
    if shift == "none" or is_workday(value):
        return value
    if shift not in {"previous_workday", "next_workday"}:
        raise ValidationError("Ungültige Wochenend-Regel.")
    return shift_to_workday(value, shift)


def normalize_recurrence(payload: Any) -> dict[str, Any] | None:
    if not payload:
        return None

    kind = str((payload or {}).get("kind") or "").strip()
    if not kind or kind == "none":
        return None

    if kind == "monthly_nth_workday":
        nth = int(payload.get("nth", 0))
        if nth < 1 or nth > 23:
            raise ValidationError("Arbeitstag im Monat muss zwischen 1 und 23 liegen.")
        return {"kind": kind, "nth": nth}

    if kind == "monthly_last_workday":
        return {"kind": kind}

    if kind == "monthly_ordinal_weekday":
        weekday = int(payload.get("weekday", -1))
        ordinal = int(payload.get("ordinal", 0))
        if weekday < 0 or weekday > 6:
            raise ValidationError("Wochentag muss zwischen Montag und Sonntag liegen.")
        if ordinal not in {1, 2, 3, 4, -1}:
            raise ValidationError("Position im Monat muss 1, 2, 3, 4 oder letzter sein.")
        return {"kind": kind, "weekday": weekday, "ordinal": ordinal}

    if kind == "monthly_day_of_month":
        day_of_month = int(payload.get("day", 0))
        shift = str(payload.get("shift") or "none")
        if day_of_month < 1 or day_of_month > 31:
            raise ValidationError("Kalendertag im Monat muss zwischen 1 und 31 liegen.")
        if shift not in {"none", "previous_workday", "next_workday"}:
            raise ValidationError("Ungültige Wochenend-Regel.")
        return {"kind": kind, "day": day_of_month, "shift": shift}

    if kind == "monthly_days_before_month_end":
        days_before = int(payload.get("daysBefore", -1))
        shift = str(payload.get("shift") or "none")
        if days_before < 0 or days_before > 30:
            raise ValidationError("Tage vor Monatsende müssen zwischen 0 und 30 liegen.")
        if shift not in {"none", "previous_workday", "next_workday"}:
            raise ValidationError("Ungültige Wochenend-Regel.")
        return {"kind": kind, "daysBefore": days_before, "shift": shift}

    raise ValidationError("Unbekannte Wiederholregel.")


def compute_occurrence_for_month(rule: dict[str, Any], year: int, month: int) -> date:
    kind = rule["kind"]
    if kind == "monthly_nth_workday":
        return nth_workday_of_month(year, month, int(rule["nth"]))
    if kind == "monthly_last_workday":
        return last_workday_of_month(year, month)
    if kind == "monthly_ordinal_weekday":
        return ordinal_weekday_of_month(year, month, int(rule["weekday"]), int(rule["ordinal"]))
    if kind == "monthly_day_of_month":
        return monthly_day_of_month(year, month, int(rule["day"]), str(rule.get("shift") or "none"))
    if kind == "monthly_days_before_month_end":
        raw = days_before_month_end(year, month, int(rule["daysBefore"]))
        return apply_workday_shift(raw, str(rule.get("shift") or "none"))
    raise ValidationError("Unbekannte Wiederholregel.")


def next_occurrence(rule: dict[str, Any], anchor: date, reference: date, inclusive: bool) -> date:
    current = reference if inclusive else reference + timedelta(days=1)
    current = max(current, anchor)
    month_cursor = date(current.year, current.month, 1)

    for offset in range(0, 240):
        month_date = add_months(month_cursor, offset)
        occurrence = compute_occurrence_for_month(rule, month_date.year, month_date.month)
        if occurrence < anchor:
            continue
        if occurrence >= current:
            return occurrence

    raise ValidationError("Konnte keine nächste Wiederholung berechnen.")


def serialize_recurrence(rule: dict[str, Any] | None) -> str | None:
    return json.dumps(rule, separators=(",", ":")) if rule else None


def deserialize_recurrence(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValidationError("Gespeicherte Wiederholregel ist beschädigt.") from exc
    return normalize_recurrence(parsed)


def resolve_schedule(due_date_value: str | None, recurrence_payload: Any) -> tuple[str | None, str | None, str | None]:
    due_date = parse_iso_date(due_date_value)
    recurrence = normalize_recurrence(recurrence_payload)

    if recurrence and due_date is None:
        raise ValidationError("Wiederholende Einträge brauchen ein Startdatum.")

    if recurrence is None:
        return to_iso_date(due_date), None, None

    anchor = due_date or date.today()
    same_month_occurrence = compute_occurrence_for_month(recurrence, anchor.year, anchor.month)

    if recurrence["kind"] == "monthly_day_of_month" and anchor.day == int(recurrence["day"]):
        first_due = same_month_occurrence
    elif recurrence["kind"] == "monthly_days_before_month_end":
        raw_same_month = days_before_month_end(anchor.year, anchor.month, int(recurrence["daysBefore"]))
        first_due = same_month_occurrence if raw_same_month >= anchor else next_occurrence(recurrence, anchor, anchor, inclusive=False)
    elif same_month_occurrence >= anchor:
        first_due = same_month_occurrence
    else:
        first_due = next_occurrence(recurrence, anchor, anchor, inclusive=False)

    return to_iso_date(first_due), serialize_recurrence(recurrence), to_iso_date(anchor)


def row_to_task(row: sqlite3.Row) -> dict[str, Any]:
    recurrence = deserialize_recurrence(row["recurrence_rule"])
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
        "dueDate": row["due_date"],
        "recurrence": recurrence,
        "recurrenceAnchor": row["recurrence_anchor"],
        "lastCompletedAt": row["last_completed_at"],
    }


def get_task(task_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return row_to_task(row) if row else None


def get_tasks() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM tasks ORDER BY created_at DESC").fetchall()
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


@app.errorhandler(ValidationError)
def handle_validation_error(error: ValidationError):
    return jsonify({"error": str(error)}), 400


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

    due_date, recurrence_rule, recurrence_anchor = resolve_schedule(
        payload.get("dueDate"),
        payload.get("recurrence"),
    )

    now = int(time.time() * 1000)
    task_id = str(uuid.uuid4())

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO tasks(
                id, text, done, color, open_symbol, done_symbol,
                created_at, updated_at, due_date, recurrence_rule, recurrence_anchor
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                text,
                0,
                color,
                open_symbol,
                done_symbol,
                now,
                now,
                due_date,
                recurrence_rule,
                recurrence_anchor,
            ),
        )
        conn.commit()

    task = get_task(task_id)
    return jsonify({"ok": True, "task": task})


@app.patch("/api/tasks/<task_id>")
def api_update_task(task_id: str):
    payload = request.get_json(silent=True) or {}

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            return jsonify({"error": "Task not found."}), 404

        recurrence = deserialize_recurrence(row["recurrence_rule"])
        updates: dict[str, Any] = {}

        if "text" in payload:
            text = str(payload.get("text", "")).strip()
            if not text:
                return jsonify({"error": "Task text cannot be empty."}), 400
            updates["text"] = text

        if "color" in payload:
            updates["color"] = str(payload.get("color") or DEFAULT_THEME["accent"])

        if "symbols" in payload:
            symbols = payload.get("symbols") or {}
            open_symbol = str(symbols.get("open", "")).strip()
            done_symbol = str(symbols.get("done", "")).strip()
            if open_symbol:
                updates["open_symbol"] = open_symbol
            if done_symbol:
                updates["done_symbol"] = done_symbol

        if "dueDate" in payload or "recurrence" in payload:
            incoming_due_date = payload.get("dueDate", row["due_date"])
            incoming_recurrence = payload.get("recurrence") if "recurrence" in payload else recurrence
            due_date, recurrence_rule, recurrence_anchor = resolve_schedule(incoming_due_date, incoming_recurrence)
            updates["due_date"] = due_date
            updates["recurrence_rule"] = recurrence_rule
            updates["recurrence_anchor"] = recurrence_anchor
            if recurrence_rule is None and "done" not in payload:
                updates["done"] = int(bool(row["done"]))

        if "done" in payload:
            desired_done = bool(payload.get("done"))
            active_recurrence = deserialize_recurrence(updates.get("recurrence_rule", row["recurrence_rule"]))
            if active_recurrence and desired_done:
                current_due = parse_iso_date(updates.get("due_date", row["due_date"])) or date.today()
                anchor = parse_iso_date(updates.get("recurrence_anchor", row["recurrence_anchor"])) or current_due
                next_due = next_occurrence(active_recurrence, anchor, current_due, inclusive=False)
                updates["done"] = 0
                updates["due_date"] = to_iso_date(next_due)
                updates["last_completed_at"] = int(time.time() * 1000)
            else:
                updates["done"] = int(desired_done)
                if desired_done:
                    updates["last_completed_at"] = int(time.time() * 1000)

        if not updates:
            return jsonify({"error": "No valid updates provided."}), 400

        updates["updated_at"] = int(time.time() * 1000)
        assignments = ", ".join(f"{key} = ?" for key in updates.keys())
        params = list(updates.values()) + [task_id]
        conn.execute(f"UPDATE tasks SET {assignments} WHERE id = ?", params)
        conn.commit()

    return jsonify({"ok": True, "task": get_task(task_id)})


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
