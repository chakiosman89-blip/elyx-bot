# ============================================================
# ELYX TRADING AI DEVELOPER
# VERSION 1.0
# PART 1/5 — FOUNDATION & CONFIGURATION
# ============================================================

import os
import re
import json
import ast
import asyncio
import logging
import hashlib
from datetime import datetime, timezone

import discord
from discord.ext import commands
import aiohttp


# ============================================================
# CONFIGURATION
# ============================================================

BOT_TOKEN = os.getenv("DISCORD_TOKEN")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPOSITORY = os.getenv("GITHUB_REPOSITORY")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")

DEVELOPER_ROLE_ID = 1572448688700391454

PREFIX = "!"

MAX_MESSAGE_LENGTH = 1800
MAX_PROJECT_SIZE = 30000
MAX_FILE_SIZE = 100000

AI_TIMEOUT = 90

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
)

GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-20b"
)


# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

logger = logging.getLogger("ELYX_DEVELOPER")


# ============================================================
# DISCORD BOT
# ============================================================

intents = discord.Intents.default()

intents.guilds = True
intents.members = True
intents.messages = True
intents.message_content = True

bot = commands.Bot(
    command_prefix=PREFIX,
    intents=intents,
    help_command=None
)


# ============================================================
# GLOBAL SYSTEM STATE
# ============================================================

HTTP_SESSION = None

BOT_STARTED = False

PROJECT_LOCK = asyncio.Lock()

USER_CONVERSATIONS = {}

PROJECT_MEMORY = []

PENDING_CHANGES = {}

ACTIVE_TASKS = {}

AI_PROVIDER_ORDER = ["gemini", "groq"]


# ============================================================
# PROJECT FILE CONFIGURATION
# ============================================================

PROJECT_FILES = [
    "main.py",
    "requirements.txt"
]

ALLOWED_FILE_EXTENSIONS = (
    ".py",
    ".txt",
    ".json",
    ".md",
    ".yml",
    ".yaml"
)


# ============================================================
# AI DEVELOPER SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are ELYX TRADING AI DEVELOPER.

You are an autonomous AI software development assistant.

Your responsibilities:

1. Understand natural language requests.
2. Inspect actual project files supplied to you.
3. Never invent files or pretend to have inspected files.
4. Find bugs and explain their causes.
5. Design new software features.
6. Generate complete code changes.
7. Maintain compatibility with existing project code.
8. Check dependencies and requirements.
9. Validate generated Python syntax.
10. Prepare changes for human approval.
11. Never claim that a change was saved unless GitHub confirms it.

IMPORTANT RULES:

- Follow the developer's instructions.
- Preserve existing working features.
- Do not silently remove existing code.
- Do not expose API keys, tokens or secrets.
- Do not execute untrusted generated code.
- Ask for clarification when a request is ambiguous.
- Explain errors in simple language.
- Prefer complete, integrated implementations.
- Never fabricate test results.

