import os
import re
import asyncio
import logging

import discord
from discord.ext import commands
from dotenv import load_dotenv

from ai_brain import generate_reply, AIUnavailableError
from tools_normal import get_access_level
from memory import initialize_memory


# ================= CONFIGURATION =================

load_dotenv()

TOKEN = (
    os.getenv("DISCORD_TOKEN")
    or os.getenv("DISCORD_BOT_TOKEN")
    or os.getenv("BOT_TOKEN")
    or os.getenv("TOKEN")
)

PREFIX = "!"
MAX_HISTORY = 12
MAX_MESSAGE_LENGTH = 1900

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger("ELYX_AI")

CONVERSATIONS = {}
USER_LOCKS = {}


# ================= DISCORD SETUP =================

intents = discord.Intents.default()
intents.guilds = True
intents.members = True
intents.message_content = True

bot = commands.Bot(
    command_prefix=commands.when_mentioned_or(PREFIX),
    intents=intents,
    help_command=None
)


# ================= CONVERSATION SYSTEM =================

def get_user_key(message):
    return f"{message.guild.id}:{message.author.id}"


def get_user_lock(key):
    if key not in USER_LOCKS:
        USER_LOCKS[key] = asyncio.Lock()

    return USER_LOCKS[key]


def get_ai_messages(key, prompt, access_level):

    history = list(CONVERSATIONS.get(key, []))

    if access_level == "developer":
        access_context = (
            "ACCESS LEVEL: DEVELOPER. "
            "This member has Elyx Developer access. "
            "Help with advanced development and server management. "
            "Never claim an action was completed unless it was actually "
            "executed and confirmed."
        )

    else:
        access_context = (
            "ACCESS LEVEL: NORMAL MEMBER. "
            "Provide normal AI assistance. "
            "Do not claim to perform developer-only operations."
        )

    history.append({
        "role": "user",
        "content": (
            access_context
            + "\n\nMember message: "
            + prompt
        )
    })

    return history


def save_conversation(key, prompt, response):

    history = CONVERSATIONS.setdefault(key, [])

    history.extend([
        {
            "role": "user",
            "content": prompt
        },
        {
            "role": "assistant",
            "content": response
        }
    ])

    CONVERSATIONS[key] = history[-MAX_HISTORY:]


# ================= MESSAGE SENDER =================

async def send_response(message, content):

    content = str(content).strip()

    if not content:
        return

    for start in range(0, len(content), MAX_MESSAGE_LENGTH):

        part = content[start:start + MAX_MESSAGE_LENGTH]

        await message.reply(
            part,
            mention_author=False,
            allowed_mentions=discord.AllowedMentions.none()
        )


# ================= AI HANDLER =================

async def handle_ai(message):

    if message.guild is None:
        return

    if not isinstance(message.author, discord.Member):
        return

    if bot.user is None:
        return

    prompt = re.sub(
        rf"<@!?{bot.user.id}>",
        "",
        message.content
    ).strip()

    if not prompt:

        await message.reply(
            "Haan, batao kya help chahiye?",
            mention_author=False
        )

        return

    try:
        access_level = get_access_level(message.author)

    except Exception:

        logger.exception("Access check failed.")

        await message.reply(
            "Access check failed. Please try again.",
            mention_author=False
        )

        return

    key = get_user_key(message)
    lock = get_user_lock(key)

    async with lock:

        thinking = await message.reply(
            "ELYX AI is thinking...",
            mention_author=False
        )

        try:

            messages = get_ai_messages(
                key,
                prompt,
                access_level
            )

            response = await generate_reply(messages)

            if not isinstance(response, str) or not response.strip():
                raise RuntimeError("AI returned an empty response.")

            save_conversation(
                key,
                prompt,
                response
            )

            await thinking.edit(
                content=response[:MAX_MESSAGE_LENGTH]
            )

            remaining = response[MAX_MESSAGE_LENGTH:]

            if remaining.strip():
                await send_response(message, remaining)

        except AIUnavailableError:

            await thinking.edit(
                content="ELYX AI is temporarily unavailable. Please try again."
            )

        except Exception:

            logger.exception("AI response failed.")

            await thinking.edit(
                content="Something went wrong. Please try again."
            )


# ================= EVENTS =================

@bot.event
async def on_ready():

    logger.info("ELYX TRADING AI DEVELOPER ONLINE")
    logger.info("Bot: %s", bot.user)
    logger.info("Connected servers: %s", len(bot.guilds))


@bot.event
async def on_message(message):

    if message.author.bot:
        return

    try:

        if bot.user and bot.user in message.mentions:
            await handle_ai(message)

    except Exception:

        logger.exception("Message handler failed.")

    await bot.process_commands(message)


# ================= BASIC COMMAND =================

@bot.command(name="elyx")
async def elyx_status(ctx):

    await ctx.reply(
        "ELYX TRADING AI DEVELOPER is online.",
        mention_author=False
    )


# ================= START BOT =================

def main():

    if not TOKEN:
        raise RuntimeError(
            "Discord token missing. Set DISCORD_TOKEN in environment variables."
        )

    try:
        initialize_memory()
        logger.info("Memory database initialized.")

    except Exception:
        logger.exception("Memory initialization failed.")
        raise

    bot.run(TOKEN)


if __name__ == "__main__":
    main()
