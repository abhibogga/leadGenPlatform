from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunStore:
    """Small SQLite repository that keeps runs and validation feedback durable."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with closing(self._connect()) as connection, connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    progress INTEGER NOT NULL,
                    request_json TEXT NOT NULL,
                    result_json TEXT,
                    error TEXT
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS feedback (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    contact_index INTEGER,
                    outcome TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(run_id) REFERENCES runs(id)
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS feedback_run_id_idx ON feedback(run_id)"
            )

    def create_run(self, request: dict[str, Any]) -> dict[str, Any]:
        run_id = str(uuid4())
        now = utc_now()
        with self._write_lock, closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT INTO runs (
                    id, created_at, updated_at, status, stage, progress, request_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (run_id, now, now, "queued", "Waiting for a research worker", 5, json.dumps(request)),
            )
        return self.get_run(run_id)

    def update_run(
        self,
        run_id: str,
        *,
        status: str,
        stage: str,
        progress: int,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        with self._write_lock, closing(self._connect()) as connection, connection:
            connection.execute(
                """
                UPDATE runs
                SET updated_at = ?, status = ?, stage = ?, progress = ?,
                    result_json = COALESCE(?, result_json), error = ?
                WHERE id = ?
                """,
                (
                    now,
                    status,
                    stage,
                    progress,
                    json.dumps(result) if result is not None else None,
                    error,
                    run_id,
                ),
            )
        return self.get_run(run_id)

    def get_run(self, run_id: str) -> dict[str, Any]:
        with closing(self._connect()) as connection, connection:
            row = connection.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            raise KeyError(run_id)
        return self._deserialize_run(row)

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection, connection:
            rows = connection.execute(
                "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        summaries: list[dict[str, Any]] = []
        for row in rows:
            record = self._deserialize_run(row)
            result = record.get("result") or {}
            summaries.append(
                {
                    "id": record["id"],
                    "created_at": record["created_at"],
                    "updated_at": record["updated_at"],
                    "status": record["status"],
                    "stage": record["stage"],
                    "progress": record["progress"],
                    "contact_count": len(record["request"].get("contacts", [])),
                    "summary": result.get("summary") if isinstance(result, dict) else None,
                }
            )
        return summaries

    def create_feedback(
        self,
        run_id: str,
        *,
        outcome: str,
        contact_index: int | None,
        notes: str,
    ) -> dict[str, Any]:
        self.get_run(run_id)
        feedback_id = str(uuid4())
        created_at = utc_now()
        with self._write_lock, closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT INTO feedback (
                    id, run_id, contact_index, outcome, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (feedback_id, run_id, contact_index, outcome, notes, created_at),
            )
        return {
            "id": feedback_id,
            "run_id": run_id,
            "contact_index": contact_index,
            "outcome": outcome,
            "notes": notes,
            "created_at": created_at,
        }

    @staticmethod
    def _deserialize_run(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "status": row["status"],
            "stage": row["stage"],
            "progress": row["progress"],
            "request": json.loads(row["request_json"]),
            "result": json.loads(row["result_json"]) if row["result_json"] else None,
            "error": row["error"],
        }
