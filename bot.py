"""Spider Panel deploy bot — Telegram interface for Railway deploys.

Supports three deploy targets:
  • Rebecca  — amirh00sain/rebecca
  • Spider   — amirh00sain/SpiderPanel
  • Sanaii   — amirh00sain/vpn_ui_railway

Deployment flow (after /newdeploy):
  1. Enter Railway API token  →  validate
  2. Select repo              →  rvg / spider / sanaii
  3. Select region            →  US West / US East / EU West / SE Asia
  4. Confirm                 →  deploy
  5. Poll status             →  DONE (no auto-redeploy)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any

import aiohttp

from config import (
    CHANNELS,
    MEMORY_CHANNEL,
    POLL_MAX_ITERS,
    REGIONS,
    RAILWAY_API,
    RAILWAY_MIN_GAP,
    SERVER_HOST,
    SERVER_PORT,
    TELEGRAM_API,
)
from storage import get_user, save_user
from utils import btn, deploy_bar, esc, is_done_status, kb, mask_token, status_label, status_pct
import tcp_proxy as tcpm

logger = logging.getLogger(__name__)

# ── Deploy target repos ───────────────────────────────────────────────────
REPOS = {
    "rebecca": {
        "repo": "amirh00sain/rebecca",
        "name": "Rebecca",
        "desc": "Multi-protocol proxy panel (VLESS/Trojan/SS)",
        "branch": "main",
    },
    "spider": {
        "repo": "amirh00sain/SpiderPanel",
        "name": "Spider Panel",
        "desc": "Advanced VPN panel with Reality & XHTTP",
        "branch": "main",
    },
    "sanaii": {
        "repo": "amirh00sain/vpn_ui_railway",
        "name": "Sanaii VPN",
        "desc": "Docker-based VPN panel for Railway",
        "branch": "main",
    },
}

# ── Telegram helper ───────────────────────────────────────────────────────
async def tg(method: str, data: dict | None = None, bot_token: str = "") -> dict:
    """Call a Telegram Bot API method and return the JSON response."""
    url = f"{TELEGRAM_API}{bot_token}/{method}"
    async with aiohttp.ClientSession() as session:
        for attempt in range(3):
            try:
                payload = data or {}
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as r:
                    j = await r.json()
                    if j.get("ok"):
                        return j
                    desc = j.get("description", "")
                    if "429" in desc or "Too Many Requests" in desc:
                        wait = 2 * (attempt + 1)
                        logger.warning("Telegram rate limited, sleeping %ds", wait)
                        await asyncio.sleep(wait)
                        continue
                    return j
            except Exception as e:
                if attempt == 2:
                    return {"ok": False, "description": str(e)}
                await asyncio.sleep(1)
    return {"ok": False, "description": "failed"}


async def send_text(chat_id: int, text: str, reply_markup: dict | None = None,
                    parse_mode: str = "HTML", bot_token: str = "") -> dict:
    """Send a text message to a Telegram chat."""
    data: dict[str, Any] = {"chat_id": chat_id, "text": text}
    if parse_mode:
        data["parse_mode"] = parse_mode
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    return await tg("sendMessage", data, bot_token)


async def edit_msg(chat_id: int, msg_id: int, text: str,
                   reply_markup: dict | None = None, parse_mode: str = "HTML",
                   bot_token: str = "") -> dict:
    """Edit an existing Telegram message."""
    data: dict[str, Any] = {
        "chat_id": chat_id, "message_id": msg_id, "text": text,
    }
    if parse_mode:
        data["parse_mode"] = parse_mode
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    return await tg("editMessageText", data, bot_token)


async def show(chat_id: int, msg_id: int | None, text: str,
               reply_markup: dict | None = None, bot_token: str = "") -> dict:
    """Edit msg_id if provided; otherwise send a new message."""
    if msg_id is not None:
        return await edit_msg(chat_id, msg_id, text, reply_markup, bot_token=bot_token)
    return await send_text(chat_id, text, reply_markup, bot_token=bot_token)


async def answer_cb(query_id: str, text: str = "") -> dict:
    """Answer a callback query (clears the loading spinner)."""
    return await tg("answerCallbackQuery", {"callback_query_id": query_id, "text": text})


# ── Railway GraphQL ────────────────────────────────────────────────────────
_last_railway_at = 0.0
_lock = asyncio.Lock()


async def railway(query: str, variables: dict | None, token: str) -> dict:
    """Execute a Railway GraphQL mutation/query with rate-limit awareness."""
    global _last_railway_at
    async with _lock:
        elapsed = __import__("time").monotonic() - _last_railway_at
        if elapsed < RAILWAY_MIN_GAP:
            await asyncio.sleep(RAILWAY_MIN_GAP - elapsed)
        _last_railway_at = __import__("time").monotonic()

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    payload = {"query": query, "variables": variables or {}}
    last_err: Exception | None = None
    async with aiohttp.ClientSession() as session:
        for attempt in range(4):
            try:
                async with session.post(RAILWAY_API, headers=headers, json=payload, timeout=30) as resp:
                    text = await resp.text()
                    if resp.status == 429 or (resp.status == 403 and ("Attention" in text or "Cloudflare" in text)):
                        last_err = RuntimeError(f"Railway rate limited ({resp.status})")
                        await asyncio.sleep(2.5 * (attempt + 1))
                        continue
                    try:
                        data = json.loads(text)
                    except Exception:
                        return {"errors": [{"message": f"Railway HTTP {resp.status}: {text[:200]}"}]}
                    if isinstance(data, dict) and data.get("errors"):
                        raise RuntimeError(data["errors"][0].get("message", "unknown"))
                    return data.get("data", {})
            except aiohttp.ClientError as e:
                last_err = e
                await asyncio.sleep(2.5 * (attempt + 1))
    raise last_err or RuntimeError("Railway request failed")


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


# ── Deploy state (in-memory per chat_id) ──────────────────────────────────
_deploy: dict[int, dict[str, Any]] = {}


def _new_deploy() -> dict[str, Any]:
    return {
        "step": "token",
        "token": None,
        "workspace_id": None,
        "repo": None,       # key in REPOS ("rebecca"|"spider"|"sanaii")
        "region": None,     # index in REGIONS list
        "job_id": None,     # Railway project id
        "service_id": None,
        "env_id": None,
        "deployment_id": None,
    }


# ── Channel-join gate ─────────────────────────────────────────────────────
async def _in_channels(user_id: int) -> bool:
    """Return True if user is member of all required channels."""
    for ch in CHANNELS:
        try:
            r = await tg("getChatMember", {"chat_id": f"@{ch}", "user_id": user_id})
            status = r.get("result", {}).get("status", "")
            if status in ("left", "kicked"):
                return False
        except Exception:
            pass
    return True


async def _channel_prompt(chat_id: int, bot_token: str) -> None:
    """Send the join-channels prompt."""
    rows = []
    for ch in CHANNELS:
        rows.append([btn(f" {ch}", f"https://t.me/{ch}")])
    rows.append([btn("عضو شدم", "check_join")])
    await send_text(
        chat_id,
        "ابتدا در کانال‌های زیر عضو شوید:",
        kb(rows),
        bot_token=bot_token,
    )


# ══════════════════════════════════════════════════════════════════════════
#  HANDLERS
# ══════════════════════════════════════════════════════════════════════════

async def cmd_start(chat_id: int, bot_token: str) -> None:
    """Handle /start — welcome message with deploy button."""
    await send_text(
        chat_id,
        "<b>Spider Panel Deploy Bot</b>\n\n"
        "با این ربات می‌تونید پنل‌های VPN رو روی Railway دیپلوی کنید.\n\n"
        " <b>Rebecca</b> — پنل چند پروتکلی (VLESS/Trojan/SS)\n"
        " <b>Spider Panel</b> — پنل پیشرفته با Reality & XHTTP\n"
        " <b>Sanaii VPN</b> — پنل Docker برای Railway\n\n"
        "برای شروع روی دکمه زیر بزنید:",
        kb([
            [btn("دیپلوی جدید", "newdeploy")],
            [btn("TCP Proxy", "tcpmenu")],
        ]),
        bot_token=bot_token,
    )


async def cmd_newdeploy(chat_id: int, msg_id: int | None, bot_token: str) -> None:
    """Handle /newdeploy — start the deploy flow."""
    # ── Channel-join gate ──────────────────────────────────────────────
    if not await _in_channels(chat_id):
        await _channel_prompt(chat_id, bot_token)
        return

    _deploy[chat_id] = _new_deploy()
    await show(
        chat_id, msg_id,
        "<b>ورود توکن Railway</b>\n\n"
        "توکن API Railway خود را وارد کنید:\n\n"
        " <i>از اینجا دریافت کنید:</i>\n"
        "<code>railway.com/account/tokens</code>",
        kb([[btn("لغو", "cancel_deploy")]]),
        bot_token=bot_token,
    )


async def cb_cancel_deploy(chat_id: int, msg_id: int, bot_token: str) -> None:
    """Cancel the deploy flow."""
    _deploy.pop(chat_id, None)
    await edit_msg(
        chat_id, msg_id,
        " دیپلوی لغو شد.\n\nبرای شروع مجدد /newdeploy بزنید.",
        kb([[btn("دیپلوی جدید", "newdeploy")]]),
        bot_token=bot_token,
    )


async def cb_check_join(chat_id: int, msg_id: int, bot_token: str) -> None:
    """Handle 'I've joined' button."""
    if await _in_channels(chat_id):
        await edit_msg(
            chat_id, msg_id,
            " عضویت شما تأیید شد!",
            kb([[btn("دیپلوی جدید", "newdeploy")]]),
            bot_token=bot_token,
        )
    else:
        await answer_cb(chat_id, " هنوز عضو نشدید!")


