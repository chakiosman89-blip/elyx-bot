import os
import re
import io
import json
import time
import base64
import asyncio
import traceback
import aiohttp
import discord
from discord.ext import commands
from google import genai
from google.genai import types

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# ==========================================
# BLOCK 1: FADEHOST ENV KEYS & HARD ACCESS
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

# ==========================================
# BLOCK 2: BOT SETUP, STORAGE & GITHUB SYNC
# ==========================================
intents = discord.Intents.all()
bot = commands.Bot(command_prefix="-", intents=intents, help_command=None)

DATA_DIR = "bot_data"
MODULES_FILE = os.path.join(DATA_DIR, "dynamic_modules.json")
MEMORY_FILE = os.path.join(DATA_DIR, "user_memories.json")
os.makedirs(DATA_DIR, exist_ok=True)

invite_cache = {}
REGISTERED_COMMANDS = set()
REGISTERED_LISTENERS = []
MODULE_LOCK = asyncio.Lock()
_RECENT_MSG_CACHE = {}


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


def load_json(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


async def sync_file_to_github(repo_path: str, data_dict: dict, commit_msg: str):
    if not GITHUB_TOKEN or not GITHUB_REPO:
        return
    gh_host = "api" + ".github.com"
    api_url = f"https://{gh_host}/repos/{GITHUB_REPO}/contents/{repo_path}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
    }
    try:
        async with aiohttp.ClientSession() as session:
            sha = None
            async with session.get(f"{api_url}?ref={GITHUB_BRANCH}", headers=headers) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    sha = res_json.get("sha")

            encoded = base64.b64encode(
                json.dumps(data_dict, indent=2, ensure_ascii=False).encode("utf-8")
            ).decode("utf-8")

            payload = {"message": commit_msg, "content": encoded, "branch": GITHUB_BRANCH}
            if sha:
                payload["sha"] = sha

            async with session.put(api_url, headers=headers, json=payload) as put_resp:
                if put_resp.status in (200, 201):
                    print(f"✅ Synced {repo_path} to GitHub")
    except Exception as e:
        print(f"⚠️ GitHub sync skipped: {e}")


async def save_modules(modules: dict):
    with open(MODULES_FILE, "w", encoding="utf-8") as f:
        json.dump(modules, f, indent=2, ensure_ascii=False)
    await sync_file_to_github("bot_data/dynamic_modules.json", modules, "Auto-save AI feature")


async def save_memories(memories: dict):
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memories, f, indent=2, ensure_ascii=False)
    await sync_file_to_github("bot_data/user_memories.json", memories, "Auto-save user memory")


# ==========================================
# BLOCK 3: BUILT-IN IMAGE & MEME ENGINE
# ==========================================
async def generate_image_bytes(prompt_text: str, top_text: str = "", bottom_text: str = "") -> io.BytesIO:
    clean_prompt = re.sub(r"[^a-zA-Z0-9 ,.-]", "", prompt_text).strip() or "funny gaming meme"
    encoded_prompt = aiohttp.helpers.quote(clean_prompt)
    img_host = "image" + ".pollinations.ai"
    url = f"https://{img_host}/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true&seed={int(time.time()) % 99999}"

    raw_bytes = None
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=25) as resp:
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

# ==========================================
# BLOCK 4: ZERO-DUPLICATE DYNAMIC LOADER
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


def execute_dynamic_code(code_str: str):
    env = {
        "bot": SafeBotProxy(bot),
        "discord": discord,
        "commands": commands,
        "os": os,
        "re": re,
        "io": io,
        "json": json,
        "time": time,
        "asyncio": asyncio,
        "aiohttp": aiohttp,
        "invite_cache": invite_cache,
        "DATA_DIR": DATA_DIR,
        "ALLOWED_IDS": ALLOWED_IDS,
        "is_authorized": is_authorized,
        "is_duplicate_message": is_duplicate_message,
        "generate_image_bytes": generate_image_bytes,
    }
    if PIL_AVAILABLE:
        env["Image"] = Image
        env["ImageDraw"] = ImageDraw
        env["ImageFont"] = ImageFont
        env["ImageOps"] = ImageOps
    exec(code_str, env)


