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
from tools_normal import get_access_level
from memory import initialize_memory, recall, recall_project

from tools_hard import (
    kick_member,
    ban_member,
    change_nickname,
    create_category,
    create_text_channel,
    delete_channel,
    create_role,
    set_member_role,
    timeout_member,
)

from self_coder import (
    validate_file_path,
    read_project_file,
    review_code_change,
)

from github_builder import GitHubBuilder


# ============================================================
# ELYX TRADING AI DEVELOPER
# MAIN.PY — PART 1/3
# ============================================================


# ================= CONFIG =================

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
MAX_PROJECT_FILE_SIZE = 100000

CODING_REQUEST_TIMEOUT = 180

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger("ELYX_AI")


# ================= GLOBAL STATE =================

CONVERSATIONS = {}
USER_LOCKS = {}

# Developer coding sessions.
# Keeps the current coding workflow separate from normal AI chat.
CODING_SESSIONS = {}


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


# ============================================================
# ACCESS SYSTEM
# ============================================================

def has_developer_role(member):

    if not isinstance(member, discord.Member):
        return False

    if member.guild is None:
        return False

    # Server owner always has developer-level access.
    if member.id == member.guild.owner_id:
        return True

    return any(
        role.id == DEVELOPER_ROLE_ID
        for role in member.roles
    )


def is_developer(member):

    try:

        if has_developer_role(member):
            return True

        return get_access_level(member) == "developer"

    except Exception:

        logger.exception(
            "Developer access check failed."
        )

        return False


async def developer_only(ctx):

    if not is_developer(ctx.author):

        await ctx.reply(
            "You don't have permission to use the Elyx Developer system.",
            mention_author=False
        )

        return False

    return True


def get_access_level_for_member(member):

    if is_developer(member):
        return "developer"

    return "normal"


# ============================================================
# MEMORY
# ============================================================

def get_memory_context(user_id, access_level):

    context = []

    try:

        user_memories = recall(
            user_id,
            limit=5
        )

        for item in user_memories:

            content = item.get(
                "content",
                ""
            )

            if content:
                context.append(
                    f"User memory: {content}"
                )

    except Exception:

        logger.exception(
            "User memory retrieval failed."
        )

    if access_level == "developer":

        try:

            project_memories = recall_project(
                limit=10
            )

            for item in project_memories:

                content = item.get(
                    "content",
                    ""
                )

                if content:
                    context.append(
                        f"Elyx project memory: {content}"
                    )

        except Exception:

            logger.exception(
                "Project memory retrieval failed."
            )

    return "\n".join(context)


# ============================================================
# CONVERSATION SYSTEM
# ============================================================

def get_user_key(message):

    guild_id = (
        message.guild.id
        if message.guild
        else 0
    )

    return f"{guild_id}:{message.author.id}"


def get_user_lock(key):

    if key not in USER_LOCKS:

        USER_LOCKS[key] = asyncio.Lock()

    return USER_LOCKS[key]


def save_conversation(
    key,
    prompt,
    response
):

    history = CONVERSATIONS.setdefault(
        key,
        []
    )

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

    CONVERSATIONS[key] = history[
        -MAX_HISTORY:
    ]


# ============================================================
# AI CONTEXT
# ============================================================

def build_ai_context(
    message,
    prompt,
    access_level
):

    memory_context = get_memory_context(
        message.author.id,
        access_level
    )

    if access_level == "developer":

        access_context = """
ACCESS LEVEL: ELYX DEVELOPER

The user has Elyx Developer access.

This user is allowed to use the AI Developer Agent.

The Developer Agent is NOT limited to a fixed list of future
commands or features.

The user may describe a new Discord feature, command, game,
system, automation, UI, economy system, ticket system,
leaderboard, moderation feature, or other software requirement
in natural Hindi, Hinglish, or English.

The AI Developer Agent must understand the requirement and
work with the existing project instead of replying with generic
coding questions.

The agent may inspect project files, design an implementation,
modify existing code, create compatible code, review changes,
test changes, fix errors, and save approved changes.

Do NOT pretend a feature was created when no code was changed.

Do NOT claim GitHub was updated unless the GitHub operation
actually succeeded.

Do NOT bypass developer access.

For destructive or sensitive Discord actions, confirmation is
required before execution.

The goal is to behave like an AI software developer working
inside the Elyx Trading project.
"""

    else:

        access_context = """
ACCESS LEVEL: NORMAL MEMBER

This member does NOT have Elyx Developer access.

Provide normal AI assistance.

The member may talk to the bot naturally.

The member may ask normal questions, request normal assistance,
ask for clean memes or entertainment, and use features that are
explicitly available to normal members.

Do NOT expose project source code.

Do NOT expose GitHub information.

Do NOT perform developer coding operations.

Do NOT create, modify, delete, deploy, or commit project code
for this member.

Do NOT perform developer-only Discord administration.
"""

    result = access_context

    if memory_context:

        result += (
            "\n\nRELEVANT MEMORY:\n"
            + memory_context
        )

    return result


