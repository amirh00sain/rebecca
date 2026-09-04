"""Cloudflare API wrapper — matches the worker cf() helper signature."""
from __future__ import annotations

import json

import aiohttp

from config import CF_API


class CloudflareError(RuntimeError):
    pass


async def cf(path: str, token: str, opts: dict | None = None) -> dict:
    opts = opts or {}
    method = opts.get("method", "GET")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = opts.get("body")
    async with aiohttp.ClientSession() as session:
        async with session.request(
            method,
            f"{CF_API}{path}",
            headers=headers,
            json=body if body is not None else None,
            timeout=30,
        ) as resp:
            j = await resp.json() if resp.content_type == "application/json" else {}
            if not j.get("success"):
                msgs = "; ".join(e.get("message", "unknown") for e in j.get("errors", []))
                raise CloudflareError(msgs or f"CF HTTP {resp.status}")
            return {"json": j, "headers": resp.headers}