async def reload_all_modules() -> int:
    async with MODULE_LOCK:
        unload_all_dynamic_modules()
        modules = load_json(MODULES_FILE)
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
        return loaded

        
# ==========================================
# BLOCK 5: THINK-FIRST AI BRAIN & SELF-HEAL
# ==========================================
MASTER_SYSTEM_PROMPT = """You are 'Elyx Trading', an ultra-smart, autonomous Discord AI Developer & friendly companion (discord.py v2.x).
Talk naturally in Hinglish/Hindi (or English if user speaks English) like a sharp, helpful friend.

STEP 1 — STRICT INTENT ROUTING (ACTION vs FEATURE vs SELF-HEAL):
- One-time tasks ("channel bana de", "role bana de", "meme channel mein meme daal", "announcement bhej", "kick/ban/mute kar", "messages delete kar") are ALWAYS `ACTION`, NEVER `FEATURE_CREATE`! Do NOT create a permanent feature unless user explicitly asks for a recurring command/system/automation (e.g., "command bana de", "invite count leaderboard bana de", "auto welcome laga de", "feature bana de").
- SELF-HEALING ON REPLY: Look carefully at `Replied Message Context`! If the user replies to an error message (or previous bot output) saying "fix kar", "theek kar", "solve kar", "ye error fix kar":
  - Read the exact error/traceback from `Replied Message Context` AND check `Existing Installed Features (with Code)`.
  - If the error belongs to an installed feature, return `mode`: `"FEATURE_MODIFY"` with `target_feature_id` set to that exact feature's ID and `"code"` containing the complete fixed Python code.
  - If the error came from a one-time `ACTION` (like `run_action` or `generate_image_bytes`), return `mode`: `"ACTION"` with `"code"` containing the fixed `async def run_action():` so the user can confirm and run it immediately.
- Check `Existing Installed Features` if user says "band kar", "stop", "disable", "hata de", "remove", "delete", "change kar", "modify kar".
- If channel/target is missing or unclear, use `CLARIFY`.

STEP 2 — PICK EXACTLY ONE MODE:
1. "CHAT": Casual talk, questions, advice, or listing features.
2. "IMAGE": Generate an image/meme in the CURRENT channel (`image_prompt`, optional `meme_top`, `meme_bottom`). (If user asks to send an image/meme to ANOTHER specific channel like #memes, use `ACTION` instead!).
3. "ACTION": Any one-time Discord task (create/delete channels or categories, create/assign roles, send message/embed/meme to another channel, moderation). Requires Confirm button.
4. "FEATURE_CREATE": Add a NEW permanent `-` prefix command or event listener (`on_member_join`, `on_message`, etc.).
5. "FEATURE_MODIFY": Fix or edit an existing feature in `Existing Installed Features` (`target_feature_id`).
6. "FEATURE_TOGGLE": Pause/stop (`enable`: false) or re-enable (`enable`: true) an existing feature.
7. "FEATURE_DELETE": Permanently delete an existing feature (`target_feature_id`).
8. "CLARIFY": Ask user for missing details without executing anything.

OUTPUT FORMAT (Strictly valid JSON ONLY, no markdown outside JSON):
{
  "thought": "1-2 lines analyzing user's true intent & any replied error",
  "mode": "CHAT | IMAGE | ACTION | FEATURE_CREATE | FEATURE_MODIFY | FEATURE_TOGGLE | FEATURE_DELETE | CLARIFY",
  "reply": "Natural, friendly Hinglish response",
  "action_summary": "Clear bullet preview of exact changes (required for ACTION, FEATURE_MODIFY, FEATURE_DELETE)",
  "target_feature_id": "Exact feature ID from Existing Installed Features (else empty)",
  "feature_name": "Short snake_case name (ONLY for FEATURE_CREATE, else empty)",
  "channel_scope": "Target channel ID as string or 'ALL'",
  "enable": true,
  "image_prompt": "Detailed English visual description if mode is IMAGE, else empty",
  "meme_top": "Short funny top caption if meme, else empty",
  "meme_bottom": "Short funny bottom caption if meme, else empty",
  "memory_update": "Updated concise notes about user (max 400 chars)",
  "code": "Raw Python code (ONLY for ACTION, FEATURE_CREATE, FEATURE_MODIFY; empty string otherwise)"
}

STRICT PYTHON CODE RULES:
- Never put ```python backticks inside `"code"`.
- Available globals in BOTH `ACTION` and `FEATURE`: `bot`, `discord`, `commands`, `os`, `re`, `io`, `json`, `time`, `asyncio`, `aiohttp`, `invite_cache`, `DATA_DIR`, `ALLOWED_IDS`, `is_authorized`, `is_duplicate_message`, `generate_image_bytes`, `Image`, `ImageDraw`, `ImageFont`, `ImageOps`.
- In `ACTION` mode: `message` and `guild` are also in scope. You MUST define `async def run_action():` and put all logic inside it (never call `asyncio.run()`).
  - Example sending meme to a channel in `ACTION`:
    async def run_action():
        ch = discord.utils.get(guild.text_channels, name="memes") or message.channel
        img_io = await generate_image_bytes("funny crypto trader meme", "ME BUYING THE DIP", "IT KEPT DIPPING")
        await ch.send(file=discord.File(img_io, filename="meme.png"))
- NEVER use `@bot.event` in features! Always use `@bot.listen("on_message")`, `@bot.listen("on_member_join")`, etc.
- Inside ANY `@bot.listen("on_message")`:
  1. Start with: `if message.author.bot or not message.guild: return` and `if is_duplicate_message(f"{feature_tag}_{message.id}"): return`
  2. Ignore bot mentions: `if bot.user in message.mentions: return`
  3. Enforce exact channel scope (`if message.channel.id != TARGET_CHANNEL_ID: return`) if specified.
- Do NOT call `bot.run()` anywhere in generated code.
"""


