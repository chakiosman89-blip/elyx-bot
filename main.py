import os
import re
import asyncio
import logging

import discord
from discord.ext import commands
from dotenv import load_dotenv

from ai_brain import generate_reply, AIUnavailableError
from tools_normal import get_access_level
from memory import initialize_memory, recall, recall_project

from tools_hard import (
    kick_member,
    ban_member,
    change_nickname,
    create_text_channel,
    delete_channel,
    create_role,
    set_member_role
)

from self_coder import (
    validate_file_path,
    read_project_file,
    review_code_change
)

from github_builder import GitHubBuilder


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
MAX_CODE_SIZE = 100000

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


# ================= ACCESS SYSTEM =================

def is_developer(member):

    try:
        return get_access_level(member) == "developer"

    except Exception:
        logger.exception("Developer access check failed.")
        return False


async def developer_only(ctx):

    if not is_developer(ctx.author):

        await ctx.reply(
            "You don't have permission to use this developer feature.",
            mention_author=False
        )

        return False

    return True


# ================= MEMORY SYSTEM =================

def get_memory_context(user_id, access_level):

    context = []

    try:

        user_memories = recall(user_id, limit=5)

        for item in user_memories:
            context.append(
                f"User memory: {item.get('content', '')}"
            )

    except Exception:
        logger.exception("User memory retrieval failed.")

    # Project memories are developer-only.
    if access_level == "developer":

        try:

            project_memories = recall_project(limit=10)

            for item in project_memories:
                context.append(
                    f"Elyx project memory: {item.get('content', '')}"
                )

        except Exception:
            logger.exception("Project memory retrieval failed.")

    return "\n".join(context)


# ================= CONVERSATION SYSTEM =================

def get_user_key(message):

    return f"{message.guild.id}:{message.author.id}"


def get_user_lock(key):

    if key not in USER_LOCKS:
        USER_LOCKS[key] = asyncio.Lock()

    return USER_LOCKS[key]


