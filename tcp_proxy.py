"""TCP Proxy management — Random / Select (with domain-prefix matching) / List+Delete.

All Railway mutations are performed via ``railway`` imported from ``bot``.

Random: user enters port → create service with that port → return domain.
Select: user chooses a target prefix (sakura/hayabusa/acela/alteria) →
        try up to 15 times to get a matching domain (create → check prefix →
        delete & retry) with a live progress bar.
List:   show all saved proxies, delete any.
"""
from __future__ import annotations

import asyncio
from typing import Any

from storage import add_tcp_proxy, delete_tcp_proxy, get_tcp_proxies, count_tcp_proxies
from utils import btn, deploy_bar, esc, kb


async def _show(chat_id: int, msg_id: int | None, text: str,
                reply_markup: dict | None, bot_token: str) -> None:
    """Lazy-import wrapper around bot.show to avoid circular imports."""
    from bot import show
    await show(chat_id, msg_id, text, reply_markup, bot_token=bot_token)

# ── Target domain prefixes for Select mode ───────────────────────────────
TCP_TARGETS = [
    {"key": "sakura",   "label": "Sakura",   "desc": "دامنه با پیشوند sakura"},
    {"key": "hayabusa", "label": "Hayabusa", "desc": "دامنه با پیشوند hayabusa"},
    {"key": "acela",    "label": "Acela",     "desc": "دامنه با پیشوند acela"},
    {"key": "alteria",  "label": "Alteria",   "desc": "دامنه با پیشوند alteria"},
]

MAX_PROXIES = 3
MAX_RETRIES = 15
DOMAIN_RETRY_DELAY_S = 3  # seconds between domain-creation attempts

# ── State per chat (in-memory, like _deploy in bot.py) ────────────────────
_tcp_state: dict[int, dict[str, Any]] = {}


def _new_tcp_state() -> dict[str, Any]:
    return {
        "step": None,          # port | target | polling | list | confirm_delete
        "token": None,
        "workspace_id": None,
        "port": None,
        "target_prefix": None, # selected prefix string for select mode
        "service_id": None,
        "service_domain_id": None,
        "environment_id": None,
        "retry_count": 0,
        "domain": None,
    }


# ── Public menu / step entry points (called from bot.py) ────────────────

async def tcp_menu(chat_id: int, msg_id: int | None, token: str,
                   workspace_id: str, bot_token: str) -> None:
    """Show the TCP Proxy main menu."""
    await _show(chat_id, msg_id,
        "<b>TCP Proxy</b>\n\n"
        "یک پورت وارد کنید تا برایتان TCP Proxy ساخته بشه.\n"
        "حداکثر ۳ پروکسی قابل ذخیره‌اند.",
        kb([
            [btn("Random", "tcprandom"), btn("Select", "tcpselect")],
            [btn("لیست", "tcplist"), btn("لغو", "cancel_tcp")],
        ]),
        bot_token,
    )


async def tcp_random_start(chat_id: int, msg_id: int, token: str,
                           workspace_id: str, bot_token: str) -> None:
    """Ask user to enter a port number for random TCP proxy."""
    _tcp_state[chat_id] = _new_tcp_state()
    _tcp_state[chat_id].update({"step": "port", "token": token, "workspace_id": workspace_id})
    await _show(chat_id, msg_id,
        "<b>TCP Proxy Random</b>\n\n"
        "شماره پورتی که می‌خواید سرویس روی اون لیسن بکنه رو وارد کنید:\n\n"
        " مثال: <code>8080</code>, <code>443</code>, <code>80</code>",
        kb([[btn("لغو", "cancel_tcp")]]),
        bot_token,
    )


async def tcp_select_start(chat_id: int, msg_id: int, token: str,
                           workspace_id: str, bot_token: str) -> None:
    """Ask user to choose a target domain prefix."""
    _tcp_state[chat_id] = _new_tcp_state()
    _tcp_state[chat_id].update({"step": "target", "token": token, "workspace_id": workspace_id})
    rows = [[btn(t["label"], f"tcpfx:{t['key']}")] for t in TCP_TARGETS]
    rows.append([btn("لغو", "cancel_tcp")])
    await _show(chat_id, msg_id,
        "<b>انتخاب دامنه</b>\n\n"
        "دامنه مورد نظر خود را انتخاب کنید.\n"
        "ربات تلاش می‌کند دامنه با پیشوند انتخابی بسازد.",
        kb(rows),
        bot_token,
    )