You are the development brain of ELYX TRADING.
"""


# ============================================================
# GENERAL HELPERS
# ============================================================

def utc_now():
    return datetime.now(timezone.utc)


def is_configured(value):
    return bool(value and value.strip())


def get_developer_access(member):

    if member is None:
        return False

    if member.guild.owner_id == member.id:
        return True

    return any(
        role.id == DEVELOPER_ROLE_ID
        for role in member.roles
    )


def safe_text(text):

    if not isinstance(text, str):
        return ""

    return text[:MAX_MESSAGE_LENGTH]


def calculate_hash(content):

    return hashlib.sha256(
        content.encode("utf-8")
    ).hexdigest()


def split_message(text, limit=1900):

    parts = []

    while text:

        if len(text) <= limit:
            parts.append(text)
            break

        position = text.rfind("\n", 0, limit)

        if position < 1:
            position = limit

        parts.append(text[:position])
        text = text[position:].lstrip()

    return parts


# ============================================================
# EMBED SYSTEM
# ============================================================

def create_embed(title, description, color=0x8A2BE2):

    embed = discord.Embed(
        title=title,
        description=description,
        color=color,
        timestamp=utc_now()
    )

    embed.set_footer(
        text="ELYX TRADING • AI DEVELOPER"
    )

    return embed


# ============================================================
# CONFIGURATION CHECK
# ============================================================

def check_configuration():

    missing = []

    if not is_configured(BOT_TOKEN):
        missing.append("DISCORD_TOKEN")

    if not is_configured(GEMINI_API_KEY) and not is_configured(GROQ_API_KEY):
        missing.append("GEMINI_API_KEY or GROQ_API_KEY")

    if not is_configured(GITHUB_TOKEN):
        missing.append("GITHUB_TOKEN")

    if not is_configured(GITHUB_REPOSITORY):
        missing.append("GITHUB_REPOSITORY")

    return missing


# ============================================================
# END OF PART 1
# ============================================================

# ============================================================
# PART 2/5 — AI BRAIN
# ============================================================


# ============================================================
# AI PROVIDER CONFIGURATION
# ============================================================

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


# ============================================================
# HTTP SESSION
# ============================================================

async def get_http_session():

    global HTTP_SESSION

    if HTTP_SESSION is None or HTTP_SESSION.closed:

        timeout = aiohttp.ClientTimeout(
            total=AI_TIMEOUT
        )

        HTTP_SESSION = aiohttp.ClientSession(
            timeout=timeout
        )

    return HTTP_SESSION


# ============================================================
# GEMINI AI
# ============================================================

async def ask_gemini(messages):

    if not is_configured(GEMINI_API_KEY):
        raise RuntimeError("Gemini API key is not configured.")

    session = await get_http_session()

    contents = []

    for message in messages:

        role = message.get("role", "user")
        content = message.get("content", "")

        if role == "system":
            continue

        gemini_role = (
            "model" if role == "assistant" else "user"
        )

        contents.append({
            "role": gemini_role,
            "parts": [
                {"text": str(content)}
            ]
        })

    payload = {
        "systemInstruction": {
            "parts": [
                {"text": SYSTEM_PROMPT}
            ]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.5,
            "maxOutputTokens": 8192
        }
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }

    async with session.post(
        GEMINI_URL,
        headers=headers,
        json=payload
    ) as response:

        if response.status != 200:

            error_text = await response.text()

            logger.error(
                "Gemini HTTP error: %s",
                response.status
            )

            raise RuntimeError(
                f"Gemini error {response.status}: "
                f"{error_text[:500]}"
            )

        data = await response.json()

    candidates = data.get("candidates", [])

    if not candidates:
        raise RuntimeError("Gemini returned an empty response.")

    parts = (
        candidates[0]
        .get("content", {})
        .get("parts", [])
    )

    answer = "".join(
        part.get("text", "")
        for part in parts
    )

    if not answer.strip():
        raise RuntimeError("Gemini response contained no text.")

    return answer.strip()


# ============================================================
# GROQ AI
# ============================================================

async def ask_groq(messages):

    if not is_configured(GROQ_API_KEY):
        raise RuntimeError("Groq API key is not configured.")

    session = await get_http_session()

    groq_messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    for message in messages:

        role = message.get("role", "user")

        if role not in ("user", "assistant"):
            continue

        groq_messages.append({
            "role": role,
            "content": str(message.get("content", ""))
        })

    payload = {
        "model": GROQ_MODEL,
        "messages": groq_messages,
        "temperature": 0.5,
        "max_tokens": 8192
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    async with session.post(
        GROQ_URL,
        headers=headers,
        json=payload
    ) as response:

        if response.status != 200:

            error_text = await response.text()

            logger.error(
                "Groq HTTP error: %s",
                response.status
            )

            raise RuntimeError(
                f"Groq error {response.status}: "
                f"{error_text[:500]}"
            )

        data = await response.json()

    choices = data.get("choices", [])

    if not choices:
        raise RuntimeError("Groq returned an empty response.")

    answer = (
        choices[0]
        .get("message", {})
        .get("content", "")
    )

    if not answer.strip():
        raise RuntimeError("Groq response contained no text.")

    return answer.strip()


# ============================================================
# AI PROVIDER FALLBACK
# ============================================================

async def generate_ai_reply(messages):

    errors = []

    for provider in AI_PROVIDER_ORDER:

        try:

            if provider == "gemini":

                answer = await ask_gemini(messages)

            elif provider == "groq":

                answer = await ask_groq(messages)

            else:
                continue

            logger.info(
                "AI response generated using %s",
                provider
            )

            return answer

        except Exception as error:

            logger.warning(
                "%s provider failed: %s",
                provider,
                str(error)[:300]
            )

            errors.append(
                f"{provider}: {str(error)[:200]}"
            )

    raise RuntimeError(
        "All AI providers failed. "
        + " | ".join(errors)
    )


# ============================================================
# CONVERSATION MEMORY
# ============================================================

def get_user_history(user_id):

    history = USER_CONVERSATIONS.get(
        user_id,
        []
    )

    return history[-12:]


def save_user_message(user_id, role, content):

    if user_id not in USER_CONVERSATIONS:

        USER_CONVERSATIONS[user_id] = []

    USER_CONVERSATIONS[user_id].append({

        "role": role,

        "content": str(content)[:8000],

        "time": utc_now().isoformat()

    })

    USER_CONVERSATIONS[user_id] = (
        USER_CONVERSATIONS[user_id][-20:]
    )


# ============================================================
# NORMAL AI RESPONSE
# ============================================================

async def get_normal_ai_response(user_id, user_message):

    history = get_user_history(user_id)

    messages = []

    for item in history:

        messages.append({

            "role": item["role"],

            "content": item["content"]

        })

    messages.append({

        "role": "user",

        "content": user_message

    })

    answer = await generate_ai_reply(messages)

    save_user_message(
        user_id,
        "user",
        user_message
    )

    save_user_message(
        user_id,
        "assistant",
        answer
    )

    return answer


# ============================================================
# END OF PART 2
# ============================================================

# ============================================================
# PART 3/5 — GITHUB PROJECT ENGINE
# ============================================================

import base64


# ============================================================
# GITHUB CONFIGURATION
# ============================================================

GITHUB_API = "https://api.github.com"

GITHUB_ALLOWED_FILES = {
    "main.py",
    "requirements.txt"
}


def github_headers():

    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
    }


def github_file_url(filename):

    if filename not in GITHUB_ALLOWED_FILES:
        raise ValueError("This project file is not allowed.")

    if not GITHUB_REPOSITORY or "/" not in GITHUB_REPOSITORY:
        raise ValueError("Invalid GitHub repository configuration.")

    return (
        f"{GITHUB_API}/repos/"
        f"{GITHUB_REPOSITORY}/contents/{filename}"
    )


# ============================================================
# GITHUB READ FILE
# ============================================================

async def github_read_file(filename):

    if not is_configured(GITHUB_TOKEN):
        raise RuntimeError("GitHub token is missing.")

    url = github_file_url(filename)

    session = await get_http_session()

    params = {
        "ref": GITHUB_BRANCH
    }

    async with session.get(
        url,
        headers=github_headers(),
        params=params
    ) as response:

        if response.status == 404:
            return {
                "success": False,
                "exists": False,
                "content": "",
                "sha": None,
                "message": "File not found."
            }

        if response.status != 200:

            error = await response.text()

            raise RuntimeError(
                f"GitHub read error {response.status}: "
                f"{error[:300]}"
            )

        data = await response.json()

    if data.get("type") != "file":
        raise RuntimeError("GitHub path is not a file.")

    encoded = data.get("content", "")

    decoded = base64.b64decode(
        encoded.replace("\n", "")
    ).decode("utf-8")

    return {
        "success": True,
        "exists": True,
        "content": decoded,
        "sha": data.get("sha"),
        "message": "File loaded successfully."
    }


# ============================================================
# READ COMPLETE PROJECT
# ============================================================

async def inspect_project():

    project = {}

    errors = []

    total_size = 0

    for filename in sorted(GITHUB_ALLOWED_FILES):

        try:

            result = await github_read_file(filename)

            if not result["success"]:
                project[filename] = {
                    "exists": False,
                    "content": "",
                    "sha": None
                }
                continue

            content = result["content"]

            remaining = MAX_PROJECT_SIZE - total_size

            if remaining <= 0:
                content = "[PROJECT SIZE LIMIT REACHED]"

            elif len(content) > remaining:
                content = (
                    content[:remaining]
                    + "\n[CONTENT TRUNCATED]"
                )

            total_size += len(content)

            project[filename] = {
                "exists": True,
                "content": content,
                "sha": result["sha"]
            }

        except Exception as error:

            errors.append(
                f"{filename}: {str(error)[:200]}"
            )

    return {
        "files": project,
        "errors": errors,
        "total_chars": total_size
    }


# ============================================================
# GITHUB CREATE / UPDATE FILE
# ============================================================

async def github_save_file(
    filename,
    new_content,
    approved=False,
    commit_message=None,
    expected_sha=None
):

    if not approved:
        raise PermissionError(
            "Human approval is required before saving."
        )

    if filename not in GITHUB_ALLOWED_FILES:
        raise ValueError("File is not in the allowed list.")

    if not isinstance(new_content, str):
        raise TypeError("File content must be text.")

    if len(new_content) > MAX_FILE_SIZE:
        raise ValueError("File exceeds maximum allowed size.")

    if filename.endswith(".py"):

        try:
            ast.parse(new_content)
        except SyntaxError as error:
            raise ValueError(
                f"Python syntax error: {error}"
            )

    if filename == "requirements.txt":

        for line in new_content.splitlines():

            line = line.strip()

            if not line or line.startswith("#"):
                continue

            if not re.match(
                r"^[A-Za-z0-9_.-]+"
                r"([<>=!~]+[A-Za-z0-9_.+-]+)?$",
                line
            ):
                raise ValueError(
                    f"Invalid dependency line: {line[:100]}"
                )

    url = github_file_url(filename)

    session = await get_http_session()

    # Fetch the latest version before committing.
    async with session.get(
        url,
        headers=github_headers(),
        params={"ref": GITHUB_BRANCH}
    ) as response:

        if response.status == 200:

            current = await response.json()

            current_sha = current.get("sha")

            if expected_sha and current_sha != expected_sha:
                raise RuntimeError(
                    "GitHub file changed after approval. "
                    "Please inspect and approve the latest version."
                )

        elif response.status == 404:

            current_sha = None

            if expected_sha:
                raise RuntimeError(
                    "File was removed after approval."
                )

        else:

            error = await response.text()

            raise RuntimeError(
                f"GitHub pre-save check failed: "
                f"{response.status} {error[:300]}"
            )

    encoded_content = base64.b64encode(
        new_content.encode("utf-8")
    ).decode("ascii")

    payload = {
        "message": (
            commit_message
            or f"Update {filename} using Elyx AI Developer"
        ),
        "content": encoded_content,
        "branch": GITHUB_BRANCH
    }

    if current_sha:
        payload["sha"] = current_sha

    async with session.put(
        url,
        headers=github_headers(),
        json=payload
    ) as response:

        if response.status not in (200, 201):

            error = await response.text()

            raise RuntimeError(
                f"GitHub save failed: "
                f"{response.status} {error[:400]}"
            )

        result = await response.json()

    return {
        "success": True,
        "filename": filename,
        "sha": result.get("content", {}).get("sha"),
        "commit": result.get("commit", {}).get("html_url"),
        "message": "GitHub file saved successfully."
    }


# ============================================================
# PROJECT SNAPSHOT FOR AI
# ============================================================

async def build_project_context():

    result = await inspect_project()

    sections = []

    for filename, info in result["files"].items():

        if not info["exists"]:
            sections.append(
                f"\nFILE: {filename}\n[FILE DOES NOT EXIST]"
            )
            continue

        sections.append(
            f"\n{'=' * 50}\n"
            f"FILE: {filename}\n"
            f"{'=' * 50}\n"
            f"{info['content']}"
        )

    if result["errors"]:

        sections.append(
            "\nINSPECTION ERRORS:\n"
            + "\n".join(result["errors"])
        )

    return "\n".join(sections)


# ============================================================
# END OF PART 3
# ============================================================


# ============================================================
# PART 4/5 — AI CODING AGENT
# ============================================================


# ============================================================
# CODING AGENT SETTINGS
# ============================================================

MAX_CHANGES_PER_REQUEST = 2

MAX_AI_OUTPUT = 50000

CODING_SYSTEM_PROMPT = """
You are ELYX TRADING AI SOFTWARE DEVELOPER.

