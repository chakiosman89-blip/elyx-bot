import os
import re
import json
import traceback
import asyncio
import discord
from discord.ext import commands
from discord import app_commands
from google import genai
from google.genai import types

# ==========================================
# CONFIGURATION & KEYS
# ==========================================
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

# Default Role/User ID hardcoded + Fadehost ENV support
DEFAULT_ALLOWED_ID = "1572448688700391454"
RAW_OWNER_IDS = os.getenv("OWNER_ID", DEFAULT_ALLOWED_ID)

ALLOWED_IDS = set()
for item in RAW_OWNER_IDS.split(","):
    clean_id = item.strip()
    if clean_id.isdigit():
        ALLOWED_IDS.add(int(clean_id))
ALLOWED_IDS.add(1572448688700391454)

# Initialize Gemini Client
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# ==========================================
# DISCORD BOT SETUP
# ==========================================
intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

DATA_DIR = "bot_data"
MODULES_FILE = os.path.join(DATA_DIR, "dynamic_modules.json")
os.makedirs(DATA_DIR, exist_ok=True)

# Cache for invite tracking
invite_cache = {}

# ==========================================
# PERMISSION CHECK (ROLE ID + USER ID)
# ==========================================
def is_authorized(member: discord.Member | discord.User) -> bool:
    if member.id in ALLOWED_IDS:
        return True
    if isinstance(member, discord.Member):
        for role in member.roles:
            if role.id in ALLOWED_IDS:
                return True
    return False