async def tcp_list_show(chat_id: int, msg_id: int, token: str,
                        workspace_id: str, bot_token: str) -> None:
    """Show saved TCP proxies and allow deletion."""
    _tcp_state.pop(chat_id, None)
    proxies = await get_tcp_proxies(chat_id)
    if not proxies:
        await _show(chat_id, msg_id,
            "<b>لیست TCP Proxy</b>\n\nهنوز هیچ پروکسی‌ای ساخته نشده.",
            kb([[btn("ساخت جدید", "tcpmenu"), btn("لغو", "cancel_tcp")]]),
            bot_token,
        )
        return
    rows = []
    for p in proxies:
        rows.append([btn(f" {p['proxy_name']} — <code>{p['domain']}</code>", "noop")])
        rows.append([btn(f" حذف {p['proxy_name']}", f"tcpdel:{p['id']}")])
    rows.append([btn("ساخت جدید", "tcpmenu"), btn("لغو", "cancel_tcp")])
    await _show(chat_id, msg_id,
        f" <b>لیست TCP Proxy</b> — {len(proxies)}/{MAX_PROXIES}\n\n"
        "روی یک پروکسی بزنید تا حذفش کنید.",
        kb(rows),
        bot_token,
    )


async def tcp_delete_show(chat_id: int, msg_id: int, proxy_id: int,
                          token: str, bot_token: str) -> None:
    """Confirm deletion of a TCP proxy."""
    from storage import get_tcp_proxy
    p = await get_tcp_proxy(chat_id, proxy_id)
    if not p:
        await _show(chat_id, msg_id, "پروکسی پیدا نشد.", None, bot_token)
        return
    _tcp_state[chat_id] = _new_tcp_state()
    _tcp_state[chat_id].update({"step": "confirm_delete", "token": token, "proxy_id": proxy_id})
    await _show(chat_id, msg_id,
        f" <b>حذف پروکسی</b>\n\n"
        f" {esc(p['proxy_name'])}\n"
        f" <code>{esc(p['domain'])}</code>\n\n"
        "مطمئنید می‌خواید حذفش کنید?",
        kb([
            [btn("بله، حذف شود", f"tcpdelyes:{p['id']}")],
            [btn("↩ بازگشت", "tcplist")],
        ]),
        bot_token,
    )


async def tcp_cancel(chat_id: int, msg_id: int, bot_token: str) -> None:
    """Cancel the current TCP proxy flow."""
    _tcp_state.pop(chat_id, None)
    await _show(chat_id, msg_id,
        "عملیات لغو شد.",
        kb([[btn("TCP Proxy", "tcpmenu")]]),
        bot_token,
    )


# ════════════════════════════════════════════════════════════════════════
#  RANDOM FLOW
# ════════════════════════════════════════════════════════════════════════