async def call_gemini_keys(prompt: str) -> str:
    last_err = None
    for key in GEMINI_KEYS:
        client = genai.Client(api_key=key)
        for model_name in ("gemini-3.8-flash", "gemini-3.5-flash-lite"):
            try:
                resp = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=MASTER_SYSTEM_PROMPT,
                            temperature=0.2,
                            response_mime_type="application/json",
                        ),
                    ),
                    timeout=35.0,
                )
                if resp.text:
                    return resp.text
            except Exception as e:
                last_err = e
    raise RuntimeError(f"Gemini keys failed: {last_err}")


async def call_groq_backup(prompt: str) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError("No GROQ_API_KEY set.")

    groq_host = "api" + ".groq.com"
    groq_endpoint = f"https://{groq_host}/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "openai/gpt-oss-120b",
        "messages": [
            {"role": "system", "content": MASTER_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(groq_endpoint, headers=headers, json=payload, timeout=35) as resp:
            if resp.status != 200:
                error_text = (await resp.text())[:500]
                raise RuntimeError(f"Groq error {resp.status}: {error_text}")
            data = await resp.json()
            first_choice = next(iter(data.get("choices", [])), {})
            return first_choice.get("message", {}).get("content", "")


async def ask_ai(prompt: str) -> dict:
    raw = None
    if GEMINI_KEYS:
        try:
            raw = await call_gemini_keys(prompt)
        except Exception as e:
            print(f"⚠️ Gemini fallback to Groq: {e}")

    if not raw and GROQ_API_KEY:
        try:
            raw = await call_groq_backup(prompt)
        except Exception as e:
            print(f"⚠️ Groq AI failed: {e}")

    if not raw:
        raise RuntimeError("Koi bhi API key response nahi de rahi.")

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
    except json.JSONDecodeError as e:
        raise RuntimeError(f"AI ne valid JSON return nahi kiya: {e}\nResponse: {cleaned[:800]}")


async def compile_and_heal_code(base_prompt: str, initial_ai_out: dict) -> dict:
    ai_res = initial_ai_out
    code = ai_res.get("code", "").strip()
    if not code:
        return ai_res

    for attempt in range(2):
        try:
            compile(code, "<ai_feature>", "exec")
            return ai_res
        except Exception as err:
            if attempt == 1:
                raise err
            fix_prompt = (
                f"{base_prompt}\n\nPREVIOUS CODE HAD SYNTAX ERROR:\n{err}\n\n"
                "Fix the syntax error and return valid JSON with the exact same mode."
            )
            ai_res = await ask_ai(fix_prompt)
            code = ai_res.get("code", "").strip()
            if not code:
                return ai_res
    return ai_res
                    

# ==========================================
# BLOCK 6: CONFIRM UI, SELF-HEAL & RUNNER
# ==========================================
LAST_RUNTIME_ERROR = ""


class ConfirmActionView(discord.ui.View):
    def __init__(self, author_id: int, ai_res: dict, orig_message: discord.Message):
        super().__init__(timeout=300)
        self.author_id = author_id
        self.ai_res = ai_res
        self.orig_message = orig_message
        self.done = False

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.author_id and not is_authorized(interaction.user):
            await interaction.response.send_message(
                "❌ Ye button sirf command dene wala ya Hard Access role hi daba sakta hai!",
                ephemeral=True,
            )
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
        await interaction.response.edit_message(content="⏳ Executing action...", view=self)

        mode = self.ai_res.get("mode")
        code = self.ai_res.get("code", "").strip()
        modules = load_json(MODULES_FILE)

        try:
            if mode == "ACTION":
                env = {
                    "bot": bot,
                    "discord": discord,
                    "commands": commands,
                    "os": os,
                    "re": re,
                    "io": io,
                    "json": json,
                    "time": time,
                    "asyncio": asyncio,
                    "aiohttp": aiohttp,
                    "message": self.orig_message,
                    "guild": self.orig_message.guild,
                    "invite_cache": invite_cache,
                    "DATA_DIR": DATA_DIR,
                    "ALLOWED_IDS": ALLOWED_IDS,
                    "is_authorized": is_authorized,
                    "is_duplicate_message": is_duplicate_message,
                    "generate_image_bytes": generate_image_bytes,
                }
                if PIL_AVAILABLE:
                    env["Image"] = Image
                    env["ImageDraw"] = ImageDraw
                    env["ImageFont"] = ImageFont
                    env["ImageOps"] = ImageOps

                exec(code, env)
                if "run_action" in env:
                    await env["run_action"]()
                await interaction.followup.send("✅ **Server Action successfully execute ho gaya!**")

            elif mode == "FEATURE_MODIFY":
                fid = self.ai_res.get("target_feature_id", "")
                if fid not in modules:
                    await interaction.followup.send(f"❌ Feature `{fid}` nahi mila.")
                    return
                modules[fid]["code"] = code
                modules[fid]["channel_scope"] = self.ai_res.get(
                    "channel_scope", modules[fid].get("channel_scope", "ALL")
                )
                await save_modules(modules)
                count = await reload_all_modules()
                await interaction.followup.send(
                    f"✅ Feature **`{fid}`** update aur reload ho gaya! (Active modules: {count})"
                )

            elif mode == "FEATURE_DELETE":
                fid = self.ai_res.get("target_feature_id", "")
                if fid in modules:
                    del modules[fid]
                    await save_modules(modules)
                    count = await reload_all_modules()
                    await interaction.followup.send(
                        f"🗑️ Feature **`{fid}`** permanently delete ho gaya! (Active modules: {count})"
                    )
                else:
                    await interaction.followup.send(f"❌ Feature `{fid}` pehle se nahi hai.")

        except Exception as e:
            err_trace = traceback.format_exc()[-1200:]
            LAST_RUNTIME_ERROR = f"Mode: {mode}\nError: {e}\nTraceback:\n{err_trace}"
            await interaction.followup.send(
                f"❌ **Execution Error:**\n```py\n{e}\n{err_trace}\n```\n"
                "💡 *Is message par Reply karke likho **'isko fix kar'** — main khud theek kar dunga!*"
            )

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.danger, emoji="✖️")
    async def cancel_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.done:
            return
        self.done = True
        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(content="❌ Action cancel kar diya gaya.", view=self)
                
@bot.command(name="features")
async def list_features_cmd(ctx: commands.Context):
    if not is_authorized(ctx.author):
        return await ctx.reply("🔒 Permission nahi hai!")
    modules = load_json(MODULES_FILE)
    if not modules:
        return await ctx.reply("📦 Abhi koi dynamic feature install nahi hai.")
    lines = [
        f"• **`{k}`** — {'🟢 ON' if v.get('enabled', True) else '🔴 OFF'} (Scope: `{v.get('channel_scope', 'ALL')}`)"
        for k, v in modules.items()
    ]
    await ctx.reply("📦 **Installed Features:**\n" + "\n".join(lines))


@bot.command(name="reload")
async def reload_features_cmd(ctx: commands.Context):
    if not is_authorized(ctx.author):
        return await ctx.reply("🔒 Permission nahi hai!")
    count = await reload_all_modules()
    await ctx.reply(f"🔄 Saare dynamic modules reload ho gaye! (Active: **{count}**)")


@bot.event
async def on_command_error(ctx: commands.Context, error):
    global LAST_RUNTIME_ERROR
    if isinstance(error, commands.CommandNotFound):
        return
    orig = getattr(error, "original", error)
    err_trace = "".join(traceback.format_exception(type(orig), orig, orig.__traceback__))[-1200:]
    LAST_RUNTIME_ERROR = f"Command: {ctx.message.content}\nError: {orig}\nTraceback:\n{err_trace}"
    await ctx.reply(
        f"❌ **Command Error:**\n```py\n{orig}\n{err_trace}\n```\n"
        "💡 *Is message par Reply karke likho **'fix kar'** — main is command ko khud fix kar dunga!*"
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


@bot.event
async def on_ready():
    print(f"🚀 Logged in as {bot.user} (ID: {bot.user.id})")
    for guild in bot.guilds:
        try:
            invite_cache[guild.id] = await guild.invites()
        except Exception:
            invite_cache[guild.id] = []
    loaded = await reload_all_modules()
    print(f"📦 Loaded {loaded} dynamic modules | Hard Access ID: {HARD_ACCESS_ID}")


@bot.event
async def on_message(message: discord.Message):
    global LAST_RUNTIME_ERROR
    if message.author.bot or not message.guild:
        return

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

    clean_text = (
        message.content.replace(f"<@{bot.user.id}>", "")
        .replace(f"<@!{bot.user.id}>", "")
        .strip()
    )
    if not clean_text:
        return await message.reply("Bolo bhai, kya kaam hai? 👀")

    replied_context = "None"
    if replied_msg:
        parts = []
        if replied_msg.content:
            parts.append(replied_msg.content)
        for emb in replied_msg.embeds:
            if emb.title:
                parts.append(f"[Embed Title]: {emb.title}")
            if emb.description:
                parts.append(f"[Embed Desc]: {emb.description}")
        if parts:
            replied_context = "\n".join(parts)[:2000]
    elif LAST_RUNTIME_ERROR and any(
        w in clean_text.lower() for w in ("fix", "error", "theek", "solve")
    ):
        replied_context = LAST_RUNTIME_ERROR[:2000]

    memories = load_json(MEMORY_FILE)
    modules = load_json(MODULES_FILE)
    user_key = str(message.author.id)
    user_mem = memories.get(user_key, "No previous memory.")

    is_fix_request = any(
        w in clean_text.lower() for w in ("fix", "error", "theek", "solve", "modify", "change")
    )
    if modules:
        feat_lines = []
        for k, v in modules.items():
            line = f"- {k} (enabled={v.get('enabled', True)}, scope={v.get('channel_scope', 'ALL')})"
            if is_fix_request:
                line += f"\n  CODE:\n{v.get('code', '')[:2500]}"
            feat_lines.append(line)
        installed_summary = "\n".join(feat_lines)
    else:
        installed_summary = "None"

    context_prompt = (
        f"User: {message.author} (ID: {message.author.id}, Authorized: {is_authorized(message.author)})\n"
        f"Current Channel: #{message.channel.name} (ID: {message.channel.id})\n"
        f"Replied Message Context:\n{replied_context}\n\n"
        f"Saved Memory:\n{user_mem}\n\n"
        f"Existing Installed Features:\n{installed_summary}\n\n"
        f"User Message: {clean_text}"
    )

    async with message.channel.typing():
        try:
            ai_res = await ask_ai(context_prompt)
            ai_res = await compile_and_heal_code(context_prompt, ai_res)
        except Exception as e:
            return await message.reply(f"⚠️ AI Error: `{e}`")

    if ai_res.get("memory_update"):
        memories[user_key] = ai_res["memory_update"][:400]
        await save_memories(memories)

    mode = ai_res.get("mode", "CHAT")
    reply_text = ai_res.get("reply", "Done!")

    if mode in ("ACTION", "FEATURE_CREATE", "FEATURE_MODIFY", "FEATURE_TOGGLE", "FEATURE_DELETE"):
        if not is_authorized(message.author):
            return await message.reply("🔒 Ye action sirf **Hard Access Role / Owner** hi kar sakta hai!")

    if mode in ("CHAT", "CLARIFY"):
        await message.reply(reply_text)

    elif mode == "IMAGE":
        img_prompt = ai_res.get("image_prompt") or clean_text
        top_t = ai_res.get("meme_top", "")
        bot_t = ai_res.get("meme_bottom", "")
        try:
            img_bytes = await generate_image_bytes(img_prompt, top_t, bot_t)
            await message.reply(
                content=reply_text, file=discord.File(img_bytes, filename="elyx_art.png")
            )
        except Exception as e:
            await message.reply(f"❌ Image generate nahi ho payi: `{e}`")

    elif mode == "FEATURE_CREATE":
        fname = re.sub(
            r"[^a-zA-Z0-9_]", "_", ai_res.get("feature_name", f"feat_{int(time.time())}")
        ).lower()
        modules[fname] = {
            "enabled": True,
            "channel_scope": str(ai_res.get("channel_scope", "ALL")),
            "code": ai_res.get("code", "").strip(),
        }
        await save_modules(modules)
        count = await reload_all_modules()
        await message.reply(
            f"{reply_text}\n\n✅ Feature **`{fname}`** install & reload ho gaya! (Total active: {count})"
        )

    elif mode == "FEATURE_TOGGLE":
        fid = ai_res.get("target_feature_id", "")
        if fid not in modules:
            return await ctx.reply(f"❌ Feature `{fid}` nahi mila.")
        state = bool(ai_res.get("enable", True))
        modules[fid]["enabled"] = state
        await save_modules(modules)
        count = await reload_all_modules()
        status_txt = "ON (Enabled) ✅" if state else "OFF (Disabled) ⏸️"
        await message.reply(
            f"{reply_text}\n\nFeature **`{fid}`** ab **{status_txt}** hai. (Active: {count})"
        )

    elif mode == "FEATURE_MODIFY" and is_fix_request:
        fid = ai_res.get("target_feature_id", "")
        if fid not in modules:
            return await message.reply(f"❌ Feature `{fid}` nahi mila.")
        modules[fid]["code"] = ai_res.get("code", "").strip()
        await save_modules(modules)
        count = await reload_all_modules()
        LAST_RUNTIME_ERROR = ""
        await message.reply(
            f"{reply_text}\n\n🛠️ **Self-Heal Applied!** Feature **`{fid}`** khud fix aur reload ho gaya! (Active: {count})"
        )

    elif mode in ("ACTION", "FEATURE_MODIFY", "FEATURE_DELETE"):
        summary = ai_res.get("action_summary", "Server/Feature update")
        embed = discord.Embed(
            title="⚡ Confirmation Required (5 Min)",
            description=f"{reply_text}\n\n**Planned Changes:**\n{summary}",
            color=discord.Color.gold(),
        )
        view = ConfirmActionView(message.author.id, ai_res, message)
        await message.reply(embed=embed, view=view)

# ==========================================
# BLOCK 7: 2-SEC SPEED PATCH + CORE SELF-EDIT
# ==========================================
async def _fast_gemini_keys(prompt: str) -> str:
    last_err = None
    for key in GEMINI_KEYS:
        client = genai.Client(api_key=key)
        for model_name in ("gemini-2.5-flash", "gemini-2.0-flash"):
            try:
                resp = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=MASTER_SYSTEM_PROMPT,
                            temperature=0.2,
                            response_mime_type="application/json",
                        ),
                    ),
                    timeout=8.0,
                )
                if resp.text:
                    return resp.text
            except Exception as e:
                last_err = e
    raise RuntimeError(f"Gemini keys failed: {last_err}")


