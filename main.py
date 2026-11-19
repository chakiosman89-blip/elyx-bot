import os
import re
import json
import base64
import asyncio
import traceback
import aiohttp
import discord
from discord.ext import commands
from google import genai
from google.genai import types

# ==========================================
# 1. FADEHOST ENV KEYS & CONFIG
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

DEFAULT_ALLOWED_ID = "1572448688700391454"
ALLOWED_IDS = {1572448688700391454}
for item in os.getenv("OWNER_ID", DEFAULT_ALLOWED_ID).split(","):
    if item.strip().isdigit():
        ALLOWED_IDS.add(int(item.strip()))

# ==========================================
# 2. BOT SETUP & STORAGE FILES
# ==========================================
intents = discord.Intents.all()
bot = commands.Bot(command_prefix="-", intents=intents, help_command=None)

DATA_DIR = "bot_data"
MODULES_FILE = os.path.join(DATA_DIR, "dynamic_modules.json")
MEMORY_FILE = os.path.join(DATA_DIR, "user_memories.json")
os.makedirs(DATA_DIR, exist_ok=True)
invite_cache = {}


def is_authorized(member: discord.abc.User) -> bool:
    if member.id in ALLOWED_IDS:
        return True
    if isinstance(member, discord.Member):
        if any(role.id in ALLOWED_IDS for role in member.roles):
            return True
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
        api_url = f"https://github.com{GITHUB_REPO}/contents/{repo_path}"

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
                    print(f"☁️ Synced {repo_path} to GitHub")
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


def execute_dynamic_code(code_str: str):
    env = {
        "bot": bot,
        "discord": discord,
        "commands": commands,
        "os": os,
        "json": json,
        "asyncio": asyncio,
        "invite_cache": invite_cache,
        "DATA_DIR": DATA_DIR,
        "ALLOWED_IDS": ALLOWED_IDS,
        "is_authorized": is_authorized,
    }
    exec(code_str, env)

   # ==========================================
# 3. AI BRAIN (CHATGPT MEMORY + ADMIN + SELF-HEAL)
# ==========================================
MASTER_SYSTEM_PROMPT = """You are 'Elyx Trading', a smart, friendly, ChatGPT-like AI companion and autonomous Discord Bot (discord.py v2.x).
Talk naturally in Hinglish/Hindi (or English if spoken in English) like a real, witty friend—never use robotic or copy-paste replies.

Analyze the message and pick ONE mode:
1. "CHAT": Casual talk, questions, jokes, advice, or continuing past conversations using the user's Saved Memory.
2. "ACTION": Authorized owner/admin wants an IMMEDIATE Discord server task right now (create/edit/delete channels or categories, create/assign/remove roles, set channel permissions for a mentioned user, kick/ban/timeout/mute a user, clear messages, send announcements).
3. "FEATURE": Authorized owner/admin wants to permanently add a NEW reusable `-` prefix command (e.g., `-kick`, `-invites`, `-ping`) or background listener (welcome image/card, auto-mod, etc.).

OUTPUT FORMAT (Strictly JSON ONLY, no markdown outside JSON):
{
  "mode": "CHAT" or "ACTION" or "FEATURE",
  "reply": "Natural, friendly Hinglish response",
  "memory_update": "Updated short bullet notes of important facts/plans about this user (keep old relevant facts + add new ones, max 400 chars)",
  "code": "Raw Python code (empty string if mode is CHAT)"
}

PYTHON CODE RULES:
- Never put ```python backticks inside the JSON `"code"` field.
- Available globals: `bot`, `discord`, `commands`, `os`, `json`, `asyncio`, `invite_cache`, `DATA_DIR`, `ALLOWED_IDS`, `is_authorized`.
- If `mode == "ACTION"`:
  - `message` and `guild` (`message.guild`) are ALSO in scope!
  - Define `async def run_action():` and put all async Discord calls inside it. Do NOT call `asyncio.run()`. The host will `await run_action()`.
  - Use `message.mentions` (excluding `bot.user`) to get target members accurately.
- If `mode == "FEATURE"`:
  - Do NOT call `bot.run()`.
  - Use `@bot.command(name="...")` (NO slash commands, ONLY `-` prefix commands!).
  - If the command is a moderation/admin command (kick, ban, mute, timeout, clear, etc.), check `if not is_authorized(ctx.author): return await ctx.reply("❌ Permission nahi hai!")`.
  - For events, use `@bot.listen("on_member_join")`, `@bot.listen("on_message")`, etc. (never `@bot.event`).
  - Save persistent data as JSON inside `DATA_DIR`.
"""


async def call_gemini_keys(prompt: str) -> str:
    last_err = None
    for key in GEMINI_KEYS:
        client = genai.Client(api_key=key)
        for model_name in ("gemini-3-flash-preview", "gemini-2.5-flash"):
            try:
                resp = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=MASTER_SYSTEM_PROMPT,
                            temperature=0.35,
                            response_mime_type="application/json",
                        ),
                    ),
                    timeout=30.0,
                )
                if resp.text:
                    return resp.text
            except Exception as e:
                last_err = e
    raise RuntimeError(f"Gemini keys failed: {last_err}")

async def call_groq_backup(prompt: str) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError("No GROQ_API_KEY set.")

    groq_endpoint = "https://api.groq.com/openai/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {
                "role": "system",
                "content": MASTER_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "temperature": 0.35,
        "response_format": {
            "type": "json_object",
        },
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            groq_endpoint,
            headers=headers,
            json=payload,
            timeout=30,
        ) as resp:

            if resp.status != 200:
                error_text = (await resp.text())[:500]
                raise RuntimeError(
                    f"Groq error {resp.status}: {error_text}"
                )

            data = await resp.json()

            return data["choices"][0]["message"]["content"]


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
        raise RuntimeError(
            f"AI ne valid JSON return nahi kiya: {e}\n"
            f"Response: {cleaned[:1000]}"
        )