async def handle_port_input(chat_id: int, msg_id: int, text: str, token: str,
                            workspace_id: str, bot_token: str) -> None:
    """Validate port and create a random TCP proxy."""
    try:
        port = int(text.strip())
        if not (1 <= port <= 65535):
            raise ValueError
    except ValueError:
        await _show(chat_id, msg_id,
            "پورت نامعتبر. عدد بین ۱ تا ۶۵۵۳۵ وارد کنید:\n\n"
            " مثال: <code>8080</code>",
            kb([[btn("لغو", "cancel_tcp")]]),
            bot_token,
        )
        return

    from bot import railway, tg

    _tcp_state[chat_id]["port"] = port

    # ── Phase 1: Create project ────────────────────────────────────────
    project_name = f"tcp-proxy-{chat_id}-{port}"
    await _show(chat_id, msg_id, deploy_bar(10, "ساخت پروژه..."), bot_token=bot_token)
    try:
        proj = await railway(
            """mutation($name: String!, $wid: String) {
              projectCreate(input: {name: $name, workspaceId: $wid}) {
                id environments { edges { node { id name } } }
              }
            }""",
            {"name": project_name, "wid": workspace_id},
            token,
        )
    except Exception as e:
        await _fail(chat_id, msg_id, f"خطا در ساخت پروژه: {e}", bot_token)
        return

    proj_id = proj["projectCreate"]["id"]
    env_id = _pick_env(proj)

    # ── Phase 2: Create service ────────────────────────────────────────
    await _show(chat_id, msg_id, deploy_bar(25, "ساخت سرویس..."), bot_token=bot_token)
    try:
        svc = await railway(
            """mutation($name: String!, $pid: String!, $eid: String!,
                        $vars: EnvironmentVariables) {
              serviceCreate(input: {
                name: $name, projectId: $pid, environmentId: $eid, variables: $vars
              }) { id }
            }""",
            {"name": f"tcp-{port}", "pid": proj_id, "eid": env_id,
             "vars": {"PORT": str(port)}},
            token,
        )
    except Exception as e:
        await _fail(chat_id, msg_id, f"خطا در ساخت سرویس: {e}", bot_token)
        return

    service_id = svc["serviceCreate"]["id"]

    # ── Phase 3: Set region (US West — low latency) ────────────────────
    await _show(chat_id, msg_id, deploy_bar(35, "تنظیم ریجن..."), bot_token=bot_token)
    try:
        await railway(
            """mutation($sid: String!, $eid: String!, $region: String!) {
              serviceInstanceUpdate(
                serviceId: $sid, environmentId: $eid,
                input: { region: $region }
              )
            }""",
            {"sid": service_id, "eid": env_id, "region": "us-west2"},
            token,
        )
    except Exception:
        pass  # non-fatal

    # ── Phase 4: Trigger deploy ────────────────────────────────────────
    await _show(chat_id, msg_id, deploy_bar(50, "شروع دیپلوی..."), bot_token=bot_token)
    try:
        dep = await railway(
            """mutation($sid: String!, $eid: String!) {
              serviceInstanceDeployV2(serviceId: $sid, environmentId: $eid)
            }""",
            {"sid": service_id, "eid": env_id},
            token,
        )
    except Exception as e:
        await _fail(chat_id, msg_id, f"خطا در دیپلوی: {e}", bot_token)
        return

    deployment_id = dep.get("serviceInstanceDeployV2")
    from utils import is_done_status, status_pct, status_label
    import asyncio as _aio

    # ── Poll deploy status ─────────────────────────────────────────────
    for it in range(18):
        await _aio.sleep(3)
        try:
            if deployment_id:
                r = await railway("query($id:String!){deployment(id:$id){status}}",
                                  {"id": deployment_id}, token)
                status = (r.get("deployment") or {}).get("status", "INITIALIZING")
            else:
                r = await railway(
                    """query($sid:String!,$eid:String!){
                      serviceInstance(serviceId:$sid,environmentId:$eid){
                        latestDeployment{id status}
                      }}""",
                    {"sid": service_id, "eid": env_id}, token,
                )
                ld = (r.get("serviceInstance") or {}).get("latestDeployment") or {}
                status = ld.get("status", "INITIALIZING")
                deployment_id = ld.get("id")
        except Exception:
            status = "INITIALIZING"
        pct = status_pct(status, {"buildTicks": it})
        await _show(chat_id, msg_id, deploy_bar(pct, status_label(status)), bot_token=bot_token)
        if is_done_status(status):
            break

    if status != "SUCCESS":
        await _fail(chat_id, msg_id, f"دیپلوی ناموفق ({status}).", bot_token)
        return

    # ── Phase 5: Create domain ─────────────────────────────────────────
    await _show(chat_id, msg_id, deploy_bar(80, "ساخت دامنه..."), bot_token=bot_token)
    domain = _get_domain_from_service(r)
    if not domain:
        domain = await _create_domain_and_get(token, service_id, env_id)

    if not domain:
        await _fail(chat_id, msg_id, "دامنه ساخته نشد.", bot_token)
        return

    # ── Save to DB ─────────────────────────────────────────────────────
    domain_id = await _get_domain_id(token, service_id, env_id)
    proxy_id = await add_tcp_proxy(
        chat_id, f"TCP-{port}", domain, service_id, domain_id, env_id, port,
    )
    _tcp_state.pop(chat_id, None)

    await _show(chat_id, msg_id,
        f" <b>TCP Proxy ساخته شد!</b>\n\n"
        f" <code>{domain}</code>\n"
        f" پورت: <code>{port}</code>\n"
        f" شناسه: <code>{proxy_id}</code>",
        kb([[btn("لیست پروکسی‌ها", "tcplist"), btn("TCP Proxy", "tcpmenu")]]),
        bot_token,
    )