You can inspect and modify these project files:
- main.py
- requirements.txt

You must use the actual project snapshot supplied in each request.

YOUR JOB:
1. Understand the developer's request.
2. Inspect the existing code.
3. Identify the exact changes needed.
4. Preserve existing working features.
5. Integrate new features with existing code.
6. Return complete replacement content for every changed file.
7. Never invent unseen functions, files or code.
8. Never claim that code was executed or tested.
9. Do not include API keys, tokens or secrets.
10. Do not create destructive or hidden behavior.

IMPORTANT:
- If the user asks only for analysis or a plan, return no changes.
- If the request is unclear, ask for clarification.
- Do not modify files unrelated to the request.
- Do not execute generated code.
- Changes must be compatible with the existing project.

RETURN ONLY VALID JSON:

{
  "status": "analysis OR changes OR question",
  "summary": "Short explanation",
  "analysis": "What you found",
  "changes": [
    {
      "filename": "main.py",
      "reason": "Why this file needs modification",
      "content": "COMPLETE NEW FILE CONTENT"
    }
  ],
  "dependencies": [
    "discord.py"
  ],
  "warnings": [],
  "questions": []
}

If no changes are needed, use:
"changes": []

Never use Markdown code fences around the JSON.
"""


# ============================================================
# CODING REQUEST DETECTION
# ============================================================

CODING_KEYWORDS = [

    "feature",
    "features",
    "function",
    "system",
    "developer",
    "coding",
    "code",
    "bug",
    "error",
    "fix",
    "update",
    "upgrade",
    "improve",
    "build",
    "create",
    "develop",
    "add",
    "remove",
    "delete",
    "integrate",
    "inspect",
    "project",
    "file",
    "files",
    "command",
    "menu",
    "system banao",
    "feature add",
    "code change",
    "bug fix",
    "naya feature",
    "naya system",
    "feature banao",
    "project inspect",
    "files inspect",
    "code check",
    "code improve",
    "kuch add karo",
    "kuch banao",
    "fix karo",
    "update karo",
    "integrate karo",
    "check karo",
    "inspect karo"
]


def looks_like_coding_request(message):

    content = message.lower()

    return any(
        keyword in content
        for keyword in CODING_KEYWORDS
    )


# ============================================================
# AI JSON EXTRACTION
# ============================================================

def extract_json_object(text):

    if not isinstance(text, str):
        raise ValueError("AI response is not text.")

    text = text.strip()

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

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end <= start:
        raise ValueError("AI did not return valid JSON.")

    data = json.loads(text[start:end + 1])

    if not isinstance(data, dict):
        raise ValueError("AI JSON must be an object.")

    return data


# ============================================================
# CODE VALIDATION
# ============================================================

def validate_generated_changes(data):

    if not isinstance(data, dict):
        raise ValueError("Invalid coding response.")

    status = data.get("status")

    if status not in ("analysis", "changes", "question"):
        raise ValueError("Invalid coding status.")

    changes = data.get("changes", [])

    if not isinstance(changes, list):
        raise ValueError("Changes must be a list.")

    if len(changes) > MAX_CHANGES_PER_REQUEST:
        raise ValueError("Too many files in one request.")

    validated = []

    seen_files = set()

    for change in changes:

        if not isinstance(change, dict):
            raise ValueError("Invalid file change.")

        filename = change.get("filename")

        content = change.get("content")

        if filename not in GITHUB_ALLOWED_FILES:
            raise ValueError(
                f"File not allowed: {filename}"
            )

        if filename in seen_files:
            raise ValueError(
                f"Duplicate file change: {filename}"
            )

        seen_files.add(filename)

        if not isinstance(content, str):
            raise ValueError(
                f"Invalid content for {filename}."
            )

        if len(content) > MAX_FILE_SIZE:
            raise ValueError(
                f"{filename} exceeds file size limit."
            )

        if filename.endswith(".py"):

            try:
                ast.parse(content)
            except SyntaxError as error:
                raise ValueError(
                    f"{filename} syntax error: {error}"
                )

        if filename == "requirements.txt":

            for line in content.splitlines():

                line = line.strip()

                if not line or line.startswith("#"):
                    continue

                if not re.match(
                    r"^[A-Za-z0-9_.-]+"
                    r"([<>=!~]+[A-Za-z0-9_.+-]+)?$",
                    line
                ):
                    raise ValueError(
                        f"Invalid dependency: {line}"
                    )

        validated.append({
            "filename": filename,
            "reason": str(
                change.get("reason", "")
            )[:500],
            "content": content
        })

    if status == "changes" and not validated:
        raise ValueError(
            "AI marked changes but supplied no files."
        )

    if status != "changes" and validated:
        raise ValueError(
            "Unexpected file changes in non-change response."
        )

    return validated


# ============================================================
# CODING APPROVAL VIEW
# ============================================================

class CodingApprovalView(discord.ui.View):

    def __init__(
        self,
        author_id,
        guild_id,
        changes,
        original_shas
    ):

        super().__init__(timeout=300)

        self.author_id = author_id
        self.guild_id = guild_id
        self.changes = changes
        self.original_shas = original_shas
        self.finished = False

    async def interaction_check(self, interaction):

        if interaction.user.id != self.author_id:

            await interaction.response.send_message(
                "Ye approval sirf request karne wala developer de sakta hai.",
                ephemeral=True
            )

            return False

        if not get_developer_access(interaction.user):

            await interaction.response.send_message(
                "Developer permission required.",
                ephemeral=True
            )

            return False

        return True

    @discord.ui.button(
        label="Approve & Save",
        style=discord.ButtonStyle.success
    )
    async def approve(self, interaction, button):

        if self.finished:
            await interaction.response.send_message(
                "This request is already finished.",
                ephemeral=True
            )
            return

        await interaction.response.defer(
            ephemeral=True,
            thinking=True
        )

        self.finished = True

        for item in self.children:
            item.disabled = True

        try:

            results = []

            async with PROJECT_LOCK:

                for change in self.changes:

                    filename = change["filename"]

                    result = await github_save_file(
                        filename=filename,
                        new_content=change["content"],
                        approved=True,
                        commit_message=(
                            "Elyx AI Developer: "
                            + filename
                        ),
                        expected_sha=self.original_shas.get(
                            filename
                        )
                    )

                    results.append(result)

            message = "\n".join(
                f"Saved: {result['filename']}"
                for result in results
            )

            await interaction.followup.send(
                "Changes successfully saved to GitHub.\n"
                + message,
                ephemeral=True
            )

        except Exception as error:

            logger.exception(
                "GitHub approval save failed."
            )

            await interaction.followup.send(
                "Save failed: "
                + str(error)[:1200],
                ephemeral=True
            )

        self.stop()

    @discord.ui.button(
        label="Cancel",
        style=discord.ButtonStyle.danger
    )
    async def cancel(self, interaction, button):

        self.finished = True

        for item in self.children:
            item.disabled = True

        await interaction.response.edit_message(
            content="Coding changes cancelled. Nothing was saved.",
            view=self
        )

        self.stop()

    async def on_timeout(self):

        if self.finished:
            return

        self.finished = True

        for item in self.children:
            item.disabled = True


# ============================================================
# PROJECT CODING AGENT
# ============================================================

async def run_coding_agent(
    message,
    request_text
):

    author = message.author

    if not get_developer_access(author):
        await message.reply(
            "Developer access required."
        )
        return

    if not GITHUB_REPOSITORY or not GITHUB_TOKEN:
        await message.reply(
            "GitHub configuration missing. "
            "FadeHost environment variables check karo."
        )
        return

    status_message = await message.reply(
        embed=create_embed(
            "ELYX AI DEVELOPER",
            "Project inspect kiya ja raha hai...",
            0x3498DB
        )
    )

    try:

        project = await inspect_project()

        if project["errors"]:
            raise RuntimeError(
                "Project inspection incomplete: "
                + "; ".join(project["errors"])
            )

        existing_files = project["files"]

        if not any(
            info["exists"]
            for info in existing_files.values()
        ):
            raise RuntimeError(
                "GitHub project files could not be loaded."
            )

        project_context = await build_project_context()

        user_prompt = f"""
