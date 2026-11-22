import os
import re
import io
import json
import time
import base64
import asyncio
import importlib
import traceback
from datetime import datetime, timezone, timedelta
import aiohttp
import discord
from discord.ext import commands, tasks
from google import genai
from google.genai import types

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# ==========================================
# PART 1: ENV KEYS, TIMEZONE & GITHUB ENGINE
# ==========================================
DISCORD_TOKEN = (
    os.getenv("DISCORD_TOKEN")
    or os.getenv("DISCORD_BOT_TOKEN")
    or os.getenv("TOKEN")
    or ""
).strip()

GEMINI_KEYS = [
    k.strip() for k in os.getenv("GEMINI_API_KEY", "").split(",") if k.strip()
]
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GITHUB_REPO = os.getenv("GITHUB_REPOSITORY", "chakiosman89-blip/elyx-bot").strip()
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main").strip()

HARD_ACCESS_ID = 1572448688700391454
ALLOWED_IDS = {HARD_ACCESS_ID}
for item in os.getenv("OWNER_ID", str(HARD_ACCESS_ID)).split(","):
    if item.strip().isdigit():
        ALLOWED_IDS.add(int(item.strip()))

IST = timezone(timedelta(hours=5, minutes=30))

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="-", intents=intents, help_command=None)

DATA_DIR = "bot_data"
COGS_DIR = "cogs"
MODULES_FILE = os.path.join(DATA_DIR, "dynamic_modules.json")
MEMORY_FILE = os.path.join(DATA_DIR, "user_memories.json")
BEHAVIOR_FILE = os.path.join(DATA_DIR, "bot_behavior.json")
SCHEDULES_FILE = os.path.join(DATA_DIR, "scheduled_tasks.json")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(COGS_DIR, exist_ok=True)

invite_cache = {}
REGISTERED_COMMANDS = set()
REGISTERED_LISTENERS = []
MODULE_LOCK = asyncio.Lock()
_RECENT_MSG_CACHE = {}
CHANNEL_CHAT_HISTORY = {}
LAST_RUNTIME_ERROR = ""


def now_ist() -> datetime:
    return datetime.now(IST)


def is_authorized(member: discord.abc.User) -> bool:
    if not member:
        return False
    if member.id in ALLOWED_IDS:
        return True
    if isinstance(member, discord.Member):
        if any(role.id in ALLOWED_IDS for role in member.roles):
            return True
    return False


def is_duplicate_message(key: str, ttl: float = 10.0) -> bool:
    now = time.time()
    expired = [k for k, ts in _RECENT_MSG_CACHE.items() if now - ts > ttl]
    for k in expired:
        _RECENT_MSG_CACHE.pop(k, None)
    if key in _RECENT_MSG_CACHE:
        return True
    _RECENT_MSG_CACHE[key] = now
    return False


def load_json(path: str, default=None):
    if default is None:
        default = {}
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def get_behavior_state() -> dict:
    data = load_json(BEHAVIOR_FILE, {})
    return {
        "mute_all": data.get("mute_all", False),
        "ignored_users": data.get("ignored_users", {}),
        "forced_replies": data.get("forced_replies", {}),
        "custom_instructions": data.get("custom_instructions", []),
    }


async def github_read_file(repo_path: str) -> tuple:
    if not GITHUB_TOKEN or not GITHUB_REPO:
        raise RuntimeError("GITHUB_TOKEN ya GITHUB_REPOSITORY missing hai!")
    api_url = f"https://github.com{GITHUB_REPO}/contents/{repo_path}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
    }
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{api_url}?ref={GITHUB_BRANCH}", headers=headers) as resp:
            if resp.status == 404:
                return None, ""
            if resp.status != 200:
                raise RuntimeError(f"GitHub read error ({resp.status})")
            data = await resp.json()
            content = base64.b64decode(data["content"]).decode("utf-8")
            return data.get("sha"), content


async def github_write_file(repo_path: str, text_content: str, commit_msg: str):
    if not GITHUB_TOKEN or not GITHUB_REPO:
        return
    api_url = f"https://github.com{GITHUB_REPO}/contents/{repo_path}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
    }
    try:
        sha, _ = await github_read_file(repo_path)
        encoded = base64.b64encode(text_content.encode("utf-8")).decode("utf-8")
        payload = {
            "message": commit_msg,
            "content": encoded,
            "branch": GITHUB_BRANCH,
        }
        if sha:
            payload["sha"] = sha
        async with aiohttp.ClientSession() as session:
            async with session.put(api_url, headers=headers, json=payload) as put_resp:
                if put_resp.status in (200, 201):
                    print(f"✅ Synced {repo_path} to GitHub")
                else:
                    print(f"⚠️ GitHub write failed ({put_resp.status})")
    except Exception as e:
        print(f"⚠️ GitHub sync skipped: {e}")


async def save_modules(modules: dict):
    with open(MODULES_FILE, "w", encoding="utf-8") as f:
        json.dump(modules, f, indent=2, ensure_ascii=False)
    await github_write_file(
        "bot_data/dynamic_modules.json",
        json.dumps(modules, indent=2, ensure_ascii=False),
        "Auto-save AI feature",
    )


async def save_memories(memories: dict):
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memories, f, indent=2, ensure_ascii=False)
    await github_write_file(
        "bot_data/user_memories.json",
        json.dumps(memories, indent=2, ensure_ascii=False),
        "Auto-save user memory",
    )