def get_ai_messages(
    message,
    prompt,
    access_level
):

    key = get_user_key(message)

    history = list(
        CONVERSATIONS.get(
            key,
            []
        )
    )

    context = build_ai_context(
        message,
        prompt,
        access_level
    )

    history.append({
        "role": "user",
        "content": (
            context
            + "\n\nCURRENT MEMBER MESSAGE:\n"
            + prompt
        )
    })

    return history


# ============================================================
# RESPONSE SENDER
# ============================================================

async def send_response(
    message,
    content
):

    content = str(
        content
    ).strip()

    if not content:
        return

    for start in range(
        0,
        len(content),
        MAX_MESSAGE_LENGTH
    ):

        part = content[
            start:
            start + MAX_MESSAGE_LENGTH
        ]

        await message.reply(
            part,
            mention_author=False,
            allowed_mentions=discord.AllowedMentions.none()
        )


# ============================================================
# CODING AGENT PROTOCOL
# ============================================================

CODING_AGENT_SYSTEM = """
You are ELYX TRADING AI DEVELOPER.

You are an autonomous software-development agent operating
inside a Discord bot project.

The user is the authorized Elyx Developer.

IMPORTANT:

This is NOT a fixed-command assistant.

The developer can request arbitrary software features in natural
Hindi, Hinglish, or English.

Examples:

- create an invite leaderboard
- create a ticket system
- add close button
- add transcript
- create a new game
- modify an existing command
- add buttons
- add database storage
- change an existing system
- fix a bug
- improve UI
- create an economy
- create a ranking system

You must reason about the requested implementation.

You must inspect existing project code before changing it.

Do not unnecessarily replace working systems.

Prefer minimal compatible changes.

Preserve existing architecture unless the requested feature
requires an architectural change.

When code changes are required, return machine-readable JSON.

The JSON format MUST be:

{
  "summary": "short description",
  "changes": [
    {
      "file": "filename.py",
      "content": "COMPLETE NEW FILE CONTENT"
    }
  ]
}

Only include files that actually need changes.

For an existing file, content must be the complete resulting file,
not a partial snippet.

Do not use markdown fences around the JSON.

Do not invent successful execution.

Do not claim tests passed unless testing was actually performed.

Do not modify secrets, tokens, credentials, or environment values.

Do not intentionally introduce malware, credential theft,
self-propagating code, destructive payloads, or other harmful code.

For normal Discord bot development, implement the requested
feature normally.
"""


def looks_like_coding_request(prompt):

    text = prompt.lower()

    coding_patterns = [
        "command bana",
        "command banao",
        "command banado",
        "feature bana",
        "feature banao",
        "system bana",
        "system banao",
        "bot me add",
        "bot mein add",
        "discord me add",
        "discord mein add",
        "code bana",
        "code banao",
        "coding kar",
        "coding karo",
        "develop",
        "developer",
        "implement",
        "create a command",
        "make a command",
        "create feature",
        "make feature",
        "create system",
        "make system",
        "add button",
        "add ticket",
        "add leaderboard",
        "leaderboard bana",
        "ticket bana",
        "game bana",
        "game banao",
        "naya command",
        "naya feature",
        "new command",
        "new feature",
        "fix code",
        "bug fix",
        "github me save",
        "github mein save",
        "github update"
    ]

    return any(
        pattern in text
        for pattern in coding_patterns
    )