DEVELOPER REQUEST:

{request_text}

ACTUAL PROJECT FILES:

{project_context}

PROJECT INSPECTION DETAILS:

{json.dumps({
    filename: {
        "exists": info["exists"],
        "sha": info["sha"],
        "characters": len(info["content"])
    }
    for filename, info in existing_files.items()
}, ensure_ascii=False)}

IMPORTANT:
Return complete file content for each changed file.
Do not invent missing code.
Do not claim that tests were executed.
Return valid JSON only.
"""

        messages = [
            {
                "role": "user",
                "content": (
                    CODING_SYSTEM_PROMPT
                    + "\n\n"
                    + user_prompt
                )
            }
        ]

        ai_response = await generate_ai_reply(messages)

        if len(ai_response) > MAX_AI_OUTPUT:
            raise ValueError(
                "AI response exceeded output size limit."
            )

        data = extract_json_object(ai_response)

        changes = validate_generated_changes(data)

        summary = str(
            data.get("summary", "")
        )[:1500]

        analysis = str(
            data.get("analysis", "")
        )[:2500]

        questions = data.get("questions", [])

        if not isinstance(questions, list):
            questions = []

        warnings = data.get("warnings", [])

        if not isinstance(warnings, list):
            warnings = []

        if data["status"] == "question":

            await status_message.edit(
                embed=create_embed(
                    "ELYX • NEEDS CLARIFICATION",
                    summary + "\n\n" + "\n".join(
                        str(question)[:500]
                        for question in questions[:5]
                    ),
                    0xF1C40F
                )
            )

            return

        if data["status"] == "analysis":

            await status_message.edit(
                embed=create_embed(
                    "ELYX • PROJECT ANALYSIS",
                    (
                        summary
                        + "\n\n"
                        + analysis
                        + "\n\nNo files changed."
                    )[:4000],
                    0x3498DB
                )
            )

            return

        original_shas = {
            filename: info["sha"]
            for filename, info in existing_files.items()
        }

        change_description = []

        for change in changes:

            change_description.append(
                f"**File:** `{change['filename']}`\n"
                f"**Reason:** {change['reason'] or 'Not specified'}\n"
                f"**New size:** {len(change['content'])} characters"
            )

        warning_text = ""

        if warnings:

            warning_text = (
                "\n\n**Warnings:**\n"
                + "\n".join(
                    "- " + str(warning)[:300]
                    for warning in warnings[:5]
                )
            )

        embed = create_embed(
            "ELYX • CHANGE APPROVAL",
            (
                summary
                + "\n\n"
                + "\n\n".join(change_description)
                + warning_text
                + "\n\n**Syntax validation passed.**"
                + "\nThis does not mean the code has been runtime-tested."
                + "\n\nApprove & Save dabane par GitHub mein changes commit honge."
            )[:4000],
            0x9B59B6
        )

        view = CodingApprovalView(
            author_id=author.id,
            guild_id=message.guild.id,
            changes=changes,
            original_shas=original_shas
        )

        await status_message.edit(
            embed=embed,
            view=view
        )

    except Exception as error:

        logger.exception(
            "Coding agent failed."
        )

        await status_message.edit(
            embed=create_embed(
                "ELYX • CODING ERROR",
                str(error)[:3000],
                0xE74C3C
            )
        )


# ============================================================
# END OF PART 4
# ============================================================


# ============================================================
# PART 5/5 — DISCORD CONNECTION & STARTUP
# ============================================================


# ============================================================
# BOT STATUS
# ============================================================

@bot.event
async def on_ready():

    logger.info(
        "ELYX TRADING connected as %s (%s)",
        bot.user,
        bot.user.id
    )

    await bot.change_presence(
        activity=discord.Activity(
            type=discord.ActivityType.watching,
            name="ELYX TRADING • AI Developer"
        ),
        status=discord.Status.online
    )

    logger.info("Elyx AI Developer is ready.")


# ============================================================
# HELP COMMAND
# ============================================================

@bot.command(name="help")
async def help_command(ctx):

    embed = create_embed(
        "ELYX TRADING • AI DEVELOPER",
        """
