"""Space feature — stores messages/media to a Telegram channel and tracks them.

The Cloudflare D1 `memory` table is replaced by the `memory` table in
``storage.init_db``.  State for the current conversation lives in KV
under ``space:{tgid}``.
"""
from __future__ import annotations

import json
from typing import Any

from storage import get_kv, put_kv, list_kv_prefix
import aiosqlite
from storage import DB_PATH

SPACE_SESSION = "space"
SPACE_PAGE_SIZE = 8


async def space_state(tgid: int) -> dict:
    raw = await get_kv(f"space:{tgid}")
    return json.loads(raw) if raw else {}


async def space_set_state(tgid: int, s: dict) -> None:
    await put_kv(f"space:{tgid}", json.dumps(s))


async def space_next_id(tgid: int) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        row = await db.execute_fetchone(
            "SELECT COALESCE(MAX(seq), 0) AS m FROM memory WHERE telegram_id = ? AND session = ?",
            (tgid, SPACE_SESSION),
        )
    return (row[0] or 0) + 1


async def space_rows(tgid: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT * FROM memory WHERE telegram_id = ? AND session = ? ORDER BY seq ASC, part ASC",
            (tgid, SPACE_SESSION),
        )
    return [dict(r) for r in rows]


def space_label(m: dict) -> str:
    is_text = not m.get("media_name")
    if is_text:
        raw = (m.get("content") or "text")
    else:
        raw = m.get("media_name") or m.get("content") or "item"
    name = raw if len(raw) <= 28 else raw[:28] + "…"
    icon = ""
    if not is_text:
        dot = name.rfind(".")
        ext = name[dot + 1:].upper() if dot > 0 else "—"
        if ext in ("JPG", "JPEG", "PNG", "GIF", "WEBP"):
            icon = ""
        elif ext in ("MP3", "OGG", "M4A", "WAV", "FLAC"):
            icon = ""
        elif ext in ("MP4", "MKV", "AVI", "MOV", "WEBM"):
            icon = ""
        else:
            icon = ""
    return f"{icon} {name}"


async def store_space_channel(env: dict, header: str, content: str, media: dict | None, from_chat_id: int) -> int | None:
    """Forward / send a space item into the memory channel. Returns message_id."""
    from bot import tg
    from storage import get_memchan_id
    from utils import esc

    ch = await get_memchan_id() or env.get("memory_channel")
    if not ch:
        return None
    if media:
        r = await tg(
            "copyMessage",
            {
                "chat_id": ch,
                "from_chat_id": from_chat_id,
                "message_id": media["msg_id"],
                "caption": f"{header}\n\n{content}",
            },
            env["BOT_TOKEN"],
        )
        return r.get("result", {}).get("message_id")
    r = await tg("sendMessage", {"chat_id": ch, "text": f"{header}\n\n{content}"}, env["BOT_TOKEN"])
    return r.get("result", {}).get("message_id")


async def space_capture(chat_id: int, text: str, media: dict | None, env: dict) -> dict:
    """Persist a single space item (text or media) and return the reply."""
    from bot import send_text
    from utils import btn, esc, kb, space_label

    id_ = await space_next_id(chat_id)
    header = f"#space{chat_id} #id{id_}"
    kind = "media" if media else "text"
    content = (media["label"] if media else text or "")

    mid = await store_space_channel(env, header, content, media, chat_id)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO memory (telegram_id, session, seq, part, parts, msg_id, kind, "
            "content, media_file_id, media_name, user_text, ai_text, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                chat_id,
                SPACE_SESSION,
                id_,
                1,
                1,
                mid,
                kind,
                content,
                media.get("file_id") if media else None,
                media.get("name") if media else None,
                content,
                None,
                __import__("time").time(),
            ),
        )
        await db.commit()

    return await send_text(
        chat_id,
        f" ذخیره شد — <b>ID {id_}</b>\n\n{esc(space_label({'media_name': media['name'] if media else None, 'content': content}))}",
        kb(
            [
                [btn("لیست", "splist"), btn("بیشتر", "spnew"), btn("Space", "space")],
            ]
        ),
        env["BOT_TOKEN"],
    )


def capture_media(msg: dict) -> dict | None:
    """Extract media metadata from a Telegram message, if any."""
    if msg.get("document"):
        d = msg["document"]
        return {
            "type": "document",
            "file_id": d["file_id"],
            "msg_id": msg["message_id"],
            "name": d.get("file_name", "document"),
            "label": "" + (d.get("file_name") or "document"),
        }
    if msg.get("audio"):
        a = msg["audio"]
        nm = (a.get("performer", "") + " - " if a.get("performer") else "") + (a.get("title") or "audio")
        return {
            "type": "audio",
            "file_id": a["file_id"],
            "msg_id": msg["message_id"],
            "name": (nm or "audio") + ".mp3",
            "label": "" + (nm or "audio"),
        }
    if msg.get("voice"):
        return {
            "type": "voice",
            "file_id": msg["voice"]["file_id"],
            "msg_id": msg["message_id"],
            "name": "voice.ogg",
            "label": "‍ voice",
        }
    if msg.get("video"):
        return {
            "type": "video",
            "file_id": msg["video"]["file_id"],
            "msg_id": msg["message_id"],
            "name": "video.mp4",
            "label": "video",
        }
    if msg.get("photo") and msg["photo"]:
        p = msg["photo"][-1]
        return {
            "type": "photo",
            "file_id": p["file_id"],
            "msg_id": msg["message_id"],
            "name": "photo.jpg",
            "label": "photo",
        }
    return None