async def generate_with_self_heal(base_prompt: str, is_action: bool, action_env: dict = None) -> dict:
    """Tests generated code and auto-fixes syntax/runtime bugs before finishing."""
    ai_res = await ask_ai(base_prompt)
    code = ai_res.get("code", "").strip()
    if not code or ai_res.get("mode", "CHAT").upper() == "CHAT":
        return ai_res

    for attempt in range(2):
        try:
            compile(code, "<ai_feature>", "exec")
            if is_action and action_env is not None:
                exec(code, action_env)
                if "run_action" in action_env:
                    await action_env["run_action"]()
            else:
                execute_dynamic_code(code)
            return ai_res
        except Exception as err:
            if attempt == 1:
                raise err
            fix_prompt = f"{base_prompt}\n\nPREVIOUS CODE FAILED WITH ERROR:\n{err}\n\nFix the bug and return valid JSON."
            ai_res = await ask_ai(fix_prompt)
            code = ai_res.get("code", "").strip()
    return ai_res
# ==========================================
# 4. BOT EVENTS & MENTION LISTENER
# ==========================================
@bot.event
async def on_ready():
    print(f"✅ ONLINE: {bot.user} (ID: {bot.user.id})")
    print(f"🔑 Gemini Keys: {len(GEMINI_KEYS)} | Groq Backup: {'Yes' if GROQ_API_KEY else 'No'}")

    for guild in bot.guilds:
        try:
            invite_cache[guild.id] = await guild.invites()
        except Exception:
            pass

    modules = load_json(MODULES_FILE)
    loaded = 0
    for mod_id, info in modules.items():
        try:
            execute_dynamic_code(info["code"])
            loaded += 1
        except Exception as e:
            print(f"❌ Error loading {mod_id}: {e}")
    print(f"📦 Loaded {loaded}/{len(modules)} saved custom modules.")


@bot.event
async def on_message(message: discord.Message):
    if message.author.bot or not message.guild:
        return

    direct_tags = (f"<@{bot.user.id}>", f"<@!{bot.user.id}>")
    if any(tag in message.content for tag in direct_tags) and not message.mention_everyone:
        clean_request = re.sub(rf"<@!?{bot.user.id}>", "", message.content).strip()
        if not clean_request:
            await message.reply("👋 Hanji bhai! Batao kya haal hai ya Discord mein kya kaam karna hai?")
            return

        async with message.channel.typing():
            try:
                modules = load_json(MODULES_FILE)
                memories = load_json(MEMORY_FILE)
                uid = str(message.author.id)
                user_mem = memories.get(uid, "No past memory yet.")

                mentions_info = [
                    f"{m.display_name} (ID: {m.id})" for m in message.mentions if m.id != bot.user.id
                ]
                roles_info = [f"{r.name} (ID: {r.id})" for r in message.guild.roles if not r.is_default()][:25]
                channels_info = [f"#{c.name} (ID: {c.id})" for c in message.guild.channels][:25]

                prompt = f"""Server: {message.guild.name}
Current Channel: #{message.channel.name} (ID: {message.channel.id})
User: {message.author.display_name} (ID: {uid}, Authorized Hard-Access: {is_authorized(message.author)})
User's Saved Memory: {user_mem}
Mentioned Users: {mentions_info or 'None'}
Existing Roles: {roles_info}
Existing Channels: {channels_info}
Installed Features: {list(modules.keys()) or 'None'}

User Message:
{clean_request}"""

                ai_out = await ask_ai(prompt)
                mode = ai_out.get("mode", "CHAT").upper()
                reply_text = ai_out.get("reply", "Ho gaya bhai!")
                new_mem = ai_out.get("memory_update", "").strip()
                code = ai_out.get("code", "").strip()

                if new_mem and new_mem != user_mem:
                    memories[uid] = new_mem[:500]
                    asyncio.create_task(save_memories(memories))

                if mode == "CHAT" or not code:
                    await message.reply(reply_text)
                else:
                    if not is_authorized(message.author):
                        await message.reply("❌ Bhai ye hard-access kaam hai—isey sirf authorized role wale hi kar sakte hain!")
                        return

                    if mode == "ACTION":
                        action_env = {
                            "bot": bot,
                            "discord": discord,
                            "commands": commands,
                            "os": os,
                            "json": json,
                            "asyncio": asyncio,
                            "message": message,
                            "guild": message.guild,
                            "DATA_DIR": DATA_DIR,
                        }
                        final_out = await generate_with_self_heal(prompt, is_action=True, action_env=action_env)
                        await message.reply(f"✅ {final_out.get('reply', reply_text)}")
                    else:
                        final_out = await generate_with_self_heal(prompt, is_action=False)
                        final_code = final_out.get("code", code).strip()
                        idx = 1
                        while f"feature_{idx}" in modules:
                            idx += 1
                        feature_id = f"feature_{idx}"
                        modules[feature_id] = {"request": clean_request, "code": final_code}
                        await save_modules(modules)
                        await message.reply(
                            f"🚀 **Feature Ready (`{feature_id}`)!**\n{final_out.get('reply', reply_text)}\n*(GitHub par permanently save ho gaya hai!)*"
                        )

            except Exception as e:
                print(traceback.format_exc())
                await message.reply(f"❌ **Chhoti si dikkat aa gayi:** `{e}`\n*(Check kar lena ki bot ke paas Administrator role hai)*")

    await bot.process_commands(message)


if __name__ == "__main__":
    if not DISCORD_TOKEN:
        print("❌ ERROR: DISCORD_TOKEN missing hai!")
    else:
        bot.run(DISCORD_TOKEN)
                