**AI Developer**
Mention the bot and describe your feature request.

**Available commands**

`!inspect` — Inspect project files.
`!status` — Check AI and GitHub configuration.
`!reset` — Reset your conversation.
`!help` — Show this menu.

**Developer features**
- Project analysis
- Feature development
- Bug analysis
- Code generation
- Code validation
- GitHub approval and saving

All GitHub changes require developer approval.
""",
        0x8A2BE2
    )

    await ctx.reply(embed=embed)


# ============================================================
# PROJECT INSPECTION COMMAND
# ============================================================

@bot.command(name="inspect")
async def inspect_command(ctx):

    if not get_developer_access(ctx.author):

        await ctx.reply(
            "Developer access required."
        )

        return

    message = await ctx.reply(
        "Project files inspect ho rahi hain..."
    )

    try:

        result = await inspect_project()

        lines = []

        for filename, info in result["files"].items():

            if info["exists"]:

                lines.append(
                    f"**{filename}** — Available "
                    f"({len(info['content'])} characters)"
                )

            else:

                lines.append(
                    f"**{filename}** — Not found"
                )

        if result["errors"]:

            lines.append(
                "\n**Inspection errors:**\n"
                + "\n".join(result["errors"])
            )

        embed = create_embed(
            "ELYX • PROJECT INSPECTION",
            "\n".join(lines)
            + f"\n\nTotal inspected: {result['total_chars']} characters",
            0x3498DB
        )

        await message.edit(embed=embed)

    except Exception as error:

        logger.exception("Project inspection failed.")

        await message.edit(
            content=f"Inspection failed: {str(error)[:1500]}"
        )


# ============================================================
# SYSTEM STATUS COMMAND
# ============================================================

@bot.command(name="status")
async def status_command(ctx):

    if not get_developer_access(ctx.author):

        await ctx.reply(
            "Developer access required."
        )

        return

    gemini_status = (
        "Configured" if is_configured(GEMINI_API_KEY)
        else "Missing"
    )

    groq_status = (
        "Configured" if is_configured(GROQ_API_KEY)
        else "Missing"
    )

    github_status = (
        "Configured"
        if (
            is_configured(GITHUB_TOKEN)
            and is_configured(GITHUB_REPOSITORY)
        )
        else "Missing"
    )

    embed = create_embed(
        "ELYX • SYSTEM STATUS",
        f"""