def extract_json_response(response):

    if isinstance(response, dict):
        return response

    text = str(
        response
    ).strip()

    # Remove accidental markdown fences.
    text = re.sub(
        r"^```(?:json)?\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(
        r"\s*```$",
        "",
        text
    )

    try:

        return json.loads(text)

    except json.JSONDecodeError:

        # Try to locate the outer JSON object.
        start = text.find("{")
        end = text.rfind("}")

        if start != -1 and end > start:

            candidate = text[
                start:
                end + 1
            ]

            return json.loads(
                candidate
            )

        raise


# ============================================================
# PROJECT FILE HELPERS
# ============================================================

PROJECT_FILES = [
    "main.py",
    "ai_brain.py",
    "tools_hard.py",
    "tools_normal.py",
    "database.py",
    "memory.py",
    "code_tester.py",
    "self_coder.py",
    "github_builder.py",
    "requirements.txt",
]


def safe_read_project_file(filename):

    validate_file_path(
        filename
    )

    content = read_project_file(
        filename
    )

    if content is None:
        return None

    content = str(
        content
    )

    if len(content) > MAX_PROJECT_FILE_SIZE:
        return (
            content[:MAX_PROJECT_FILE_SIZE]
            + "\n\n[FILE TRUNCATED]"
        )

    return content


def build_project_snapshot():

    files = {}

    for filename in PROJECT_FILES:

        try:

            content = safe_read_project_file(
                filename
            )

            if content is not None:
                files[filename] = content

        except Exception:

            logger.warning(
                "Could not read project file: %s",
                filename
            )

    return files


def build_coding_messages(
    message,
    prompt,
    project_snapshot
):

    project_text = []

    for filename, content in project_snapshot.items():

        project_text.append(
            "\n===== FILE: "
            + filename
            + " =====\n"
            + content
        )

    project_context = "".join(
        project_text
    )

    developer_context = build_ai_context(
        message,
        prompt,
        "developer"
    )

    return [
        {
            "role": "system",
            "content": CODING_AGENT_SYSTEM
        },
        {
            "role": "user",
            "content": (
                developer_context
                + "\n\n"
                + "CURRENT PROJECT FILES:\n"
                + project_context
                + "\n\n"
                + "DEVELOPER REQUEST:\n"
                + prompt
                + "\n\n"
                + "Return the required code changes as JSON."
            )
        }
]

# ============================================================
# ELYX TRADING AI DEVELOPER
# MAIN.PY — PART 2/3
# ============================================================


# ============================================================
# CODE CHANGE VALIDATION
# ============================================================

def validate_coding_result(result):

    if not isinstance(result, dict):
        raise ValueError(
            "AI coding result is not a valid object."
        )

    changes = result.get("changes")

    if not isinstance(changes, list):
        raise ValueError(
            "AI coding result does not contain a valid changes list."
        )

    if not changes:
        raise ValueError(
            "AI did not produce any code changes."
        )

    validated = []

    for change in changes:

        if not isinstance(change, dict):
            raise ValueError(
                "Invalid code change entry."
            )

        filename = str(
            change.get("file", "")
        ).strip()

        content = change.get(
            "content"
        )

        if not filename:
            raise ValueError(
                "A code change is missing its filename."
            )

        if content is None:
            raise ValueError(
                f"Code content missing for {filename}."
            )

        content = str(content)

        if len(content) > MAX_CODE_SIZE:
            raise ValueError(
                f"{filename} exceeds the maximum allowed code size."
            )

        validate_file_path(
            filename
        )

        validated.append({
            "file": filename,
            "content": content
        })

    return validated


# ============================================================
# CODE REVIEW
# ============================================================

def review_generated_change(
    filename,
    content
):

    review = review_code_change(
        filename,
        content
    )

    if not isinstance(review, dict):
        raise RuntimeError(
            f"Code review returned an invalid result for {filename}."
        )

    errors = review.get(
        "errors"
    ) or []

    if isinstance(errors, str):
        errors = [errors]

    if review.get("error"):
        errors.append(
            review["error"]
        )

    passed = review.get(
        "review_passed",
        review.get(
            "valid",
            not errors
        )
    )

    warnings = review.get(
        "warnings"
    ) or []

    if isinstance(warnings, str):
        warnings = [warnings]

    return {
        "passed": bool(
            passed and not errors
        ),
        "errors": [
            str(item)
            for item in errors
        ],
        "warnings": [
            str(item)
            for item in warnings
        ]
    }


