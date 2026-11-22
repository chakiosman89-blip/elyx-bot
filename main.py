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
# PART 3: SUB-10s AI BRAIN (FASTEST MODELS)
# ==========================================
MASTER_SYSTEM_PROMPT = """You are 'Elyx Trading', an ultra-fast, autonomous Discord AI & self-coding developer (discord.py v2.x).
You understand Hinglish, Hindi, and English effortlessly—even rough voice-typed messages.
Reply concisely and naturally in Hinglish/English.

STRICT AUTONOMY & SPEED RULES:
1. NEVER ask for User IDs or Channel IDs! Use `find_member_smart(guild, "name")` or `find_channel_smart(guild, "name")` inside code.
2. ZERO-CONFIRMATION BY DEFAULT:
   - Execute nicknames, roles, channels, messages, auto-warning features, behavior rules, scheduled timers, and new GitHub cog files IMMEDIATELY (`requires_confirm`: false)!
   - ONLY set `requires_confirm`: true if deleting a channel/role or banning someone.
3. CREATING SEPARATE GITHUB COG FILES (`GITHUB_FILE_CREATE` mode):
   - When the owner says: "GitHub mein ek alag file bana ke [feature/command] add kar de" or "naya command file bana de":
   - Set `mode`: `"GITHUB_FILE_CREATE"`, `target_file`: `"cogs/<clean_snake_name>.py"`.
   - Generate a complete, valid `discord.py` extension file containing `class FeatureCog(commands.Cog): ...` AND `async def setup(bot): await bot.add_cog(FeatureCog(bot))` so it loads and runs automatically!
4. SELF-HEALING ON ERROR REPLY (`FEATURE_MODIFY` or `GITHUB_FILE_FIX` or `ACTION`):
   - Check `Replied Message Context`, `Recent Channel Chat History`, and `Last Runtime Error`.
   - If the error came from a file in `Existing Cog Files` (like `cogs/xyz.py` or `casino_engine.py`), return `mode`: `"GITHUB_FILE_FIX"`, `target_file`: that exact file path, and `patch_instruction`: exact bug fix!
   - If the error came from an installed dynamic feature, return `mode`: `"FEATURE_MODIFY"` with fixed code.
   - If the error came from a one-time `ACTION`, return `mode`: `"ACTION"` with fixed `async def run_action():`.
5. BEHAVIOR CONTROL (`BEHAVIOR_UPDATE` mode):
   - "ab kuch mat bolna / chup rehna" -> `mute_all`: true.
   - "ab sabko reply dena" -> `mute_all`: false.
   - "[name] ko reply mat dena" -> add user ID to `add_ignored_users`: {"ID": "ignored"}.
   - "[name] kuch bhi puche toh reply mein 'bhikhari' dena" -> add to `add_forced_replies`: {"ID": "bhikhari"}.
   - "ab [name] ko normal reply dena" -> add ID to `remove_user_rules`: ["ID"].
6. SCHEDULED EVENTS & GIVEAWAYS (`SCHEDULE_CREATE` mode):
   - Calculate exact `run_at_ist` (`YYYY-MM-DD HH:MM`) using `Current IST Time`.
   - For invite giveaway winner: use `ranked = await get_invite_leaderboard(guild)` inside `async def run_action():` and announce the top inviter!

OUTPUT STRICT VALID JSON ONLY:
{
  "mode": "CHAT | IMAGE | ACTION | BEHAVIOR_UPDATE | SCHEDULE_CREATE | FEATURE_CREATE | FEATURE_MODIFY | FEATURE_TOGGLE | FEATURE_DELETE | GITHUB_FILE_CREATE | GITHUB_FILE_FIX | CLARIFY",
  "requires_confirm": false,
  "reply": "Short friendly Hinglish reply",
  "action_summary": "Summary if requires_confirm is true",
  "target_feature_id": "",
  "feature_name": "",
  "target_file": "cogs/example.py or main.py",
  "patch_instruction": "Exact fix details if GITHUB_FILE_FIX",
  "enable": true,
  "behavior_patch": {
    "mute_all": null,
    "add_ignored_users": {},
    "add_forced_replies": {},
    "remove_user_rules": [],
    "add_instruction": ""
  },
  "schedule_data": {
    "title": "",
    "run_at_ist": "YYYY-MM-DD HH:MM",
    "channel_name": "general"
  },
  "image_prompt": "",
  "meme_top": "",
  "meme_bottom": "",
  "memory_update": "Concise user memory note",
  "code": "Raw Python code (NO markdown backticks)"
}

PYTHON CODE RULES:
- Never include ```python backticks inside `"code"`.
- In `ACTION` and `SCHEDULE_CREATE`: always wrap logic in `async def run_action():`.
- In `FEATURE_CREATE` / `FEATURE_MODIFY`: use `@bot.listen("on_message")`, NEVER `@bot.event`.
- In `GITHUB_FILE_CREATE`: write a clean `commands.Cog` with `async def setup(bot): await bot.add_cog(...)`.
"""