async def handle_token(chat_id: int, msg_id: int, text: str, bot_token: str) -> None:
    """Handle token input step."""
    token = text.strip()
    if not token.startswith("usr_") and len(token) < 20:
        await edit_msg(
            chat_id, msg_id,
            " <b>توکن نامعتبر است.</b>\n\n"
            "توکن معمولاً با <code>usr_</code> شروع می‌شود.\n"
            "دوباره وارد کنید:",
            kb([[btn("لغو", "cancel_deploy")]]),
            bot_token=bot_token,
        )
        return

    # ── Validate token ──────────────────────────────────────────────────
    await edit_msg(chat_id, msg_id, "<b>در حال بررسی توکن...</b>", bot_token=bot_token)
    try:
        info = await railway_validate(token)
    except Exception as e:
        await edit_msg(
            chat_id, msg_id,
            f" <b>توکن نامعتبر:</b> <code>{esc(str(e)[:100])}</code>\n\n"
            "دوباره وارد کنید:",
            kb([[btn("لغو", "cancel_deploy")]]),
            bot_token=bot_token,
        )
        return

    d = _deploy[chat_id]
    d["token"] = token
    d["workspace_id"] = info["workspaceId"]
    d["step"] = "repo"

    # Persist token for later use by TCP Proxy
    u = await get_user(chat_id)
    u["token"] = token
    u["workspace_id"] = info["workspaceId"]
    await save_user(u, chat_id)

    # ── Show repo selection ─────────────────────────────────────────────
    rows = []
    for key, repo in REPOS.items():
        rows.append([btn(f"{repo['name']} — {repo['desc']}", f"repo:{key}")])
    rows.append([btn("لینک دلخواه — ریپوی گیت‌هاب", "repo:custom")])
    rows.append([btn("لغو", "cancel_deploy")])

    await edit_msg(
        chat_id, msg_id,
        f" <b>توکن تأیید شد!</b>\n\n"
        f" {esc(info.get('name', ''))} ({esc(info.get('email', ''))})\n"
        f" Workspace: <code>{esc(info['workspaceName'])}</code>\n\n"
        " <b>پنل مورد نظر را انتخاب کنید:</b>",
        kb(rows),
        bot_token=bot_token,
    )