async def _fast_groq_backup(prompt: str) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError("No GROQ_API_KEY set.")
    groq_host = "api" + ".groq.com"
    groq_endpoint = f"https://{groq_host}/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": MASTER_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(groq_endpoint, headers=headers, json=payload, timeout=8) as resp:
            if resp.status != 200:
                raise RuntimeError(f"Groq error {resp.status}: {(await resp.text())[:300]}")
            data = await resp.json()
            return next(iter(data.get("choices", [])), {}).get("message", {}).get("content", "")


async def _super_fast_ask_ai(prompt: str) -> dict:
    raw = None
    if GROQ_API_KEY:
        try:
            raw = await _fast_groq_backup(prompt)
        except Exception as e:
            print(f"⚠️ Groq fallback to Gemini: {e}")
    if not raw and GEMINI_KEYS:
        try:
            raw = await _fast_gemini_keys(prompt)
        except Exception as e:
            print(f"⚠️ Gemini failed: {e}")
    if not raw:
        raise RuntimeError("Koi bhi API key response nahi de rahi.")

    cleaned = raw.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())


# Override slow AI functions with 2-sec fast versions
call_gemini_keys = _fast_gemini_keys
call_groq_backup = _fast_groq_backup
ask_ai = _super_fast_ask_ai


async def patch_core_file_on_github(file_path: str, instruction: str) -> str:
    if not GITHUB_TOKEN or not GITHUB_REPO:
        raise RuntimeError("GITHUB_TOKEN missing in environment!")
    gh_host = "api" + ".github.com"
    api_url = f"https://{gh_host}/repos/{GITHUB_REPO}/contents/{file_path}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
    }
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{api_url}?ref={GITHUB_BRANCH}", headers=headers) as resp:
            if resp.status != 200:
                raise RuntimeError(f"GitHub read error ({resp.status})")
            data = await resp.json()
            sha = data["sha"]
            current_code = base64.b64decode(data["content"]).decode("utf-8")

        patch_prompt = (
            f"You are editing `{file_path}` for a discord.py bot. Apply ONLY this exact change without breaking anything else:\n"
            f"INSTRUCTION: {instruction}\n\n"
            f"CURRENT FILE CONTENT:\n{current_code}\n\n"
            "Return valid JSON ONLY with keys: {\"reply\": \"short Hinglish explanation of fix\", \"code\": \"COMPLETE UPDATED PYTHON FILE CONTENT\"}"
        )
        res = await ask_ai(patch_prompt)
        new_code = res.get("code", "").strip()
        if not new_code or len(new_code) < 100:
            raise RuntimeError("AI ne valid full file code generate nahi kiya.")

        compile(new_code, file_path, "exec")  # Syntax check before pushing

        encoded = base64.b64encode(new_code.encode("utf-8")).decode("utf-8")
        payload = {
            "message": f"AI Core Self-Patch: {file_path}",
            "content": encoded,
            "branch": GITHUB_BRANCH,
            "sha": sha,
        }
        async with session.put(api_url, headers=headers, json=payload) as put_resp:
            if put_resp.status not in (200, 201):
                raise RuntimeError(f"GitHub commit failed ({put_resp.status})")
        return res.get("reply", f"✅ {file_path} successfully patched & pushed!")