async def save_behavior(state: dict):
    with open(BEHAVIOR_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    await github_write_file(
        "bot_data/bot_behavior.json",
        json.dumps(state, indent=2, ensure_ascii=False),
        "Update bot behavior rules",
    )


async def save_schedules(tasks_list: list):
    with open(SCHEDULES_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks_list, f, indent=2, ensure_ascii=False)
    await github_write_file(
        "bot_data/scheduled_tasks.json",
        json.dumps(tasks_list, indent=2, ensure_ascii=False),
        "Update scheduled tasks",
    )


# ==========================================
# PART 2: HELPERS & AUTO-COG / MODULE LOADER
# ==========================================
def find_member_smart(guild: discord.Guild, query: str):
    if not guild or not query:
        return None
    q = query.strip().lower().replace("<@", "").replace("!", "").replace(">", "")
    if q.isdigit():
        m = guild.get_member(int(q))
        if m:
            return m
    for m in guild.members:
        if q in (m.name.lower(), m.display_name.lower(), str(m).lower()):
            return m
    for m in guild.members:
        if q in m.name.lower() or q in m.display_name.lower():
            return m
    return None


def find_channel_smart(guild: discord.Guild, query: str):
    if not guild or not query:
        return None
    q = query.strip().lower().replace("<#", "").replace(">", "").replace("#", "")
    if q.isdigit():
        ch = guild.get_channel(int(q))
        if ch:
            return ch
    for ch in guild.text_channels:
        if q == ch.name.lower():
            return ch
    for ch in guild.text_channels:
        if q in ch.name.lower():
            return ch
    return None


async def get_invite_leaderboard(guild: discord.Guild) -> list:
    invites = await guild.invites()
    counts = {}
    for inv in invites:
        if inv.inviter and not inv.inviter.bot:
            uid = inv.inviter.id
            counts[uid] = counts.get(uid, 0) + (inv.uses or 0)
    return sorted(counts.items(), key=lambda x: x[1], reverse=True)


async def generate_image_bytes(prompt_text: str, top_text: str = "", bottom_text: str = "") -> io.BytesIO:
    clean_prompt = re.sub(r"[^a-zA-Z0-9 ,.-]", "", prompt_text).strip() or "funny gaming meme"
    encoded_prompt = aiohttp.helpers.quote(clean_prompt)
    url = f"https://pollinations.ai{encoded_prompt}?width=1024&height=1024&nologo=true&seed={int(time.time()) % 99999}"

    raw_bytes = None
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=20) as resp:
                if resp.status == 200:
                    raw_bytes = await resp.read()
    except Exception:
        raw_bytes = None

    if raw_bytes and PIL_AVAILABLE and (top_text or bottom_text):
        try:
            img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
            draw = ImageDraw.Draw(img)
            w, h = img.size
            font_size = max(36, w // 16)
            try:
                font = ImageFont.truetype("DejaVuSans-Bold.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()

            def draw_meme_line(text: str, y_pos: int):
                text = text.upper()
                tw = int(draw.textlength(text, font=font))
                x_pos = max(10, (w - tw) // 2)
                for dx in (-3, 0, 3):
                    for dy in (-3, 0, 3):
                        draw.text((x_pos + dx, y_pos + dy), text, font=font, fill="black")
                draw.text((x_pos, y_pos), text, font=font, fill="white")

            if top_text:
                draw_meme_line(top_text[:45], 25)
            if bottom_text:
                draw_meme_line(bottom_text[:45], h - font_size - 40)

            out = io.BytesIO()
            img.save(out, format="PNG")
            out.seek(0)
            return out
        except Exception:
            pass

    if raw_bytes:
        out = io.BytesIO(raw_bytes)
        out.seek(0)
        return out

    if PIL_AVAILABLE:
        img = Image.new("RGB", (800, 450), color=(28, 32, 46))
        draw = ImageDraw.Draw(img)
        draw.text((40, 180), (top_text or clean_prompt)[:60], fill=(255, 255, 255))
        if bottom_text:
            draw.text((40, 240), bottom_text[:60], fill=(255, 220, 90))
        out = io.BytesIO()
        img.save(out, format="PNG")
        out.seek(0)
        return out

    raise RuntimeError("Image generate nahi ho payi.")


def unload_all_dynamic_modules():
    for cmd_name in list(REGISTERED_COMMANDS):
        try:
            bot.remove_command(cmd_name)
        except Exception:
            pass
    REGISTERED_COMMANDS.clear()

    for event_name, func in list(REGISTERED_LISTENERS):
        try:
            bot.remove_listener(func, event_name)
        except Exception:
            pass
    REGISTERED_LISTENERS.clear()


def _tracked_command(*args, **kwargs):
    def decorator(func):
        cmd_name = kwargs.get("name") or (next(iter(args), None) or func.__name__)
        if bot.get_command(cmd_name):
            bot.remove_command(cmd_name)
        cmd_obj = commands.command(*args, **kwargs)(func)
        bot.add_command(cmd_obj)
        REGISTERED_COMMANDS.add(cmd_name)
        return cmd_obj
    return decorator


def _tracked_listen(name=None):
    def decorator(func):
        event_name = name or func.__name__
        bot.add_listener(func, event_name)
        REGISTERED_LISTENERS.append((event_name, func))
        return func
    return decorator


class SafeBotProxy:
    def __init__(self, real_bot):
        self._bot = real_bot

    def command(self, *args, **kwargs):
        return _tracked_command(*args, **kwargs)

    def listen(self, name=None):
        return _tracked_listen(name)

    def event(self, func):
        return _tracked_listen(func.__name__)(func)

    def __getattr__(self, item):
        return getattr(self._bot, item)


def build_exec_env(extra: dict = None) -> dict:
    env = {
        "bot": SafeBotProxy(bot),
        "discord": discord,
        "commands": commands,
        "os": os,
        "re": re,
        "io": io,
        "json": json,
        "time": time,
        "datetime": datetime,
        "timedelta": timedelta,
        "IST": IST,
        "now_ist": now_ist,
        "asyncio": asyncio,
        "aiohttp": aiohttp,
        "invite_cache": invite_cache,
        "DATA_DIR": DATA_DIR,
        "ALLOWED_IDS": ALLOWED_IDS,
        "is_authorized": is_authorized,
        "is_duplicate_message": is_duplicate_message,
        "find_member_smart": find_member_smart,
        "find_channel_smart": find_channel_smart,
        "get_invite_leaderboard": get_invite_leaderboard,
        "generate_image_bytes": generate_image_bytes,
    }
    if PIL_AVAILABLE:
        env["Image"] = Image
        env["ImageDraw"] = ImageDraw
        env["ImageFont"] = ImageFont
        env["ImageOps"] = ImageOps
    if extra:
        env.update(extra)
    return env


def execute_dynamic_code(code_str: str):
    exec(code_str, build_exec_env())


async def load_or_reload_cog_file(cog_rel_path: str):
    """Loads/reloads a .py file inside cogs/ immediately without bot restart."""
    ext_name = cog_rel_path.replace("/", ".").replace("\\", ".").removesuffix(".py")
    importlib.invalidate_caches()
    if ext_name in bot.extensions:
        await bot.reload_extension(ext_name)
    else:
        await bot.load_extension(ext_name)


async def load_all_cogs_from_disk() -> int:
    count = 0
    if not os.path.exists(COGS_DIR):
        return 0
    for fname in os.listdir(COGS_DIR):
        if fname.endswith(".py") and not fname.startswith("_"):
            rel_path = f"{COGS_DIR}/{fname}"
            try:
                await load_or_reload_cog_file(rel_path)
                count += 1
            except Exception as e:
                print(f"❌ Cog load error ({fname}): {e}")
    return count


async def reload_all_modules() -> int:
    async with MODULE_LOCK:
        unload_all_dynamic_modules()
        modules = load_json(MODULES_FILE, {})
        loaded = 0
        for mod_id, info in modules.items():
            if not info.get("enabled", True):
                continue
            code = info.get("code", "").strip()
            if not code:
                continue
            try:
                execute_dynamic_code(code)
                loaded += 1
            except Exception as e:
                print(f"❌ Error loading {mod_id}: {e}")
        cog_count = await load_all_cogs_from_disk()
        return loaded + cog_count

# ==========================================
# PART 2A: HELPERS & AUTO-COG / MODULE LOADER
# ==========================================

def find_member_smart(guild: discord.Guild, query: str):
    if not guild or not query:
        return None

    q = (
        query.strip()
        .lower()
        .replace("<@", "")
        .replace("!", "")
        .replace(">", "")
    )

    if q.isdigit():
        m = guild.get_member(int(q))
        if m:
            return m

    for m in guild.members:
        if q in (
            m.name.lower(),
            m.display_name.lower(),
            str(m).lower()
        ):
            return m

    for m in guild.members:
        if (
            q in m.name.lower()
            or q in m.display_name.lower()
        ):
            return m

    return None


def find_channel_smart(guild: discord.Guild, query: str):
    if not guild or not query:
        return None

    q = (
        query.strip()
        .lower()
        .replace("<#", "")
        .replace(">", "")
        .replace("#", "")
    )

    if q.isdigit():
        ch = guild.get_channel(int(q))
        if ch:
            return ch

    for ch in guild.text_channels:
        if q == ch.name.lower():
            return ch

    for ch in guild.text_channels:
        if q in ch.name.lower():
            return ch

    return None


async def get_invite_leaderboard(
    guild: discord.Guild
) -> list:
    invites = await guild.invites()

    counts = {}

    for inv in invites:
        if inv.inviter and not inv.inviter.bot:
            uid = inv.inviter.id
            counts[uid] = (
                counts.get(uid, 0)
                + (inv.uses or 0)
            )

    return sorted(
        counts.items(),
        key=lambda x: x[1],
        reverse=True
    )


async def generate_image_bytes(
    prompt_text: str,
    top_text: str = "",
    bottom_text: str = ""
) -> io.BytesIO:

    clean_prompt = re.sub(
        r"[^a-zA-Z0-9 ,.-]",
        "",
        prompt_text
    ).strip() or "funny gaming meme"

    encoded_prompt = aiohttp.helpers.quote(
        clean_prompt
    )

    url = (
        f"https://pollinations.ai"
        f"{encoded_prompt}"
        f"?width=1024"
        f"&height=1024"
        f"&nologo=true"
        f"&seed={int(time.time()) % 99999}"
    )

    raw_bytes = None

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                timeout=20
            ) as resp:

                if resp.status == 200:
                    raw_bytes = await resp.read()

    except Exception:
        raw_bytes = None

    if (
        raw_bytes
        and PIL_AVAILABLE
        and (top_text or bottom_text)
    ):
        try:
            img = Image.open(
                io.BytesIO(raw_bytes)
            ).convert("RGB")

            draw = ImageDraw.Draw(img)

            w, h = img.size

            font_size = max(
                36,
                w // 16
            )

            try:
                font = ImageFont.truetype(
                    "DejaVuSans-Bold.ttf",
                    font_size
                )
            except Exception:
                font = ImageFont.load_default()

            def draw_meme_line(
                text: str,
                y_pos: int
            ):
                text = text.upper()

                tw = int(
                    draw.textlength(
                        text,
                        font=font
                    )
                )

                x_pos = max(
                    10,
                    (w - tw) // 2
                )

                for dx in (-3, 0, 3):
                    for dy in (-3, 0, 3):
                        draw.text(
                            (
                                x_pos + dx,
                                y_pos + dy
                            ),
                            text,
                            font=font,
                            fill="black"
                        )

                draw.text(
                    (
                        x_pos,
                        y_pos
                    ),
                    text,
                    font=font,
                    fill="white"
                )

            if top_text:
                draw_meme_line(
                    top_text[:45],
                    25
                )

            if bottom_text:
                draw_meme_line(
                    bottom_text[:45],
                    h - font_size - 40
                )

            out = io.BytesIO()

            img.save(
                out,
                format="PNG"
            )

            out.seek(0)

            return out

        except Exception:
            pass

    if raw_bytes:
        out = io.BytesIO(raw_bytes)
        out.seek(0)
        return out

    if PIL_AVAILABLE:
        img = Image.new(
            "RGB",
            (800, 450),
            color=(28, 32, 46)
        )

        draw = ImageDraw.Draw(img)

        draw.text(
            (40, 180),
            (top_text or clean_prompt)[:60],
            fill=(255, 255, 255)
        )

        if bottom_text:
            draw.text(
                (40, 240),
                bottom_text[:60],
                fill=(255, 220, 90)
            )

        out = io.BytesIO()

        img.save(
            out,
            format="PNG"
        )

        out.seek(0)

        return out

    raise RuntimeError(
        "Image generate nahi ho payi."
    )
    # ==========================================
# PART 2B: DYNAMIC MODULE / COG LOADER
# ==========================================

def unload_all_dynamic_modules():
    for cmd_name in list(REGISTERED_COMMANDS):
        try:
            bot.remove_command(cmd_name)
        except Exception:
            pass

    REGISTERED_COMMANDS.clear()

    for event_name, func in list(REGISTERED_LISTENERS):
        try:
            bot.remove_listener(func, event_name)
        except Exception:
            pass

    REGISTERED_LISTENERS.clear()


def _tracked_command(*args, **kwargs):
    def decorator(func):
        cmd_name = (
            kwargs.get("name")
            or (next(iter(args), None) or func.__name__)
        )

        if bot.get_command(cmd_name):
            bot.remove_command(cmd_name)

        cmd_obj = commands.command(
            *args,
            **kwargs
        )(func)

        bot.add_command(cmd_obj)
        REGISTERED_COMMANDS.add(cmd_name)

        return cmd_obj

    return decorator


def _tracked_listen(name=None):
    def decorator(func):
        event_name = name or func.__name__

        bot.add_listener(
            func,
            event_name
        )

        REGISTERED_LISTENERS.append(
            (event_name, func)
        )

        return func

    return decorator


class SafeBotProxy:
    def __init__(self, real_bot):
        self._bot = real_bot

    def command(self, *args, **kwargs):
        return _tracked_command(
            *args,
            **kwargs
        )

    def listen(self, name=None):
        return _tracked_listen(name)

    def event(self, func):
        return _tracked_listen(
            func.__name__
        )(func)

    def __getattr__(self, item):
        return getattr(
            self._bot,
            item
        )


def build_exec_env(extra: dict = None) -> dict:
    env = {
        "bot": SafeBotProxy(bot),
        "discord": discord,
        "commands": commands,
        "os": os,
        "re": re,
        "io": io,
        "json": json,
        "time": time,
        "datetime": datetime,
        "timedelta": timedelta,
        "IST": IST,
        "now_ist": now_ist,
        "asyncio": asyncio,
        "aiohttp": aiohttp,
        "invite_cache": invite_cache,
        "DATA_DIR": DATA_DIR,
        "ALLOWED_IDS": ALLOWED_IDS,
        "is_authorized": is_authorized,
        "is_duplicate_message": is_duplicate_message,
        "find_member_smart": find_member_smart,
        "find_channel_smart": find_channel_smart,
        "get_invite_leaderboard": get_invite_leaderboard,
        "generate_image_bytes": generate_image_bytes,
    }

    if PIL_AVAILABLE:
        env["Image"] = Image
        env["ImageDraw"] = ImageDraw
        env["ImageFont"] = ImageFont
        env["ImageOps"] = ImageOps

    if extra:
        env.update(extra)

    return env


def execute_dynamic_code(code_str: str):
    exec(
        code_str,
        build_exec_env()
    )


async def load_or_reload_cog_file(
    cog_rel_path: str
):
    """Loads/reloads a .py file inside cogs/ immediately without bot restart."""

    ext_name = (
        cog_rel_path
        .replace("/", ".")
        .replace("\\", ".")
        .removesuffix(".py")
    )

    importlib.invalidate_caches()

    if ext_name in bot.extensions:
        await bot.reload_extension(ext_name)
    else:
        await bot.load_extension(ext_name)


async def load_all_cogs_from_disk() -> int:
    count = 0

    if not os.path.exists(COGS_DIR):
        return 0

    for fname in os.listdir(COGS_DIR):
        if (
            fname.endswith(".py")
            and not fname.startswith("_")
        ):
            rel_path = f"{COGS_DIR}/{fname}"

            try:
                await load_or_reload_cog_file(
                    rel_path
                )
                count += 1

            except Exception as e:
                print(
                    f"❌ Cog load error ({fname}): {e}"
                )

    return count


async def reload_all_modules() -> int:
    async with MODULE_LOCK:

        unload_all_dynamic_modules()

        modules = load_json(
            MODULES_FILE,
            {}
        )

        loaded = 0

        for mod_id, info in modules.items():

            if not info.get(
                "enabled",
                True
            ):
                continue

            code = info.get(
                "code",
                ""
            ).strip()

            if not code:
                continue

            try:
                execute_dynamic_code(
                    code
                )
                loaded += 1

            except Exception as e:
                print(
                    f"❌ Error loading {mod_id}: {e}"
                )

        cog_count = await load_all_cogs_from_disk()

        return loaded + cog_count

# ==========================================
# PART 2C: AI / MODULE SUPPORT HELPERS
# ==========================================

def save_json(path: str, data):
    os.makedirs(
        os.path.dirname(path) or ".",
        exist_ok=True
    )

    with open(
        path,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            data,
            f,
            ensure_ascii=False,
            indent=2
        )


def load_json(path: str, default=None):
    try:
        if not os.path.exists(path):
            return default

        with open(
            path,
            "r",
            encoding="utf-8"
        ) as f:
            return json.load(f)

    except Exception:
        return default


def now_ist():
    return datetime.now(IST)


def is_authorized(member) -> bool:
    if not member:
        return False

    try:
        if member.id in ALLOWED_IDS:
            return True
    except Exception:
        pass

    try:
        role_ids = {
            role.id
            for role in getattr(
                member,
                "roles",
                []
            )
        }

        if DEVELOPER_ROLE_ID in role_ids:
            return True

    except Exception:
        pass

    return False


def is_duplicate_message(
    message: discord.Message
) -> bool:

    if not message:
        return True

    try:
        key = (
            message.guild.id if message.guild else 0,
            message.author.id,
            message.id
        )

        if key in invite_cache:
            return True

        invite_cache[key] = time.time()

        # Old cache cleanup
        current = time.time()

        for k, v in list(
            invite_cache.items()
        ):
            if current - v > 30:
                invite_cache.pop(
                    k,
                    None
                )

        return False

    except Exception:
        return False


def extract_code_block(text: str) -> str:
    if not text:
        return ""

    match = re.search(
        r"```(?:python|py)?\s*(.*?)```",
        text,
        re.DOTALL | re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    return text.strip()


def safe_filename(name: str) -> str:
    name = (
        name
        .strip()
        .replace("\\", "_")
        .replace("/", "_")
    )

    name = re.sub(
        r"[^a-zA-Z0-9_.-]",
        "_",
        name
    )

    return name[:120]


def ensure_python_extension(
    filename: str
) -> str:

    filename = safe_filename(
        filename
    )

    if not filename.endswith(".py"):
        filename += ".py"

    return filename


def get_project_file_path(
    filename: str
) -> str:

    filename = safe_filename(
        filename
    )

    return os.path.join(
        DATA_DIR,
        filename
    )


def clean_ai_text(text: str) -> str:
    if not text:
        return ""

    text = str(text).strip()

    if text.startswith("```"):
        text = re.sub(
            r"^```[a-zA-Z0-9_-]*\s*",
            "",
            text
        )

        text = re.sub(
            r"\s*```$",
            "",
            text
        )

    return text.strip()


def extract_json_safe(text: str):
    if not text:
        return None

    text = clean_ai_text(text)

    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(
        r"\{.*\}",
        text,
        re.DOTALL
    )

    if not match:
        return None

    try:
        return json.loads(
            match.group(0)
        )
    except Exception:
        return None

# ==========================================
# PART 3A: AI BRAIN — SYSTEM PROMPT
# ==========================================

MASTER_SYSTEM_PROMPT = """
You are ELYX AI Developer, an advanced Discord coding assistant.

Your job is to understand the user's request and safely work with the
existing Discord bot project.

IMPORTANT RULES:

1. Preserve the existing project architecture.
2. Do not remove existing features unless explicitly requested.
3. Do not rewrite unrelated files.
4. Do not modify Cogs unless the user explicitly asks for a Cog change.
5. When fixing an error, make the smallest reliable fix.
6. Do not invent files, functions, variables, IDs, channels, roles,
   or project structure that are not available in context.
7. Follow the user's exact requested names.
8. If code is required, return valid Python code.
9. Prefer stable solutions over unnecessarily complicated solutions.
10. Do not claim that code was saved, tested, deployed, or pushed unless
    the program actually performed that action.
11. Discord operations that change the server must follow the existing
    confirmation/authorization system.
12. Never expose API keys, tokens, passwords, or other secrets.
13. Keep responses concise unless detailed explanation is necessary.

The project uses Python and discord.py.

The developer role is allowed to perform advanced coding operations.
Normal members must not receive developer-only coding access.

When generating structured AI responses, return valid JSON whenever
the caller requests JSON.
"""


def _clean_ai_error(error) -> str:
    if error is None:
        return "Unknown AI error."

    text = str(error).strip()

    if not text:
        return "Unknown AI error."

    # Remove common noisy prefixes
    prefixes = [
        "Groq fast failed:",
        "Gemini fast failed:",
        "Fast AI Error:",
    ]

    for prefix in prefixes:
        if text.startswith(prefix):
            text = text[len(prefix):].strip()

    return text[:1000]


def _extract_http_error(
    status: int,
    body: str
) -> str:

    body = (body or "").strip()

    if status == 401:
        return "API key invalid or unauthorized."

    if status == 403:
        return "API access forbidden."

    if status == 404:
        return "AI model or API endpoint not found."

    if status == 429:
        return "AI API rate limit reached."

    if status == 500:
        return "AI provider server error."

    if status == 502:
        return "AI provider gateway error."

    if status == 503:
        return "AI provider temporarily unavailable."

    if status == 504:
        return "AI provider timeout."

    if body:
        try:
            data = json.loads(body)

            if isinstance(data, dict):
                error = data.get("error")

                if isinstance(error, dict):
                    message = error.get("message")

                    if message:
                        return str(message)[:500]

                if isinstance(error, str):
                    return error[:500]

                message = data.get("message")

                if message:
                    return str(message)[:500]

        except Exception:
            pass

    return f"HTTP {status}"


async def _post_json(
    session,
    url: str,
    headers: dict,
    payload: dict,
    timeout_seconds: float = 5.0
):

    timeout = aiohttp.ClientTimeout(
        total=timeout_seconds
    )

    async with session.post(
        url,
        headers=headers,
        json=payload,
        timeout=timeout
    ) as response:

        body = await response.text()

        if response.status >= 400:
            raise RuntimeError(
                _extract_http_error(
                    response.status,
                    body
                )
            )

        try:
            return json.loads(body)

        except Exception:
            raise RuntimeError(
                "AI provider returned invalid JSON."
        )

# ==========================================
# PART 3B: AI BRAIN — GROQ + GEMINI
# ==========================================

async def call_groq_fast(
    user_prompt: str,
    timeout_seconds: float = 4.5
):

    if not GROQ_API_KEY:
        raise RuntimeError(
            "Groq API key not configured."
        )

    url = (
        "https://api.groq.com/openai/v1/"
        "chat/completions"
    )

    headers = {
        "Authorization": (
            f"Bearer {GROQ_API_KEY}"
        ),
        "Content-Type": "application/json",
    }

    models = [
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
    ]

    last_error = None

    async with aiohttp.ClientSession() as session:

        for model in models:

            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": MASTER_SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": user_prompt,
                    },
                ],
                "temperature": 0.2,
                "max_tokens": 3000,
            }

            try:
                data = await _post_json(
                    session,
                    url,
                    headers,
                    payload,
                    timeout_seconds
                )

                choices = data.get(
                    "choices",
                    []
                )

                if not choices:
                    raise RuntimeError(
                        "Groq returned no choices."
                    )

                message = choices[0].get(
                    "message",
                    {}
                )

                content = message.get(
                    "content",
                    ""
                )

                if not content:
                    raise RuntimeError(
                        "Groq returned an empty response."
                    )

                return content

            except Exception as e:
                last_error = e

    raise RuntimeError(
        "Groq fast failed: "
        + _clean_ai_error(last_error)
    )