def get_ai_messages(key, prompt, access_level, user_id):

    history = list(CONVERSATIONS.get(key, []))

    memory_context = get_memory_context(
        user_id,
        access_level
    )

    if access_level == "developer":

        access_context = (
            "ACCESS LEVEL: DEVELOPER. "
            "This member has Elyx Developer access. "
            "Help with advanced development and server management. "
            "Never claim an action was completed unless it was actually "
            "executed and confirmed. Never bypass approval."
        )

    else:

        access_context = (
            "ACCESS LEVEL: NORMAL MEMBER. "
            "Provide normal AI assistance. "
            "Do not claim to perform developer-only operations. "
            "Never reveal developer-only information."
        )

    combined_context = access_context

    if memory_context:
        combined_context += (
            "\n\nRelevant saved memories:\n"
            + memory_context
        )

    history.append({
        "role": "user",
        "content": (
            combined_context
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

    access_level = (
        "developer"
        if is_developer(message.author)
        else "normal"
    )

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
                access_level,
                message.author.id
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


# ================= ACTION CONFIRMATION =================

class ActionConfirmView(discord.ui.View):

    def __init__(self, requester_id, action):
        super().__init__(timeout=60)

        self.requester_id = requester_id
        self.action = action

    async def interaction_check(self, interaction):

        if interaction.user.id != self.requester_id:

            await interaction.response.send_message(
                "Only the person who requested this action can approve it.",
                ephemeral=True
            )

            return False

        return True

    @discord.ui.button(
        label="Confirm",
        style=discord.ButtonStyle.danger
    )
    async def confirm(self, interaction, button):

        self.stop()

        for child in self.children:
            child.disabled = True

        await interaction.response.edit_message(
            content="Action approved. Executing...",
            view=self
        )

        try:

            result = await self.action()

            result_text = str(result) if result else "Action completed."

            await interaction.edit_original_response(
                content=f"ELYX: {result_text}",
                view=self
            )

        except Exception:

            logger.exception("Approved action failed.")

            await interaction.edit_original_response(
                content="Action failed. Check bot logs.",
                view=self
            )

    @discord.ui.button(
        label="Cancel",
        style=discord.ButtonStyle.secondary
    )
    async def cancel(self, interaction, button):

        self.stop()

        for child in self.children:
            child.disabled = True

        await interaction.response.edit_message(
            content="Action cancelled.",
            view=self
        )

    async def on_timeout(self):

        for child in self.children:
            child.disabled = True


async def request_action(ctx, description, action):

    if not await developer_only(ctx):
        return

    view = ActionConfirmView(
        requester_id=ctx.author.id,
        action=action
    )

    await ctx.reply(
        f"**ELYX ACTION APPROVAL**\n\n"
        f"{description}\n\n"
        f"Confirm karne par hi action execute hoga.",
        view=view,
        mention_author=False
    )


# ================= SERVER MANAGEMENT =================

@bot.command(name="kick")
@commands.guild_only()
async def kick_command(ctx, member: discord.Member, *, reason="No reason provided"):

    await request_action(
        ctx,
        f"Kick member: {member}\nReason: {reason}",
        lambda: kick_member(
            ctx.guild,
            ctx.author,
            member,
            reason
        )
    )


@bot.command(name="ban")
@commands.guild_only()
async def ban_command(ctx, member: discord.Member, *, reason="No reason provided"):

    await request_action(
        ctx,
        f"Ban member: {member}\nReason: {reason}",
        lambda: ban_member(
            ctx.guild,
            ctx.author,
            member,
            reason
        )
    )


@bot.command(name="nick")
@commands.guild_only()
async def nickname_command(ctx, member: discord.Member, *, nickname):

    await request_action(
        ctx,
        f"Change nickname of {member} to: {nickname}",
        lambda: change_nickname(
            ctx.guild,
            ctx.author,
            member,
            nickname
        )
    )


@bot.command(name="createchannel")
@commands.guild_only()
async def create_channel_command(ctx, *, name):

    await request_action(
        ctx,
        f"Create text channel: #{name}",
        lambda: create_text_channel(
            ctx.guild,
            ctx.author,
            name
        )
    )


@bot.command(name="deletechannel")
@commands.guild_only()
async def delete_channel_command(ctx, channel: discord.TextChannel):

    await request_action(
        ctx,
        f"Delete channel: {channel.mention}",
        lambda: delete_channel(
            ctx.guild,
            ctx.author,
            channel.id
        )
    )


@bot.command(name="createrole")
@commands.guild_only()
async def create_role_command(ctx, *, name):

    await request_action(
        ctx,
        f"Create role: {name}",
        lambda: create_role(
            ctx.guild,
            ctx.author,
            name
        )
    )


@bot.command(name="roleadd")
@commands.guild_only()
async def add_role_command(ctx, member: discord.Member, role: discord.Role):

    await request_action(
        ctx,
        f"Add role {role.name} to {member}",
        lambda: set_member_role(
            ctx.guild,
            ctx.author,
            member.id,
            role.id,
            add=True
        )
    )


@bot.command(name="roleremove")
@commands.guild_only()
async def remove_role_command(ctx, member: discord.Member, role: discord.Role):

    await request_action(
        ctx,
        f"Remove role {role.name} from {member}",
        lambda: set_member_role(
            ctx.guild,
            ctx.author,
            member.id,
            role.id,
            add=False
        )
    )


# ================= CODE READER =================

@bot.command(name="readcode")
@commands.guild_only()
async def read_code_command(ctx, *, filename):

    if not await developer_only(ctx):
        return

    try:

        validate_file_path(filename)

        content = read_project_file(filename)

        if not content:
            await ctx.reply(
                "File is empty or unavailable.",
                mention_author=False
            )
            return

        content = str(content)

        for start in range(0, len(content), 1700):

            part = content[start:start + 1700]

            await ctx.reply(
                f"```python\n{part}\n```",
                mention_author=False
            )

    except Exception:

        logger.exception("Project file read failed.")

        await ctx.reply(
            "Could not read that project file.",
            mention_author=False
        )


# ================= CODE REVIEW + GITHUB =================

@bot.command(name="codeupdate")
@commands.guild_only()
async def code_update_command(ctx, filename=None):

    if not await developer_only(ctx):
        return

    if not filename:

        await ctx.reply(
            "Usage: !codeupdate filename.py\nAttach the new code file.",
            mention_author=False
        )

        return

    if not ctx.message.attachments:

        await ctx.reply(
            "Please attach the new code file.",
            mention_author=False
        )

        return

    attachment = ctx.message.attachments[0]

    if attachment.size > MAX_CODE_SIZE:

        await ctx.reply(
            "File is too large. Maximum size is 100 KB.",
            mention_author=False
        )

        return

    try:

        validate_file_path(filename)

        raw_content = await attachment.read()

        new_content = raw_content.decode("utf-8")

        review = review_code_change(
            filename,
            new_content
        )

        if not isinstance(review, dict):
            raise RuntimeError("Invalid code review response.")

        errors = review.get("errors") or []

        if isinstance(errors, str):
            errors = [errors]

        if review.get("error"):
            errors.append(review["error"])

        review_passed = review.get(
            "review_passed",
            review.get("valid", not errors)
        )

        if errors or not review_passed:

            await ctx.reply(
                "**Code review failed.**\n"
                + "\n".join(str(item) for item in errors[:5]),
                mention_author=False
            )

            return

        warnings = review.get("warnings") or []

        warning_text = (
            "\n".join(str(item) for item in warnings[:5])
            if warnings
            else "No warnings."
        )

        builder = GitHubBuilder()

        existing_file = await builder.get_file(filename)

        if not existing_file:

            await ctx.reply(
                "GitHub file not found. This workflow updates existing files only.",
                mention_author=False
            )

            return

        async def approved_update():

            # Check developer access again before committing.
            if not is_developer(ctx.author):
                raise PermissionError(
                    "Developer access is no longer available."
                )

            result = await builder.update_file(
                filename,
                new_content,
                approved=True,
                commit_message=f"Update {filename} through Elyx Developer"
            )

            if not isinstance(result, dict):
                raise RuntimeError("Invalid GitHub response.")

            if not result.get("success"):
                raise RuntimeError(
                    result.get("message", "GitHub update failed.")
                )

            return result.get(
                "message",
                "GitHub file updated successfully."
            )

        await request_action(
            ctx,
            (
                f"**ELYX GITHUB CODE UPDATE**\n"
                f"File: `{filename}`\n"
                f"Review: Passed\n"
                f"Warnings:\n{warning_text}\n\n"
                f"GitHub commit requires your confirmation."
            ),
            approved_update
        )

    except Exception:

        logger.exception("Code update workflow failed.")

        await ctx.reply(
            "Code update failed. Check the bot logs.",
            mention_author=False
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


# ================= BASIC COMMANDS =================

@bot.command(name="elyx")
async def elyx_status(ctx):

    await ctx.reply(
        "ELYX TRADING AI DEVELOPER is online.",
        mention_author=False
    )


@bot.command(name="devhelp")
async def developer_help(ctx):

    if not await developer_only(ctx):
        return

    await ctx.reply(
        "**ELYX DEVELOPER COMMANDS**\n\n"
        "`!kick @member reason`\n"
        "`!ban @member reason`\n"
        "`!nick @member nickname`\n"
        "`!createchannel name`\n"
        "`!deletechannel #channel`\n"
        "`!createrole name`\n"
        "`!roleadd @member @role`\n"
        "`!roleremove @member @role`\n"
        "`!readcode filename.py`\n"
        "`!codeupdate filename.py` + attached file\n\n"
        "Important actions require confirmation.",
        mention_author=False
    )


# ================= START BOT =================

def main():

    if not TOKEN:

        raise RuntimeError(
            "Discord token missing. Set DISCORD_TOKEN in environment variables."
        )

    initialize_memory()

    logger.info("Memory database initialized.")

    bot.run(TOKEN)


if __name__ == "__main__":
    main()