async def cb_repo(chat_id: int, msg_id: int, repo_key: str, bot_token: str) -> None:
    """Handle repo selection."""
    if repo_key != "custom" and repo_key not in REPOS:
        return
    d = _deploy.get(chat_id)
    if not d or d["step"] != "repo":
        return

    # ── Custom repo: ask user for a GitHub URL ──────────────────────────
    if repo_key == "custom":
        d["repo"] = "custom"
        d["step"] = "custom_repo"
        await edit_msg(
            chat_id, msg_id,
            " <b>ریپوی دلخواه</b>\n\n"
            "لینک ریپوی گیت‌هاب خودتون رو بفرستید:\n\n"
            " فرمت‌های قبول شده:\n"
            "• <code>owner/repo</code>\n"
            "• <code>https://github.com/owner/repo</code>\n\n"
            "مثال: <code>amirh00sain/SpiderPanel</code>",
            kb([[btn("لغو", "cancel_deploy")]]),
            bot_token=bot_token,
        )
        return

    repo = REPOS[repo_key]
    d["repo"] = repo_key
    d["step"] = "region"

    # ── Show region selection ───────────────────────────────────────────
    rows = []
    for i, r in enumerate(REGIONS):
        rows.append([btn(f" {r['label']} — {r['country']}", f"region:{i}")])
    rows.append([btn("لغو", "cancel_deploy")])

    await edit_msg(
        chat_id, msg_id,
        f" انتخاب شد: <b>{repo['name']}</b>\n"
        f"<code>{repo['repo']}</code>\n\n"
        " <b>ریجن سرور را انتخاب کنید:</b>",
        kb(rows),
        bot_token=bot_token,
    )


