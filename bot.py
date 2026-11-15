import os
import re
import json
import glob
import asyncio
import logging
from pathlib import Path

import discord
import requests
from discord.ext import commands, tasks
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# 🌈 ELYX TRADING - CONFIGURATION
# ==========================================

BOT_TOKEN = os.getenv("DISCORD_TOKEN")

GITHUB_USER = os.getenv("GITHUB_USER", "chakiosman89-blip")
REPO_NAME = os.getenv("REPO_NAME", "elyx-bot")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

DATA_FOLDER = Path("data")

GITHUB_API = (
    f"https://api.github.com/repos/"
    f"{GITHUB_USER}/{REPO_NAME}/contents/data"
    f"?ref={GITHUB_BRANCH}"
)

SYNC_INTERVAL = 5

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("ELYX TRADING")


# ==========================================
# DISCORD SETUP
# ==========================================

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(
    command_prefix=commands.when_mentioned,
    intents=intents,
    help_command=None
)

sync_lock = asyncio.Lock()


# ==========================================
# 🌈 ELYX BRANDING
# ==========================================

def create_embed(title, description):

    embed = discord.Embed(
        title=title,
        description=description,
        colour=discord.Colour.from_rgb(120, 80, 255)
    )

    embed.set_footer(
        text="E L Y X  T R A D I N G  •  SKYBLOCK MARKET"
    )

    return embed


# ==========================================
# DATA FILE SYSTEM
# ==========================================

def load_all_items():

    DATA_FOLDER.mkdir(exist_ok=True)

    all_items = []

    files = glob.glob("data/*.json")

    for filename in files:

        try:

            with open(filename, "r", encoding="utf-8") as file:
                data = json.load(file)

            if isinstance(data, list):
                rows = data

            elif isinstance(data, dict):
                rows = data.get("items", [])

            else:
                continue

            for item in rows:

                if not isinstance(item, dict):
                    continue

                if not item.get("name"):
                    continue

                item = item.copy()

                item["_file"] = Path(filename).stem

                all_items.append(item)

        except Exception as error:

            logger.error(
                f"JSON Error: {filename} | {error}"
            )

    return all_items


# ==========================================
# SMART SEARCH SYSTEM
# ==========================================

def clean_query(query):

    query = query.lower()

    query = re.sub(
        r"<@!?\d+>",
        "",
        query
    )

    ignored = {
        "de", "ki", "ka", "ke", "bata",
        "value", "valu", "price", "rate",
        "kitni", "kitna", "hai", "h",
        "please", "plz", "batao"
    }

    words = query.split()

    words = [
        word for word in words
        if word not in ignored
    ]

    return " ".join(words).strip()


def search_items(query, items):

    query = clean_query(query)

    if not query:
        return []

    words = query.split()

    results = []

    for item in items:

        searchable = " ".join([
            str(item.get("name", "")),
            str(item.get("category", "")),
            str(item.get("group", "")),
            str(item.get("aliases", "")),
            str(item.get("_file", ""))
        ]).lower()

        if all(word in searchable for word in words):

            results.append(item)

    return results


# ==========================================
# CATEGORY SYSTEM
# ==========================================

CATEGORY_ALIASES = {

    "rr": ["rare", "rr"],
    "rare": ["rare", "rr"],

    "armor": ["armor", "armour"],
    "armour": ["armor", "armour"],

    "mvp": ["mvp"],

    "sword": ["sword"],
    "swords": ["sword"],

    "title": ["title"],
    "titles": ["title"],

    "event": ["event"],
}


def get_category(item):

    category = str(
        item.get("category", item.get("_file", "Other"))
    )

    return category


def category_search(category, items):

    category = category.lower().strip()

    terms = CATEGORY_ALIASES.get(
        category,
        [category]
    )

    results = []

    for item in items:

        item_category = get_category(item).lower()

        item_group = str(
            item.get("group", "")
        ).lower()

        if any(
            term in item_category or term in item_group
            for term in terms
        ):

            results.append(item)

    return results


# ==========================================
# RESULT EMBED SYSTEM
# ==========================================

async def send_results(message, title, results):

    if not results:

        embed = create_embed(
            "🔎 ELYX SEARCH",
            "❌ Koi matching item nahi mila."
        )

        await message.reply(
            embed=embed,
            mention_author=False
        )

        return

    lines = []

    for item in results:

        name = item.get("name", "Unknown")

        category = get_category(item)

        value = item.get(
            "value",
            "Not verified"
        )

        demand = item.get(
            "demand",
            "Unknown"
        )

        line = (
            f"🔹 **{name}** "
            f"[{category}] — "
            f"**{value}** ({demand})"
        )

        lines.append(line)

    # Discord embed character limit protection

    chunks = []

    current = ""

    for line in lines:

        if len(current) + len(line) > 3800:

            chunks.append(current)

            current = line

        else:

            current += (
                "\n" if current else ""
            ) + line

    if current:
        chunks.append(current)

    for number, chunk in enumerate(chunks, 1):

        embed = create_embed(
            f"🌈 {title}",
            chunk
        )

        embed.add_field(
            name="📊 Total Items",
            value=str(len(results)),
            inline=True
        )

        embed.add_field(
            name="📁 Results Page",
            value=f"{number}/{len(chunks)}",
            inline=True
        )

        await message.reply(
            embed=embed,
            mention_author=False
        )

# ==========================================
# 🌈 GITHUB AUTOMATIC DATABASE SYNC
# ==========================================

def github_headers():

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Elyx-Trading-Bot"
    }

    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    return headers