@bot.command(name="corefix")
async def corefix_cmd(ctx: commands.Context, file_name: str, *, instruction: str):
    """Usage: -corefix main.py <kya fix karna hai> OR -corefix casino_engine.py <kya fix karna hai>"""
    if not is_authorized(ctx.author):
        return await ctx.reply("🔒 Ye command sirf Owner / Hard Access Role ke liye hai!")
    if file_name not in ("main.py", "casino_engine.py"):
        return await ctx.reply("❌ Sirf `main.py` ya `casino_engine.py` hi edit kar sakte ho!")

    msg = await ctx.reply(f"🛠️ **`{file_name}`** ko GitHub par read aur patch kar raha hoon...")
    try:
        summary = await patch_core_file_on_github(file_name, instruction)
        await msg.edit(
            content=f"✅ **`{file_name}` Patch Done & Pushed to GitHub!**\n{summary}\n🔄 *Hosting runtime ab auto-restart hoga...*"
        )
    except Exception as e:
        await msg.edit(content=f"❌ **Core Patch Error:** `{e}`")
        

if __name__ == "__main__":
    if not DISCORD_TOKEN:
        raise RuntimeError("❌ DISCORD_TOKEN missing in environment variables!")
    bot.run(DISCORD_TOKEN)
                  
    
    
