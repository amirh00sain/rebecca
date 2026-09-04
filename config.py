"""Configuration and constants for the Spider Panel Telegram bot."""
from __future__ import annotations

import os

# ── Telegram ─────────────────────────────────────────────────────────
TELEGRAM_API = "https://api.telegram.org/bot"
CHANNELS = ["spider_vpn1", "amirsp1ider"]
MEMORY_CHANNEL = "@sapaceunlimitamirbot"

# ── Panel (Spider Panel admin credentials) ───────────────────────────
PANEL_USER = os.getenv("PANEL_USER", "admin")
PANEL_PASS = os.getenv("PANEL_PASS", "admin")
PANEL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

# ── Deployment defaults ──────────────────────────────────────────────
REPO = "amirh00sain/SpiderPanel"
BRANCH = "main"
PORT = os.getenv("PORT", "8080")

# ── Cloudflare ────────────────────────────────────────────────────────
CF_API = "https://api.cloudflare.com/client/v4"
CF_TOKEN_URL = (
    "https://dash.cloudflare.com/profile/api-tokens"
    "?permissionGroupKeys=%5B%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D"
    "%2C%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22edit%22%7D"
    "%5D&accountId=*&zoneId=all&name=EzAccess1-Token"
)

# ── Railway ───────────────────────────────────────────────────────────
RAILWAY_API = "https://backboard.railway.com/graphql/v2"
RAILWAY_MIN_GAP = 1.2  # seconds between Railway GraphQL requests

# ── Deploy polling ────────────────────────────────────────────────────
POLL_MAX_ITERS = 12  # 12 * 3s = 36s window like the worker pollLoop

# ── Encryption ────────────────────────────────────────────────────────
ENCRYPTION_KEY = os.environ["ENCRYPTION_KEY"]  # SHA-256 derived AES key

# ── Regions ──────────────────────────────────────────────────────────
REGIONS = [
    {"id": "us-west2", "label": "US West · Metal", "country": "USA"},
    {"id": "us-east4-eqdc4a", "label": "US East · Metal", "country": "USA"},
    {"id": "europe-west4-drams3a", "label": "EU West · Metal", "country": "Netherlands"},
    {"id": "asia-southeast1-eqsg3a", "label": "Southeast Asia · Metal", "country": "Singapore"},
]

# ── Server binding ────────────────────────────────────────────────────
SERVER_HOST = "0.0.0.0"
SERVER_PORT = int(os.getenv("PORT", "8080"))