def extract_json_safe(raw: str) -> dict:
    cleaned = raw.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


async def call_groq_fast(prompt: str, timeout_sec: float = 6.5) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError("No GROQ_API_KEY")
    last_err = None
    headers = {

        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    # Fastest production LPU models on Groq (1,000+ tok/s)
    for model_name in ("openai/gpt-oss-20b", "llama-4-scout-17b-16e-instruct", "openai/gpt-oss-120b"):
        try:
            payload = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": MASTER_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.15,
                "response_format": {"type": "json_object"},
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://groq.com",
                    headers=headers,
                    json=payload,
                    timeout=timeout_sec,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        content = next(iter(data.get("choices", [])), {}).get("message", {}).get("content", "")
                        if content:
                            return content
        except Exception as e:
            last_err = e
    raise RuntimeError(f"Groq fast failed: {last_err}")


async def call_gemini_fast(prompt: str, timeout_sec: float = 8.0) -> str:
    last_err = None
    for key in GEMINI_KEYS:
        client = genai.Client(api_key=key)
        # Active 2026 fast Gemini models
        for model_name in ("gemini-3.5-flash-lite", "gemini-3.8-flash"):
            try:
                resp = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=MASTER_SYSTEM_PROMPT,
                            temperature=0.15,
                            response_mime_type="application/json",
                        ),
                    ),
                    timeout=timeout_sec,
                )
                if resp.text:
                    return resp.text
            except Exception as e:
                last_err = e
    raise RuntimeError(f"Gemini fast failed: {last_err}")


async def ask_ai(prompt: str, timeout_sec: float = 7.0) -> dict:
    raw = None
    errors = []
    # Groq first for <3s response speed, Gemini instant fallback
    if GROQ_API_KEY:
        try:
            raw = await call_groq_fast(prompt, timeout_sec=timeout_sec)
        except Exception as e:
            errors.append(str(e))
    if not raw and GEMINI_KEYS:
        try:
            raw = await call_gemini_fast(prompt, timeout_sec=timeout_sec + 2.0)
        except Exception as e:
            errors.append(str(e))
    if not raw:
        raise RuntimeError(" | ".join(errors) or "AI API keys unavailable")
    return extract_json_safe(raw)


async def compile_and_heal_code(base_prompt: str, initial_ai_out: dict) -> dict:
    ai_res = initial_ai_out
    code = ai_res.get("code", "").strip()
    if not code:
        return ai_res
    for attempt in range(2):
        try:
            compile(code, "<ai_generated>", "exec")
            return ai_res
        except Exception as err:
            if attempt == 1:
                raise err
            fix_prompt = f"{base_prompt}\n\nSYNTAX ERROR IN CODE:\n{err}\nFix syntax and return valid JSON."
            ai_res = await ask_ai(fix_prompt, timeout_sec=8.0)
            code = ai_res.get("code", "").strip()
            if not code:
                return ai_res
    return ai_res

