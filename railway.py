"""Railway GraphQL client — async, rate-throttled, retry-aware."""
from __future__ import annotations

import asyncio
import time

import aiohttp

from config import RAILWAY_API, RAILWAY_MIN_GAP

_last_railway_at = 0.0
_lock = asyncio.Lock()


def q(s) -> str:
    """JSON-quote a string for inline GraphQL."""
    import json

    return json.dumps(str(s))


async def railway(query: str, variables: dict | None, token: str) -> dict:
    """Execute a GraphQL mutation/query against Railway's backboard."""
    global _last_railway_at
    async with _lock:
        since = time.monotonic() - _last_railway_at
        if since < RAILWAY_MIN_GAP:
            await asyncio.sleep(RAILWAY_MIN_GAP - since)
        _last_railway_at = time.monotonic()

    last_err: Exception | None = None
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    payload = {"query": query, "variables": variables or {}}
    async with aiohttp.ClientSession() as session:
        for attempt in range(4):
            try:
                async with session.post(RAILWAY_API, headers=headers, json=payload, timeout=30) as resp:
                    text = await resp.text()
                    if resp.status == 429 or (
                        resp.status == 403 and "Attention" in text or "Cloudflare" in text
                    ):
                        last_err = RuntimeError(f"Railway rate limited (HTTP {resp.status})")
                        await asyncio.sleep(2.5 * (attempt + 1))
                        continue
                    data = _safe_json(text, resp)
                    if isinstance(data, dict) and data.get("errors"):
                        raise RuntimeError(data["errors"][0].get("message", "unknown"))
                    return data.get("data", {})
            except aiohttp.ClientError as e:
                last_err = e
                await asyncio.sleep(2.5 * (attempt + 1))

    raise last_err or RuntimeError("Railway request failed")


def _safe_json(text: str, resp) -> dict:
    import json

    try:
        return json.loads(text)
    except Exception:
        return {"errors": [{"message": f"Railway HTTP {resp.status}: {text[:200]}"}]}


async def railway_validate(token: str) -> dict:
    """Validate a Railway API token and return workspace/me info."""
    d = await railway("{ apiToken { workspaces { id name } } me { id name email } }", None, token)
    ws = d.get("apiToken", {}).get("workspaces", [{}])[0] if d.get("apiToken") else {}
    if not ws.get("id"):
        raise RuntimeError("workspace not found for token")
    return {
        "workspaceId": ws["id"],
        "workspaceName": ws.get("name", ""),
        "userId": d["me"]["id"],
        "name": d["me"].get("name", ""),
        "email": d["me"].get("email", ""),
    }