def review_all_changes(changes):

    results = []

    all_errors = []
    all_warnings = []

    for change in changes:

        filename = change["file"]
        content = change["content"]

        result = review_generated_change(
            filename,
            content
        )

        results.append({
            "file": filename,
            **result
        })

        all_errors.extend(
            f"{filename}: {error}"
            for error in result["errors"]
        )

        all_warnings.extend(
            f"{filename}: {warning}"
            for warning in result["warnings"]
        )

    return {
        "passed": not all_errors,
        "results": results,
        "errors": all_errors,
        "warnings": all_warnings
    }


# ============================================================
# GITHUB CODE CHANGE PREPARATION
# ============================================================

async def prepare_github_changes(changes):

    builder = GitHubBuilder()

    prepared = []

    for change in changes:

        filename = change["file"]
        content = change["content"]

        existing = await builder.get_file(
            filename
        )

        prepared.append({
            "file": filename,
            "content": content,
            "existing": bool(existing)
        })

    return prepared


# ============================================================
# GITHUB COMMIT
# ============================================================

async def commit_coding_changes(
    changes,
    commit_message
):

    if not is_developer(
        coding_context_member
    ):
        raise PermissionError(
            "Developer access is required."
        )

    builder = GitHubBuilder()

    results = []

    for change in changes:

        filename = change["file"]
        content = change["content"]

        existing = await builder.get_file(
            filename
        )

        # Existing files are updated.
        if existing:

            result = await builder.update_file(
                filename,
                content,
                approved=True,
                commit_message=commit_message
            )

        else:

            # The current GitHubBuilder interface used by this
            # project may not expose file creation.
            # Never pretend a new file was created.
            raise RuntimeError(
                f"GitHub file `{filename}` does not already exist "
                "and the current GitHubBuilder does not provide a "
                "verified file-creation workflow."
            )

        if not isinstance(result, dict):

            raise RuntimeError(
                f"Invalid GitHub response for {filename}."
            )

        if not result.get("success"):

            raise RuntimeError(
                result.get(
                    "message",
                    f"GitHub update failed for {filename}."
                )
            )

        results.append(
            result.get(
                "message",
                f"{filename} updated successfully."
            )
        )

    return results


# ============================================================
# CODING APPROVAL VIEW
# ============================================================

class CodingApprovalView(
    discord.ui.View
):

    def __init__(
        self,
        requester_id,
        changes,
        summary,
        warnings
    ):

        super().__init__(
            timeout=120
        )

        self.requester_id = requester_id
        self.changes = changes
        self.summary = summary
        self.warnings = warnings

    async def interaction_check(
        self,
        interaction
    ):

        if interaction.user.id != self.requester_id:

            await interaction.response.send_message(
                "Only the developer who requested this change can approve it.",
                ephemeral=True
            )

            return False

        if not is_developer(
            interaction.user
        ):

            await interaction.response.send_message(
                "Elyx Developer access is required.",
                ephemeral=True
            )

            return False

        return True

    @discord.ui.button(
        label="Save to GitHub",
        style=discord.ButtonStyle.success
    )
    async def approve(
        self,
        interaction,
        button
    ):

        self.stop()

        for child in self.children:
            child.disabled = True

        await interaction.response.edit_message(
            content=(
                "ELYX DEVELOPER\n\n"
                "Approved. Updating GitHub..."
            ),
            view=self
        )

        global coding_context_member

        coding_context_member = interaction.user

        try:

            results = await commit_coding_changes(
                self.changes,
                self.summary
            )

            result_text = "\n".join(
                f"• {item}"
                for item in results
            )

            await interaction.edit_original_response(
                content=(
                    "**ELYX DEVELOPER — SAVED**\n\n"
                    f"{self.summary}\n\n"
                    f"{result_text}\n\n"
                    "GitHub update completed."
                ),
                view=self
            )

        except Exception as error:

            logger.exception(
                "GitHub coding change failed."
            )

            await interaction.edit_original_response(
                content=(
                    "**ELYX DEVELOPER — SAVE FAILED**\n\n"
                    f"{error}"
                ),
                view=self
            )

        finally:

            coding_context_member = None

    @discord.ui.button(
        label="Cancel",
        style=discord.ButtonStyle.secondary
    )
    async def cancel(
        self,
        interaction,
        button
    ):

        self.stop()

        for child in self.children:
            child.disabled = True

        await interaction.response.edit_message(
            content=(
                "**ELYX DEVELOPER**\n\n"
                "Code change cancelled. Nothing was saved to GitHub."
            ),
            view=self
        )

    async def on_timeout(self):

        for child in self.children:
            child.disabled = True


