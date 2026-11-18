import os
import logging

import discord
from discord.ext import commands
from dotenv import load_dotenv

# Environment settings
load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")

# Elyx Developer role ID
DEVELOPER_ROLE_ID = 1572448688700391454

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger("ELYX")

# Discord intents
intents = discord.Intents.default()
intents.guilds = True
intents.members = True
intents.message_content = True

# Bot setup
bot = commands.Bot(
    command_prefix=commands.when_mentioned_or("!"),
    intents=intents,
    help_command=None
)


@bot.event
async def on_ready():
    logger.info("ELYX TRADING AI DEVELOPER ONLINE")
    logger.info("Bot Name: %s", bot.user)
    logger.info("Connected Servers: %s", len(bot.guilds))


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    # Commands processing
    await bot.process_commands(message)


@bot.event
async def on_command_error(ctx, error):
    logger.error("Command Error: %s", error)


async def main():
    if not TOKEN:
        raise RuntimeError(
            "DISCORD_TOKEN missing! Check your .env file."
        )

    async with bot:
        await bot.start(TOKEN)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