async def call_gemini_fast(
    user_prompt: str,
    timeout_seconds: float = 4.5
):

    if not GEMINI_API_KEY:
        raise RuntimeError(
            "Gemini API key not configured."
        )

    models = [
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash-lite",
    ]

    last_error = None

    async with aiohttp.ClientSession() as session:

        for model in models:

            url = (
                "https://generativelanguage.googleapis.com/"
                f"v1beta/models/{model}:generateContent"
                f"?key={GEMINI_API_KEY}"
            )

            headers = {
                "Content-Type": "application/json"
            }

            payload = {
                "system_instruction": {
                    "parts": [
                        {
                            "text": MASTER_SYSTEM_PROMPT
                        }
                    ]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": user_prompt
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": 3000,
                },
            }

            try:
                data = await _post_json(
                    session,
                    url,
                    headers,
                    payload,
                    timeout_seconds
                )

                candidates = data.get(
                    "candidates",
                    []
                )

                if not candidates:
                    raise RuntimeError(
                        "Gemini returned no candidates."
                    )

                parts = (
                    candidates[0]
                    .get("content", {})
                    .get("parts", [])
                )

                text_parts = []

                for part in parts:
                    value = part.get(
                        "text",
                        ""
                    )

                    if value:
                        text_parts.append(
                            value
                        )

                content = "".join(
                    text_parts
                ).strip()

                if not content:
                    raise RuntimeError(
                        "Gemini returned an empty response."
                    )

                return content

            except Exception as e:
                last_error = e

    raise RuntimeError(
        "Gemini fast failed: "
        + _clean_ai_error(last_error)
                )
  # ==========================================
