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
            "Use simple Hinglish when appropriate. "
            "Never claim an action was completed unless it was "
            "actually executed and confirmed. "
            "Never claim access to files or live data without checking. "
            "Never bypass approval."
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

            result_text = (
                str(result)
                if result
                else "Action completed."
            )

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


# ================= NATURAL LANGUAGE ACTION SYSTEM =================

async def handle_natural_discord_action(message, prompt):

    text = prompt.lower().strip()

    guild = message.guild
    actor = message.author

    action_requested = re.search(
        r"\b(create|make|bana|banao|banado|banade|create\s+kar)\b",
        text
    )

    # ---------- ROLE CREATION ----------

    if action_requested and re.search(r"\brole\b", text):

        match = re.search(
            r"(?:create|make|bana|banao|banado|banade)\s+(.+?)\s+role\b",
            text
        )

        if not match:
            await message.reply(
                "Role ka naam batao. Example: create Elyx Elite role",
                mention_author=False
            )
            return True

        role_name = match.group(1).strip()

        role_name = re.sub(
            r"\s+",
            " ",
            role_name
        )

        if not role_name or len(role_name) > 100:
            await message.reply(
                "Invalid role name.",
                mention_author=False
            )
            return True

        colour_map = {
            "purple": 0x800080,
            "red": 0xFF0000,
            "blue": 0x0000FF,
            "green": 0x00FF00,
            "yellow": 0xFFFF00,
            "orange": 0xFFA500,
            "pink": 0xFFC0CB,
            "cyan": 0x00FFFF,
            "gold": 0xFFD700,
            "black": 0x000000,
            "white": 0xFFFFFF
        }

        colour = discord.Colour.default()

        hex_match = re.search(
            r"#([0-9a-fA-F]{6})",
            text
        )

        if hex_match:

            colour = discord.Colour(
                int(hex_match.group(1), 16)
            )

        else:

            for colour_name, hex_value in colour_map.items():

                if re.search(
                    rf"\b{colour_name}\b",
                    text
                ):

                    colour = discord.Colour(hex_value)
                    break

        existing = discord.utils.get(
            guild.roles,
            name=role_name
        )

        if existing:
            await message.reply(
                f"Role `{role_name}` already exists.",
                mention_author=False
            )
            return True

        async def execute_role():

            if not is_developer(actor):
                raise PermissionError(
                    "Developer access required."
                )

            if not actor.guild_permissions.manage_roles:
                raise PermissionError(
                    "You need Manage Roles permission."
                )

            bot_member = guild.me

            if bot_member is None:
                raise RuntimeError(
                    "Bot member could not be found."
                )

            if not bot_member.guild_permissions.manage_roles:
                raise PermissionError(
                    "Bot needs Manage Roles permission."
                )

            role = await guild.create_role(
                name=role_name,
                colour=colour,
                reason="Approved Elyx AI action"
            )

            return (
                f"Role `{role.name}` created successfully."
            )

        view = ActionConfirmView(
            actor.id,
            execute_role
        )

        await message.reply(
            f"**ELYX ACTION APPROVAL**\n\n"
            f"Create role: `{role_name}`\n"
            f"Colour: `{colour}`\n\n"
            f"Confirm karne par role create hoga.",
            view=view,
            mention_author=False
        )

        return True

    # ---------- KICK MEMBER ----------

    if re.search(r"\bkick\b", text):

        targets = [
            member
            for member in message.mentions
            if bot.user is None or member.id != bot.user.id
        ]

        if not targets:
            await message.reply(
                "Member ko mention karo. Example: kick @member",
                mention_author=False
            )
            return True

        member = targets[0]

        reason_match = re.search(
            r"\breason\s+(.+)",
            prompt,
            re.IGNORECASE
        )

        reason = (
            reason_match.group(1).strip()
            if reason_match
            else "No reason provided"
        )

        async def execute_kick():

            if not is_developer(actor):
                raise PermissionError(
                    "Developer access required."
                )

            return await kick_member(
                guild,
                actor,
                member,
                reason
            )

        view = ActionConfirmView(
            actor.id,
            execute_kick
        )

        await message.reply(
            f"**ELYX ACTION APPROVAL**\n\n"
            f"Kick member: {member.mention}\n"
            f"Reason: {reason}\n\n"
            f"Confirm karne par member kick hoga.",
            view=view,
            mention_author=False
        )

        return True

    # ---------- BAN MEMBER ----------

    if re.search(r"\bban\b", text):

        targets = [
            member
            for member in message.mentions
            if bot.user is None or member.id != bot.user.id
        ]

        if not targets:
            await message.reply(
                "Member ko mention karo. Example: ban @member",
                mention_author=False
            )
            return True

        member = targets[0]

        reason_match = re.search(
            r"\breason\s+(.+)",
            prompt,
            re.IGNORECASE
        )

        reason = (
            reason_match.group(1).strip()
            if reason_match
            else "No reason provided"
        )

        async def execute_ban():

            if not is_developer(actor):
                raise PermissionError(
                    "Developer access required."
                )

            return await ban_member(
                guild,
                actor,
                member,
                reason
            )

        view = ActionConfirmView(
            actor.id,
            execute_ban
        )

        await message.reply(
            f"**ELYX ACTION APPROVAL**\n\n"
            f"Ban member: {member.mention}\n"
            f"Reason: {reason}\n\n"
            f"Confirm karne par member ban hoga.",
            view=view,
            mention_author=False
        )

        return True

    # ---------- TEXT CHANNEL CREATION ----------

    if action_requested and "channel" in text:

        hashtag = re.search(
            r"#([a-z0-9][a-z0-9_-]{0,90})",
            text
        )

        if hashtag:

            channel_name = hashtag.group(1)

        else:

            named = re.search(
                r"(?:named|called|naam)\s+([a-z0-9][a-z0-9_-]{0,90})",
                text
            )

            if not named:
                await message.reply(
                    "Channel ka naam batao. Example: #elyx-chat",
                    mention_author=False
                )
                return True

            channel_name = named.group(1)

        existing = discord.utils.get(
            guild.text_channels,
            name=channel_name
        )

        if existing:
            await message.reply(
                f"#{channel_name} already exists.",
                mention_author=False
            )
            return True

        async def execute_creation():

            if not is_developer(actor):
                raise PermissionError(
                    "Developer access required."
                )

            return await create_text_channel(
                guild,
                actor,
                channel_name
            )

        view = ActionConfirmView(
            actor.id,
            execute_creation
        )

        await message.reply(
            f"**ELYX ACTION APPROVAL**\n\n"
            f"Create channel: `#{channel_name}`\n\n"
            f"Confirm karne par channel create hoga.",
            view=view,
            mention_author=False
        )

        return True

    return False

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

    if access_level == "developer":

        handled = await handle_natural_discord_action(
            message,
            prompt
        )

        if handled:
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
                access_level,
                message.author.id
            )

            response = await generate_reply(messages)

            if not isinstance(response, str) or not response.strip():
                raise RuntimeError(
                    "AI returned an empty response."
                )

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
                await send_response(
                    message,
                    remaining
                )

        except AIUnavailableError:

            await thinking.edit(
                content="ELYX AI is temporarily unavailable. Please try again."
            )

        except Exception:

            logger.exception("AI response failed.")

            await thinking.edit(
                content="Something went wrong. Please try again."
            )


