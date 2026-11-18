import os
import re
import json
import asyncio
import logging
from datetime import timedelta

import discord
from discord.ext import commands
from dotenv import load_dotenv

from ai_brain import generate_reply, AIUnavailableError

from memory import (
    initialize_memory,
    recall,
    recall_project,
)

from tools_hard import (
    HardAccessError,
    has_developer_access,
    kick_member,
    ban_member,
    timeout_member,
    change_nickname,
    create_category,
    create_text_channel,
    delete_channel,
    create_role,
    set_member_role,
)

from self_coder import (
    validate_file_path,
    read_project_file,
    review_code_change,
)

from github_builder import GitHubBuilder


# ==========================================
# CONFIGURATION
# ==========================================

load_dotenv()

TOKEN = (
    os.getenv("DISCORD_TOKEN")
    or os.getenv("DISCORD_BOT_TOKEN")
    or os.getenv("BOT_TOKEN")
    or os.getenv("TOKEN")
)

PREFIX = "!"

DEVELOPER_ROLE_ID = 1572448688700391454

MAX_HISTORY = 12
MAX_MESSAGE_LENGTH = 1900
MAX_CODE_SIZE = 100000
MAX_PROJECT_SNAPSHOT = 12000

CODING_REQUEST_TIMEOUT = 180