# PART 3C-1: AI RESPONSE HANDLER
# ==========================================

async def ask_ai(
    user_prompt: str,
    timeout_sec: float = 8.0
):

    async def run_groq():
        try:
            result = await call_groq_fast(
                user_prompt,
                timeout_seconds=4.5
            )

            if result and result.strip():
                return {
                    "provider": "groq",
                    "content": result.strip()
                }

        except Exception as e:
            return {
                "provider": "groq",
                "error": _clean_ai_error(e)
            }

        return {
            "provider": "groq",
            "error": "Empty Groq response."
        }


    async def run_gemini():
        try:
            result = await call_gemini_fast(
                user_prompt,
                timeout_seconds=4.5
            )

            if result and result.strip():
                return {
                    "provider": "gemini",
                    "content": result.strip()
                }

        except Exception as e:
            return {
                "provider": "gemini",
                "error": _clean_ai_error(e)
            }

        return {
            "provider": "gemini",
            "error": "Empty Gemini response."
        }


    groq_task = asyncio.create_task(
        run_groq()
    )

    gemini_task = asyncio.create_task(
        run_gemini()
    )

    tasks = {
        groq_task,
        gemini_task
    }

    errors = []
# ==========================================
# PART 3C-2: AI RESPONSE RACE
# ==========================================

    try:

        while tasks:

            done, tasks = await asyncio.wait(
                tasks,
                timeout=timeout_sec,
                return_when=asyncio.FIRST_COMPLETED
            )

            if not done:
                break

            for task in done:

                try:
                    result = task.result()

                except Exception as e:
                    errors.append(
                        _clean_ai_error(e)
                    )
                    continue

                content = result.get(
                    "content"
                )

                if content:
                    for pending in tasks:
                        pending.cancel()

                    return content

                error = result.get(
                    "error"
                )

                if error:
                    errors.append(
                        f"{result.get('provider', 'AI')}: "
                        f"{error}"
                    )

    finally:

        for pending in tasks:
            pending.cancel()

        if tasks:
            await asyncio.gather(
                *tasks,
                return_exceptions=True
                    )