# ============================================================
# CODING AGENT EXECUTION
# ============================================================

async def run_coding_agent(
    message,
    prompt
):

    if not is_developer(
        message.author
    ):

        await message.reply(
            "Elyx Developer access required.",
            mention_author=False
        )

        return

    key = get_user_key(
        message
    )

    lock = get_user_lock(
        key
    )

    async with lock:

        thinking = await message.reply(
            "ELYX DEVELOPER is inspecting the project...",
            mention_author=False
        )

        try:

            # -----------------------------------------------
            # 1. READ CURRENT PROJECT
            # -----------------------------------------------

            project_snapshot = (
                build_project_snapshot()
            )

            if not project_snapshot:

                raise RuntimeError(
                    "Project files could not be read."
                )

            await thinking.edit(
                content=(
                    "ELYX DEVELOPER\n\n"
                    "Project inspected.\n"
                    "Designing the requested change..."
                )
            )

            # -----------------------------------------------
            # 2. ASK AI TO DESIGN THE CODE CHANGE
            # -----------------------------------------------

            coding_messages = (
                build_coding_messages(
                    message,
                    prompt,
                    project_snapshot
                )
            )

            ai_response = await asyncio.wait_for(
                generate_reply(
                    coding_messages
                ),
                timeout=CODING_REQUEST_TIMEOUT
            )

            if not ai_response:

                raise RuntimeError(
                    "AI Developer returned an empty response."
                )

            # -----------------------------------------------
            # 3. PARSE AI CODE
            # -----------------------------------------------

            try:

                coding_result = (
                    extract_json_response(
                        ai_response
                    )
                )

            except Exception:

                logger.exception(
                    "AI returned invalid coding JSON."
                )

                raise RuntimeError(
                    "AI Developer returned invalid code-change data."
                )

            changes = validate_coding_result(
                coding_result
            )

            # -----------------------------------------------
            # 4. REVIEW EVERY CHANGED FILE
            # -----------------------------------------------

            await thinking.edit(
                content=(
                    "ELYX DEVELOPER\n\n"
                    f"Generated {len(changes)} code change(s).\n"
                    "Reviewing the changes..."
                )
            )

            review = review_all_changes(
                changes
            )

            if not review["passed"]:

                error_text = "\n".join(
                    f"• {item}"
                    for item in review["errors"][:10]
                )

                await thinking.edit(
                    content=(
                        "**ELYX DEVELOPER — CODE REVIEW FAILED**\n\n"
                        f"{error_text}\n\n"
                        "Nothing was saved to GitHub."
                    )
                )

                return

            # -----------------------------------------------
            # 5. PREPARE GITHUB CHECK
            # -----------------------------------------------

            await thinking.edit(
                content=(
                    "ELYX DEVELOPER\n\n"
                    "Code review passed.\n"
                    "Checking GitHub files..."
                )
            )

            prepared = await prepare_github_changes(
                changes
            )

            missing_files = [
                item["file"]
                for item in prepared
                if not item["existing"]
            ]

            if missing_files:

                await thinking.edit(
                    content=(
                        "**ELYX DEVELOPER — STOPPED**\n\n"
                        "The AI requested files that do not already "
                        "exist in the verified GitHub update workflow:\n\n"
                        + "\n".join(
                            f"• `{name}`"
                            for name in missing_files
                        )
                        + "\n\n"
                        "Nothing was saved."
                    )
                )

                return

            # -----------------------------------------------
            # 6. BUILD APPROVAL SUMMARY
            # -----------------------------------------------

            summary = coding_result.get(
                "summary",
                "Requested Elyx project update"
            )

            summary = str(
                summary
            ).strip()

            if not summary:

                summary = (
                    "Requested Elyx project update"
                )

            warning_text = ""

            if review["warnings"]:

                warning_text = (
                    "\n\nWarnings:\n"
                    + "\n".join(
                        f"• {item}"
                        for item in review["warnings"][:10]
                    )
                )

            file_text = "\n".join(
                f"• `{change['file']}`"
                for change in changes
            )

            approval_text = (
                "**ELYX DEVELOPER — CODE READY**\n\n"
                f"**Request:** {prompt}\n\n"
                f"**Plan:** {summary}\n\n"
                f"**Files to update:**\n"
                f"{file_text}\n\n"
                "Code review: **PASSED**"
                f"{warning_text}\n\n"
                "**Save to GitHub?**"
            )

            view = CodingApprovalView(
                requester_id=message.author.id,
                changes=changes,
                summary=(
                    f"Elyx Developer: {summary}"
                ),
                warnings=review["warnings"]
            )

            await thinking.edit(
                content=approval_text,
                view=view
            )

        except asyncio.TimeoutError:

            await thinking.edit(
                content=(
                    "**ELYX DEVELOPER**\n\n"
                    "The coding request took too long to process.\n"
                    "Nothing was saved."
                )
            )

        except AIUnavailableError:

            await thinking.edit(
                content=(
                    "**ELYX DEVELOPER**\n\n"
                    "AI service is temporarily unavailable.\n"
                    "Nothing was saved."
                )
            )

        except Exception as error:

            logger.exception(
                "AI Developer workflow failed."
            )

            await thinking.edit(
                content=(
                    "**ELYX DEVELOPER — ERROR**\n\n"
                    f"{error}\n\n"
                    "Nothing was saved to GitHub."
                )
            )


