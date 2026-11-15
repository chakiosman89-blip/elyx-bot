import os
import json
import glob
import discord
from discord.ext import commands, tasks
import requests

# ==========================================
# 1. APNI DETAILS YAHAN DALEIN
# ==========================================
BOT_TOKEN = os.getenv("BOT_TOKEN", "YAHAN_APNA_DISCORD_BOT_TOKEN_DALEIN")
GITHUB_USER = "YAHAN_APNA_GITHUB_USERNAME_DALEIN"
REPO_NAME = "YAHAN_APNA_REPO_NAME_DALEIN"
BRANCH = "main"

# ==========================================
# 2. BOT SETUP (@Elyx Trading Mention System)
# ==========================================
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix=commands.when_mentioned, intents=intents, help_command=None)

all_items = []

def load_local_files():
    global all_items
    temp_list = []
    for file_path in glob.glob("data/*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    temp_list.extend(data)
        except Exception as e:
            print(f"[LOCAL ERROR] {file_path}: {e}")
    if temp_list:
        all_items = temp_list

@tasks.loop(minutes=5)
async def auto_sync_github():
    global all_items
    api_url = f"https://github.com{GITHUB_USER}/{REPO_NAME}/contents/data?ref={BRANCH}"
    try:
        res = requests.get(api_url, timeout=10)
        if res.status_code == 200:
            files = res.json()
            new_items = []
            for file_info in files:
                if file_info["name"].endswith(".json") and file_info.get("download_url"):
                    file_data = requests.get(file_info["download_url"], timeout=10).json()
                    if isinstance(file_data, list):
                        new_items.extend(file_data)
            if new_items:
                all_items = new_items
                print(f"[AUTO-SYNC] {len(all_items)} items synced!")
                return
    except Exception as e:
        print(f"[GITHUB SYNC ERROR] {e}")
    
    load_local_files()

@bot.event
async def on_ready():
    load_local_files()
    auto_sync_github.start()
    print(f"✅ Elyx Trading Online Hai! Total Items: {len(all_items)}")

@bot.event
async def on_message(message):
    if message.author.bot:
        return

    if bot.user in message.mentions:
        clean_text = message.content.replace(f"<@{bot.user.id}>", "").replace(f"<@!{bot.user.id}>", "").strip()

        if not clean_text or clean_text.lower() == "help":
            embed = discord.Embed(
                title="🤖 Elyx Trading — Guide",
                description=(
                    "**Value Check:**\n"
                    f"• {bot.user.mention} `hades`\n"
                    f"• {bot.user.mention} `zeus lightning`\n\n"
                    "**Category List:**\n"
                    f"• {bot.user.mention} `list rr` | `list mvp` | `list sword` | `list armor` | `list title` | `list event`\n\n"
                    "**Force Refresh:**\n"
                    f"• {bot.user.mention} `sync`"
                ),
                color=discord.Color.gold()
            )
            await message.channel.send(embed=embed)
            return

        if clean_text.lower() == "sync":
            await auto_sync_github()
            await message.channel.send(f"🔄 **Synced!** Database mein **{len(all_items)} items** active hain.")
            return

        if clean_text.lower().startswith("list"):
            parts = clean_text.split(" ", 1)
            cat = parts[1].upper().strip() if len(parts) > 1 else "ALL"

            if cat == "ALL":
                filtered = all_items
                title_text = "📊 Elyx Trading — All Items List"
            else:
                filtered = [i for i in all_items if i.get("category", "").upper() == cat]
                title_text = f"🔥 Elyx Trading — {cat} Value List"

            if not filtered:
                await message.channel.send(f"❌ **`{cat}`** mein koi item nahi mila. Try: `RR`, `MVP`, `SWORD`, `ARMOR`, `TITLE`, `EVENT`")
                return

            lines = [f"🔹 **{i['item']}** `[{i['category']}]` — **{i['value']}** *({i['demand']})*" for i in filtered]
            embed = discord.Embed(
                title=title_text,
                description="\n".join(lines[:25]),
                color=discord.Color.blue()
            )
            embed.set_footer(text=f"Showing {min(len(lines), 25)} of {len(lines)} items • Elyx Trading")
            await message.channel.send(embed=embed)
            return

        query = clean_text.lower()
        matches = [i for i in all_items if query in i.get("item", "").lower()]

        if not matches:
            await message.channel.send(f"❌ **`{clean_text}`** database mein nahi mila!")
            return

        lines = [f"🔹 **{i['item']}** `[{i['category']}]` — **{i['value']}** *({i['demand']})*" for i in matches[:15]]
        embed = discord.Embed(
            title=f"⚔️ Elyx Trading — Search: \"{clean_text.title()}\"",
            description="\n".join(lines),
            color=discord.Color.gold()
        )
        embed.set_footer(text="Auto-Synced • Elyx Trading Database")
        await message.channel.send(embed=embed)

bot.run(BOT_TOKEN)