# ==========================================
# PERSISTENT MODULE LOADER & EXECUTOR
# ==========================================
def load_saved_modules() -> dict:
    if not os.path.exists(MODULES_FILE):
        return {}
    try:
        with open(MODULES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_modules(modules: dict):
    with open(MODULES_FILE, "w", encoding="utf-8") as f:
        json.dump(modules, f, indent=4, ensure_ascii=False)

def execute_dynamic_code(code_str: str):
    env = {
        "bot": bot,
        "discord": discord,
        "commands": commands,
        "app_commands": app_commands,
        "os": os,
        "json": json,
        "asyncio": asyncio,
        "invite_cache": invite_cache,
        "DATA_DIR": DATA_DIR,
    }
    exec(code_str, env)

# ==========================================
# AI CODE GENERATOR ("DREAM IT, BUILD IT")
# ==========================================
SYSTEM_PROMPT = """You are the core self-upgrade engine for 'Elyx Trading', a Discord bot running on discord.py (v2.x).
Your job is to convert the user's natural language request (often in Hindi, Hinglish, or English) into clean, working, self-contained Python code that registers new features directly onto the existing `bot` instance.

CRITICAL RULES:
1. Return ONLY raw Python code inside a single ```python ... ``` block. Do not include conversational text outside the code block.
2. Assume these global objects ALREADY exist in the execution scope: `bot`, `discord`, `commands`, `app_commands`, `os`, `json`, `asyncio`, `invite_cache`, `DATA_DIR`.
3. Do NOT call `bot.run(...)`, do NOT redefine `bot = commands.Bot(...)`, and do NOT call `await bot.tree.sync()` inside the generated code (the host engine handles syncing automatically after execution).
4. For Slash Commands, use `@bot.tree.command(name="...", description="...")`. Note: Slash command names MUST be lowercase, alphanumeric/underscores only, no spaces (e.g., `invite_leaderboard`).
5. For Events/Listeners, use `@bot.listen("on_message")`, `@bot.listen("on_member_join")`, etc., so existing listeners are NOT overwritten.
6. If persistent data is needed (e.g., invites, economy, warnings, configs), save/load JSON files inside `DATA_DIR` (e.g., `os.path.join(DATA_DIR, "invites.json")`).
7. If building an Invite Leaderboard or invite tracker, use `await interaction.guild.invites()` directly to sum `invite.uses` per `invite.inviter` so it works immediately for existing server invites!
8. Always handle errors gracefully inside commands so the bot never crashes.
"""

async def generate_feature_code(user_request: str, existing_modules: dict) -> str:
    existing_summary = ", ".join(existing_modules.keys()) if existing_modules else "None"
    prompt = f"""Existing installed features: {existing_summary}

User Request:
{user_request}

Write the complete Python code to implement this feature on `bot`."""

    response = await asyncio.to_thread(
        ai_client.models.generate_content,
        model="gemini-3.8-flash"",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2,
        ),
    )

    raw_text = response.text or ""
    match = re.search(r"```(?:python)?\s*(.*?)```", raw_text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw_text.strip()

# ==========================================
# BUILT-IN MANAGEMENT COMMANDS
# ==========================================
@bot.tree.command(name="upgrades", description="Installed AI features ki list dekhein")
async def list_upgrades(interaction: discord.Interaction):
    if not is_authorized(interaction.user):
        await interaction.response.send_message("❌ Aapke paas is command ki permission nahi hai.", ephemeral=True)
        return

    modules = load_saved_modules()
    if not modules:
        await interaction.response.send_message("📭 Abhi tak koi custom feature install nahi kiya gaya hai. Mujhe tag karke kuch banwayein!", ephemeral=True)
        return

    embed = discord.Embed(
        title="🚀 Elyx Trading - Installed Upgrades",
        color=discord.Color.gold()
    )
    for mod_id, info in modules.items():
        embed.add_field(
            name=f"🔹 {mod_id}",
            value=f"**Request:** {info.get('request', 'N/A')[:100]}",
            inline=False
        )
    await interaction.response.send_message(embed=embed)

@bot.tree.command(name="remove_upgrade", description="Kisi AI-generated feature ko delete karein")
@app_commands.describe(feature_name="List mein se feature ka naam (jaise feature_1)")
async def remove_upgrade(interaction: discord.Interaction, feature_name: str):
    if not is_authorized(interaction.user):
        await interaction.response.send_message("❌ Aapke paas is command ki permission nahi hai.", ephemeral=True)
        return

    modules = load_saved_modules()
    if feature_name in modules:
        del modules[feature_name]
        save_modules(modules)
        await interaction.response.send_message(
            f"🗑️ **{feature_name}** delete kar diya gaya hai. Changes apply karne ke liye bot ko ek baar restart karein."
        )
    else:
        await interaction.response.send_message(f"⚠️ `{feature_name}` nahi mila. `/upgrades` se sahi naam check karein.", ephemeral=True)

# ==========================================
# BOT EVENTS & DREAM-IT-BUILD-IT TRIGGER
# ==========================================
@bot.event
async def on_ready():
    print(f"✅ Logged in as {bot.user} (ID: {bot.user.id})")
    print(f"🔑 Authorized IDs (Role/User): {ALLOWED_IDS}")

    for guild in bot.guilds:
        try:
            invite_cache[guild.id] = await guild.invites()
        except Exception:
            pass

    modules = load_saved_modules()
    loaded_count = 0
    for mod_id, info in modules.items():
        try:
            execute_dynamic_code(info["code"])
            loaded_count += 1
        except Exception as e:
            print(f"❌ Error loading {mod_id}: {e}")

    print(f"📦 Loaded {loaded_count}/{len(modules)} saved custom modules.")
    try:
        synced = await bot.tree.sync()
        print(f"🔄 Synced {len(synced)} slash commands.")
    except Exception as e:
        print(f"⚠️ Slash command sync failed: {e}")

@bot.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return

    # Check agar bot ko tag kiya gaya hai
    if bot.user and bot.user.mentioned_in(message) and not message.mention_everyone:
        if not is_authorized(message.author):
            await message.reply("❌ Sirf authorized owners/roles hi naye features bana sakte hain.")
            return

        if not ai_client:
            await message.reply("⚠️ `GEMINI_API_KEY` set nahi hai. Apne host panel mein key add karein.")
            return

        clean_request = re.sub(rf"<@!?{bot.user.id}>", "", message.content).strip()
        if not clean_request:
            await message.reply("👋 Bataiye kya naya feature ya command banana hai? (Jaise: *'Ek `/ping` command banao'* ya *'Invite leaderboard banao'*)")
            return

        status_msg = await message.reply("⚙️ **AI Engine kaam kar raha hai...** Naya feature code kiya ja raha hai, kripya pratiksha karein.")

        try:
            modules = load_saved_modules()
            generated_code = await generate_feature_code(clean_request, modules)

            # Code ko test aur register karein
            execute_dynamic_code(generated_code)

            # Slash commands ko turant sync karein
            await bot.tree.sync()

            # Unique feature ID ke saath save karein
            idx = 1
            while f"feature_{idx}" in modules:
                idx += 1
            feature_id = f"feature_{idx}"

            modules[feature_id] = {
                "request": clean_request,
                "code": generated_code
            }
            save_modules(modules)

            await status_msg.edit(
                content=f"✅ **Feature Ready (`{feature_id}`)!**\nAapka naya feature install aur sync ho gaya hai. Agar slash command banayi hai toh Discord mein `/` dabakar check karein!"
            )
        except Exception as e:
            err_trace = traceback.format_exc()[-600:]
            await status_msg.edit(
                content=f"❌ **Feature banane mein error aaya:**\n```py\n{e}\n```\nDubara thoda aur clear likh kar try karein."
            )
            print(f"Generation/Execution Error:\n{err_trace}")

    await bot.process_commands(message)

# ==========================================
# START BOT
# ==========================================
if __name__ == "__main__":
    if not DISCORD_TOKEN:
        print("❌ ERROR: DISCORD_TOKEN environment variable missing hai!")
    else:
        bot.run(DISCORD_TOKEN)
            
