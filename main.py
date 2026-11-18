import os
import re
import asyncio
import logging

import discord
from discord.ext import commands
from dotenv import load_dotenv

from ai_brain import generate_reply, AIUnavailableError
from tools_hard import has_developer_access


load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")

DEVELOPER_ROLE_ID = 1572448688700391454

MAX_HISTORY = 12
MAX_REPLY_LENGTH = 1900

CONVERSATIONS = {}
USER_LOCKS = {}


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger("ELYX_AI")


intents = discord.Intents.default()
intents.guilds = True
intents.members = True
intents.message_content = True


bot = commands.Bot(
    command_prefix=commands.when_mentioned_or("!"),
    intents=intents,
    help_command=None
)


def get_conversation_key(message):
    return f"{message.guild.id}:{message.author.id}"


def get_user_lock(key):
    if key not in USER_LOCKS:
        USER_LOCKS[key] = asyncio.Lock()

    return USER_LOCKS[key]


def get_ai_messages(key, prompt, access_level):
    history = CONVERSATIONS.get(key, [])

    messages = list(history)

    if access_level == "developer":
        context = (
            "[ACCESS LEVEL: DEVELOPER / HARD ACCESS]\n"
            "This member has the authorized Elyx Developer role. "
            "Help with developer planning and advanced development. "
            "Never claim an action was executed unless a real tool confirms it."
        )
    else:
        context = (
            "[ACCESS LEVEL: NORMAL MEMBER]\n"
            "This member has normal access only. "
            "Help with ordinary member features and general questions. "
            "Do not perform or claim to perform moderation, "
            "nickname changes, role management, channel management, "
            "server administration, or developer-only operations. "
            "Explain politely that these require Developer access."
        )

    messages.append({
        "role": "user",
        "content": context + "\n\nMember request: " + prompt
    })

    return messages


def save_conversation(key, user_message, ai_reply):
    history = CONVERSATIONS.setdefault(key, [])

    history.append({
        "role": "user",
        "content": user_message
    })

    history.append({
        "role": "assistant",
        "content": ai_reply
    })

    CONVERSATIONS[key] = history[-MAX_HISTORY:]


async def send_long_message(message, content):
    content = content.strip()

    if not content:
        return

    for start in range(0, len(content), MAX_REPLY_LENGTH):
        chunk = content[start:start + MAX_REPLY_LENGTH]

        await message.reply(
            chunk,
            mention_author=False,
            allowed_mentions=discord.AllowedMentions.none()
        )


async def handle_ai_mention(message):

    if bot.user is None:
        return

    if not isinstance(message.author, discord.Member):
        return

    # Decide access level using the actual role ID
    if has_developer_access(message.author):
        access_level = "developer"
    else:
        access_level = "normal"

    # Remove bot mention
    prompt = re.sub(
        rf"<@!?{bot.user.id}>",
        "",
        message.content
    ).strip()

    if not prompt:
        await message.reply(
            "Haan! Batao kya help chahiye?",
            mention_author=False
        )
        return

    key = get_conversation_key(message)
    lock = get_user_lock(key)

    async with lock:

        thinking_message = await message.reply(
            "ELYX AI is thinking...",
            mention_author=False
        )

        try:
            ai_messages = get_ai_messages(
                key,
                prompt,
                access_level
            )

            reply = await generate_reply(ai_messages)

            if not isinstance(reply, str) or not reply.strip():
                raise RuntimeError("AI returned an empty response.")

            save_conversation(key, prompt, reply)

            await thinking_message.edit(
                content=reply[:MAX_REPLY_LENGTH]
            )

            remaining = reply[MAX_REPLY_LENGTH:]

            if remaining.strip():
                await send_long_message(message, remaining)

        except AIUnavailableError:
            await thinking_message.edit(
                content=(
                    "ELYX AI is temporarily unavailable. "
                    "Please try again later."
                )
            )

        except Exception:
            logger.exception("AI request failed")

            await thinking_message.edit(
                content="Something went wrong. Please try again."


            )


@bot.event
async def on_ready():
    logger.info("ELYX TRADING AI DEVELOPER ONLINE")
    logger.info("Bot: %s", bot.user)
    logger.info("Connected Servers: %s", len(bot.guilds))


@bot.event
async def on_message(message):

    if message.author.bot:
        return

    if bot.user and bot.user in message.mentions:
        await handle_ai_mention(message)

    await bot.process_commands(message)


@bot.event
async def on_command_error(ctx, error):
    logger.error("Command Error: %s", error)


async def main():

    if not TOKEN:
        raise RuntimeError(
            "DISCORD_TOKEN missing! Check FadeHost environment variables."
        )

    async with bot:
        await bot.start(TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