# ============================================================
# NATURAL DEVELOPER ROUTER
# ============================================================

async def handle_developer_request(
    message,
    prompt
):

    if not is_developer(
        message.author
    ):
        return False

    # Developer coding requests go to the
    # general-purpose AI coding agent.
    if looks_like_coding_request(
        prompt
    ):

        await run_coding_agent(
            message,
            prompt
        )

        return True

    return False


# =========================
# PART 3/3 — DISCORD ROUTER
# =========================

class HardActionConfirmationView(discord.ui.View):
    def __init__(self, action_data, actor):
        super().__init__(timeout=60)
        self.action_data = action_data
        self.actor = actor
        self.done = False

    @discord.ui.button(label="Confirm", style=discord.ButtonStyle.success)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user.id != self.actor.id:
            await interaction.response.send_message(
                "Only the developer who requested this action can confirm it.",
                ephemeral=True
            )
            return

        if self.done:
            return

        self.done = True
        self.disable_all_items()

        try:
            result = await execute_hard_action(
                interaction.guild,
                self.actor,
                self.action_data
            )

            await interaction.response.edit_message(
                content=f"Confirmed.\n\n{result}",
                view=self
            )

        except HardAccessError as exc:
            await interaction.response.edit_message(
                content=f"Action failed:\n{exc}",
                view=self
            )

        except discord.Forbidden:
            await interaction.response.edit_message(
                content=(
                    "Action failed: Discord denied the request. "
                    "Check the bot permission and role hierarchy."
                ),
                view=self
            )

        except discord.HTTPException as exc:
            await interaction.response.edit_message(
                content=f"Discord API error: {exc}",
                view=self
            )

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.danger)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user.id != self.actor.id:
            await interaction.response.send_message(
                "Only the developer who requested this action can cancel it.",
                ephemeral=True
            )
            return

        self.done = True
        self.disable_all_items()

        await interaction.response.edit_message(
            content="Action cancelled.",
            view=self
        )


def disable_all_items(self):
    for item in self.children:
        item.disabled = True


HardActionConfirmationView.disable_all_items = disable_all_items


def _quoted_or_plain_name(text):
    text = text.strip()

    if text.startswith('"') and text.endswith('"'):
        return text[1:-1].strip()

    if text.startswith("'") and text.endswith("'"):
        return text[1:-1].strip()

    return text.strip()