**Discord:** Connected
**Gemini:** {gemini_status}
**Groq:** {groq_status}
**GitHub:** {github_status}
**Repository:** {GITHUB_REPOSITORY or 'Not configured'}
**Branch:** {GITHUB_BRANCH}
**AI model:** Gemini {GEMINI_MODEL}
**Fallback model:** Groq {GROQ_MODEL}
""",
        0x2ECC71
    )

    await ctx.reply(embed=embed)


# ============================================================
# RESET CONVERSATION
# ============================================================

@bot.command(name="reset")
async def reset_command(ctx):

    USER_CONVERSATIONS.pop(
        str(ctx.author.id),
        None
    )

    await ctx.reply(
        "Tumhari current conversation history reset ho gayi."
    )


# ============================================================
# MESSAGE HANDLER
# ============================================================

@bot.event
async def on_message(message):

    if message.author.bot:
        return

    # Prefix commands are processed first.
    if message.content.startswith(PREFIX):

        await bot.process_commands(message)

        return

    if not bot.user:
        return

    # Only respond when the bot is mentioned.
    if bot.user not in message.mentions:
        return

    if message.guild is None:
        await message.reply(
            "Please use Elyx AI Developer inside the server."
        )
        return

    # Remove the bot mention from the request.
    request_text = re.sub(
        rf"<@!?{bot.user.id}>",
        "",
        message.content
    ).strip()

    if not request_text:

        await message.reply(
            "Batao, kya banana ya karwana hai?"
        )

        return

    user_id = str(message.author.id)

    # Developer coding requests.
    if (
        get_developer_access(message.author)
        and looks_like_coding_request(request_text)
    ):

        await run_coding_agent(
            message,
            request_text
        )

        return

    # Normal AI chat for developers and members.
    try:

        async with message.channel.typing():

            answer = await get_normal_ai_response(
                user_id,
                request_text
            )

        for part in split_message(answer):

            await message.reply(
                part,
                mention_author=False
            )

    except Exception as error:

        logger.exception(
            "Normal AI response failed."
        )

        await message.reply(
            "AI abhi response nahi de pa raha. "
            "API configuration ya provider status check karo."
        )


# ============================================================
# STARTUP
# ============================================================

async def start_bot():

    missing = check_configuration()

    if missing:

        logger.critical(
            "Missing configuration: %s",
            ", ".join(missing)
        )

        return

    try:

        logger.info(
            "Starting Elyx Trading AI Developer..."
        )

        await bot.start(BOT_TOKEN)

    finally:

        if HTTP_SESSION is not None and not HTTP_SESSION.closed:

            await HTTP_SESSION.close()


# ============================================================
# RUN BOT
# ============================================================

if __name__ == "__main__":

    try:

        asyncio.run(start_bot())

    except KeyboardInterrupt:

        logger.info("Bot stopped.")

    except Exception:

        logger.exception(
            "Fatal startup error."
        )


# ============================================================
# END OF ELYX TRADING AI DEVELOPER
# ============================================================