# ==========================================
# PART 3C-3: AI ERROR HANDLING
# ==========================================

    if errors:

        unique_errors = []

        for error in errors:

            error = _clean_ai_error(
                error
            )

            if (
                error
                and error not in unique_errors
            ):
                unique_errors.append(
                    error
                )

        if unique_errors:
            raise RuntimeError(
                " | ".join(
                    unique_errors
                )
            )

    raise RuntimeError(
        "Fast AI temporarily unavailable."
    )


async def compile_and_heal_code(
    code: str
):

    if not code:
        return code

    try:
        compile(
            code,
            "<dynamic_code>",
            "exec"
        )

        return code

    except SyntaxError as first_error:

        fix_prompt = f"""
Fix ONLY the Python syntax error in this code.

Do not redesign it.
Do not remove features.
Do not change logic unnecessarily.

Syntax error:
{first_error}

CODE:
{code}
"""

        try:
            fixed = await ask_ai(
                fix_prompt,
                timeout_sec=8.0
            )

            fixed = extract_code_block(
                fixed
            )

            compile(
                fixed,
                "<dynamic_code>",
                "exec"
            )

            return fixed

        except Exception:
            return code
        

# ==========================================
# PART 3C-4: CODE AUTO-HEAL
# ==========================================

        try:
            fixed = await ask_ai(
                fix_prompt,
                timeout_sec=8.0
            )

            fixed = extract_code_block(
                fixed
            )

            compile(
                fixed,
                "<dynamic_code>",
                "exec"
            )

            return fixed

        except Exception:
            return code

 # ==========================================