# ================= SERVER MANAGEMENT =================

@bot.command(name="kick")
@commands.guild_only()
async def kick_command(
    ctx,
    member: discord.Member,
    *,
    reason="No reason provided"
):

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
async def ban_command(
    ctx,
    member: discord.Member,
    *,
    reason="No reason provided"
):

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
async def nickname_command(
    ctx,
    member: discord.Member,
    *,
    nickname
):

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
async def delete_channel_command(
    ctx,
    channel: discord.TextChannel
):

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
async def add_role_command(
    ctx,
    member: discord.Member,
    role: discord.Role
):

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
async def remove_role_command(
    ctx,
    member: discord.Member,
    role: discord.Role
):

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
        lines = content.splitlines()

        summary = (
            f"**File:** `{filename}`\n"
            f"**Lines:** {len(lines)}\n"
            f"**Characters:** {len(content)}\n\n"
            f"```python\n"
            f"{content[:1500]}\n"
            f"```"
        )

        await ctx.reply(
            summary,
            mention_author=False
        )

        if len(content) > 1500:
            await ctx.send(
                "File has more content. Use the file-reading workflow to inspect the remaining code."
            )

    except Exception:

        logger.exception(
            "Project file read failed."
        )

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
            raise RuntimeError(
                "Invalid code review response."
            )

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
                + "\n".join(
                    str(item)
                    for item in errors[:5]
                ),
                mention_author=False
            )

            return

        warnings = review.get("warnings") or []

        warning_text = (
            "\n".join(
                str(item)
                for item in warnings[:5]
            )
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

            if not is_developer(ctx.author):
                raise PermissionError(
                    "Developer access is no longer available."
                )

            result = await builder.update_file(
                filename,
                new_content,
                approved=True,
                commit_message=(
                    f"Update {filename} through Elyx Developer"
                )
            )

            if not isinstance(result, dict):
                raise RuntimeError(
                    "Invalid GitHub response."
                )

            if not result.get("success"):
                raise RuntimeError(
                    result.get(
                        "message",
                        "GitHub update failed."
                    )
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

        logger.exception(
            "Code update workflow failed."
        )

        await ctx.reply(
            "Code update failed. Check the bot logs.",
            mention_author=False
        )


# ================= EVENTS =================

@bot.event
async def on_ready():

    logger.info(
        "ELYX TRADING AI DEVELOPER ONLINE"
    )

    logger.info(
        "Bot: %s",
        bot.user
    )

    logger.info(
        "Connected servers: %s",
        len(bot.guilds)
    )


@bot.event
async def on_message(message):

    if message.author.bot:
        return

    try:

        if bot.user and bot.user in message.mentions:
            await handle_ai(message)

    except Exception:

        logger.exception(
            "Message handler failed."
        )

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
        "Natural language channel, role, kick and ban actions are supported.\n"
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

    logger.info(
        "Memory database initialized."
    )

    bot.run(TOKEN)


if __name__ == "__main__":
    main()