# ── Space menu/list/get/delete (async wrappers used by handlers) ───────
async def space_menu(chat_id: int, msg_id: int | None, env: dict) -> dict:
    from bot import edit_msg, send_text
    from utils import btn, kb, show

    st = await space_state(chat_id)
    st.pop("step", None)
    await space_set_state(chat_id, st)
    text = (
        " <b>Space</b>\n\n"
        "فایل‌ها، متن و آهنگ‌ها در اینجا ذخیره می‌شوند.\n\n"
        " <b>جدید</b> — هر چیزی (فایل، عکس، صدا، آهنگ یا متن) که می‌خواهید بفرستید.\n"
        " <b>لیست</b> — همه چیز از اینجا قابل دسترسی است."
    )
    return await show(chat_id, msg_id, text, kb([[btn("جدید", "spnew"), btn("لیست", "splist"), btn("Space", "space")]]), env["BOT_TOKEN"])


async def space_new(chat_id: int, msg_id: int | None, env: dict) -> dict:
    await space_set_state(chat_id, {"step": "new"})
    text = (
        " <b>جدید</b>\n\n"
        "هر چیزه می‌خواهید بفرستید. فایل، عکس، صدا، آهنگ یا متن.\n"
        "هر کدووم با ID عددی ذخیره می‌شه و با لیست قابل دسترسی."
    )
    from utils import btn, kb, show

    return await show(
        chat_id,
        msg_id,
        text,
        kb([[btn("لیست", "splist"), btn("Space", "space")]]),
        env["BOT_TOKEN"],
    )


async def space_list(chat_id: int, msg_id: int | None, env: dict, page: int) -> dict:
    from utils import btn, kb, show

    st = await space_state(chat_id)
    st.pop("step", None)
    await space_set_state(chat_id, st)
    items = await space_rows(chat_id)
    if not items:
        await show(
            chat_id,
            msg_id,
            "هنوز پیامی ندارید.\nبا <b> جدید</b> ولی در موارد بفرستید.",
            kb([[btn("جدید", "spnew"), btn("Space", "space")]]),
            env["BOT_TOKEN"],
        )
    pages = max(1, (len(items) + SPACE_PAGE_SIZE - 1) // SPACE_PAGE_SIZE)
    pg = max(0, min(page, pages - 1))
    start = pg * SPACE_PAGE_SIZE
    end = min(start + SPACE_PAGE_SIZE, len(items))
    krows = [[btn(f"{it['seq']}. {space_label(it)}", "spget:" + str(it["seq"]))] for it in items[start:end]]
    nav = []
    if pg > 0:
        nav.append(btn("قبلی", "sppg:" + str(pg - 1)))
    nav.append(btn(f"{pg + 1}/{pages}", "spnoop"))
    if pg < pages - 1:
        nav.append(btn("بعدی", "sppg:" + str(pg + 1)))
    krows.append([nav]) if nav else krows
    krows.append([btn("جدید", "spnew"), btn("Space", "space")])
    text = f" <b>لیست Space</b> — {len(items)} مورد\n\nروی کدوم بزنید تا..."
    return await show(chat_id, msg_id, text, kb(krows), env["BOT_TOKEN"])


async def space_get(chat_id: int, msg_id: int | None, id_: int, env: dict) -> dict:
    from bot import send_text
    from utils import btn, esc, kb

    items = await space_rows(chat_id)
    it = next((x for x in items if x["seq"] == id_), None)
    if not it:
        return await send_text(chat_id, "پیدا نشد.", kb([[btn("لیست", "splist")]]), env["BOT_TOKEN"])
    if it.get("kind") == "media" and it.get("msg_id"):
        from bot import tg
        from storage import get_memchan_id
        await tg(
            "copyMessage",
            {"chat_id": chat_id, "from_chat_id": await get_memchan_id() or env.get("memory_channel"), "message_id": it["msg_id"], "caption": it.get("media_name") or " "},
            env["BOT_TOKEN"],
        )
    else:
        await send_text(chat_id, esc(it.get("content") or ""), None, "HTML", bot_token=env["BOT_TOKEN"])
    return await show(
        chat_id,
        msg_id,
        f" <b>ID {it['seq']}</b>\n\n{esc(it.get('content') or '')}\n\nمی‌خوای حذفش کنی؟",
        kb([[btn("حذف", "spdel:" + str(it["seq"])), btn("لیست", "splist")]]),
        env["BOT_TOKEN"],
    )


async def space_delete(chat_id: int, msg_id: int | None, id_: int, env: dict) -> dict:
    from bot import tg
    from storage import get_memchan_id
    from utils import btn, kb

    items = await space_rows(chat_id)
    it = next((x for x in items if x["seq"] == id_), None)
    if it and it.get("msg_id"):
        ch = await get_memchan_id() or env.get("memory_channel")
        await tg("deleteMessage", {"chat_id": ch, "message_id": it["msg_id"]}, env["BOT_TOKEN"])
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM memory WHERE telegram_id = ? AND session = ? AND seq = ?", (chat_id, SPACE_SESSION, id_))
        await db.commit()
    return await space_list(chat_id, msg_id, env, 0)