PROJECT_FILES = [
    "main.py",
    "ai_brain.py",
    "tools_hard.py",
    "tools_normal.py",
    "self_coder.py",
    "memory.py",
    "database.py",
    "github_builder.py",
    "code_tester.py",
    "requirements.txt",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger("ELYX_TRADING")

USER_HISTORY = {}
CODING_SESSIONS = {}

MEMORY_READY = False


# ==========================================
# DISCORD BOT
# ==========================================

intents = discord.Intents.default()

intents.guilds = True
intents.members = True
intents.messages = True
intents.message_content = True

bot = commands.Bot(
    command_prefix=PREFIX,
    intents=intents,
    help_command=None,
)


# ==========================================
# ACCESS CONTROL
# ==========================================

def is_developer(member):

    if not isinstance(member, discord.Member):
        return False

    if member.guild.owner_id == member.id:
        return True

    return has_developer_access(member)


def is_bot_mentioned(message):

    return bot.user is not None and bot.user in message.mentions


def clean_bot_mention(content):

    if bot.user is None:
        return content.strip()

    content = re.sub(
        rf"<@!?{bot.user.id}>",
        "",
        content,
    )

    return content.strip()


# ==========================================
# MESSAGE UTILITIES
# ==========================================

async def send_long_message(channel, content):

    if not content:
        content = "Mujhe koi response nahi mila."

    content = str(content)

    for index in range(0, len(content), MAX_MESSAGE_LENGTH):

        chunk = content[index:index + MAX_MESSAGE_LENGTH]

        await channel.send(
            chunk,
            allowed_mentions=discord.AllowedMentions.none(),
        )


def create_embed(title, description, colour=discord.Colour.blurple()):

    embed = discord.Embed(
        title=title,
        description=description,
        colour=colour,
    )

    embed.set_footer(
        text="ELYX TRADING • AI DEVELOPER"
    )

    return embed


# ==========================================
# MEMORY SYSTEM
# ==========================================

def get_user_memories(user_id):

    try:
        memories = recall(
            str(user_id),
            limit=5,
        )

        if not memories:
            return ""

        return str(memories)[:4000]

    except Exception:

        logger.exception("User memory retrieval failed.")

        return ""


def get_project_memories():

    try:
        memories = recall_project(limit=10)

        if not memories:
            return ""

        return str(memories)[:5000]

    except Exception:

        logger.exception("Project memory retrieval failed.")

        return ""


# ==========================================
# NORMAL AI
# ==========================================

async def handle_normal_ai_message(message):

    user_id = str(message.author.id)

    prompt = clean_bot_mention(message.content)

    if not prompt:
        prompt = "Hello!"

    history = USER_HISTORY.setdefault(user_id, [])

    memory_context = get_user_memories(user_id)

    messages = list(history)

    if memory_context:
        messages.append({
            "role": "user",
            "content": (
                "Relevant saved user memories:\n"
                + memory_context
            ),
        })

    messages.append({
        "role": "user",
        "content": prompt,
    })

    try:

        async with message.channel.typing():

            reply = await generate_reply(messages)

        if not isinstance(reply, str) or not reply.strip():
            reply = "Mujhe response generate karne mein problem hui."

        history.append({
            "role": "user",
            "content": prompt,
        })

        history.append({
            "role": "assistant",
            "content": reply,
        })

        USER_HISTORY[user_id] = history[-MAX_HISTORY:]

        await send_long_message(
            message.channel,
            reply,
        )

    except AIUnavailableError:

        await message.channel.send(
            "AI abhi available nahi hai. Thodi der baad try karo."
        )

    except Exception:

        logger.exception("Normal AI failed.")

        await message.channel.send(
            "Response generate karte waqt error aa gaya."
        )


# ==========================================
# CODING REQUEST DETECTION
# ==========================================

CODING_KEYWORDS = [
    "code",
    "coding",
    "developer",
    "program",
    "programming",
    "python",
    "javascript",
    "discord bot",
    "command banao",
    "command create",
    "feature banao",
    "feature add",
    "add feature",
    "create feature",
    "new feature",
    "function banao",
    "file banao",
    "create file",
    "new file",
    "bug fix",
    "error fix",
    "fix code",
    "fix karo",
    "fix kar",
    "update code",
    "modify",
    "edit file",
    "github",
    "leaderboard",
    "ticket system",
    "invite system",
    "game system",
    "economy system",
    "database",
    "api integration",
    "integration",
    "bot mein",
    "bot me",
    "system add",
    "system banao",
    "system create",
]


def looks_like_coding_request(prompt):

    text = prompt.lower()

    return any(
        keyword in text
        for keyword in CODING_KEYWORDS
    )


# ==========================================
# PROJECT SNAPSHOT
# ==========================================

def build_project_snapshot():

    snapshot = []
    total_size = 0

    for filename in PROJECT_FILES:

        try:

            content = read_project_file(filename)

            remaining = MAX_PROJECT_SNAPSHOT - total_size

            if remaining <= 0:
                break

            content = content[:remaining]

            section = (
                f"\n\n===== FILE: {filename} =====\n"
                f"{content}\n"
            )

            snapshot.append(section)

            total_size += len(section)

        except FileNotFoundError:

            continue

        except Exception as error:

            logger.warning(
                "Could not read %s: %s",
                filename,
                error,
            )

    return "\n".join(snapshot)


# ==========================================
# CODING AGENT INSTRUCTIONS
# ==========================================

CODING_AGENT_SYSTEM = """
You are ELYX TRADING AI DEVELOPER.

You are a general-purpose Python Discord bot coding agent.

The user may speak Hindi, Hinglish or English.

Your job:
1. Understand the requested development task.
2. Inspect the supplied project files.
3. Identify the exact files that need changes.
4. Produce complete replacement contents for changed files.
5. Preserve existing working features.
6. Do not invent functions that do not exist.
7. Do not claim that code has been tested unless it was tested.
8. Do not claim GitHub was updated unless the GitHub operation succeeded.
9. Never reveal tokens, API keys or secrets.
10. Do not create fake success messages.

IMPORTANT PROJECT RULES:

- Only use filenames from the supplied project.
- Existing files can be updated.
- New files cannot currently be created through the configured GitHubBuilder.
- Do not request changes to files unnecessarily.
- Preserve the existing Python discord.py architecture.
- Do not remove existing features unless explicitly requested.
- Never bypass confirmation for important Discord actions.
- Never bypass GitHub approval.

OUTPUT FORMAT:

Return ONLY valid JSON.

{
    "summary": "Short explanation of the changes",
    "changes": [
        {
            "file": "main.py",
            "content": "COMPLETE FILE CONTENT"
        }
    ]
}

Each changed file must contain its COMPLETE new content.

Do not return partial snippets.

If a requested task cannot be completed with the available project files,
return an empty changes list and explain the limitation in summary.
"""

# ==========================================
# CODE VALIDATION
# ==========================================

def validate_coding_result(data):

    from code_tester import validate_python_code

    if not isinstance(data, dict):
        raise ValueError("AI response must be a JSON object.")

    summary = data.get("summary", "")

    if not isinstance(summary, str):
        raise ValueError("Invalid change summary.")

    changes = data.get("changes", [])

    if not isinstance(changes, list):
        raise ValueError("Changes must be a list.")

    if not changes:
        return summary, []

    validated = []
    seen_files = set()

    for item in changes:

        if not isinstance(item, dict):
            raise ValueError("Invalid file change format.")

        filename = item.get("file")
        content = item.get("content")

        if not isinstance(filename, str):
            raise ValueError("File name must be text.")

        if not isinstance(content, str):
            raise ValueError("File content must be text.")

        path = validate_file_path(filename)
        filename = path.name

        if filename in seen_files:
            raise ValueError(
                f"Duplicate file in AI response: {filename}"
            )

        seen_files.add(filename)

        if len(content.encode("utf-8")) > MAX_CODE_SIZE:
            raise ValueError(
                f"{filename} exceeds the 100 KB size limit."
            )

        # Existing GitHub Builder cannot create new files.
        if not path.exists():
            raise ValueError(
                f"{filename} does not exist locally. "
                "New file creation is not supported by the current GitHubBuilder."
            )

        review = review_code_change(
            filename,
            content,
        )

        if not review.get("valid"):
            errors = "\n".join(review.get("errors", []))

            raise ValueError(
                f"Validation failed for {filename}:\n{errors}"
            )

        if filename.endswith(".py"):

            syntax_check = validate_python_code(content)

            if not syntax_check.get("valid"):
                errors = "\n".join(
                    syntax_check.get("errors", [])
                )

                raise ValueError(
                    f"Python syntax error in {filename}:\n{errors}"
                )

        validated.append({
            "file": filename,
            "content": content,
            "warnings": review.get("warnings", []),
        })

    return summary, validated


# ==========================================
# AI JSON PARSER
# ==========================================

def parse_coding_json(raw):

    if not isinstance(raw, str):
        raise ValueError("AI returned an invalid response.")

    text = raw.strip()

    # Remove optional Markdown code fences.
    if text.startswith("```"):

        text = re.sub(
            r"^```(?:json)?\s*",
            "",
            text,
            count=1,
            flags=re.IGNORECASE,
        )

        text = re.sub(
            r"\s*```$",
            "",
            text,
            count=1,
        )

    try:

        data = json.loads(text)

    except json.JSONDecodeError:

        # Try extracting a JSON object from surrounding text.
        start = text.find("{")
        end = text.rfind("}")

        if start == -1 or end <= start:
            raise ValueError("AI did not return valid JSON.")

        data = json.loads(text[start:end + 1])

    if not isinstance(data, dict):
        raise ValueError("AI response is not a JSON object.")

    return data


# ==========================================
# GITHUB CHANGE PREPARATION
# ==========================================

async def prepare_github_changes(changes):

    builder = GitHubBuilder()

    prepared = []

    for change in changes:

        filename = change["file"]

        current = await builder.get_file(filename)

        if not current.get("success"):

            raise ValueError(
                f"Cannot retrieve {filename} from GitHub: "
                f"{current.get('message', 'Unknown error')}"
            )

        prepared.append({
            "file": filename,
            "content": change["content"],
            "old_content": current["content"],
            "old_sha": current["sha"],
            "warnings": change.get("warnings", []),
        })

    return prepared


# ==========================================
# GITHUB APPROVAL VIEW
# ==========================================

class CodingApprovalView(discord.ui.View):

    def __init__(
        self,
        author_id,
        changes,
        summary,
    ):

        super().__init__(timeout=300)

        self.author_id = author_id
        self.changes = changes
        self.summary = summary
        self.finished = False

    async def interaction_check(self, interaction):

        if interaction.user.id != self.author_id:

            await interaction.response.send_message(
                "Ye approval sirf request karne wala developer de sakta hai.",
                ephemeral=True,
            )

            return False

        if not is_developer(interaction.user):

            await interaction.response.send_message(
                "Developer access required.",
                ephemeral=True,
            )

            return False

        return True

    async def on_timeout(self):

        self.finished = True

        for item in self.children:
            item.disabled = True

    @discord.ui.button(
        label="Save to GitHub",
        style=discord.ButtonStyle.success,
    )
    async def approve(
        self,
        interaction,
        button,
    ):

        if self.finished:
            await interaction.response.send_message(
                "This approval has expired.",
                ephemeral=True,
            )
            return

        self.finished = True

        for item in self.children:
            item.disabled = True

        await interaction.response.edit_message(
            content="GitHub update process started. Please wait...",
            view=self,
        )

        try:

            results = await commit_coding_changes(
                self.changes,
                self.summary,
            )

            successful = [
                result for result in results
                if result.get("success")
            ]

            failed = [
                result for result in results
                if not result.get("success")
            ]

            lines = []

            for result in successful:
                lines.append(
                    f"SUCCESS: {result['file']}"
                )

            for result in failed:
                lines.append(
                    f"FAILED: {result['file']} — "
                    f"{result.get('message', 'Unknown error')}"
                )

            if failed:
                lines.append(
                    "\nSome files could not be updated. "
                    "Check GitHub before retrying."
                )

            elif successful:
                lines.append(
                    "\nAll requested GitHub updates succeeded."
                )

            else:
                lines.append(
                    "No files were updated."
                )

            await send_long_message(
                interaction.channel,
                "\n".join(lines),
            )

        except Exception:

            logger.exception("GitHub approval failed.")

            await send_long_message(
                interaction.channel,
                "GitHub update failed. Check the logs and repository.",
            )

    @discord.ui.button(
        label="Cancel",
        style=discord.ButtonStyle.danger,
    )
    async def cancel(
        self,
        interaction,
        button,
    ):

        self.finished = True

        for item in self.children:
            item.disabled = True

        await interaction.response.edit_message(
            content="GitHub changes cancelled. No update was requested.",
            view=self,
        )


# ==========================================
# GITHUB COMMIT FUNCTION
# ==========================================

async def commit_coding_changes(
    changes,
    commit_message,
):

    builder = GitHubBuilder()

    results = []

    for change in changes:

        filename = change["file"]

        # Re-check the latest GitHub version before updating.
        current = await builder.get_file(filename)

        if not current.get("success"):

            results.append({
                "success": False,
                "file": filename,
                "message": current.get("message"),
            })

            continue

        # Prevent overwriting a file changed by someone else
        # after the approval preview was created.
        if current.get("sha") != change.get("old_sha"):

            results.append({
                "success": False,
                "file": filename,
                "message": (
                    "GitHub file changed after approval preview. "
                    "Generate a fresh proposal."
                ),
            })

            continue

        try:

            result = await builder.update_file(
                file_path=filename,
                new_content=change["content"],
                approved=True,
                commit_message=(
                    f"{commit_message} - {filename}"
                ),
            )

            results.append({
                "success": bool(result.get("success")),
                "file": filename,
                "message": result.get("message"),
            })

        except Exception as error:

            logger.exception(
                "GitHub update failed for %s",
                filename,
            )

            results.append({
                "success": False,
                "file": filename,
                "message": str(error)[:300],
            })

    return results


# ==========================================
# CODING AGENT
# ==========================================

async def run_coding_agent(message, prompt):

    author = message.author

    if not is_developer(author):

        await message.channel.send(
            "Elyx Developer access required."
        )

        return

    user_id = str(author.id)

    history = USER_HISTORY.setdefault(user_id, [])

    project_snapshot = build_project_snapshot()

    project_memory = get_project_memories()

    coding_messages = [
        {
            "role": "user",
            "content": CODING_AGENT_SYSTEM,
        },
        {
            "role": "user",
            "content": (
                "CURRENT ELYX PROJECT FILES:\n\n"
                + project_snapshot
            ),
        },
    ]

    if project_memory:

        coding_messages.append({
            "role": "user",
            "content": (
                "SAVED PROJECT DECISIONS:\n\n"
                + project_memory
            ),
        })

    coding_messages.extend(history[-MAX_HISTORY:])

    coding_messages.append({
        "role": "user",
        "content": (
            "DEVELOPER REQUEST:\n"
            + prompt
            + "\n\nReturn the required JSON only."
        ),
    })

    try:

        async with message.channel.typing():

            raw_response = await asyncio.wait_for(
                generate_reply(coding_messages),
                timeout=CODING_REQUEST_TIMEOUT,
            )

        data = parse_coding_json(raw_response)

        summary, changes = validate_coding_result(data)

        if not changes:

            await send_long_message(
                message.channel,
                (
                    "Developer analysis:\n"
                    + summary
                    + "\n\nNo file changes were proposed."
                ),
            )

            return

        async with message.channel.typing():

            prepared = await prepare_github_changes(changes)

        # Keep a history of the developer's request and response.
        history.append({
            "role": "user",
            "content": prompt,
        })

        history.append({
            "role": "assistant",
            "content": summary,
        })

        USER_HISTORY[user_id] = history[-MAX_HISTORY:]

        file_list = "\n".join(
            f"• {item['file']}"
            for item in prepared
        )

        warning_lines = []

        for item in prepared:

            for warning in item.get("warnings", []):

                warning_lines.append(
                    f"{item['file']}: {warning}"
                )

        description = (
            f"**Summary:**\n{summary[:2500]}\n\n"
            f"**Files to update:**\n{file_list}\n\n"
            "**Status:** Waiting for your approval."
        )

        if warning_lines:

            description += (
                "\n\n**Review warnings:**\n"
                + "\n".join(warning_lines)[:1000]
            )

        embed = create_embed(
            "ELYX • CODE CHANGE PROPOSAL",
            description,
            discord.Colour.gold(),
        )

        view = CodingApprovalView(
            author_id=author.id,
            changes=prepared,
            summary=summary,
        )

        await message.channel.send(
            embed=embed,
            view=view,
        )

    except asyncio.TimeoutError:

        await message.channel.send(
            "Coding request timed out. Please try again."
        )

    except AIUnavailableError:

        await message.channel.send(
            "AI providers are currently unavailable."
        )

    except ValueError as error:

        logger.warning(
            "Coding proposal rejected: %s",
            error,
        )

        await send_long_message(
            message.channel,
            f"Code proposal rejected:\n{error}",
        )

    except Exception:

        logger.exception("Coding agent failed.")

        await message.channel.send(
            "Coding agent mein error aaya. Logs check karo."
        )


# ==========================================
# DEVELOPER REQUEST HANDLER
# ==========================================

async def handle_developer_request(message, prompt):

    if not is_developer(message.author):

        await message.channel.send(
            "Elyx Developer access required."
        )

        return

    if not prompt.strip():

        await message.channel.send(
            "Kya development karna hai? Apni request likho."
        )

        return

    await run_coding_agent(
        message,
        prompt,
)

# ==========================================
# HARD ACTION PARSER
# ==========================================

def parse_hard_action(prompt):

    text = prompt.strip()

    # --------------------------------------
    # CREATE CATEGORY
    # Example:
    # Elyx Games naam ki category banao
    # Create category Elyx Games
    # --------------------------------------

    patterns = [
        r"^(?P<name>.+?)\s+naam\s+ki\s+category\s+banao$",
        r"^category\s+(?P<name>.+?)\s+banao$",
        r"^create\s+category\s+(?P<name>.+)$",
        r"^category\s+(?P<name>.+?)\s+create\s+karo$",
    ]

    for pattern in patterns:

        match = re.fullmatch(
            pattern,
            text,
            re.IGNORECASE,
        )

        if match:

            return {
                "type": "create_category",
                "name": match.group("name").strip(),
            }

    # --------------------------------------
    # CREATE CHANNEL INSIDE CATEGORY
    # Example:
    # battle-room channel Elyx Games
    # category mein banao
    # --------------------------------------

    patterns = [
        (
            r"^(?P<channel>.+?)\s+channel\s+"
            r"(?P<category>.+?)\s+category\s+mein\s+banao$"
        ),
        (
            r"^create\s+channel\s+(?P<channel>.+?)\s+"
            r"in\s+category\s+(?P<category>.+)$"
        ),
    ]

    for pattern in patterns:

        match = re.fullmatch(
            pattern,
            text,
            re.IGNORECASE,
        )

        if match:

            return {
                "type": "create_channel",
                "name": match.group("channel").strip(),
                "category": match.group("category").strip(),
            }

    # --------------------------------------
    # CREATE CHANNEL WITHOUT CATEGORY
    # --------------------------------------

    patterns = [
        r"^channel\s+(?P<name>.+?)\s+banao$",
        r"^(?P<name>.+?)\s+channel\s+banao$",
        r"^create\s+channel\s+(?P<name>.+)$",
    ]

    for pattern in patterns:

        match = re.fullmatch(
            pattern,
            text,
            re.IGNORECASE,
        )

        if match:

            return {
                "type": "create_channel",
                "name": match.group("name").strip(),
                "category": None,
            }

    # --------------------------------------
    # CREATE ROLE
    # Example:
    # Battle Manager role banao
    # Create role Battle Manager
    # --------------------------------------

    patterns = [
        r"^(?P<name>.+?)\s+role\s+banao$",
        r"^role\s+(?P<name>.+?)\s+banao$",
        r"^create\s+role\s+(?P<name>.+)$",
    ]

    for pattern in patterns:

        match = re.fullmatch(
            pattern,
            text,
            re.IGNORECASE,
        )

        if match:

            return {
                "type": "create_role",
                "name": match.group("name").strip(),
            }

    # --------------------------------------
    # KICK MEMBER
    # --------------------------------------

    match = re.fullmatch(
        r"kick\s+(?:member\s+)?(?P<target><@!?\d{15,22}>)",
        text,
        re.IGNORECASE,
    )

    if match:

        return {
            "type": "kick",
            "target": match.group("target"),
        }

    # --------------------------------------
    # BAN MEMBER
    # --------------------------------------

    match = re.fullmatch(
        r"ban\s+(?:member\s+)?(?P<target><@!?\d{15,22}>)",
        text,
        re.IGNORECASE,
    )

    if match:

        return {
            "type": "ban",
            "target": match.group("target"),
        }

    # --------------------------------------
    # TIMEOUT MEMBER
    # Example: timeout @member 10
    # Duration is in minutes.
    # --------------------------------------

    match = re.fullmatch(
        r"timeout\s+(?P<target><@!?\d{15,22}>)\s+"
        r"(?P<minutes>\d+)",
        text,
        re.IGNORECASE,
    )

    if match:

        return {
            "type": "timeout",
            "target": match.group("target"),
            "minutes": int(match.group("minutes")),
        }

    # --------------------------------------
    # DELETE CHANNEL
    # --------------------------------------

    match = re.fullmatch(
        r"delete\s+channel\s+(?P<target><#\d{15,22}>)",
        text,
        re.IGNORECASE,
    )

    if match:

        return {
            "type": "delete_channel",
            "target": match.group("target"),
        }

    return None


# ==========================================
# HARD ACTION EXECUTION
# ==========================================

async def execute_hard_action(guild, actor, action):

    action_type = action["type"]

    if action_type == "create_category":

        category = await create_category(
            guild,
            actor,
            action["name"],
        )

        return (
            f"Category **{category.name}** created successfully."
        )

    if action_type == "create_channel":

        channel = await create_text_channel(
            guild,
            actor,
            action["name"],
            category=action.get("category"),
        )

        return channel

    if action_type == "create_role":

        return await create_role(
            guild,
            actor,
            action["name"],
        )

    if action_type == "kick":

        return await kick_member(
            guild,
            actor,
            action["target"],
        )

    if action_type == "ban":

        return await ban_member(
            guild,
            actor,
            action["target"],
        )

    if action_type == "timeout":

        return await timeout_member(
            guild,
            actor,
            action["target"],
            action["minutes"],
        )

    if action_type == "delete_channel":

        return await delete_channel(
            guild,
            actor,
            action["target"],
        )

    raise HardAccessError(
        "Unknown hard action."
    )


# ==========================================
# ACTION CONFIRMATION VIEW
# ==========================================

class HardActionConfirmationView(discord.ui.View):

    def __init__(self, actor_id, guild, action):

        super().__init__(timeout=120)

        self.actor_id = actor_id
        self.guild = guild
        self.action = action
        self.finished = False

    async def interaction_check(self, interaction):

        if interaction.user.id != self.actor_id:

            await interaction.response.send_message(
                "Sirf original developer is action ko confirm kar sakta hai.",
                ephemeral=True,
            )

            return False

        if not is_developer(interaction.user):

            await interaction.response.send_message(
                "Developer access required.",
                ephemeral=True,
            )

            return False

        return True

    async def on_timeout(self):

        self.finished = True

        for item in self.children:
            item.disabled = True

    @discord.ui.button(
        label="Confirm Action",
        style=discord.ButtonStyle.success,
    )
    async def confirm(self, interaction, button):

        if self.finished:

            await interaction.response.send_message(
                "Confirmation expired.",
                ephemeral=True,
            )

            return

        self.finished = True

        for item in self.children:
            item.disabled = True

        await interaction.response.edit_message(
            content="Action confirmed. Processing...",
            view=self,
        )

        try:

            result = await execute_hard_action(
                self.guild,
                interaction.user,
                self.action,
            )

            await send_long_message(
                interaction.channel,
                f"SUCCESS: {result}",
            )

        except HardAccessError as error:

            await send_long_message(
                interaction.channel,
                f"Action blocked: {error}",
            )

        except discord.Forbidden:

            await send_long_message(
                interaction.channel,
                "Discord permission denied. Check bot permissions and role hierarchy.",
            )

        except discord.NotFound:

            await send_long_message(
                interaction.channel,
                "Requested Discord member/channel was not found.",
            )

        except Exception:

            logger.exception("Hard action failed.")

            await send_long_message(
                interaction.channel,
                "Action failed due to an unexpected error. Check logs.",
            )

    @discord.ui.button(
        label="Cancel",
        style=discord.ButtonStyle.danger,
    )
    async def cancel(self, interaction, button):

        self.finished = True

        for item in self.children:
            item.disabled = True

        await interaction.response.edit_message(
            content="Action cancelled. No Discord changes were made.",
            view=self,
        )


# ==========================================
# HARD ACTION REQUEST HANDLER
# ==========================================

async def handle_hard_action_request(message, action):

    if not is_developer(message.author):

        await message.channel.send(
            "Elyx Developer access required."
        )

        return

    action_type = action["type"]

    if action_type == "create_category":

        description = (
            f"Create category: **{action['name']}**"
        )

    elif action_type == "create_channel":

        category = action.get("category")

        description = (
            f"Create channel: **{action['name']}**"
        )

        if category:
            description += (
                f"\nInside category: **{category}**"
            )

    elif action_type == "create_role":

        description = (
            f"Create role: **{action['name']}**"
        )

    elif action_type in ("kick", "ban"):

        description = (
            f"{action_type.upper()} member: "
            f"{action['target']}"
        )

    elif action_type == "timeout":

        description = (
            f"Timeout member: {action['target']}\n"
            f"Duration: {action['minutes']} minutes"
        )

    elif action_type == "delete_channel":

        description = (
            f"Delete channel: {action['target']}"
        )

    else:

        await message.channel.send(
            "Unknown action."
        )

        return

    embed = create_embed(
        "ELYX • ACTION CONFIRMATION",
        (
            f"{description}\n\n"
            "**No changes have been made yet.**\n"
            "Confirm only if this action is correct."
        ),
        discord.Colour.gold(),
    )

    view = HardActionConfirmationView(
        actor_id=message.author.id,
        guild=message.guild,
        action=action,
    )

    await message.channel.send(
        embed=embed,
        view=view,
    )


# ==========================================
# MESSAGE HANDLER
# ==========================================

@bot.event
async def on_message(message):

    if message.author.bot:
        return

    # Prefix commands are handled by discord.py.
    if message.content.startswith(PREFIX):

        await bot.process_commands(message)

        return

    if message.guild is None:
        return

    mentioned = is_bot_mentioned(message)

    # --------------------------------------
    # DEVELOPER ACCESS
    # --------------------------------------

    if is_developer(message.author):

        prompt = clean_bot_mention(
            message.content
        )

        if not prompt:
            return

        # Hard actions always require confirmation.
        action = parse_hard_action(prompt)

        if action:

            await handle_hard_action_request(
                message,
                action,
            )

            return

        # Developer coding requests.
        if looks_like_coding_request(prompt):

            await handle_developer_request(
                message,
                prompt,
            )

            return

        # Normal AI response if developer mentions bot.
        if mentioned:

            await handle_normal_ai_message(
                message
            )

        return

    # --------------------------------------
    # NORMAL MEMBERS
    # --------------------------------------

    # Normal members can only access normal AI
    # by mentioning Elyx Trading.
    if mentioned:

        await handle_normal_ai_message(
            message
        )


# ==========================================
# READY EVENT
# ==========================================

@bot.event
async def on_ready():

    logger.info(
        "Logged in as %s (%s)",
        bot.user,
        bot.user.id,
    )

    await bot.change_presence(
        activity=discord.Activity(
            type=discord.ActivityType.watching,
            name="Elyx Trading",
        ),
        status=discord.Status.online,
    )


# ==========================================
# STARTUP
# ==========================================

async def start_bot():

    global MEMORY_READY

    if not TOKEN:

        raise RuntimeError(
            "Discord bot token is missing. "
            "Set DISCORD_TOKEN in FadeHost environment variables."
        )

    # initialize_memory is synchronous.
    initialize_memory()

    MEMORY_READY = True

    logger.info(
        "Elyx Trading memory initialized."
    )

    await bot.start(TOKEN)


# ==========================================
# RUN BOT
# ==========================================

if __name__ == "__main__":

    try:

        asyncio.run(start_bot())

    except KeyboardInterrupt:

        logger.info(
            "Elyx Trading bot stopped."
        )