# ════════════════════════════════════════════════════════════════════════
#  SELECT FLOW (domain prefix matching)
# ════════════════════════════════════════════════════════════════════════

async def tcp_select_target(chat_id: int, msg_id: int, prefix: str, token: str,
                            workspace_id: str, bot_token: str) -> None:
    """Handle target prefix selection → create service → try to match domain."""
    st = _tcp_state.get(chat_id)
    if not st or st["step"] != "target":
        return

    target = next((t for t in TCP_TARGETS if t["key"] == prefix), None)
    if not target:
        return

    st["target_prefix"] = prefix
    st["step"] = "polling"
    st["retry_count"] = 0

    from bot import railway

    # ── Create project + service first ─────────────────────────────────
    project_name = f"tcp-{prefix}-{chat_id}"
    await _show(chat_id, msg_id, deploy_bar(5, "ساخت پروژه..."), bot_token=bot_token)
    try:
        proj = await railway(
            """mutation($name: String!, $wid: String) {
              projectCreate(input: {name: $name, workspaceId: $wid}) {
                id environments { edges { node { id name } } }
              }
            }""",
            {"name": project_name, "wid": workspace_id},
            token,
        )
    except Exception as e:
        await _fail(chat_id, msg_id, f"خطا در ساخت پروژه: {e}", bot_token)
        return

    env_id = _pick_env(proj)
    proj_id = proj["projectCreate"]["id"]

    await _show(chat_id, msg_id, deploy_bar(15, "ساخت سرویس..."), bot_token=bot_token)
    try:
        svc = await railway(
            """mutation($name: String!, $pid: String!, $eid: String!) {
              serviceCreate(input: {name: $name, projectId: $pid, environmentId: $eid}) { id }
            }""",
            {"name": f"tcp-{prefix}", "pid": proj_id, "eid": env_id},
            token,
        )
    except Exception as e:
        await _fail(chat_id, msg_id, f"خطا در ساخت سرویس: {e}", bot_token)
        return

    service_id = svc["serviceCreate"]["id"]
    st["service_id"] = service_id
    st["environment_id"] = env_id

    # Set region
    await _show(chat_id, msg_id, deploy_bar(25, "تنظیم ریجن..."), bot_token=bot_token)
    try:
        await railway(
            """mutation($sid: String!, $eid: String!, $region: String!) {
              serviceInstanceUpdate(serviceId:$sid,environmentId:$eid,input:{region:$region})
            }""",
            {"sid": service_id, "eid": env_id, "region": "us-west2"},
            token,
        )
    except Exception:
        pass

    # Deploy
    await _show(chat_id, msg_id, deploy_bar(35, "شروع دیپلوی..."), bot_token=bot_token)
    try:
        dep = await railway(
            """mutation($sid:String!,$eid:String!){
              serviceInstanceDeployV2(serviceId:$sid,environmentId:$eid)
            }""",
            {"sid": service_id, "eid": env_id},
            token,
        )
    except Exception as e:
        await _fail(chat_id, msg_id, f"خطا در دیپلوی: {e}", bot_token)
        return

    deployment_id = dep.get("serviceInstanceDeployV2")

    from utils import is_done_status, status_pct, status_label
    import asyncio as _aio

    # Poll deploy
    for it in range(18):
        await _aio.sleep(3)
        try:
            if deployment_id:
                r = await railway("query($id:String!){deployment(id:$id){status}}",
                                  {"id": deployment_id}, token)
                status = (r.get("deployment") or {}).get("status", "INITIALIZING")
            else:
                r = await railway(
                    """query($sid:String!,$eid:String!){
                      serviceInstance(serviceId:$sid,environmentId:$eid){
                        latestDeployment{id status}}}""",
                    {"sid": service_id, "eid": env_id}, token)
                ld = (r.get("serviceInstance") or {}).get("latestDeployment") or {}
                status = ld.get("status", "INITIALIZING")
                deployment_id = ld.get("id")
        except Exception:
            status = "INITIALIZING"
        pct = 40 + round(it / 18 * 20)
        await _show(chat_id, msg_id, deploy_bar(min(pct, 55), status_label(status)),
                    bot_token=bot_token)
        if is_done_status(status):
            break

    if status != "SUCCESS":
        await _fail(chat_id, msg_id, f"دیپلوی ناموفق ({status}).", bot_token)
        return

    # ── Domain matching loop ───────────────────────────────────────────
    import asyncio as _aio
    for attempt in range(1, MAX_RETRIES + 1):
        pct = 55 + round((attempt / MAX_RETRIES) * 40)
        label = f"تلاش {attempt}/{MAX_RETRIES} — ساخت دامنه..."
        await _show(chat_id, msg_id, deploy_bar(pct, label), bot_token=bot_token)

        domain = await _create_domain_and_get(token, service_id, env_id)
        if not domain:
            await _aio.sleep(DOMAIN_RETRY_DELAY_S)
            continue

        if prefix in domain.lower():
            # ── Match found! ──────────────────────────────────────────
            st["domain"] = domain
            domain_id = await _get_domain_id(token, service_id, env_id)
            await add_tcp_proxy(
                chat_id, target["label"], domain, service_id, domain_id, env_id, None,
            )
            _tcp_state.pop(chat_id, None)
            await _show(chat_id, msg_id,
                f" <b>دامنه {target['label']} پیدا شد!</b>\n\n"
                f" <code>{domain}</code>\n"
                f" تلاش‌ها: {attempt}/{MAX_RETRIES}",
                kb([[btn("لیست پروکسی‌ها", "tcplist"), btn("TCP Proxy", "tcpmenu")]]),
                bot_token,
            )
            return

        # ── Prefix didn't match → delete and retry ────────────────────
        did = await _get_domain_id(token, service_id, env_id)
        if did:
            try:
                await railway(
                    """mutation($did:String!,$sid:String!,$eid:String!) {
                      serviceDomainDelete(id:$did,serviceId:$sid,environmentId:$eid)
                    }""",
                    {"did": did, "sid": service_id, "eid": env_id},
                    token,
                )
            except Exception:
                pass
        await _aio.sleep(DOMAIN_RETRY_DELAY_S)

    # ── All retries exhausted ──────────────────────────────────────────
    _tcp_state.pop(chat_id, None)
    await _show(chat_id, msg_id,
        f" <b>دامنه {target['label']} پیدا نشد.</b>\n\n"
        f"تعداد تلاش‌ها: {MAX_RETRIES}\n\n"
        "می‌خوایید دوباره امتحان کنید?",
        kb([
            [btn("تلاش مجدد", f"tcpfx:{prefix}")],
            [btn("لغو", "cancel_tcp")],
        ]),
        bot_token,
    )