def _parse_github_repo(text: str) -> str | None:
    """Parse a GitHub repo reference into 'owner/repo'.

    Accepts: 'owner/repo', 'https://github.com/owner/repo', with or without
    trailing '.git' and any path suffix after the repo name.
    Returns None if it cannot be parsed.
    """
    t = (text or "").strip().lower()
    if not t:
        return None
    # Strip scheme + host
    for prefix in ("https://github.com/", "http://github.com/", "github.com/"):
        if t.startswith(prefix):
            t = t[len(prefix):]
            break
    # Remove trailing .git and any path beyond owner/repo
    t = t.removesuffix(".git")
    # Take only the first two path segments
    parts = [p for p in t.split("/") if p]
    if len(parts) >= 2 and parts[0] and parts[1]:
        return f"{parts[0]}/{parts[1]}"
    return None


async def handle_custom_repo(chat_id: int, msg_id: int, text: str, bot_token: str) -> None:
    """Handle custom GitHub repo link input."""
    repo_ref = _parse_github_repo(text)
    if not repo_ref:
        await edit_msg(
            chat_id, msg_id,
            " <b>لینک نامعتبر است.</b>\n\n"
            "فرمت صحیح:\n"
            "• <code>owner/repo</code>\n"
            "• <code>https://github.com/owner/repo</code>\n\n"
            "دوباره بفرستید:",
            kb([[btn("لغو", "cancel_deploy")]]),
            bot_token=bot_token,
        )
        return

    d = _deploy.get(chat_id)
    if not d or d["step"] != "custom_repo":
        return

    # Save as a synthetic repo entry
    d["repo"] = "custom"
    d["custom_repo"] = repo_ref
    d["step"] = "region"

    # ── Show region selection ───────────────────────────────────────────
    rows = []
    for i, r in enumerate(REGIONS):
        rows.append([btn(f" {r['label']} — {r['country']}", f"region:{i}")])
    rows.append([btn("لغو", "cancel_deploy")])

    await edit_msg(
        chat_id, msg_id,
        f" ریپوی دلخواه: <code>{repo_ref}</code>\n\n"
        " <b>ریجن سرور را انتخاب کنید:</b>",
        kb(rows),
        bot_token=bot_token,
    )


async def cb_region(chat_id: int, msg_id: int, region_idx: int, bot_token: str) -> None:
    """Handle region selection → show confirmation."""
    if region_idx < 0 or region_idx >= len(REGIONS):
        return
    d = _deploy.get(chat_id)
    if not d or d["step"] != "region":
        return

    region = REGIONS[region_idx]
    repo = _resolve_repo(d)
    d["region"] = region_idx
    d["step"] = "confirm"

    await edit_msg(
        chat_id, msg_id,
        f" <b>خلاصه دیپلوی:</b>\n\n"
        f" پنل: <b>{repo['name']}</b>\n"
        f" ریپو: <code>{repo['repo']}</code>\n"
        f" ریجن: <b>{region['label']}</b> ({region['country']})\n"
        f" Workspace: <code>{esc(d.get('workspace_id', ''))}</code>\n\n"
        " برای شروع دیپلوی روی دکمه زیر بزنید:",
        kb([
            [btn("شروع دیپلوی", "start_deploy")],
            [btn("لغو", "cancel_deploy")],
        ]),
        bot_token=bot_token,
    )