# PART 3C-5: CODE VALIDATION
# ==========================================

async def validate_and_heal_code(code: str) -> str:

    if not code:
        return code

    try:
        compile(
            code,
            "<dynamic_code>",
            "exec"
        )

        return code

    except SyntaxError:
        return await compile_and_heal_code(
            code
        )


# ==========================================
# PART 4A: GITHUB AUTO-CODER
# ==========================================

async def github_read_file(
    repo_path: str
):

    if not GITHUB_TOKEN:
        raise RuntimeError(
            "GitHub token not configured."
        )

    api_url = (
        f"https://api.github.com/repos/"
        f"{GITHUB_REPO}/contents/{repo_path}"
    )

    headers = {
        "Authorization": (
            f"Bearer {GITHUB_TOKEN}"
        ),
        "Accept": (
            "application/vnd.github+json"
        ),
        "X-GitHub-Api-Version": (
            "2022-11-28"
        ),
    }

    async with aiohttp.ClientSession() as session:

        async with session.get(
            api_url,
            headers=headers,
            timeout=15
        ) as resp:

            body = await resp.text()

            if resp.status != 200:
                raise RuntimeError(
                    _extract_http_error(
                        resp.status,
                        body
                    )
                )

            data = json.loads(body)

            content = data.get(
                "content",
                ""
            )

            sha = data.get(
                "sha"
            )

            if content:
                import base64

                decoded = base64.b64decode(
                    content
                ).decode("utf-8")

            else:
                decoded = ""

            return decoded, sha


