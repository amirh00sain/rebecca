"""SQLite-backed storage replacing Cloudflare Workers KV + D1.

A single file DB holds:
  * ``kv``   — arbitrary key/value (users, jobs, memchan_id, space state)
  * ``memory`` — Space feature messages/media rows (mirrors the D1 schema)

Everything is async via ``aiosqlite``.
"""
from __future__ import annotations

import json
import os
from typing import Any

import aiosqlite

DB_PATH = os.getenv("DB_PATH", "/data/spider.db")

_INIT_SQL = """
CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memory (
    telegram_id   INTEGER NOT NULL,
    session       TEXT    NOT NULL,
    seq           INTEGER NOT NULL,
    part          INTEGER NOT NULL DEFAULT 1,
    parts         INTEGER NOT NULL DEFAULT 1,
    msg_id        INTEGER,
    kind          TEXT,
    content       TEXT,
    media_file_id TEXT,
    media_name    TEXT,
    user_text     TEXT,
    ai_text       TEXT,
    created_at    INTEGER,
    PRIMARY KEY (telegram_id, session, seq, part)
);
CREATE INDEX IF NOT EXISTS idx_memory_lookup ON memory (telegram_id, session);
CREATE INDEX IF NOT EXISTS idx_memory_seq ON memory (telegram_id, session, seq);
CREATE TABLE IF NOT EXISTS tcp_proxies (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id   INTEGER NOT NULL,
    proxy_name    TEXT    NOT NULL,
    domain        TEXT    NOT NULL,
    service_id    TEXT,
    service_domain_id TEXT,
    environment_id TEXT,
    port          INTEGER,
    created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tcp_proxy_user ON tcp_proxies (telegram_id);
"""


async def init_db() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(_INIT_SQL)
        await db.commit()


# ── Generic KV ────────────────────────────────────────────────────────
async def get_kv(key: str) -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        row = await db.execute_fetchone("SELECT value FROM kv WHERE key = ?", (key,))
        return row[0] if row else None


async def put_kv(key: str, value: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO kv (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        await db.commit()


async def del_kv(key: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM kv WHERE key = ?", (key,))
        await db.commit()


async def list_kv_prefix(prefix: str) -> list[str]:
    async with aiosqlite.connect(DB_PATH) as db:
        rows = await db.execute_fetchall(
            "SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\'",
            (prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%",),
        )
        return [r[0] for r in rows]


# ── Typed user helpers ────────────────────────────────────────────────
async def get_user(chat_id: int) -> dict[str, Any]:
    raw = await get_kv(f"user:{chat_id}")
    return json.loads(raw) if raw else {"step": "welcome", "projects": [], "region": None}


async def save_user(user: dict[str, Any], chat_id: int) -> None:
    await put_kv(f"user:{chat_id}", json.dumps(user))


async def get_memchan_id() -> str | None:
    return await get_kv("memchan_id")


async def set_memchan_id(tg_id: str) -> None:
    await put_kv("memchan_id", str(tg_id))


# ── TCP Proxy helpers ──────────────────────────────────────────────────
async def add_tcp_proxy(telegram_id: int, proxy_name: str, domain: str, service_id: str | None,
                       service_domain_id: str | None, environment_id: str | None, port: int | None) -> int:
    """Insert a new TCP proxy row; returns its id."""
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO tcp_proxies (telegram_id, proxy_name, domain, service_id, "
            "service_domain_id, environment_id, port, created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (telegram_id, proxy_name, domain, service_id, service_domain_id,
             environment_id, port, __import__("time").time()),
        )
        await db.commit()
        return cur.lastrowid


async def get_tcp_proxies(telegram_id: int) -> list[dict]:
    """Return all TCP proxies for a user, newest first."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT * FROM tcp_proxies WHERE telegram_id = ? ORDER BY id DESC", (telegram_id,)
        )
    return [dict(r) for r in rows]


async def count_tcp_proxies(telegram_id: int) -> int:
    """Return the number of TCP proxies for a user."""
    async with aiosqlite.connect(DB_PATH) as db:
        row = await db.execute_fetchone(
            "SELECT COUNT(*) AS c FROM tcp_proxies WHERE telegram_id = ?", (telegram_id,)
        )
    return row[0] if row else 0


async def get_tcp_proxy(telegram_id: int, proxy_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        row = await db.execute_fetchone(
            "SELECT * FROM tcp_proxies WHERE telegram_id = ? AND id = ?", (telegram_id, proxy_id)
        )
    return dict(row) if row else None


async def delete_tcp_proxy(telegram_id: int, proxy_id: int) -> bool:
    """Delete a TCP proxy row. Returns True if a row was removed."""
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "DELETE FROM tcp_proxies WHERE telegram_id = ? AND id = ?", (telegram_id, proxy_id)
        )
        await db.commit()
        return cur.rowcount > 0
