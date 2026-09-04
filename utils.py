"""Small display + string helpers ported from worker.js."""
from __future__ import annotations

import html
import math

from config import ENCRYPTION_KEY
from crypto import decrypt as _decrypt
from crypto import encrypt as _encrypt


# ── Encryption passthrough ─────────────────────────────────────────────
def encrypt(plain: str) -> str:
    return _encrypt(plain, ENCRYPTION_KEY)


def decrypt(blob: str) -> str:
    return _decrypt(blob, ENCRYPTION_KEY)


# ── String helpers ────────────────────────────────────────────────────
def esc(s: str) -> str:
    return html.escape(str(s))


def q(s) -> str:
    """JSON-quote for inline GraphQL."""
    import json

    return json.dumps(str(s))


def rand(len: int = 8) -> str:
    import random
    import string

    c = string.ascii_lowercase + "0123456789"
    return "".join(random.choice(c) for _ in range(len))


def mask_token(t: str | None) -> str:
    if not t:
        return ""
    t = str(t)
    if len(t) <= 10:
        return t[:6] + "…" + t[-4:] if len(t) > 6 else t
    return t[:6] + "…" + t[-4:]


def fmt_gb(v) -> str:
    g = float(v) if v else 0
    if g >= 1:
        return f"{g:.2f} GB"
    return f"{math.ceil(g * 1024)} MB"


# ── Buttons ───────────────────────────────────────────────────────────
def btn(text: str, data: str) -> dict:
    return {"text": text, "callback_data": data}


def url_btn(text: str, url: str) -> dict:
    return {"text": text, "url": url}


def kb(rows: list[list[dict]]) -> dict:
    return {"inline_keyboard": rows}


# ── Deploy progress ───────────────────────────────────────────────────
def deploy_bar(pct: int, label: str) -> str:
    pct = max(0, min(100, round(pct)))
    filled = round(pct / 10)
    bar = "#" * filled + "-" * (10 - filled)
    return f"<b>Spider Panel Deployment</b>\n<code>[{bar}]</code> {pct}%\n{esc(label)}"


def status_label(s: str) -> str:
    m = {
        "WAITING": "Waiting in queue…",
        "QUEUED": "Queued…",
        "INITIALIZING": "Initializing…",
        "BUILDING": "Building image…",
        "DEPLOYING": "Deploying…",
        "SUCCESS": "Deployment completed",
        "FAILED": "Deployment failed",
        "CRASHED": "Crashed",
        "REMOVED": "Removed",
        "SLEEPING": "Sleeping",
        "NEEDS_APPROVAL": "Needs approval",
    }
    return m.get(s, s)


def status_pct(status: str, job: dict | None = None) -> int:
    job = job or {}
    if status in ("WAITING", "QUEUED", "INITIALIZING"):
        return 80
    if status == "BUILDING":
        return min(95, 80 + (job.get("buildTicks", 0) * 2))
    if status == "DEPLOYING":
        return min(99, 95 + job.get("deployTicks", 0))
    if status in ("SUCCESS", "FAILED", "CRASHED", "REMOVED", "SLEEPING", "NEEDS_APPROVAL"):
        return 100
    return 80


def is_done_status(s: str) -> bool:
    return s in ("SUCCESS", "FAILED", "CRASHED", "REMOVED", "SLEEPING", "NEEDS_APPROVAL")