async def github_write_file(
    repo_path: str,
    content: str,
    commit_message: str
):

    if not GITHUB_TOKEN:
        raise RuntimeError(
            "GitHub token not configured."
        )

    api_url = (
        f"https://api.github.com/repos/"
        f"{GITHUB_REPO}/contents/{repo_path}"
    )

    headers = {
        "Authorization": (
            f"Bearer {GITHUB_TOKEN}"
        ),
        "Accept": (
            "application/vnd.github+json"
        ),
        "X-GitHub-Api-Version": (
            "2022-11-28"
        ),
    }

    import base64

    encoded = base64.b64encode(
        content.encode("utf-8")
    ).decode("ascii")

    sha = None

    try:
        _, sha = await github_read_file(
            repo_path
        )

    except Exception:
        sha = None

    payload = {
        "message": commit_message,
        "content": encoded,
        "branch": GITHUB_BRANCH,
    }

    if sha:
        payload["sha"] = sha

    async with aiohttp.ClientSession() as session:

        async with session.put(
            api_url,
            headers=headers,
            json=payload,
            timeout=20
        ) as resp:

            body = await resp.text()

            if resp.status not in (
                200,
                201
            ):
                raise RuntimeError(
                    _extract_http_error(
                        resp.status,
                        body
                    )
                )

            return json.loads(body)


async def github_save_project_file(
    filename: str,
    content: str
):

    filename = filename.strip()

    if not filename:
        raise RuntimeError(
            "Filename missing."
        )

    if not filename.endswith(".py"):
        filename += ".py"

    return await github_write_file(
        filename,
        content,
        f"Update {filename}"
    )
# ==========================================
# PART 4B: GITHUB PROJECT FILE HELPERS
# ==========================================

async def github_get_project_file(
    filename: str
):
    filename = filename.strip()

    if not filename:
        raise RuntimeError(
            "Filename missing."
        )

    return await github_read_file(
        filename
    )