def _resolve_repo(d: dict) -> dict:
    """Resolve repo info dict from deploy state, supporting custom repos."""
    if d.get("repo") == "custom":
        custom = d.get("custom_repo", "")
        name = custom.split("/")[-1] if "/" in custom else custom
        return {"repo": custom, "name": name, "branch": "main"}
    return REPOS.get(d["repo"], {"repo": "amirh00sain/SpiderPanel", "name": "Spider", "branch": "main"})


async def cb_start_deploy(chat_id: int, msg_id: int, bot_token: str) -> None:
    """Execute the deployment."""
    d = _deploy.get(chat_id)
    if not d or d["step"] != "confirm":
        return

    token = d["token"]
    repo_info = _resolve_repo(d)
    region = REGIONS[d["region"]]
    region_id = region["id"]
    safe_name = repo_info["repo"].replace("/", "-")
    project_name = f"spider-{safe_name}-{chat_id}"

    # ── Phase 1: Create project ────────────────────────────────────────
    await edit_msg(chat_id, msg_id, deploy_bar(10, "ساخت پروژه..."), bot_token=bot_token)
    try:
        proj = await railway(
            """
            mutation($name: String!, $wid: String) {
              projectCreate(input: {name: $name, workspaceId: $wid}) {
                id
                name
                environments { edges { node { id name } } }
              }
            }
            """,
            {"name": project_name, "wid": d["workspace_id"]},
            token,
        )
    except Exception as e:
        await edit_msg(
            chat_id, msg_id,
            f" <b>خطا در ساخت پروژه:</b>\n<code>{esc(str(e)[:200])}</code>",
            kb([[btn("تلاش مجدد", "newdeploy")]]),
            bot_token=bot_token,
        )
        _deploy.pop(chat_id, None)
        return

    proj_id = proj["projectCreate"]["id"]
    d["job_id"] = proj_id

    # Find production environment ID
    env_id = None
    for edge in proj["projectCreate"]["environments"]["edges"]:
        node = edge["node"]
        if node["name"] == "production":
            env_id = node["id"]
            break
    if not env_id and proj["projectCreate"]["environments"]["edges"]:
        env_id = proj["projectCreate"]["environments"]["edges"][0]["node"]["id"]
    if not env_id:
        await edit_msg(
            chat_id, msg_id,
            " <b>خطا:</b> environment پیدا نشد",
            kb([[btn("تلاش مجدد", "newdeploy")]]),
            bot_token=bot_token,
        )
        _deploy.pop(chat_id, None)
        return
    d["env_id"] = env_id

    # ── Phase 2: Create service with git source ────────────────────────
    await edit_msg(chat_id, msg_id, deploy_bar(25, "ساخت سرویس..."), bot_token=bot_token)
    try:
        svc = await railway(
            """
            mutation($name: String!, $pid: String!, $eid: String!, $source: ServiceSourceInput, $branch: String) {
              serviceCreate(input: {
                name: $name,
                projectId: $pid,
                environmentId: $eid,
                source: $source,
                branch: $branch
              }) { id name }
            }
            """,
            {
                "name": repo_info["name"],
                "pid": proj_id,
                "eid": env_id,
                "source": {"repo": repo_info["repo"]},
                "branch": repo_info["branch"],
            },
            token,
        )
    except Exception as e:
        await edit_msg(
            chat_id, msg_id,
            f" <b>خطا در ساخت سرویس:</b>\n<code>{esc(str(e)[:200])}</code>",
            kb([[btn("تلاش مجدد", "newdeploy")]]),
            bot_token=bot_token,
        )
        _deploy.pop(chat_id, None)
        return

    service_id = svc["serviceCreate"]["id"]
    d["service_id"] = service_id

    # ── Phase 3: Set region ────────────────────────────────────────────
    await edit_msg(chat_id, msg_id, deploy_bar(40, "تنظیم ریجن..."), bot_token=bot_token)
    try:
        await railway(
            """
            mutation($sid: String!, $eid: String!, $region: String!) {
              serviceInstanceUpdate(
                serviceId: $sid,
                environmentId: $eid,
                input: { region: $region }
              )
            }
            """,
            {"sid": service_id, "eid": env_id, "region": region_id},
            token,
        )
    except Exception as e:
        # Region set failure is non-fatal — deployment will use default region
        logger.warning("Region set failed: %s", e)

    # ── Phase 4: Trigger deployment ────────────────────────────────────
    await edit_msg(chat_id, msg_id, deploy_bar(55, "شروع دیپلوی..."), bot_token=bot_token)
    try:
        dep = await railway(
            """
            mutation($sid: String!, $eid: String!) {
              serviceInstanceDeployV2(serviceId: $sid, environmentId: $eid)
            }
            """,
            {"sid": service_id, "eid": env_id},
            token,
        )
    except Exception as e:
        await edit_msg(
            chat_id, msg_id,
            f" <b>خطا در شروع دیپلوی:</b>\n<code>{esc(str(e)[:200])}</code>",
            kb([[btn("تلاش مجدد", "newdeploy")]]),
            bot_token=bot_token,
        )
        _deploy.pop(chat_id, None)
        return

    deployment_id = dep.get("serviceInstanceDeployV2") or dep.get("deploymentId")
    d["deployment_id"] = deployment_id
    d["step"] = "polling"

    # ── Phase 5: Poll deployment status ────────────────────────────────
    await _poll_deployment(chat_id, msg_id, d, bot_token)