def parse_hard_action(message):
    """
    Converts simple natural-language developer requests
    into controlled Discord actions.

    IMPORTANT:
    This only prepares the action.
    It does NOT execute anything.
    """

    text = message.strip()

    # ---------------------------------
    # CATEGORY
    # ---------------------------------

    category_match = re.search(
        r"(?:create|make|add|banao|banado|bana\s+do)\s+"
        r"(?:a\s+)?(?:category|categor(?:y|ies))"
        r"\s+(?:named|called|naam\s*(?:ki|ka)?|name\s*)?"
        r"(.+?)\s*$",
        text,
        re.IGNORECASE
    )

    if category_match:
        name = _quoted_or_plain_name(category_match.group(1))

        if name:
            return {
                "type": "create_category",
                "name": name
            }

    # ---------------------------------
    # CHANNEL INSIDE CATEGORY
    # ---------------------------------

    nested_channel_patterns = [
        r"(?:create|make|add|banao|banado|bana\s+do)\s+"
        r"(?:a\s+)?(?:text\s+)?channel\s+"
        r"(.+?)\s+(?:inside|under|in|under\s+category)\s+(.+)$",

        r"(?:create|make|add|banao|banado|bana\s+do)\s+"
        r"(?:a\s+)?(?:text\s+)?channel\s+"
        r"(.+?)\s+(?:category|cat)\s+(.+)$",
    ]

    for pattern in nested_channel_patterns:
        match = re.search(pattern, text, re.IGNORECASE)

        if match:
            channel_name = _quoted_or_plain_name(match.group(1))
            category_name = _quoted_or_plain_name(match.group(2))

            if channel_name and category_name:
                return {
                    "type": "create_text_channel",
                    "name": channel_name,
                    "category": category_name
                }

    # ---------------------------------
    # ROLE
    # ---------------------------------

    role_match = re.search(
        r"(?:create|make|add|banao|banado|bana\s+do)\s+"
        r"(?:a\s+)?role\s+"
        r"(?:named|called|naam\s*(?:ka|ki)?|name\s*)?"
        r"(.+?)(?:\s+(?:colour|color)\s+(.+))?$",
        text,
        re.IGNORECASE
    )

    if role_match:
        role_name = _quoted_or_plain_name(role_match.group(1))
        colour = role_match.group(2)

        if role_name:
            return {
                "type": "create_role",
                "name": role_name,
                "colour": colour.strip() if colour else None
            }

    # ---------------------------------
    # TIMEOUT
    # ---------------------------------

    timeout_match = re.search(
        r"(?:timeout|time\s*out|mute)\s+"
        r"(<@!?\d+>|<@\d+>|\d{15,22})"
        r".*?"
        r"(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)",
        text,
        re.IGNORECASE
    )

    if timeout_match:
        target = timeout_match.group(1)
        amount = int(timeout_match.group(2))
        unit = timeout_match.group(3).lower()

        if unit.startswith("hour") or unit.startswith("hr"):
            amount *= 60

        return {
            "type": "timeout_member",
            "target": target,
            "duration_minutes": amount
        }

    # ---------------------------------
    # KICK
    # ---------------------------------

    kick_match = re.search(
        r"(?:kick|remove)\s+"
        r"(<@!?\d+>|<@\d+>|\d{15,22})",
        text,
        re.IGNORECASE
    )

    if kick_match:
        return {
            "type": "kick_member",
            "target": kick_match.group(1)
        }

    # ---------------------------------
    # BAN
    # ---------------------------------

    ban_match = re.search(
        r"(?:ban)\s+"
        r"(<@!?\d+>|<@\d+>|\d{15,22})",
        text,
        re.IGNORECASE
    )

    if ban_match:
        return {
            "type": "ban_member",
            "target": ban_match.group(1)
        }

    return None


def describe_hard_action(action):
    action_type = action["type"]

    if action_type == "create_category":
        return (
            f"Create category:\n"
            f"**{action['name']}**"
        )

    if action_type == "create_text_channel":
        return (
            f"Create channel:\n"
            f"**#{action['name']}**\n"
            f"Inside category:\n"
            f"**{action['category']}**"
        )

    if action_type == "create_role":
        colour_text = action.get("colour") or "default"

        return (
            f"Create role:\n"
            f"**{action['name']}**\n"
            f"Colour: **{colour_text}**"
        )

    if action_type == "timeout_member":
        return (
            f"Timeout member:\n"
            f"**{action['target']}**\n"
            f"Duration: **{action['duration_minutes']} minute(s)**"
        )

    if action_type == "kick_member":
        return (
            f"Kick member:\n"
            f"**{action['target']}**"
        )

    if action_type == "ban_member":
        return (
            f"Ban member:\n"
            f"**{action['target']}**"
        )

    return "Unknown developer action."