def extract_requested_filename(
    text: str
):
    patterns = [
        r"(?:file|filename)\s*[:=]?\s*[`\"]?([A-Za-z0-9_.-]+\.py)",
        r"([A-Za-z0-9_-]+\.py)",
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:
            return match.group(1)

    return None


def extract_requested_code(
    text: str
):
    code = extract_code_block(text)
    return code.strip()

# ==========================================
# PART 4C: GITHUB SAVE HELPER
# ==========================================

async def save_generated_code_to_github(
    filename: str,
    code: str
):
    code = await validate_and_heal_code(
        code
    )

    return await github_save_project_file(
        filename,
        code
    )
    # ==========================================
# PART 4D: AI CODING FLOW
# ==========================================

async def generate_code_for_request(
    user_request: str,
    existing_code: str = "",
    filename: str = ""
):
    context = ""

    if existing_code:
        context = (
            "\nEXISTING FILE:\n"
            + filename
            + "\n\n"
            + existing_code
        )

    prompt = (
        "You are modifying an existing Python Discord bot.\n\n"
        "USER REQUEST:\n"
        + user_request
        + "\n\n"
        + context
        + "\n\n"
        "Rules:\n"
        "- Preserve existing features.\n"
        "- Do not modify unrelated logic.\n"
        "- Make the smallest reliable change.\n"
        "- Do not change Cogs unless explicitly requested.\n"
        "- Return ONLY the complete Python code."
    )

    result = await ask_ai(
        prompt,
        timeout_sec=8.0
    )

    code = extract_code_block(result)

    if not code:
        raise RuntimeError(
            "AI returned no code."
        )

    return await validate_and_heal_code(
        code
    )
    # ==========================================
# PART 4E: GITHUB REQUEST HANDLER
# ==========================================

async def handle_github_code_request(
    user_request: str
):
    filename = extract_requested_filename(
        user_request
    )

    if not filename:
        raise RuntimeError(
            "Python filename nahi mila."
        )

    existing_code = ""

    try:
        existing_code, _ = (
            await github_get_project_file(
                filename
            )
        )
    except Exception:
        existing_code = ""

    return await generate_code_for_request(
        user_request,
        existing_code,
        filename
    )
    # ==========================================
# PART 4F: CODE SAVE FLOW
# ==========================================

async def process_code_save_request(
    user_request: str
):
    code = await handle_github_code_request(
        user_request
    )

    filename = extract_requested_filename(
        user_request
    )

    if not filename:
        raise RuntimeError(
            "Filename nahi mila."
        )

    return await save_generated_code_to_github(
        filename,
        code
    )

# ==========================================
# PART 4G: BACKGROUND TASKS
# ==========================================

async def github_sync_loop():
    await bot.wait_until_ready()

    while not bot.is_closed():
        try:
            await asyncio.sleep(300)

        except asyncio.CancelledError:
            break

        except Exception as e:
            print(
                f"❌ GitHub sync error: {e}"
            )


# ==========================================
# PART 5A: BOT COMMANDS
# ==========================================

@bot.command(name="ai")
async def ai_command(
    ctx,
    *,
    prompt: str
):
    if not is_authorized(ctx.author):
        return

    try:
        async with ctx.typing():
            result = await ask_ai(
                prompt,
                timeout_sec=8.0
            )

        await ctx.reply(
            result[:1900],
            mention_author=False
        )

    except Exception as e:
        await ctx.reply(
            f"⚠️ AI Error: `{_clean_ai_error(e)}`",
            mention_author=False
        )


@bot.command(name="code")
async def code_command(
    ctx,
    *,
    request: str
):
    if not is_authorized(ctx.author):
        return

    try:
        async with ctx.typing():
            code = await process_code_save_request(
                request
            )

        await ctx.reply(
            "✅ Code generated and saved successfully.",
            mention_author=False
        )

    except Exception as e:
        await ctx.reply(
            f"⚠️ Code Error: `{_clean_ai_error(e)}`",
            mention_author=False
        )


# ==========================================
# PART 5B: MESSAGE LISTENER
# ==========================================

@bot.event
async def on_message(message):

    if message.author.bot:
        return

    if is_duplicate_message(message):
        return

    await bot.process_commands(
        message
    )

    if not bot.user:
        return

    if bot.user not in message.mentions:
        return

    if not is_authorized(
        message.author
    ):
        return

    prompt = (
        message.content
        .replace(
            f"<@{bot.user.id}>",
            ""
        )
        .replace(
            f"<@!{bot.user.id}>",
            ""
        )
        .strip()
    )

    if not prompt:
        return

    try:
        async with message.channel.typing():
            result = await ask_ai(
                prompt,
                timeout_sec=8.0
            )

        await message.reply(
            result[:1900],
            mention_author=False
        )

    except Exception as e:
        await message.reply(
            f"⚠️ Fast AI Error: "
            f"`{_clean_ai_error(e)}`",
            mention_author=False
        )


# ==========================================
# PART 5C: BOT STARTUP
# ==========================================

@bot.event
async def on_ready():

    print(
        f"✅ Logged in as {bot.user}"
    )

    try:
        await reload_all_modules()

        print(
            "✅ Modules and Cogs loaded."
        )

    except Exception as e:
        print(
            f"❌ Module load error: {e}"
        )

    if not hasattr(
        bot,
        "_github_sync_task"
    ):
        bot._github_sync_task = (
            asyncio.create_task(
                github_sync_loop()
            )
        )


# ==========================================
# PART 5D: START BOT
# ==========================================

if __name__ == "__main__":

    if not DISCORD_TOKEN:
        raise RuntimeError(
            "DISCORD_TOKEN not configured."
        )

    bot.run(
        DISCORD_TOKEN
)