# ════════════════════════════════════════════════════════════════════════
#  DELETE CONFIRMATION
# ════════════════════════════════════════════════════════════════════════

async def tcp_confirm_delete(chat_id: int, msg_id: int, proxy_id: int,
                             token: str, bot_token: str) -> None:
    """Delete a saved TCP proxy and optionally the Railway service/domain."""
    from bot import railway
    from storage import get_tcp_proxy

    p = await get_tcp_proxy(chat_id, proxy_id)
    if not p:
        await _show(chat_id, msg_id, "پروکسی پیدا نشد.", None, bot_token)
        return

    # Try to clean up Railway resources
    if p.get("service_domain_id") and p.get("service_id") and p.get("environment_id"):
        try:
            await railway(
                """mutation($did:String!,$sid:String!,$eid:String!) {
                  serviceDomainDelete(id:$did,serviceId:$sid,environmentId:$eid)
                }""",
                {"did": p["service_domain_id"], "sid": p["service_id"],
                 "eid": p["environment_id"]},
                token,
            )
        except Exception:
            pass

    if p.get("service_id") and p.get("environment_id"):
        try:
            await railway(
                """mutation($sid:String!,$eid:String!) {
                  serviceDelete(serviceId:$sid,environmentId:$eid)
                }""",
                {"sid": p["service_id"], "eid": p["environment_id"]},
                token,
            )
        except Exception:
            pass

    await delete_tcp_proxy(chat_id, proxy_id)
    await _show(chat_id, msg_id,
        f" <b>حذف شد:</b> {esc(p['proxy_name'])} — <code>{esc(p['domain'])}</code>",
        kb([[btn("لیست پروکسی‌ها", "tcplist"), btn("TCP Proxy", "tcpmenu")]]),
        bot_token,
    )