# ==========================================
# PART 4: GITHUB AUTO-CODER & SCHEDULER
# ==========================================
async def create_or_fix_github_cog(file_path: str, instruction_or_code: str, is_fix: bool = False) -> str:
    clean_path = file_path.strip().lstrip("/")
    if not clean_path.endswith(".py"):
        clean_path += ".py"
    if clean_path not in ("main.py", "casino_engine.py") and not clean_path.startswith("cogs/"):
        clean_path = f"cogs/{os.path.basename(clean_path)}"

    if is_fix:
        _, existing_code = await github_read_file(clean_path)
        if not existing_code and os.path.exists(clean_path):
            with open(clean_path, "r", encoding="utf-8") as f:
                existing_code = f.read()
        fix_prompt = (
            f"Fix the bug in `{clean_path}` according to this error/request:\n{instruction_or_code}\n\n"
            f"CURRENT CODE:\n{existing_code}\n\n"
            "Return STRICT JSON: {\"reply\": \"short Hinglish fix summary\", \"code\": \"COMPLETE FIXED PYTHON FILE\"}"
        )
        res = await ask_ai(fix_prompt, timeout_sec=15.0)
        final_code = res.get("code", "").strip()
        summary = res.get("reply", f"✅ `{clean_path}` fix karke save kar diya!")
    else:
        final_code = instruction_or_code.strip()
        summary = f"✅ `{clean_path}` GitHub par save aur live run ho gaya!"

    for fence in ("```python", "```"):
        if final_code.startswith(fence):
            final_code = final_code[len(fence):]
    if final_code.endswith("```"):
        final_code = final_code[:-3]
    final_code = final_code.strip()

    if len(final_code) < 40:
        raise RuntimeError("Generated code khali ya adhoora hai.")

    compile(final_code, clean_path, "exec")

    # Save locally & push to GitHub
    os.makedirs(os.path.dirname(clean_path) or ".", exist_ok=True)
    with open(clean_path, "w", encoding="utf-8") as f:
        f.write(final_code)
    await github_write_file(clean_path, final_code, f"AI Auto-Code: {clean_path}")

    # Auto-load into running bot immediately if it's a Cog
    if clean_path.startswith("cogs/") or clean_path == "casino_engine.py":
        await load_or_reload_cog_file(clean_path)

    return summary


@tasks.loop(seconds=15)
async def schedule_runner_loop():
    await bot.wait_until_ready()
    tasks_list = load_json(SCHEDULES_FILE, [])
    if not tasks_list:
        return

    current_dt = now_ist()
    updated = False

    for task in tasks_list:
        if task.get("done"):
            continue
        try:
            target_dt = datetime.strptime(task["run_at_ist"], "%Y-%m-%d %H:%M").replace(tzinfo=IST)
        except Exception:
            task["done"] = True
            updated = True
            continue

        if current_dt >= target_dt:
            task["done"] = True
            updated = True
            guild = bot.get_guild(int(task.get("guild_id", 0))) or (bot.guilds[0] if bot.guilds else None)
            fallback_ch = find_channel_smart(guild, task.get("channel_name", "general")) if guild else None
            if not fallback_ch and guild and guild.text_channels:
                fallback_ch = guild.text_channels[0]

            code = task.get("code", "").strip()
            try:
                if code:
                    env = build_exec_env({"guild": guild, "channel": fallback_ch})
                    exec(code, env)
                    if "run_action" in env:
                        await env["run_action"]()
                elif fallback_ch and task.get("message_text"):
                    await fallback_ch.send(task["message_text"])
            except Exception as e:
                if fallback_ch:
                    await fallback_ch.send(f"⚠️ Scheduled task `{task.get('title')}` error: `{e}`")

    if updated:
        await save_schedules(tasks_list)


async def execute_action_code(code: str, message: discord.Message):
    env = build_exec_env({"message": message, "guild": message.guild})
    exec(code, env)
    if "run_action" in env:
        await env["run_action"]()


