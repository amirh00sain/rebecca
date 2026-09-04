"""Spider Panel HTTP API client — mirrors panelLogin() + panelCall()."""
from __future__ import annotations

from config import PANEL_PASS, PANEL_UA

import aiohttp


async def panel_login(base: str) -> str:
    """Log into the panel at *base* and return the spider_session cookie."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"https://{base}/api/login",
            json={"password": PANEL_PASS},
            headers={"Content-Type": "application/json", "User-Agent": PANEL_UA},
            timeout=30,
        ) as resp:
            set_cookie = resp.headers.get("set-cookie", "")
            import re

            m = re.search(r"spider_session=([^;]+)", set_cookie)
            if not m:
                raise RuntimeError(f"panel login failed (HTTP {resp.status})")
            return m.group(1)


async def panel_call(base: str, cookie: str, method: str, path: str, body: dict | None) -> dict:
    """Make an authenticated call to the panel API."""
    async with aiohttp.ClientSession() as session:
        async with session.request(
            method,
            f"https://{base}{path}",
            json=body if body is not None else None,
            headers={
                "Content-Type": "application/json",
                "User-Agent": PANEL_UA,
                "Cookie": f"spider_session={cookie}",
            },
            timeout=60,
        ) as resp:
            text = await resp.text()
            import json

            try:
                j = json.loads(text)
            except Exception:
                j = {"raw": text[:200]}
            if not resp.ok:
                detail = j.get("detail") or j.get("message") or j.get("raw") or text
                raise RuntimeError(str(detail)[:160])
            return j


def find_reality_ib(inbounds: list) -> dict | None:
    """Locate the Reality inbound from a panel inbounds list."""
    arr = inbounds or []
    return (
        next((x for x in arr if x.get("inbound_id") == "default-reality"), None)
        or next(
            (
                x
                for x in arr
                if str(x.get("protocol", "")).lower() == "reality"
                and str(x.get("network", "")).lower() == "xhttp"
            ),
            None,
        )
        or next((x for x in arr if str(x.get("protocol", "")).lower() == "reality"), None)
        or None
    )


def sub_link(sub_url: str, username: str) -> str:
    if not sub_url or not username:
        return sub_url or ""
    try:
        from urllib.parse import quote

        u = sub_url
        idx = u.find("/sub/")
        if idx > 0:
            return u[: idx + 5] + quote(username)
        return u
    except Exception:
        return sub_url or ""