async def _poll_deployment(chat_id: int, msg_id: int, d: dict, bot_token: str) -> None:
    """Poll Railway deployment status until done. NO auto-redeploy on success."""
    token = d["token"]
    deployment_id = d.get("deployment_id")
    service_id = d["service_id"]
    env_id = d["env_id"]

    for iteration in range(POLL_MAX_ITERS):
        await asyncio.sleep(3)

        try:
            if deployment_id:
                # Query by specific deployment ID
                result = await railway(
                    "query($id: String!) { deployment(id: $id) { status } }",
                    {"id": deployment_id},
                    token,
                )
                status = (result.get("deployment") or {}).get("status", "INITIALIZING")
            else:
                # Query latest deployment for the service
                result = await railway(
                    """
                    query($sid: String!, $eid: String!) {
                      serviceInstance(serviceId: $sid, environmentId: $eid) {
                        latestDeployment { id status }
                      }
                    }
                    """,
                    {"sid": service_id, "eid": env_id},
                    token,
                )
                si = result.get("serviceInstance") or {}
                ld = si.get("latestDeployment") or {}
                status = ld.get("status", "INITIALIZING")
                if ld.get("id"):
                    d["deployment_id"] = ld["id"]
                    deployment_id = ld["id"]
        except Exception:
            status = "INITIALIZING"

        pct = status_pct(status, {"buildTicks": iteration, "deployTicks": max(0, iteration - 3)})
        label = status_label(status)

        try:
            await edit_msg(chat_id, msg_id, deploy_bar(pct, label), bot_token=bot_token)
        except Exception:
            pass

        if is_done_status(status):
            break

    # ── Final status ───────────────────────────────────────────────────
    repo_info = REPOS.get(d.get("repo"), {})

    if status == "SUCCESS":
        # Get the service domain
        domain_info = ""
        try:
            svc_info = await railway(
                """
                query($sid: String!, $eid: String!) {
                  serviceInstance(serviceId: $sid, environmentId: $eid) {
                    domains { serviceDomains { domain } }
                  }
                }
                """,
                {"sid": service_id, "eid": env_id},
                token,
            )
            domains = (svc_info.get("serviceInstance") or {}).get("domains") or {}
            svc_domains = domains.get("serviceDomains") or []
            if svc_domains and svc_domains[0].get("domain"):
                domain_info = f"\n\n <b>آدرس پنل:</b>\n<code>https://{svc_domains[0]['domain']}</code>"
        except Exception:
            pass

        # ── SUCCESS — mark as done, NO auto-redeploy ───────────────
        d["step"] = "done"
        await edit_msg(
            chat_id, msg_id,
            f" <b>دیپلوی موفق!</b>\n\n"
            f" پنل: <b>{repo_info.get('name', '')}</b>\n"
            f" ریجن: {REGIONS[d['region']]['label']}\n"
            f" پروژه: <code>{d.get('job_id', '')}</code>"
            f"{domain_info}\n\n"
            "برای دیپلوی مجدد /newdeploy بزنید.",
            kb([[btn("باز کردن پنل", f"https://{svc_domains[0]['domain']}")]] if domain_info and svc_domains else None),
            bot_token=bot_token,
        )
        # ── Cleanup: remove deploy state, do NOT re-trigger deploy ──
        _deploy.pop(chat_id, None)
        return

    # ── FAILED / CRASHED ───────────────────────────────────────────
    d["step"] = "failed"
    await edit_msg(
        chat_id, msg_id,
        f" <b>دیپلوی ناموفق — {esc(status)}</b>\n\n"
        "برای تلاش مجدد /newdeploy بزنید.",
        kb([[btn("تلاش مجدد", "newdeploy")]]),
        bot_token=bot_token,
    )
    _deploy.pop(chat_id, None)