class ConfirmActionView(discord.ui.View):
    def __init__(self, author_id: int, ai_res: dict, orig_message: discord.Message):
        super().__init__(timeout=300)
        self.author_id = author_id
        self.ai_res = ai_res
        self.orig_message = orig_message
        self.done = False

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.author_id and not is_authorized(interaction.user):
            await interaction.response.send_message("❌ Sirf Owner hi confirm kar sakta hai!", ephemeral=True)
            return False
        return True

    @discord.ui.button(label="Confirm & Execute", style=discord.ButtonStyle.success, emoji="✅")
    async def confirm_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        global LAST_RUNTIME_ERROR
        if self.done:
            return
        self.done = True
        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(content="⏳ Executing...", view=self)
        try:
            await execute_action_code(self.ai_res.get("code", "").strip(), self.orig_message)
            await interaction.followup.send("✅ **Done!**")
        except Exception as e:
            err_trace = traceback.format_exc()[-1000:]
            LAST_RUNTIME_ERROR = f"Error: {e}\n{err_trace}"
            await interaction.followup.send(
                f"❌ **Error:** `{e}`\n💡 *Is message pe reply karke likho **'fix kar'** — main khud theek kar dunga!*"
            )

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.danger, emoji="✖️")
    async def cancel_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.done:
            return
        self.done = True
        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(content="❌ Cancelled.", view=self)

# ==========================================
# PART 5A: COMMANDS & EVENT LISTENERS
# ==========================================
@bot.command(name="features")
async def list_features_cmd(ctx: commands.Context):
    if not is_authorized(ctx.author):
        return await ctx.reply("🔒 Permission nahi hai!")
    modules = load_json(MODULES_FILE, {})
    cog_files = [f for f in os.listdir(COGS_DIR) if f.endswith(".py")] if os.path.exists(COGS_DIR) else []
    lines = [f"• `[Dynamic]` **`{k}`** — {'🟢 ON' if v.get('enabled', True) else '🔴 OFF'}" for k, v in modules.items()]
    lines += [f"• `[GitHub Cog]` **`cogs/{f}`** — 🟢 LOADED" for f in cog_files]
    if not lines:
        return await ctx.reply("📦 Abhi koi extra feature ya cog nahi hai.")
    await ctx.reply("📦 **Active Features & GitHub Cogs:**\n" + "\n".join(lines))


@bot.command(name="reload")
async def reload_features_cmd(ctx: commands.Context):
    if not is_authorized(ctx.author):
        return await ctx.reply("🔒 Permission nahi hai!")
    count = await reload_all_modules()
    await ctx.reply(f"🔄 Saare modules aur GitHub cogs reload ho gaye! (Active: **{count}**)")


@bot.event
async def on_command_error(ctx: commands.Context, error):
    global LAST_RUNTIME_ERROR
    if isinstance(error, commands.CommandNotFound):
        return
    orig = getattr(error, "original", error)
    err_trace = "".join(traceback.format_exception(type(orig), orig, orig.__traceback__))[-1000:]
    LAST_RUNTIME_ERROR = f"Command: {ctx.message.content}\nError: {orig}\nTraceback:\n{err_trace}"
    await ctx.reply(
        f"❌ **Command Error:**\n```py\n{orig}\n```\n💡 *Is error pe reply karke likho **'isko fix kar'** — main fix karke GitHub pe save kar dunga!*"
    )


@bot.event
async def on_invite_create(invite: discord.Invite):
    if invite.guild:
        try:
            invite_cache[invite.guild.id] = await invite.guild.invites()
        except Exception:
            pass


@bot.event
async def on_invite_delete(invite: discord.Invite):
    if invite.guild:
        try:
            invite_cache[invite.guild.id] = await invite.guild.invites()
        except Exception:
            pass


@bot.event
async def setup_hook():
    if os.path.exists("casino_engine.py"):
        await bot.load_extension("casino_engine")
    if not schedule_runner_loop.is_running():
        schedule_runner_loop.start()


@bot.event
async def on_ready():
    print(f"🚀 Logged in as {bot.user} (ID: {bot.user.id}) | IST: {now_ist().strftime('%Y-%m-%d %H:%M')}")
    for guild in bot.guilds:
        try:
            invite_cache[guild.id] = await guild.invites()
        except Exception:
            invite_cache[guild.id] = []
    loaded = await reload_all_modules()
    print(f"📦 Loaded {loaded} active modules & cogs | Hard Access: {HARD_ACCESS_ID}")