def sync_github_data():

    DATA_FOLDER.mkdir(exist_ok=True)

    response = requests.get(
        GITHUB_API,
        headers=github_headers(),
        timeout=25
    )

    response.raise_for_status()

    files = response.json()

    if not isinstance(files, list):
        raise ValueError("Invalid GitHub folder response.")

    downloaded = {}

    for file_info in files:

        if file_info.get("type") != "file":
            continue

        filename = file_info.get("name", "")

        if not filename.lower().endswith(".json"):
            continue

        download_url = file_info.get("download_url")

        if not download_url:
            continue

        file_response = requests.get(
            download_url,
            headers=github_headers(),
            timeout=25
        )

        file_response.raise_for_status()

        content = file_response.text

        # Validate JSON before saving
        json.loads(content)

        downloaded[filename] = content

    if not downloaded:
        raise ValueError("GitHub data folder has no JSON files.")

    # Save only after all files pass validation
    for filename, content in downloaded.items():

        temporary = DATA_FOLDER / f".{filename}.tmp"

        temporary.write_text(
            content,
            encoding="utf-8"
        )

        temporary.replace(
            DATA_FOLDER / filename
        )

    return len(downloaded)


async def perform_sync():

    async with sync_lock:

        return await asyncio.to_thread(
            sync_github_data
        )


# ==========================================
# AUTOMATIC 5 MINUTE SYNC
# ==========================================

@tasks.loop(minutes=SYNC_INTERVAL)
async def automatic_sync():

    try:

        total = await perform_sync()

        logger.info(
            f"GitHub Sync Successful: {total} JSON files"
        )

    except Exception as error:

        logger.error(
            f"GitHub Sync Failed: {error}"
        )

        logger.info(
            "Using local JSON backup."
        )


@automatic_sync.before_loop
async def before_sync():

    await bot.wait_until_ready()


# ==========================================
# BOT STARTUP
# ==========================================

@bot.event
async def on_ready():

    logger.info(
        f"ELYX TRADING ONLINE: {bot.user}"
    )

    if not automatic_sync.is_running():

        automatic_sync.start()

    try:

        total = await perform_sync()

        logger.info(
            f"Initial Sync: {total} files"
        )

    except Exception as error:

        logger.warning(
            f"Initial Sync Failed: {error}"
        )

        logger.warning(
            "Local database will be used."
        )


# ==========================================
# HELP MENU
# ==========================================

async def show_help(message):

    embed = create_embed(
        "🌈 ELYX TRADING",
        "**BLOCKMAN GO • SKYBLOCK MARKET**\n\n"

        "🔎 **ITEM SEARCH**\n"
        "`@Elyx Trading hades`\n"
        "`@Elyx Trading valk`\n"
        "`@Elyx Trading thor`\n\n"

        "📚 **CATEGORY LIST**\n"
        "`@Elyx Trading list mvp`\n"
        "`@Elyx Trading list rr`\n"
        "`@Elyx Trading list armor`\n"
        "`@Elyx Trading list swords`\n"
        "`@Elyx Trading list titles`\n"
        "`@Elyx Trading list event`\n\n"

        "🔄 **DATABASE**\n"
        "`@Elyx Trading sync`\n\n"

        "ℹ️ **HELP**\n"
        "`@Elyx Trading help`"
    )

    await message.reply(
        embed=embed,
        mention_author=False
    )


# ==========================================
# CATEGORY COMMAND HANDLER
# ==========================================

async def handle_category(message, category):

    items = load_all_items()

    results = category_search(
        category,
        items
    )

    await send_results(
        message,
        f"📚 {category.upper()} ITEMS",
        results
    )


# ==========================================
# MAIN MENTION SYSTEM
# ==========================================

@bot.event
async def on_message(message):

    if message.author.bot:
        return

    if bot.user is None:
        return

    # Ignore messages without bot mention
    if bot.user not in message.mentions:
        return

    content = message.content

    content = re.sub(
        rf"<@!?{bot.user.id}>",
        "",
        content
    ).strip()

    if not content:

        await show_help(message)

        return

    parts = content.split(maxsplit=1)

    command = parts[0].lower()

    argument = (
        parts[1].strip()
        if len(parts) > 1
        else ""
    )

    # HELP
    if command in ["help", "commands"]:

        await show_help(message)

        return

    # MANUAL SYNC
    if command == "sync":

        try:

            total = await perform_sync()

            embed = create_embed(
                "✅ DATABASE UPDATED",
                f"GitHub se **{total} JSON files** sync hui.\n\n"
                "🌈 Elyx Trading database updated."
            )

        except Exception as error:

            embed = create_embed(
                "⚠️ SYNC FAILED",
                "Local JSON backup use ho raha hai.\n"
                f"`{str(error)[:500]}`"
            )

        await message.reply(
            embed=embed,
            mention_author=False
        )

        return

    # CATEGORY SEARCH
    if command == "list":

        if not argument:

            await message.reply(
                embed=create_embed(
                    "📚 CATEGORY LIST",
                    "Category likho:\n"
                    "`mvp`, `rr`, `armor`, `swords`, `titles`, `event`"
                ),
                mention_author=False
            )

            return

        await handle_category(
            message,
            argument
        )

        return

    # SMART ITEM SEARCH
    items = load_all_items()

    results = search_items(
        content,
        items
    )

    await send_results(
        message,
        f"SEARCH: {content}",
        results
    )


# ==========================================
# ERROR HANDLING
# ==========================================

@bot.event
async def on_error(event, *args, **kwargs):

    logger.exception(
        f"Discord event error: {event}"
    )


# ==========================================
# START ELYX TRADING
# ==========================================

if __name__ == "__main__":

    if not BOT_TOKEN:

        raise RuntimeError(
            "DISCORD_TOKEN missing! Add it to hosting environment variables."
        )

    bot.run(BOT_TOKEN)