# ══════════════════════════════════════════════════════════════════════════
#  MESSAGE ROUTER
# ══════════════════════════════════════════════════════════════════════════

BOT_TOKEN = os.getenv("BOT_TOKEN", "")


async def _handle_message(msg: dict) -> None:
    """Route a single Telegram message / callback query to the right handler."""
    bot_token = msg.get("_bot_token") or BOT_TOKEN

    # ── Callback queries ────────────────────────────────────────────────
    if "callback_query" in msg:
        cb = msg["callback_query"]
        chat_id = cb["message"]["chat"]["id"]
        msg_id = cb["message"]["message_id"]
        data = cb.get("data", "")
        query_id = cb.get("id", "")

        if data == "newdeploy":
            await answer_cb(query_id)
            await cmd_newdeploy(chat_id, msg_id, bot_token)
        elif data == "check_join":
            await answer_cb(query_id)
            await cb_check_join(chat_id, msg_id, bot_token)
        elif data == "cancel_deploy":
            await answer_cb(query_id)
            await cb_cancel_deploy(chat_id, msg_id, bot_token)
        elif data.startswith("repo:"):
            await answer_cb(query_id)
            await cb_repo(chat_id, msg_id, data.split(":", 1)[1], bot_token)
        elif data.startswith("region:"):
            await answer_cb(query_id)
            try:
                await cb_region(chat_id, msg_id, int(data.split(":", 1)[1]), bot_token)
            except (ValueError, IndexError):
                pass
        elif data == "start_deploy":
            await answer_cb(query_id)
            await cb_start_deploy(chat_id, msg_id, bot_token)
        # ── TCP Proxy menu ─────────────────────────────────────────────
        elif data == "tcpmenu":
            await answer_cb(query_id)
            u = await get_user(chat_id)
            tok = u.get("token") or _deploy.get(chat_id, {}).get("token")
            wid = u.get("workspace_id") or _deploy.get(chat_id, {}).get("workspace_id")
            if not tok or not wid:
                await send_text(chat_id, "ابتدا /newdeploy بزنید و توکن Railway را وارد کنید.",
                                kb([[btn("دیپلوی جدید", "newdeploy")]]), bot_token=bot_token)
            else:
                await tcpm.tcp_menu(chat_id, msg_id, tok, wid, bot_token)
        elif data in ("tcprandom", "tcpselect", "tcplist", "cancel_tcp"):
            await answer_cb(query_id)
            u = await get_user(chat_id)
            tok = u.get("token") or _deploy.get(chat_id, {}).get("token")
            wid = u.get("workspace_id") or _deploy.get(chat_id, {}).get("workspace_id")
            if data == "tcprandom":
                await tcpm.tcp_random_start(chat_id, msg_id, tok, wid, bot_token)
            elif data == "tcpselect":
                await tcpm.tcp_select_start(chat_id, msg_id, tok, wid, bot_token)
            elif data == "tcplist":
                await tcpm.tcp_list_show(chat_id, msg_id, tok, wid, bot_token)
            else:
                await tcpm.tcp_cancel(chat_id, msg_id, bot_token)
        elif data.startswith("tcpfx:"):
            await answer_cb(query_id)
            u = await get_user(chat_id)
            tok = u.get("token") or _deploy.get(chat_id, {}).get("token")
            wid = u.get("workspace_id") or _deploy.get(chat_id, {}).get("workspace_id")
            try:
                await tcpm.tcp_select_target(chat_id, msg_id, data.split(":", 1)[1], tok, wid, bot_token)
            except (IndexError, ValueError):
                pass
        elif data.startswith("tcpdel:"):
            await answer_cb(query_id)
            u = await get_user(chat_id)
            tok = u.get("token") or _deploy.get(chat_id, {}).get("token")
            try:
                await tcpm.tcp_delete_show(chat_id, msg_id, int(data.split(":")[1]), tok, bot_token)
            except (IndexError, ValueError):
                pass
        elif data.startswith("tcpdelyes:"):
            await answer_cb(query_id)
            u = await get_user(chat_id)
            tok = u.get("token") or _deploy.get(chat_id, {}).get("token")
            try:
                await tcpm.tcp_confirm_delete(chat_id, msg_id, int(data.split(":")[1]), tok, bot_token)
            except (IndexError, ValueError):
                pass
        else:
            await answer_cb(query_id)
        return

    # ── Regular messages ────────────────────────────────────────────────
    chat_id = msg["chat"]["id"]
    text = msg.get("text", "").strip()

    if text.startswith("/start"):
        await cmd_start(chat_id, bot_token)
        return

    if text.startswith("/newdeploy"):
        await cmd_newdeploy(chat_id, None, bot_token)
        return

    # ── Check if user is in deploy flow ─────────────────────────────────
    d = _deploy.get(chat_id)
    if d and d["step"] == "token":
        await handle_token(chat_id, msg["message_id"], text, bot_token)
        return

    # ── Check if user is entering a custom GitHub repo link ──────────────
    if d and d["step"] == "custom_repo":
        await handle_custom_repo(chat_id, msg["message_id"], text, bot_token)
        return

    # ── Check if user is in TCP Proxy port input step ───────────────────
    from tcp_proxy import _tcp_state as tcp_st
    if tcp_st.get(chat_id, {}).get("step") == "port":
        u = await get_user(chat_id)
        tok = u.get("token") or _deploy.get(chat_id, {}).get("token")
        wid = u.get("workspace_id") or _deploy.get(chat_id, {}).get("workspace_id")
        if tok and wid:
            from tcp_proxy import handle_port_input
            await handle_port_input(chat_id, msg["message_id"], text, tok, wid, bot_token)
        else:
            await send_text(chat_id, "ابتدا /newdeploy بزنید و توکن Railway را وارد کنید.",
                            kb([[btn("دیپلوی جدید", "newdeploy")]]), bot_token=bot_token)
        return


# ══════════════════════════════════════════════════════════════════════════
#  MAIN — Long-polling loop
# ══════════════════════════════════════════════════════════════════════════

async def main() -> None:
    """Entry point — poll Telegram for updates and process them."""
    from storage import init_db
    await init_db()

    offset = 0
    logger.info("Spider Bot starting — polling Telegram...")
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                url = f"{TELEGRAM_API}{BOT_TOKEN}/getUpdates"
                params: dict[str, Any] = {"offset": offset, "timeout": 30}
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=40)) as r:
                    data = await r.json()
                    if not data.get("ok"):
                        await asyncio.sleep(5)
                        continue

                    for update in data.get("result", []):
                        offset = update["update_id"] + 1
                        try:
                            await _handle_message(update)
                        except Exception as e:
                            logger.error("Handler error: %s", e, exc_info=True)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Poll error: %s", e)
                await asyncio.sleep(5)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    )
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