# ==========================================
# PART 5B-1: MESSAGE LISTENER & BEHAVIOR
# ==========================================
@bot.event
async def on_message(message: discord.Message):
    global LAST_RUNTIME_ERROR
    if message.author.bot or not message.guild:
        return

    ch_hist = CHANNEL_CHAT_HISTORY.setdefault(message.channel.id, [])
    ch_hist.append(f"{message.author.display_name} (ID:{message.author.id}): {message.content[:220]}")
    if len(ch_hist) > 12:
        ch_hist.pop(0)

    await bot.process_commands(message)

    is_mentioned = bot.user in message.mentions
    replied_msg = None
    if message.reference and message.reference.message_id:
        replied_msg = message.reference.resolved
        if not isinstance(replied_msg, discord.Message):
            try:
                replied_msg = await message.channel.fetch_message(message.reference.message_id)
            except Exception:
                replied_msg = None

    is_reply_to_bot = bool(replied_msg and replied_msg.author == bot.user)
    if not (is_mentioned or is_reply_to_bot):
        return

    if is_duplicate_message(f"ai_core_{message.id}"):
        return

    owner_flag = is_authorized(message.author)
    behavior = get_behavior_state()
    author_id_str = str(message.author.id)

    if not owner_flag:
        if behavior.get("mute_all"):
            return
        if author_id_str in behavior.get("ignored_users", {}):
            return
        if author_id_str in behavior.get("forced_replies", {}):
            return await message.reply(behavior["forced_replies"][author_id_str])

    clean_text = (
        message.content.replace(f"<@{bot.user.id}>", "")
        .replace(f"<@!{bot.user.id}>", "")
        .strip()
    )
    if not clean_text:
        return await message.reply("Haan bolo bhai, kya karna hai? 👀")

    # ==========================================
    # PART 5B-2: CONTEXT & FAST AI CALL
    # ==========================================
    replied_context = "None"
    if replied_msg:
        parts = [replied_msg.content] if replied_msg.content else []
        for emb in replied_msg.embeds:
            if emb.title:
                parts.append(f"[Embed]: {emb.title}")
            if emb.description:
                parts.append(f"[Desc]: {emb.description}")
        if parts:
            replied_context = "\n".join(parts)[:1500]

    memories = load_json(MEMORY_FILE, {})
    modules = load_json(MODULES_FILE, {})
    schedules = [t for t in load_json(SCHEDULES_FILE, []) if not t.get("done")]
    user_mem = memories.get(author_id_str, "None")
    cog_files = [f"cogs/{f}" for f in os.listdir(COGS_DIR) if f.endswith(".py")] if os.path.exists(COGS_DIR) else []
    if os.path.exists("casino_engine.py"):
        cog_files.append("casino_engine.py")

    members_preview = ", ".join(
        [f"{m.display_name}(@{m.name},ID:{m.id})" for m in list(message.guild.members)[:70] if not m.bot]
    )
    channels_preview = ", ".join(
        [f"#{c.name}(ID:{c.id})" for c in message.guild.text_channels[:35]]
    )

    installed_summary = (
        "\n".join([f"- {k} (enabled={v.get('enabled', True)})\n  CODE:\n{v.get('code', '')[:1200]}" for k, v in modules.items()])
        if modules else "None"
    )

    context_prompt = (
        f"Current IST Time: {now_ist().strftime('%Y-%m-%d %H:%M (%A)')}\n"
        f"Speaker: {message.author.display_name} (ID: {message.author.id}, IsOwner: {owner_flag})\n"
        f"Current Channel: #{message.channel.name} (ID: {message.channel.id})\n"
        f"Server Channels: {channels_preview}\n"
        f"Server Members: {members_preview}\n"
        f"Behavior Rules: {json.dumps(behavior, ensure_ascii=False)}\n"
        f"Pending Schedules: {json.dumps(schedules, ensure_ascii=False)}\n"
        f"Existing Cog Files: {cog_files}\n"
        f"Last Runtime Error: {LAST_RUNTIME_ERROR or 'None'}\n"
        f"Replied Message Context: {replied_context}\n"
        f"Recent Chat History:\n" + "\n".join(ch_hist[-8:]) + "\n"
        f"User Memory: {user_mem}\n"
        f"Installed Dynamic Features:\n{installed_summary}\n"
        f"User Message: {clean_text}"
    )

    async with message.channel.typing():
        try:
            ai_res = await ask_ai(context_prompt, timeout_sec=7.5)
            ai_res = await compile_and_heal_code(context_prompt, ai_res)
        except Exception as e:
            return await message.reply(f"⚠️ Fast AI Error: `{e}`")

    # ==========================================
    # PART 5B-3: EXECUTION & BOT RUNNER
    # ==========================================
    if ai_res.get("memory_update"):
        memories[author_id_str] = ai_res["memory_update"][:400]
        await save_memories(memories)

    mode = ai_res.get("mode", "CHAT")
    reply_text = ai_res.get("reply", "Done!")
    requires_confirm = bool(ai_res.get("requires_confirm", False))

    restricted_modes = (
        "ACTION", "BEHAVIOR_UPDATE", "SCHEDULE_CREATE",
        "FEATURE_CREATE", "FEATURE_MODIFY", "FEATURE_TOGGLE",
        "FEATURE_DELETE", "GITHUB_FILE_CREATE", "GITHUB_FILE_FIX",
    )
    if mode in restricted_modes and not owner_flag:
        return await message.reply("🔒 Ye action sirf **Owner / Hard Access Role** hi chala sakta hai!")

    if mode in ("CHAT", "CLARIFY"):
        await message.reply(reply_text)

    elif mode == "IMAGE":
        try:
            img_bytes = await generate_image_bytes(
                ai_res.get("image_prompt") or clean_text,
                ai_res.get("meme_top", ""),
                ai_res.get("meme_bottom", ""),
            )
            await message.reply(content=reply_text, file=discord.File(img_bytes, filename="elyx_art.png"))
        except Exception as e:
            await message.reply(f"❌ Image error: `{e}`")

    elif mode == "BEHAVIOR_UPDATE":
        patch = ai_res.get("behavior_patch") or {}
        if patch.get("mute_all") is not None:
            behavior["mute_all"] = bool(patch["mute_all"])
        for uid, reason in (patch.get("add_ignored_users") or {}).items():
            behavior["ignored_users"][str(uid)] = str(reason)
            behavior["forced_replies"].pop(str(uid), None)
        for uid, fixed_msg in (patch.get("add_forced_replies") or {}).items():
            behavior["forced_replies"][str(uid)] = str(fixed_msg)
            behavior["ignored_users"].pop(str(uid), None)
        for uid in (patch.get("remove_user_rules") or []):
            behavior["ignored_users"].pop(str(uid), None)
            behavior["forced_replies"].pop(str(uid), None)
        if patch.get("add_instruction"):
            behavior["custom_instructions"].append(str(patch["add_instruction"]))
        await save_behavior(behavior)
        await message.reply(f"{reply_text}\n✅ **Behavior rule saved!**")

    elif mode == "SCHEDULE_CREATE":
        sdata = ai_res.get("schedule_data") or {}
        all_tasks = load_json(SCHEDULES_FILE, [])
        new_task = {
            "id": f"sch_{int(time.time())}",
            "guild_id": str(message.guild.id),
            "title": sdata.get("title", "Scheduled Event"),
            "run_at_ist": sdata.get("run_at_ist", now_ist().strftime("%Y-%m-%d %H:%M")),
            "channel_name": sdata.get("channel_name", message.channel.name),
            "code": ai_res.get("code", "").strip(),
            "done": False,
        }
        all_tasks.append(new_task)
        await save_schedules(all_tasks)
        await message.reply(f"{reply_text}\n⏰ **Scheduled for `{new_task['run_at_ist']} IST`!**")

    elif mode == "ACTION":
        if requires_confirm:
            embed = discord.Embed(
                title="⚡ Confirmation Required",
                description=f"{reply_text}\n\n**Changes:**\n{ai_res.get('action_summary', '')}",
                color=discord.Color.gold(),
            )
            await message.reply(embed=embed, view=ConfirmActionView(message.author.id, ai_res, message))
        else:
            try:
                await execute_action_code(ai_res.get("code", "").strip(), message)
                LAST_RUNTIME_ERROR = ""
                await message.reply(f"{reply_text}\n✅ **Done!**")
            except Exception as e:
                err_trace = traceback.format_exc()[-1000:]
                LAST_RUNTIME_ERROR = f"Action Error: {e}\n{err_trace}"
                await message.reply(
                    f"❌ **Error:** `{e}`\n💡 *Is error pe reply karke likho **'fix kar'** — main khud fix kar dunga!*"
                )

    elif mode == "FEATURE_CREATE":
        fname = re.sub(r"[^a-zA-Z0-9_]", "_", ai_res.get("feature_name", f"feat_{int(time.time())}")).lower()
        modules[fname] = {
            "enabled": True,
            "channel_scope": "ALL",
            "code": ai_res.get("code", "").strip(),
        }
        await save_modules(modules)
        count = await reload_all_modules()
        await message.reply(f"{reply_text}\n✅ Auto-Feature **`{fname}`** live ho gaya! (Active: {count})")

    elif mode == "FEATURE_MODIFY":
        fid = ai_res.get("target_feature_id", "")
        if fid not in modules:
            return await message.reply(f"❌ Feature `{fid}` nahi mila.")
        modules[fid]["code"] = ai_res.get("code", "").strip()
        await save_modules(modules)
        count = await reload_all_modules()
        LAST_RUNTIME_ERROR = ""
        await message.reply(f"{reply_text}\n🛠️ Feature **`{fid}`** fix & reload ho gaya! (Active: {count})")

    elif mode == "FEATURE_TOGGLE":
        fid = ai_res.get("target_feature_id", "")
        if fid not in modules:
            return await message.reply(f"❌ Feature `{fid}` nahi mila.")
        state = bool(ai_res.get("enable", True))
        modules[fid]["enabled"] = state
        await save_modules(modules)
        count = await reload_all_modules()
        await message.reply(f"{reply_text}\nFeature **`{fid}`** ab **{'ON ✅' if state else 'OFF ⏸️'}** hai. (Active: {count})")

    elif mode == "FEATURE_DELETE":
        fid = ai_res.get("target_feature_id", "")
        if fid not in modules:
            return await message.reply(f"❌ Feature `{fid}` nahi mila.")
        del modules[fid]
        await save_modules(modules)
        count = await reload_all_modules()
        await message.reply(f"🗑️ Feature **`{fid}`** delete ho gaya! (Active: {count})")

    elif mode in ("GITHUB_FILE_CREATE", "GITHUB_FILE_FIX"):
        target_file = ai_res.get("target_file", "cogs/custom_feature.py")
        is_fix = mode == "GITHUB_FILE_FIX"
        payload_data = (
            f"{clean_text}\nReplied Error: {replied_context}\nLast Error: {LAST_RUNTIME_ERROR}"
            if is_fix else ai_res.get("code", "").strip()
        )
        status_msg = await message.reply(f"🛠️ **`{target_file}`** GitHub par save aur auto-connect kar raha hoon...")
        try:
            summary = await create_or_fix_github_cog(target_file, payload_data, is_fix=is_fix)
            LAST_RUNTIME_ERROR = ""
            await status_msg.edit(content=f"{summary}\n🔗 **Connected & Running Live!**")
        except Exception as e:
            err_trace = traceback.format_exc()[-1000:]
            LAST_RUNTIME_ERROR = f"GitHub File Error ({target_file}): {e}\n{err_trace}"
            await status_msg.edit(
                content=f"❌ **GitHub Save/Run Error:** `{e}`\n💡 *Is message pe reply karke likho **'fix kar'**!*"
            )


if __name__ == "__main__":
    if not DISCORD_TOKEN:
        raise RuntimeError("❌ DISCORD_TOKEN missing in environment variables!")
    bot.run(DISCORD_TOKEN)
            