# ════════════════════════════════════════════════════════════════════════
#  TEXT INPUT ROUTER (called from bot.py)
# ════════════════════════════════════════════════════════════════════════

async def handle_text_input(chat_id: int, msg_id: int, text: str,
                            token: str, workspace_id: str, bot_token: str) -> bool:
    """Route text input to the appropriate TCP handler. Returns True if handled."""
    st = _tcp_state.get(chat_id)
    if not st:
        return False

    if st["step"] == "port":
        await handle_port_input(chat_id, msg_id, text, token, workspace_id, bot_token)
        return True
    return False


# ════════════════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════════════════

def _pick_env(proj: dict) -> str:
    """Extract production environment ID from projectCreate result."""
    for edge in proj["projectCreate"]["environments"]["edges"]:
        if edge["node"]["name"] == "production":
            return edge["node"]["id"]
    return proj["projectCreate"]["environments"]["edges"][0]["node"]["id"]


def _get_domain_from_service(r: dict) -> str | None:
    """Try to read existing domain from a serviceInstance query result."""
    si = r.get("serviceInstance") or {}
    d = si.get("domains") or {}
    sd = d.get("serviceDomains") or []
    if sd and sd[0].get("domain"):
        return sd[0]["domain"]
    return None


async def _create_domain_and_get(token: str, service_id: str, env_id: str) -> str | None:
    """Create a Railway service domain and return the domain string."""
    from bot import railway
    r = await railway(
        """mutation($sid:String!,$eid:String!) {
          serviceDomainCreate(serviceId:$sid,environmentId:$eid) { domain id }
        }""",
        {"sid": service_id, "eid": env_id},
        token,
    )
    d = r.get("serviceDomainCreate") or {}
    return d.get("domain")


async def _get_domain_id(token: str, service_id: str, env_id: str) -> str | None:
    """Get the id of the first service domain on a service."""
    from bot import railway
    r = await railway(
        """query($sid:String!,$eid:String!){
          serviceInstance(serviceId:$sid,environmentId:$eid){
            domains { serviceDomains { id domain } }
          }}""",
        {"sid": service_id, "eid": env_id},
        token,
    )
    si = r.get("serviceInstance") or {}
    sd = (si.get("domains") or {}).get("serviceDomains") or []
    return sd[0]["id"] if sd else None


async def _fail(chat_id: int, msg_id: int, error: str, bot_token: str) -> None:
    """Show failure message with retry/cancel options."""
    _tcp_state.pop(chat_id, None)
    await _show(chat_id, msg_id,
        f" <b>خطا:</b> {esc(error)}",
        kb([[btn("تلاش مجدد", "tcpmenu"), btn("لغو", "cancel_tcp")]]),
        bot_token,
    )