async def execute_hard_action(guild, actor, action):
    action_type = action["type"]

    if action_type == "create_category":
        category = await create_category(
            guild,
            actor,
            action["name"]
        )

        return (
            f"Category created successfully:\n"
            f"**{category.name}**"
        )

    if action_type == "create_text_channel":
        return await create_text_channel(
            guild,
            actor,
            action["name"],
            action["category"]
        )

    if action_type == "create_role":
        return await create_role(
            guild,
            actor,
            action["name"],
            action.get("colour")
        )

    if action_type == "timeout_member":
        return await timeout_member(
            guild,
            actor,
            action["target"],
            action["duration_minutes"]
        )

    if action_type == "kick_member":
        return await kick_member(
            guild,
            actor,
            action["target"]
        )

    if action_type == "ban_member":
        return await ban_member(
            guild,
            actor,
            action["target"]
        )

    raise HardAccessError("Unknown developer action.")


async def handle_hard_request(message):
    if message.guild is None:
        return False

    if not is_developer(message.author):
        return False

    action = parse_hard_action(message.content)

    if action is None:
        return False

    confirmation_text = (
        "Elyx Developer Action\n\n"
        f"{describe_hard_action(action)}\n\n"
        "This action will change the Discord server.\n"
        "Confirm before I execute it."
    )

    view = HardActionConfirmationView(
        action,
        message.author
    )

    await message.reply(
        confirmation_text,
        view=view,
        mention_author=False
    )

    return True


async def handle_normal_ai_message(message):
    if message.guild is None:
        return

    if message.author.bot:
        return

    bot_user = bot.user

    if bot_user is None:
        return

    mentioned = bot_user in message.mentions

    if not mentioned:
        return

    cleaned = message.content

    cleaned = cleaned.replace(
        f"<@{bot_user.id}>",
        ""
    )

    cleaned = cleaned.replace(
        f"<@!{bot_user.id}>",
        ""
    )

    cleaned = cleaned.strip()

    if not cleaned:
        await message.reply(
            "Haan, bolo kya help chahiye?",
            mention_author=False
        )
        return

    try:
        reply = await generate_reply(
            cleaned,
            user_id=str(message.author.id),
            username=message.author.display_name
        )

        if not reply:
            reply = "Sorry, abhi reply generate nahi ho paya."

        await message.reply(
            reply[:MAX_MESSAGE_LENGTH],
            mention_author=False
        )

    except AIUnavailableError:
        await message.reply(
            "AI service abhi available nahi hai. Thodi der baad try karo.",
            mention_author=False
        )

    except Exception as exc:
        logging.exception(
            "Normal AI message failed: %s",
            exc
        )

        await message.reply(
            "AI reply generate karte waqt error aa gaya.",
            mention_author=False
        )


@bot.event
async def on_ready():
    logging.info(
        "Elyx Trading AI Developer connected as %s",
        bot.user
    )

    logging.info(
        "Developer Role ID: %s",
        DEVELOPER_ROLE_ID
    )

    logging.info(
        "Connected guilds: %s",
        len(bot.guilds)
    )


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    if message.guild is None:
        return

    # ---------------------------------
    # DEVELOPER HARD ACTIONS
    # ---------------------------------

    try:
        handled = await handle_hard_request(message)

        if handled:
            return

    except Exception as exc:
        logging.exception(
            "Hard action router failed: %s",
            exc
        )

        await message.reply(
            "Developer action process mein error aa gaya.",
            mention_author=False
        )

        return

    # ---------------------------------
    # DEVELOPER AI CODING AGENT
    # ---------------------------------

    if is_developer(message.author):
        try:
            if looks_like_coding_request(message.content):
                await handle_developer_request(message)
                return

        except Exception as exc:
            logging.exception(
                "Developer coding request failed: %s",
                exc
            )

            await message.reply(
                "Coding request process karte waqt error aa gaya.",
                mention_author=False
            )

            return

    # ---------------------------------
    # NORMAL MEMBER AI
    # ---------------------------------

    await handle_normal_ai_message(message)


async def start_bot():
    if not TOKEN:
        raise RuntimeError(
            "DISCORD_TOKEN environment variable is missing."
        )

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s"
    )

    await initialize_memory()

    await bot.start(TOKEN)


if __name__ == "__main__":
    try:
        asyncio.run(start_bot())
    except KeyboardInterrupt:
        pass
