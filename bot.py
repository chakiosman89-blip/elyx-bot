import os
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
import aiohttp
import discord
from discord.ext import tasks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ElyxTrading")

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GITHUB_USER = "chakiosman89-blip"
GITHUB_REPO = "elyx-bot"
GITHUB_BRANCH = "main"
DATA_DIR = Path("data")

CATEGORY_CONFIG = {
    "MVP": {"color": 0xFF0055, "badge": "👑"},
    "Rare": {"color": 0xFF7700, "badge": "💎"},
    "MVP SW": {"color": 0xFFDD00, "badge": "⚔️"},
    "Rare SW": {"color": 0x00E676, "badge": "🗡️"},
    "MVP Armor": {"color": 0x00B0FF, "badge": "🛡️"},
    "Rare Armor": {"color": 0x651FFF, "badge": "🔰"},
    "MVP Titles": {"color": 0xD500F9, "badge": "🏷️"},
    "Rare Titles": {"color": 0xFF4081, "badge": "✨"},
}

RAINBOW_BAR = "🟥🟧🟨🟩🟦🟪"


class MarketDatabase:
    def __init__(self):
        self.items: list[dict] = []
        self.last_sync: str = "Local Cache"
        self.sync_status: str = "🟡 Local Mode"
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def _validate_and_clean(self, raw_items: list) -> list[dict]:
        cleaned = []
        seen_names = set()

        for entry in raw_items:
            if not isinstance(entry, dict):
                continue

            name = str(entry.get("name", "")).strip()
            category = str(entry.get("category", "")).strip()
            value = str(entry.get("value", "Unverified")).strip()
            demand = str(entry.get("demand", "Unverified")).strip()
            trend = str(entry.get("trend", "")).strip().lower()

            if not name or category not in CATEGORY_CONFIG:
                continue

            name_key = f"{name.lower()}_{category.lower()}"
            if name_key in seen_names:
                continue
            seen_names.add(name_key)

            if demand.lower() in ["low", "medium", "high"]:
                demand = demand.capitalize()
            else:
                demand = "Unverified"

            if not value:
                value = "Unverified"

            cleaned.append({
                "name": name,
                "category": category,
                "value": value,
                "demand": demand,
                "trend": trend
            })

        return cleaned

    def load_local_files(self):
        all_raw = []
        for file_path in DATA_DIR.glob("*.json"):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict) and isinstance(data.get("items"), list):
                    all_raw.extend(data["items"])
            except Exception as e:
                logger.error(f"Error reading {file_path.name}: {e}")

        self.items = self._validate_and_clean(all_raw)
        logger.info(f"Loaded {len(self.items)} verified items from local storage.")

    async def sync_from_github(self):
        api_url = f"https://github.com{GITHUB_USER}/{GITHUB_REPO}/contents/data?ref={GITHUB_BRANCH}"
        headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "Elyx-Trading-Bot"}

        try:
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(api_url, timeout=15) as resp:
                    if resp.status != 200:
                        raise RuntimeError(f"GitHub API status {resp.status}")
                    files_meta = await resp.json()

                json_files = [
                    f for f in files_meta
                    if isinstance(f, dict) and f.get("name", "").endswith(".json") and f.get("download_url")
                ]

                if not json_files:
                    raise RuntimeError("No JSON files in GitHub data folder.")

                fetched_raw = []
                for file_info in json_files:
                    fname = file_info["name"]
                    raw_url = file_info["download_url"]
                    async with session.get(raw_url, timeout=15) as file_resp:
                        if file_resp.status == 200:
                            text_data = await file_resp.text()
                            try:
                                parsed = json.loads(text_data)
                                if isinstance(parsed, dict) and isinstance(parsed.get("items"), list):
                                    fetched_raw.extend(parsed["items"])
                                    with open(DATA_DIR / fname, "w", encoding="utf-8") as lf:
                                        json.dump(parsed, lf, indent=2, ensure_ascii=False)
                            except json.JSONDecodeError:
                                logger.error(f"Invalid JSON in {fname}")

                if fetched_raw:
                    self.items = self._validate_and_clean(fetched_raw)
                    self.last_sync = datetime.now(timezone.utc).strftime("%H:%M UTC")
                    self.sync_status = f"🟢 Live Synced ({self.last_sync})"
                    logger.info(f"GitHub sync complete: {len(self.items)} items.")

        except Exception as e:
            self.sync_status = "🟠 Offline Fallback (Local DB)"
            logger.warning(f"GitHub sync failed ({e}). Using local DB.")
            if not self.items:
                self.load_local_files()

class ElyxTradingBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents)
        self.db = MarketDatabase()

    async def setup_hook(self):
        self.db.load_local_files()
        self.auto_sync_task.start()

    async def on_ready(self):
        await self.change_presence(
            activity=discord.Activity(
                type=discord.ActivityType.watching,
                name="Elyx Trading | @mention me"
            )
        )
        logger.info(f"Logged in as {self.user} - Elyx Trading Ready!")

    @tasks.loop(minutes=5)
    async def auto_sync_task(self):
        await self.db.sync_from_github()

    @auto_sync_task.before_loop
    async def before_auto_sync(self):
        await self.wait_until_ready()

    def _format_demand(self, demand: str) -> str:
        mapping = {
            "High": "🔥 High",
            "Medium": "⚡ Medium",
            "Low": "❄️ Low",
            "Unverified": "❔ Unverified"
        }
        return mapping.get(demand, "❔ Unverified")

    def _format_value(self, item: dict) -> str:
        value = item.get("value", "Unverified")
        trend = item.get("trend", "")
        if value.lower() == "unverified":
            return "`Unverified`"
        arrow = " 📈" if trend == "up" else (" 📉" if trend == "down" else "")
        return f"💰 **`{value}`**{arrow}"

    def build_category_embeds(self, items: list[dict], title_prefix: str = "MARKET INDEX") -> list[discord.Embed]:
        grouped: dict[str, list[dict]] = {cat: [] for cat in CATEGORY_CONFIG}
        for item in items:
            grouped[item["category"]].append(item)

        embeds = []
        for category, cat_items in grouped.items():
            if not cat_items:
                continue

            cfg = CATEGORY_CONFIG[category]
            lines = []
            for idx, it in enumerate(cat_items, start=1):
                val_str = self._format_value(it)
                dem_str = self._format_demand(it["demand"])
                lines.append(f"**{idx}. {it['name']}**  •  {val_str}  •  {dem_str}")

            description_text = "\n".join(lines)
            if len(description_text) > 3900:
                description_text = description_text[:3900] + "\n*...search exact item name for more*"

            embed = discord.Embed(
                title=f"{cfg['badge']} ELYX TRADING • {category.upper()} ({title_prefix})",
                description=f"{RAINBOW_BAR}\n\n{description_text}\n\n{RAINBOW_BAR}",
                color=cfg["color"],
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_footer(text=f"Elyx Trading Market Terminal • {self.db.sync_status}")
            embeds.append(embed)

        return embeds

    def build_help_embed(self) -> discord.Embed:
        embed = discord.Embed(
            title="🌈 ELYX TRADING • LIVE MARKET TERMINAL",
            description=(
                f"{RAINBOW_BAR}\n"
                "Blockman GO Skyblock Gcube items & demand tracker.\n\n"
                "**🔍 Item Search:**\n"
                f"> {self.user.mention} `Fenrir`\n"
                f"> {self.user.mention} `Harem`\n\n"
                "**📂 Category Filter:**\n"
                f"> {self.user.mention} `MVP SW` • `Rare SW` • `MVP Armor` • `Rare Armor`\n"
                f"> {self.user.mention} `MVP` • `Rare` • `MVP Titles` • `Rare Titles`\n\n"
                "**📊 Full Market List:**\n"
                f"> {self.user.mention} `all`\n"
                f"{RAINBOW_BAR}"
            ),
            color=0x00F5D4
        )
        embed.add_field(name="📦 Indexed Items", value=f"`{len(self.db.items)} Items`", inline=True)
        embed.add_field(name="🔄 Database Status", value=f"`{self.db.sync_status}`", inline=True)
        embed.set_footer(text="Elyx Trading • Values in M / B • Community Verified")
        return embed

    async def on_message(self, message: discord.Message):
        if message.author.bot or self.user not in message.mentions:
            return

        clean_query = message.content
        for mention_str in [f"<@{self.user.id}>", f"<@!{self.user.id}>"]:
            clean_query = clean_query.replace(mention_str, "")
        clean_query = clean_query.strip()

        if not clean_query or clean_query.lower() in ["help", "menu", "commands"]:
            await message.reply(embed=self.build_help_embed(), mention_author=False)
            return

        if clean_query.lower() in ["all", "list", "market", "values"]:
            embeds = self.build_category_embeds(self.db.items, title_prefix="ALL VALUES")
            if not embeds:
                await message.reply("⚠️ Database mein abhi koi item load nahi hai.", mention_author=False)
                return
            for i in range(0, len(embeds), 10):
                await message.reply(embeds=embeds[i:i + 10], mention_author=False)
            return

        matched_category = next(
            (cat for cat in CATEGORY_CONFIG if clean_query.lower() == cat.lower()),
            None
        )

        if matched_category:
            cat_items = [it for it in self.db.items if it["category"] == matched_category]
            embeds = self.build_category_embeds(cat_items, title_prefix="CATEGORY")
            if not embeds:
                await message.reply(f"⚠️ **{matched_category}** category abhi khaali hai.", mention_author=False)
                return
            await message.reply(embeds=embeds, mention_author=False)
            return

        query_lower = clean_query.lower()
        results = [it for it in self.db.items if query_lower in it["name"].lower()]

        if not results:
            no_res = discord.Embed(
                title="❌ ELYX TRADING • NO ITEM FOUND",
                description=(
                    f"{RAINBOW_BAR}\n"
                    f"**`{clean_query}`** naam ka koi item database mein nahi mila.\n"
                    f"Spelling check karein ya {self.user.mention} `all` likhein.\n"
                    f"{RAINBOW_BAR}"
                ),
                color=0xFF1744
            )
            no_res.set_footer(text=f"Elyx Trading • {self.db.sync_status}")
            await message.reply(embed=no_res, mention_author=False)
            return

        embeds = self.build_category_embeds(results, title_prefix="SEARCH RESULT")
        for i in range(0, len(embeds), 10):
            await message.reply(embeds=embeds[i:i + 10], mention_author=False)


if __name__ == "__main__":
    if not DISCORD_TOKEN:
        raise RuntimeError("DISCORD_TOKEN environment variable missing!")
    bot = ElyxTradingBot()
    bot.run(DISCORD_TOKEN)
        
