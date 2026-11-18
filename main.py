# ============================================================
# ELYX TRADING AI DEVELOPER
# PART 1/5 — CORE, DATABASE, AI & GITHUB
# ============================================================

import os
import re
import json
import ast
import time
import base64
import hashlib
import asyncio
import sqlite3
import logging
from datetime import datetime, timezone, timedelta

import aiohttp
import discord
from discord.ext import commands
from discord import app_commands


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

BOT_NAME = "Elyx Trading"
DATABASE_NAME = "elyx_data.db"

PREFIX = "!"

MAX_AI_OUTPUT = 12000
MAX_PROJECT_CONTEXT = 18000

GEMINI_MODEL = "gemini-2.5-flash"
GROQ_MODEL = "openai/gpt-oss-20b"

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/"
    "v1beta/models/{model}:generateContent"
)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

GITHUB_API = "https://api.github.com"

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s"
)

logger = logging.getLogger("ELYX")


# ============================================================
# GLOBAL STATE
# ============================================================

http_session = None

pending_approvals = {}
active_developments = {}

bot_ready = False


# ============================================================
# DATABASE SYSTEM
# ============================================================

def get_database():

    connection = sqlite3.connect(DATABASE_NAME)

    connection.row_factory = sqlite3.Row

    return connection


def initialize_database():

    connection = get_database()

    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_memory (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            memory TEXT,
            updated_at TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS warnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT,
            user_id TEXT,
            moderator_id TEXT,
            reason TEXT,
            created_at TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS message_counts (
            guild_id TEXT,
            user_id TEXT,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (guild_id, user_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS invite_tracking (
            guild_id TEXT,
            user_id TEXT,
            invite_count INTEGER DEFAULT 0,
            PRIMARY KEY (guild_id, user_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS development_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            developer_id TEXT,
            request TEXT,
            status TEXT,
            created_at TEXT
        )
    """)

    connection.commit()
    connection.close()

    logger.info("ELYX DATABASE INITIALIZED")


def save_user_memory(user_id, username, memory):

    connection = get_database()

    connection.execute("""
        INSERT INTO user_memory
        (user_id, username, memory, updated_at)
        VALUES (?, ?, ?, ?)

        ON CONFLICT(user_id)
        DO UPDATE SET
            username = excluded.username,
            memory = excluded.memory,
            updated_at = excluded.updated_at
    """, (
        str(user_id),
        str(username),
        str(memory),
        datetime.now(timezone.utc).isoformat()
    ))

    connection.commit()
    connection.close()


def get_user_memory(user_id):

    connection = get_database()

    row = connection.execute(
        "SELECT memory FROM user_memory WHERE user_id = ?",
        (str(user_id),)
    ).fetchone()

    connection.close()

    return row["memory"] if row else ""


def record_development(developer_id, request, status):

    connection = get_database()

    connection.execute("""
        INSERT INTO development_history
        (developer_id, request, status, created_at)
        VALUES (?, ?, ?, ?)
    """, (
        str(developer_id),
        str(request),
        str(status),
        datetime.now(timezone.utc).isoformat()
    ))

    connection.commit()
    connection.close()


# ============================================================
# HTTP SESSION
# ============================================================

async def get_http_session():

    global http_session

    if http_session is None or http_session.closed:

        timeout = aiohttp.ClientTimeout(total=90)

        http_session = aiohttp.ClientSession(
            timeout=timeout
        )

    return http_session


# ============================================================
# AI RESPONSE PARSER
# ============================================================

def clean_ai_response(text):

    if not text:
        return ""

    text = text.strip()

    text = re.sub(
        r"^```(?:python|json|text)?\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(r"\s*```$", "", text)

    return text.strip()


# ============================================================
# GEMINI AI CONNECTION
# ============================================================

async def ask_gemini(prompt, system_instruction=None):

    if not GEMINI_API_KEY:
        return None

    session = await get_http_session()

    url = GEMINI_URL.format(model=GEMINI_MODEL)

    headers = {
        "Content-Type": "application/json"
    }

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": MAX_AI_OUTPUT
        }
    }

    if system_instruction:

        payload["systemInstruction"] = {
            "parts": [
                {
                    "text": system_instruction
                }
            ]
        }

    try:

        async with session.post(
            url,
            headers=headers,
            params={"key": GEMINI_API_KEY},
            json=payload
        ) as response:

            result = await response.json()

            if response.status != 200:

                logger.error(
                    "GEMINI ERROR: %s",
                    result
                )

                return None

            candidates = result.get("candidates", [])

            if not candidates:
                return None

            parts = candidates[0].get(
                "content", {}
            ).get("parts", [])

            output = "".join(
                part.get("text", "")
                for part in parts
            )

            return clean_ai_response(output)

    except Exception:

        logger.exception("GEMINI CONNECTION FAILED")

        return None


# ============================================================
# GROQ AI CONNECTION
# ============================================================

async def ask_groq(prompt, system_instruction=None):

    if not GROQ_API_KEY:
        return None

    session = await get_http_session()

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    messages = []

    if system_instruction:

        messages.append({
            "role": "system",
            "content": system_instruction
        })

    messages.append({
        "role": "user",
        "content": prompt
    })

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": MAX_AI_OUTPUT
    }

    try:

        async with session.post(
            GROQ_URL,
            headers=headers,
            json=payload
        ) as response:

            result = await response.json()

            if response.status != 200:

                logger.error(
                    "GROQ ERROR: %s",
                    result
                )

                return None

            choices = result.get("choices", [])

            if not choices:
                return None

            output = choices[0]["message"]["content"]

            return clean_ai_response(output)

    except Exception:

        logger.exception("GROQ CONNECTION FAILED")

        return None


# ============================================================
# AI ROUTER — GEMINI + GROQ
# ============================================================

async def ask_ai(prompt, system_instruction=None):

    result = await ask_gemini(
        prompt,
        system_instruction
    )

    if result:
        return result

    logger.warning(
        "Gemini unavailable. Trying Groq..."
    )

    result = await ask_groq(
        prompt,
        system_instruction
    )

    if result:
        return result

    return None


# ============================================================
# GITHUB CONNECTION
# ============================================================

def github_headers():

    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }


def github_file_url(filename):

    return (
        f"{GITHUB_API}/repos/"
        f"{GITHUB_REPOSITORY}/contents/{filename}"
    )


async def github_get_file(filename):

    if not GITHUB_TOKEN or not GITHUB_REPOSITORY:
        return None

    session = await get_http_session()

    params = {
        "ref": GITHUB_BRANCH
    }

    try:

        async with session.get(
            github_file_url(filename),
            headers=github_headers(),
            params=params
        ) as response:

            if response.status == 404:
                return None

            result = await response.json()

            if response.status != 200:

                logger.error(
                    "GITHUB READ ERROR: %s",
                    result
                )

                return None

            encoded = result.get("content", "")

            decoded = base64.b64decode(
                encoded.replace("\n", "")
            ).decode("utf-8")

            return {
                "name": filename,
                "content": decoded,
                "sha": result.get("sha")
            }

    except Exception:

        logger.exception("GITHUB READ FAILED")

        return None


async def github_save_file(
    filename,
    content,
    commit_message,
    existing_sha=None
):

    if not GITHUB_TOKEN or not GITHUB_REPOSITORY:
        return False

    session = await get_http_session()

    encoded_content = base64.b64encode(
        content.encode("utf-8")
    ).decode("utf-8")

    payload = {
        "message": commit_message,
        "content": encoded_content,
        "branch": GITHUB_BRANCH
    }

    if existing_sha:
        payload["sha"] = existing_sha

    try:

        async with session.put(
            github_file_url(filename),
            headers=github_headers(),
            json=payload
        ) as response:

            result = await response.json()

            if response.status not in (200, 201):

                logger.error(
                    "GITHUB SAVE ERROR: %s",
                    result
                )

                return False

            logger.info(
                "GITHUB FILE SAVED: %s",
                filename
            )

            return True

    except Exception:

        logger.exception("GITHUB SAVE FAILED")

        return False


# ============================================================
# PROJECT INSPECTION
# ============================================================

async def inspect_project():

    main_file, requirements_file = await asyncio.gather(
        github_get_file("main.py"),
        github_get_file("requirements.txt")
    )

    if not main_file:
        return None

    return {
        "main.py": main_file,
        "requirements.txt": requirements_file
    }


# ============================================================
# BASIC VALIDATION
# ============================================================

def validate_python_code(code):

    try:

        ast.parse(code)

        return True, "Python syntax is valid."

    except SyntaxError as error:

        return False, (
            f"Syntax error on line {error.lineno}: "
            f"{error.msg}"
        )


# ============================================================
# END OF PART 1
# ============================================================




# ============================================================
# ELYX TRADING AI DEVELOPER
# PART 2/5 — AI CODING AGENT ENGINE
# ============================================================


# ============================================================
# AI DEVELOPER IDENTITY
# ============================================================

AI_DEVELOPER_NAME = "ELYX AI DEVELOPER"

AI_DEVELOPER_INSTRUCTIONS = """
You are ELYX AI DEVELOPER.

You are an advanced autonomous software development agent
inside a Discord bot.

Your job is to understand the developer's natural language
instructions and develop the requested features.

LANGUAGE:
- Understand Hindi.
- Understand Hinglish.
- Understand English.
- Reply in the language used by the developer.

CORE ABILITIES:
1. Inspect existing project files.
2. Understand existing code architecture.
3. Plan new features.
4. Generate complete Python code.
5. Modify existing code.
6. Fix bugs.
7. Improve existing systems.
8. Update dependencies when necessary.
9. Preserve existing working features.
10. Explain proposed changes.

IMPORTANT RULES:

- Never assume a feature already exists.
- Inspect the actual project before modifying it.
- Never invent existing functions or files.
- Do not unnecessarily rewrite working code.
- Do not remove existing features without permission.
- Do not silently change existing configuration.
- Keep the project compatible with Python 3.13.
- Use discord.py 2.6.4 compatibility.
- Use asynchronous functions for network operations.
- Avoid blocking the Discord event loop.
- Handle exceptions properly.
- Do not expose API keys, tokens or passwords.
- Never place secrets inside generated source code.
- Do not create unnecessary project files.

PROJECT FILE POLICY:

The two main source/configuration files are:

1. main.py
2. requirements.txt

Runtime database files may be created automatically.

When generating changes, return complete file contents
for every file that needs modification.

Do not return incomplete snippets as replacements.

Do not claim code was tested unless it was actually tested.

SECURITY:

- Never generate code intended to steal tokens or passwords.
- Never add hidden backdoors.
- Never bypass Discord permissions.
- Never perform destructive server actions without
  explicit confirmation.
- Never save generated code to GitHub without approval.

OUTPUT:

Return valid JSON whenever the developer requests
a project modification.

Do not wrap JSON in Markdown code fences.
"""


# ============================================================
# PROJECT FILE LIMITS
# ============================================================

ALLOWED_PROJECT_FILES = {
    "main.py",
    "requirements.txt"
}


# ============================================================
# PROJECT SNAPSHOT
# ============================================================

async def get_project_snapshot():

    project = await inspect_project()

    if not project:
        return {
            "success": False,
            "error": "Could not read main.py from GitHub."
        }

    main_file = project.get("main.py")
    requirements_file = project.get("requirements.txt")

    if not main_file:
        return {
            "success": False,
            "error": "main.py was not found."
        }

    snapshot = {
        "main.py": {
            "content": main_file["content"],
            "sha": main_file["sha"]
        }
    }

    if requirements_file:

        snapshot["requirements.txt"] = {
            "content": requirements_file["content"],
            "sha": requirements_file["sha"]
        }

    else:

        snapshot["requirements.txt"] = {
            "content": "",
            "sha": None
        }

    return {
        "success": True,
        "files": snapshot
    }


# ============================================================
# PROJECT CONTEXT BUILDER
# ============================================================

def build_project_context(snapshot):

    if not snapshot.get("success"):
        return ""

    files = snapshot.get("files", {})

    context_parts = []

    for filename, data in files.items():

        content = data.get("content", "")

        context_parts.append(
            f"\n\n===== FILE: {filename} =====\n"
            f"{content}"
        )

    context = "\n".join(context_parts)

    if len(context) > MAX_PROJECT_CONTEXT:

        context = (
            context[:MAX_PROJECT_CONTEXT]
            + "\n\n[PROJECT CONTEXT TRUNCATED]"
        )

    return context


# ============================================================
# JSON RESPONSE EXTRACTOR
# ============================================================

def extract_ai_json(response):

    if not response:
        return None

    response = response.strip()

    try:

        parsed = json.loads(response)

        if isinstance(parsed, dict):
            return parsed

    except json.JSONDecodeError:
        pass

    match = re.search(
        r"\{[\s\S]*\}",
        response
    )

    if not match:
        return None

    try:

        parsed = json.loads(match.group(0))

        if isinstance(parsed, dict):
            return parsed

    except json.JSONDecodeError:

        return None

    return None


# ============================================================
# REQUEST CLASSIFICATION
# ============================================================

async def understand_developer_request(
    developer_message,
    user_id=None
):

    memory = ""

    if user_id is not None:
        memory = get_user_memory(user_id)

    prompt = f"""
DEVELOPER MESSAGE:

{developer_message}

PREVIOUS DEVELOPER CONTEXT:

{memory[:3000]}

Identify the developer's intention.

Possible intent categories:

- create_feature
- modify_feature
- fix_bug
- inspect_project
- explain_project
- discord_server_action
- general_question
- clarification_required

Return ONLY valid JSON:

{{
    "intent": "category",
    "understanding": "What the developer wants",
    "target": "Feature, file or Discord object",
    "needs_project_inspection": true,
    "needs_discord_action": false,
    "needs_code_changes": false,
    "clarification": null
}}

Do not assume a request needs code changes if it is
only a normal question.

If important information is missing, ask for clarification.
"""

    response = await ask_ai(
        prompt,
        AI_DEVELOPER_INSTRUCTIONS
    )

    result = extract_ai_json(response)

    if not result:

        return {
            "intent": "general_question",
            "understanding": developer_message,
            "target": None,
            "needs_project_inspection": False,
            "needs_discord_action": False,
            "needs_code_changes": False,
            "clarification": None
        }

    return result


# ============================================================
# DEVELOPMENT PLANNER
# ============================================================

async def create_development_plan(
    developer_message,
    snapshot
):

    project_context = build_project_context(snapshot)

    if not project_context:

        return {
            "success": False,
            "error": "Project files could not be inspected."
        }

    prompt = f"""
DEVELOPER REQUEST:

{developer_message}

CURRENT PROJECT:

{project_context}

YOUR TASK:

Understand the requested feature.

Inspect the existing architecture.

Create a practical implementation plan.

Identify:

1. Existing code that needs modification.
2. New functions or classes required.
3. Existing functions that can be reused.
4. Required dependencies.
5. Database changes if necessary.
6. Discord permissions or intents required.
7. Possible compatibility problems.
8. Testing requirements.

IMPORTANT:

Do not generate the final code yet.

Do not invent existing project functionality.

Do not remove unrelated features.

Return ONLY valid JSON:

{{
    "success": true,
    "feature_name": "Feature name",
    "understanding": "Detailed understanding",
    "implementation_steps": [
        "Step 1",
        "Step 2"
    ],
    "files_to_modify": [
        "main.py"
    ],
    "dependencies_to_add": [],
    "database_changes": [],
    "discord_permissions": [],
    "risks": [],
    "questions": []
}}
"""

    response = await ask_ai(
        prompt,
        AI_DEVELOPER_INSTRUCTIONS
    )

    result = extract_ai_json(response)

    if not result:

        return {
            "success": False,
            "error": "AI could not create a valid development plan."
        }

    result["success"] = True

    return result


# ============================================================
# CODE GENERATION ENGINE
# ============================================================

async def generate_project_changes(
    developer_message,
    snapshot,
    development_plan
):

    project_context = build_project_context(snapshot)

    if not project_context:

        return {
            "success": False,
            "error": "Project context is missing."
        }

    prompt = f"""
DEVELOPER REQUEST:

{developer_message}

APPROVED DEVELOPMENT PLAN:

{json.dumps(development_plan, ensure_ascii=False, indent=2)}

CURRENT PROJECT FILES:

{project_context}

YOUR TASK:

Implement the requested feature.

Return the complete contents of every changed file.

FILES ALLOWED:

- main.py
- requirements.txt

IMPORTANT REQUIREMENTS:

1. Preserve all unrelated working features.
2. Integrate with the actual existing code.
3. Do not duplicate existing event handlers.
4. Do not duplicate Discord command registrations.
5. Do not create missing imports.
6. Keep indentation and syntax correct.
7. Use async/await correctly.
8. Keep Discord API compatibility.
9. Add error handling.
10. Do not hardcode secrets.
11. Do not remove existing environment variables.
12. Do not overwrite requirements unnecessarily.
13. Do not claim the code was executed or tested.
14. Do not create any additional source files.

Return ONLY valid JSON:

{{
    "success": true,
    "summary": "Changes made",
    "files": {{
        "main.py": "COMPLETE FILE CONTENT"
    }},
    "requirements_changed": false,
    "warnings": [],
    "testing_required": []
}}

If requirements.txt must change, include its complete
contents inside files and set requirements_changed to true.

If the task cannot be safely completed, return:

{{
    "success": false,
    "error": "Reason",
    "questions": []
}}

Do not use Markdown code fences.
"""

    response = await ask_ai(
        prompt,
        AI_DEVELOPER_INSTRUCTIONS
    )

    result = extract_ai_json(response)

    if not result:

        return {
            "success": False,
            "error": "AI returned an invalid code-generation response."
        }

    if not result.get("success"):

        return result

    generated_files = result.get("files")

    if not isinstance(generated_files, dict):

        return {
            "success": False,
            "error": "AI did not return a valid files object."
        }

    if not generated_files:

        return {
            "success": False,
            "error": "AI did not generate any project files."
        }

    for filename, content in generated_files.items():

        if filename not in ALLOWED_PROJECT_FILES:

            return {
                "success": False,
                "error": f"Unauthorized project file: {filename}"
            }

        if not isinstance(content, str):

            return {
                "success": False,
                "error": f"Invalid content for {filename}"
            }

    return result


# ============================================================
# GENERATED CODE VALIDATION
# ============================================================

def validate_generated_project(
    generated_files,
    original_snapshot
):

    if not isinstance(generated_files, dict):

        return {
            "success": False,
            "errors": ["Invalid generated files."]
        }

    errors = []

    for filename, content in generated_files.items():

        if filename not in ALLOWED_PROJECT_FILES:

            errors.append(
                f"Unauthorized file: {filename}"
            )

            continue

        if not isinstance(content, str):

            errors.append(
                f"{filename} content must be text."
            )

            continue

        if not content.strip():

            errors.append(
                f"{filename} cannot be empty."
            )

            continue

        if filename == "main.py":

            valid, message = validate_python_code(
                content
            )

            if not valid:
                errors.append(message)

        if filename == "requirements.txt":

            for line_number, line in enumerate(
                content.splitlines(),
                start=1
            ):

                line = line.strip()

                if not line or line.startswith("#"):
                    continue

                if line.startswith("-"):
                    continue

                if not re.match(
                    r"^[A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_,.-]+\])?(?:\s*.*)?$",
                    line
                ):

                    errors.append(
                        f"Invalid dependency on line {line_number}."
                    )

    if errors:

        return {
            "success": False,
            "errors": errors
        }

    return {
        "success": True,
        "errors": []
    }


# ============================================================
# CHANGE SUMMARY
# ============================================================

def create_change_summary(
    generated_result,
    original_snapshot
):

    files = generated_result.get("files", {})

    summary = {
        "feature_summary": generated_result.get(
            "summary",
            "Project changes generated."
        ),
        "changed_files": [],
        "warnings": generated_result.get(
            "warnings",
            []
        ),
        "testing_required": generated_result.get(
            "testing_required",
            []
        )
    }

    for filename, new_content in files.items():

        old_content = ""

        original = original_snapshot.get(
            "files",
            {}
        ).get(filename)

        if original:
            old_content = original.get("content", "")

        summary["changed_files"].append({
            "filename": filename,
            "old_characters": len(old_content),
            "new_characters": len(new_content),
            "changed": old_content != new_content
        })

    return summary


# ============================================================
# END OF PART 2
# ==========================================================
==
# ============================================================
# ELYX TRADING AI DEVELOPER
# PART 3/5 — NATURAL LANGUAGE + HARD ACCESS
# ============================================================

import secrets


# ============================================================
# DEVELOPER ACCESS
# ============================================================

DEVELOPER_ROLE_ID = 1572448688700391454


def has_developer_access(member):

    if not isinstance(member, discord.Member):
        return False

    return any(
        role.id == DEVELOPER_ROLE_ID
        for role in member.roles
    )


# ============================================================
# PENDING APPROVAL STORAGE
# ============================================================

pending_approvals = {}

APPROVAL_TIMEOUT = 600


def create_approval_id():

    return secrets.token_hex(4).upper()


def cleanup_pending_approvals():

    current_time = time.time()

    expired = []

    for approval_id, data in pending_approvals.items():

        if current_time - data["created_at"] > APPROVAL_TIMEOUT:
            expired.append(approval_id)

    for approval_id in expired:
        pending_approvals.pop(approval_id, None)


# ============================================================
# DISCORD MESSAGE HELPERS
# ============================================================

async def send_developer_message(message, content):

    if len(content) <= 1900:

        await message.reply(
            content,
            mention_author=False
        )

        return

    for start in range(0, len(content), 1900):

        await message.channel.send(
            content[start:start + 1900]
        )


# ============================================================
# GENERAL AI CHAT
# ============================================================

async def handle_general_developer_chat(message):

    prompt = f"""
You are Elyx Trading AI Developer.

The developer sent this normal message:

{message.content}

Reply naturally and helpfully.

Language:
Use the same language as the developer.

Do not claim that you performed an action unless
the action was actually completed.

If the developer requests a code change, explain
that you are preparing a development plan.
"""

    response = await ask_ai(
        prompt,
        AI_DEVELOPER_INSTRUCTIONS
    )

    if not response:

        await send_developer_message(
            message,
            "AI service abhi available nahi hai. "
            "Gemini aur Groq API connection check karna padega."
        )

        return

    await send_developer_message(
        message,
        response
    )


# ============================================================
# DEVELOPMENT REQUEST PROCESSOR
# ============================================================

async def process_development_request(message):

    user_id = message.author.id

    await send_developer_message(
        message,
        "ELYX AI Developer: Request samajh rahi hoon aur project inspect kar rahi hoon..."
    )

    # ----------------------------------------
    # STEP 1 — UNDERSTAND REQUEST
    # ----------------------------------------

    understanding = await understand_developer_request(
        message.content,
        user_id
    )

    intent = understanding.get("intent")

    # ----------------------------------------
    # STEP 2 — NORMAL QUESTION
    # ----------------------------------------

    if intent in (
        "general_question",
        "explain_project"
    ):

        await handle_general_developer_chat(message)

        return

    # ----------------------------------------
    # STEP 3 — DISCORD ACTION
    # ----------------------------------------

    if intent == "discord_server_action":

        await send_developer_message(
            message,
            "Samajh gayi. Discord server editing system "
            "next integration mein connect hoga. "
            "Abhi koi server change nahi kiya gaya."
        )

        return

    # ----------------------------------------
    # STEP 4 — CLARIFICATION
    # ----------------------------------------

    if intent == "clarification_required":

        clarification = understanding.get(
            "clarification"
        ) or "Request clear nahi hai. Thoda aur detail batao."

        await send_developer_message(
            message,
            clarification
        )

        return

    # ----------------------------------------
    # STEP 5 — INSPECT PROJECT
    # ----------------------------------------

    snapshot = await get_project_snapshot()

    if not snapshot.get("success"):

        await send_developer_message(
            message,
            "GitHub project inspect nahi ho paya. "
            "Repository settings aur GitHub token check karo."
        )

        return

    # ----------------------------------------
    # STEP 6 — CREATE DEVELOPMENT PLAN
    # ----------------------------------------

    await send_developer_message(
        message,
        "Project mil gaya. Ab feature ka development plan bana rahi hoon..."
    )

    plan = await create_development_plan(
        message.content,
        snapshot
    )

    if not plan.get("success"):

        await send_developer_message(
            message,
            "Development plan nahi ban paya:\n"
            + str(plan.get("error"))
        )

        return

    if plan.get("questions"):

        await send_developer_message(
            message,
            "Ek clarification chahiye:\n"
            + "\n".join(
                str(q)
                for q in plan["questions"]
            )
        )

        return

    # ----------------------------------------
    # STEP 7 — GENERATE CODE
    # ----------------------------------------

    await send_developer_message(
        message,
        "Plan ready. Ab complete code generate kar rahi hoon..."
    )

    generated = await generate_project_changes(
        message.content,
        snapshot,
        plan
    )

    if not generated.get("success"):

        await send_developer_message(
            message,
            "Code generate nahi hua:\n"
            + str(generated.get("error"))
        )

        return

    # ----------------------------------------
    # STEP 8 — VALIDATE GENERATED FILES
    # ----------------------------------------

    validation = validate_generated_project(
        generated.get("files"),
        snapshot
    )

    if not validation.get("success"):

        await send_developer_message(
            message,
            "Generated code validation fail hui:\n"
            + "\n".join(validation["errors"])
        )

        return

    # ----------------------------------------
    # STEP 9 — CREATE APPROVAL REQUEST
    # ----------------------------------------

    approval_id = create_approval_id()

    pending_approvals[approval_id] = {
        "developer_id": user_id,
        "guild_id": message.guild.id,
        "files": generated["files"],
        "snapshot": snapshot,
        "summary": generated.get("summary", ""),
        "created_at": time.time()
    }

    record_development(
        user_id,
        message.content,
        "WAITING_FOR_APPROVAL"
    )

    summary = create_change_summary(
        generated,
        snapshot
    )

    report = (
        "ELYX AI DEVELOPER — CODE READY\n\n"
        f"Feature: {plan.get('feature_name', 'New Feature')}\n\n"
        f"Summary: {summary['feature_summary']}\n\n"
        "Files changed:\n"
    )

    for file_info in summary["changed_files"]:

        report += (
            f"\n• {file_info['filename']}"
            f"\n  Old size: {file_info['old_characters']} characters"
            f"\n  New size: {file_info['new_characters']} characters"
        )

    report += (
        "\n\nCode syntax validation: PASSED"
        "\nExecution testing: NOT YET PERFORMED"
        f"\n\nApproval ID: `{approval_id}`"
        "\n\nCode save karne ke liye message bhejo:"
        f"\n`APPROVE {approval_id}`"
        "\n\nCancel karne ke liye:"
        f"\n`CANCEL {approval_id}`"
        "\n\nApproval 10 minutes mein expire ho jayegi."
    )

    await send_developer_message(
        message,
        report
    )


# ============================================================
# APPROVAL PROCESSOR
# ============================================================

async def process_approval_message(message):

    parts = message.content.strip().split()

    if len(parts) != 2:
        return False

    action = parts[0].upper()
    approval_id = parts[1].upper()

    if action not in ("APPROVE", "CANCEL"):
        return False

    data = pending_approvals.get(approval_id)

    if not data:
        await send_developer_message(
            message,
            "Approval ID invalid ya expired hai."
        )
        return True

    if data["developer_id"] != message.author.id:
        await send_developer_message(
            message,
            "Ye approval kisi aur developer ki hai."
        )
        return True

    if data["guild_id"] != message.guild.id:
        await send_developer_message(
            message,
            "Approval original server mein hi use ho sakti hai."
        )
        return True

    if time.time() - data["created_at"] > APPROVAL_TIMEOUT:

        pending_approvals.pop(approval_id, None)

        await send_developer_message(
            message,
            "Approval expire ho gayi."
        )

        return True

    if action == "CANCEL":

        pending_approvals.pop(approval_id, None)

        record_development(
            message.author.id,
            "Cancelled approval " + approval_id,
            "CANCELLED"
        )

        await send_developer_message(
            message,
            "Code changes cancel kar diye gaye. GitHub update nahi hua."
        )

        return True

    # ----------------------------------------
    # APPROVE — VERIFY ORIGINAL FILE VERSION
    # ----------------------------------------

    await send_developer_message(
        message,
        "Approval received. GitHub ke current code versions verify kar rahi hoon..."
    )

    latest_snapshot = await get_project_snapshot()

    if not latest_snapshot.get("success"):

        await send_developer_message(
            message,
            "Latest GitHub project read nahi ho paya. Save rok diya."
        )

        return True

    original_files = data["snapshot"]["files"]
    latest_files = latest_snapshot["files"]

    for filename in data["files"]:

        old_sha = original_files.get(
            filename,
            {}
        ).get("sha")

        latest_sha = latest_files.get(
            filename,
            {}
        ).get("sha")

        if old_sha != latest_sha:

            await send_developer_message(
                message,
                f"{filename} GitHub par approval ke baad change hui hai. "
                "Conflict detected. Purana code overwrite nahi kiya."
            )

            pending_approvals.pop(approval_id, None)

            return True

    # ----------------------------------------
    # SAVE APPROVED FILES
    # ----------------------------------------

    save_success = True

    for filename, content in data["files"].items():

        existing_sha = latest_files.get(
            filename,
            {}
        ).get("sha")

        saved = await github_save_file(
            filename,
            content,
            f"ELYX AI: Update {filename}",
            existing_sha
        )

        if not saved:

            save_success = False

            break

    pending_approvals.pop(approval_id, None)

    if save_success:

        record_development(
            message.author.id,
            data["summary"],
            "SAVED_TO_GITHUB"
        )

        await send_developer_message(
            message,
            "SUCCESS: Approved code GitHub mein save ho gaya.\n"
            "Naye code ko activate karne ke liye hosting par restart/redeploy "
            "ki zaroorat ho sakti hai."
        )

    else:

        record_development(
            message.author.id,
            data["summary"],
            "GITHUB_SAVE_FAILED"
        )

        await send_developer_message(
            message,
            "GitHub update complete nahi hua. Logs check karne honge."
        )

    return True


# ============================================================
# NATURAL MESSAGE LISTENER
# ============================================================

@bot.listen("on_message")
async def elyx_ai_message_listener(message):

    if message.author.bot:
        return

    if not message.guild:
        return

    # Ignore messages without developer role.
    if not has_developer_access(message.author):
        return

    cleanup_pending_approvals()

    # Handle approval/cancel first.
    handled = await process_approval_message(message)

    if handled:
        return

    # Ignore bot commands and unrelated prefix messages.
    if message.content.startswith(PREFIX):
        return

    # Store developer context.
    save_user_memory(
        message.author.id,
        message.author.name,
        message.content[:3000]
    )

    try:

        async with message.channel.typing():

            understanding = await understand_developer_request(
                message.content,
                message.author.id
            )

            if understanding.get("needs_code_changes") or (
                understanding.get("intent") in (
                    "create_feature",
                    "modify_feature",
                    "fix_bug"
                )
            ):

                await process_development_request(message)

            elif understanding.get("intent") == "discord_server_action":

                await process_development_request(message)

            else:

                await handle_general_developer_chat(message)

    except Exception:

        logger.exception(
            "ELYX AI MESSAGE HANDLER FAILED"
        )

        await send_developer_message(
            message,
            "Request process karte waqt error aaya. Logs check karne honge."
        )


# ============================================================
# END OF PART 3
# ============================================================


# ============================================================
# ELYX TRADING AI DEVELOPER
# PART 4/5 — DISCORD SERVER EDITING ENGINE
# ============================================================


# ============================================================
# SERVER ACTION CONFIGURATION
# ============================================================

SERVER_ACTION_TIMEOUT = 300

pending_server_actions = {}


# ============================================================
# DISCORD ACTION AI INSTRUCTIONS
# ============================================================

DISCORD_ACTION_INSTRUCTIONS = """
You are the Discord Server Management AI of Elyx Trading.

Understand natural language instructions in Hindi,
Hinglish and English.

The developer can request Discord server changes naturally.

Examples:

- Create a category named Elyx Games.
- Create battle-room inside Elyx Games.
- Create a category and multiple channels together.
- Create a role named Battle Manager.
- Rename an existing channel.
- Delete a channel.
- Rename a role.
- Delete a role.

IMPORTANT:

1. Understand the complete request.
2. Preserve exact names.
3. Never shorten names.
4. Never replace requested names with single letters.
5. Never invent names.
6. Never assume a missing category.
7. Resolve existing Discord objects before modifying them.
8. If an object is ambiguous, ask for clarification.
9. Never execute an action without developer confirmation.
10. Never claim an action succeeded before Discord confirms it.

Return ONLY valid JSON.

Supported actions:

create_category
create_text_channel
create_voice_channel
delete_channel
rename_channel
create_role
delete_role
rename_role

JSON FORMAT:

{
    "understood": true,
    "explanation": "Explanation",
    "actions": [
        {
            "type": "create_category",
            "name": "Elyx Games"
        },
        {
            "type": "create_text_channel",
            "name": "battle-room",
            "category": "Elyx Games"
        }
    ],
    "questions": []
}

For a category that already exists, do not create it again.

For missing information, return questions.

Do not return Markdown.
"""


# ============================================================
# SERVER ACTION VALIDATION
# ============================================================

ALLOWED_SERVER_ACTIONS = {
    "create_category",
    "create_text_channel",
    "create_voice_channel",
    "delete_channel",
    "rename_channel",
    "create_role",
    "delete_role",
    "rename_role"
}


def validate_server_action_plan(plan):

    if not isinstance(plan, dict):
        return False, "Invalid action plan."

    actions = plan.get("actions")

    if not isinstance(actions, list) or not actions:
        return False, "No Discord actions were generated."

    if len(actions) > 15:
        return False, "Maximum 15 actions allowed per request."

    for action in actions:

        if not isinstance(action, dict):
            return False, "Invalid action format."

        action_type = action.get("type")

        if action_type not in ALLOWED_SERVER_ACTIONS:
            return False, f"Unsupported action: {action_type}"

        if action_type in (
            "create_category",
            "create_text_channel",
            "create_voice_channel",
            "create_role",
            "rename_channel",
            "rename_role"
        ):

            name = action.get("name")

            if not isinstance(name, str) or not name.strip():
                return False, "An action is missing its exact name."

            if len(name) > 100:
                return False, "Name exceeds Discord's length limit."

        if action_type in (
            "delete_channel",
            "rename_channel"
        ):

            if not action.get("channel"):
                return False, "Channel name is missing."

        if action_type in (
            "delete_role",
            "rename_role"
        ):

            if not action.get("role"):
                return False, "Role name is missing."

    return True, "Action plan valid."


# ============================================================
# CREATE DISCORD ACTION PLAN
# ============================================================

async def create_discord_action_plan(
    developer_request,
    guild
):

    server_info = await get_server_information(guild)

    prompt = f"""
DEVELOPER REQUEST:

{developer_request}

CURRENT DISCORD SERVER:

{json.dumps(server_info, ensure_ascii=False, indent=2)}

Understand the complete request.

Create a sequence of Discord actions.

For example:

If the developer requests:

"Create Elyx Games category and add
battle-room and game-chat inside it"

Return three actions:

1. Create category Elyx Games.
2. Create text channel battle-room inside Elyx Games.
3. Create text channel game-chat inside Elyx Games.

Preserve exact names.

If the category already exists, reuse it.

If a channel or role name is ambiguous,
ask the developer.

Return ONLY JSON in the required format.
"""

    response = await ask_ai(
        prompt,
        DISCORD_ACTION_INSTRUCTIONS
    )

    result = extract_ai_json(response)

    if not result:
        return {
            "success": False,
            "error": "AI returned invalid Discord action data."
        }

    if result.get("questions"):

        return {
            "success": False,
            "questions": result["questions"]
        }

    valid, error = validate_server_action_plan(result)

    if not valid:
        return {
            "success": False,
            "error": error
        }

    return {
        "success": True,
        "plan": result
    }


# ============================================================
# FIND DISCORD OBJECTS
# ============================================================

def find_channel_exact(guild, name):

    name = name.strip().casefold()

    matches = [
        channel
        for channel in guild.channels
        if channel.name.casefold() == name
    ]

    if len(matches) == 1:
        return matches[0]

    return None


def find_role_exact(guild, name):

    name = name.strip().casefold()

    matches = [
        role
        for role in guild.roles
        if role.name.casefold() == name
        and not role.is_default()
    ]

    if len(matches) == 1:
        return matches[0]

    return None


# ============================================================
# EXECUTE ONE SERVER ACTION
# ============================================================

async def execute_server_action(guild, action):

    action_type = action["type"]

    # ----------------------------------------
    # CREATE CATEGORY
    # ----------------------------------------

    if action_type == "create_category":

        name = action["name"].strip()

        existing = find_server_category(guild, name)

        if existing:
            return {
                "success": True,
                "message": f"Category already exists: {name}",
                "object_id": existing.id
            }

        if not bot_has_permission(guild, "manage_channels"):
            raise PermissionError("Manage Channels permission required.")

        category = await guild.create_category(
            name=name,
            reason="Elyx AI Developer approved action"
        )

        return {
            "success": True,
            "message": f"Category created: {category.name}",
            "object_id": category.id
        }

    # ----------------------------------------
    # CREATE TEXT CHANNEL
    # ----------------------------------------

    if action_type == "create_text_channel":

        name = action["name"].strip()

        category_name = action.get("category")

        category = None

        if category_name:

            category = find_server_category(
                guild,
                category_name
            )

            if not category:
                raise ValueError(
                    f"Category not found: {category_name}"
                )

        existing = find_channel_exact(guild, name)

        if existing:

            if existing.category_id == (
                category.id if category else None
            ):

                return {
                    "success": True,
                    "message": f"Channel already exists: {name}",
                    "object_id": existing.id
                }

            raise ValueError(
                f"Channel {name} already exists in another category."
            )

        if not bot_has_permission(guild, "manage_channels"):
            raise PermissionError("Manage Channels permission required.")

        channel = await guild.create_text_channel(
            name=name,
            category=category,
            reason="Elyx AI Developer approved action"
        )

        return {
            "success": True,
            "message": f"Text channel created: {channel.name}",
            "object_id": channel.id
        }

    # ----------------------------------------
    # CREATE VOICE CHANNEL
    # ----------------------------------------

    if action_type == "create_voice_channel":

        name = action["name"].strip()

        category = None

        if action.get("category"):

            category = find_server_category(
                guild,
                action["category"]
            )

            if not category:
                raise ValueError("Requested category not found.")

        if find_channel_exact(guild, name):
            raise ValueError("A channel with this name already exists.")

        if not bot_has_permission(guild, "manage_channels"):
            raise PermissionError("Manage Channels permission required.")

        channel = await guild.create_voice_channel(
            name=name,
            category=category,
            reason="Elyx AI Developer approved action"
        )

        return {
            "success": True,
            "message": f"Voice channel created: {channel.name}",
            "object_id": channel.id
        }

    # ----------------------------------------
    # DELETE CHANNEL
    # ----------------------------------------

    if action_type == "delete_channel":

        channel = find_channel_exact(
            guild,
            action["channel"]
        )

        if not channel:
            raise ValueError("Channel not found or ambiguous.")

        if not bot_has_permission(guild, "manage_channels"):
            raise PermissionError("Manage Channels permission required.")

        channel_name = channel.name

        await channel.delete(
            reason="Elyx AI Developer approved action"
        )

        return {
            "success": True,
            "message": f"Channel deleted: {channel_name}"
        }

    # ----------------------------------------
    # RENAME CHANNEL
    # ----------------------------------------

    if action_type == "rename_channel":

        channel = find_channel_exact(
            guild,
            action["channel"]
        )

        if not channel:
            raise ValueError("Channel not found or ambiguous.")

        if not bot_has_permission(guild, "manage_channels"):
            raise PermissionError("Manage Channels permission required.")

        old_name = channel.name

        await channel.edit(
            name=action["name"].strip(),
            reason="Elyx AI Developer approved action"
        )

        return {
            "success": True,
            "message": f"Channel renamed: {old_name} → {channel.name}"
        }

    # ----------------------------------------
    # CREATE ROLE
    # ----------------------------------------

    if action_type == "create_role":

        name = action["name"].strip()

        if find_role_exact(guild, name):
            raise ValueError("Role already exists.")

        if not bot_has_permission(guild, "manage_roles"):
            raise PermissionError("Manage Roles permission required.")

        role = await guild.create_role(
            name=name,
            reason="Elyx AI Developer approved action"
        )

        return {
            "success": True,
            "message": f"Role created: {role.name}",
            "object_id": role.id
        }

    # ----------------------------------------
    # DELETE ROLE
    # ----------------------------------------

    if action_type == "delete_role":

        role = find_role_exact(
            guild,
            action["role"]
        )

        if not role:
            raise ValueError("Role not found or ambiguous.")

        if role >= guild.me.top_role or role.managed:
            raise PermissionError("Bot cannot manage this role.")

        if not bot_has_permission(guild, "manage_roles"):
            raise PermissionError("Manage Roles permission required.")

        role_name = role.name

        await role.delete(
            reason="Elyx AI Developer approved action"
        )

        return {
            "success": True,
            "message": f"Role deleted: {role_name}"
        }

    # ----------------------------------------
    # RENAME ROLE
    # ----------------------------------------

    if action_type == "rename_role":

        role = find_role_exact(
            guild,
            action["role"]
        )

        if not role:
            raise ValueError("Role not found or ambiguous.")

        if role >= guild.me.top_role or role.managed:
            raise PermissionError("Bot cannot manage this role.")

        if not bot_has_permission(guild, "manage_roles"):
            raise PermissionError("Manage Roles permission required.")

        old_name = role.name

        await role.edit(
            name=action["name"].strip(),
            reason="Elyx AI Developer approved action"
        )

        return {
            "success": True,
            "message": f"Role renamed: {old_name} → {role.name}"
        }

    raise ValueError("Unsupported Discord action.")


# ============================================================
# PREPARE SERVER ACTIONS FOR APPROVAL
# ============================================================

async def prepare_server_actions(message):

    result = await create_discord_action_plan(
        message.content,
        message.guild
    )

    if not result.get("success"):

        questions = result.get("questions")

        if questions:

            await send_developer_message(
                message,
                "Thodi clarification chahiye:\n"
                + "\n".join(str(q) for q in questions)
            )

        else:

            await send_developer_message(
                message,
                "Discord action plan nahi bana:\n"
                + str(result.get("error"))
            )

        return

    plan = result["plan"]

    action_id = create_approval_id()

    pending_server_actions[action_id] = {
        "developer_id": message.author.id,
        "guild_id": message.guild.id,
        "actions": plan["actions"],
        "created_at": time.time()
    }

    report = (
        "ELYX AI — SERVER ACTION PREVIEW\n\n"
        + str(plan.get("explanation", "Requested changes"))
        + "\n\nProposed changes:\n"
    )

    for index, action in enumerate(
        plan["actions"],
        start=1
    ):

        report += (
            f"\n{index}. "
            + json.dumps(
                action,
                ensure_ascii=False
            )
        )

    report += (
        "\n\nKoi action abhi execute nahi hua."
        f"\n\nApprove: `SERVER APPROVE {action_id}`"
        f"\nCancel: `SERVER CANCEL {action_id}`"
        "\n\nApproval 5 minutes mein expire hogi."
    )

    await send_developer_message(
        message,
        report
    )


# ============================================================
# SERVER ACTION APPROVAL
# ============================================================

async def process_server_approval(message):

    parts = message.content.strip().split()

    if len(parts) != 3:
        return False

    if parts[0].upper() != "SERVER":
        return False

    action = parts[1].upper()
    action_id = parts[2].upper()

    if action not in ("APPROVE", "CANCEL"):
        return False

    data = pending_server_actions.get(action_id)

    if not data:

        await send_developer_message(
            message,
            "Server approval invalid ya expired hai."
        )

        return True

    if data["developer_id"] != message.author.id:

        await send_developer_message(
            message,
            "Ye approval tumhari nahi hai."
        )

        return True

    if data["guild_id"] != message.guild.id:

        await send_developer_message(
            message,
            "Approval original server mein use karo."
        )

        return True

    if time.time() - data["created_at"] > SERVER_ACTION_TIMEOUT:

        pending_server_actions.pop(action_id, None)

        await send_developer_message(
            message,
            "Server approval expire ho gayi."
        )

        return True

    if action == "CANCEL":

        pending_server_actions.pop(action_id, None)

        await send_developer_message(
            message,
            "Server changes cancel kar diye gaye."
        )

        return True

    pending_server_actions.pop(action_id, None)

    await send_developer_message(
        message,
        "Approval received. Discord changes execute ho rahe hain..."
    )

    results = []

    for item in data["actions"]:

        try:

            result = await execute_server_action(
                message.guild,
                item
            )

            results.append(
                "SUCCESS: " + result["message"]
            )

        except Exception as error:

            logger.exception("SERVER ACTION FAILED")

            results.append(
                "FAILED: " + str(error)
            )

            # Stop after a failed dependency.
            break

    report = "ELYX SERVER ACTION RESULTS\n\n"

    report += "\n".join(results)

    await send_developer_message(
        message,
        report
    )

    return True


# ============================================================
# EXTEND EXISTING APPROVAL PROCESSOR
# ============================================================

_previous_process_approval_message = process_approval_message


async def process_approval_message(message):

    handled = await process_server_approval(message)

    if handled:
        return True

    return await _previous_process_approval_message(message)


# ============================================================
# CONNECT SERVER ACTION ENGINE TO DEVELOPMENT ENGINE
# ============================================================

_previous_process_development_request = process_development_request


async def process_development_request(message):

    understanding = await understand_developer_request(
        message.content,
        message.author.id
    )

    if understanding.get("intent") == "discord_server_action":

        await prepare_server_actions(message)

        return

    await _previous_process_development_request(message)


# ============================================================
# END OF PART 4
# ============================================================



# ============================================================
# PART 5/5 — FINAL INTEGRATION & BOT STARTUP
# ============================================================

import traceback
from datetime import timedelta


# ============================================================
# FINAL CONFIGURATION
# ============================================================

RUN_TOKEN = os.getenv("DISCORD_TOKEN")

if not RUN_TOKEN:
    raise RuntimeError(
        "DISCORD_TOKEN missing from FadeHost environment variables."
    )


# ============================================================
# BOT STATUS
# ============================================================

bot_ready = False


# ============================================================
# FINAL ERROR HANDLER
# ============================================================

@bot.event
async def on_command_error(ctx, error):

    if isinstance(error, commands.CommandNotFound):
        return

    logger.error(
        "COMMAND ERROR: %s",
        error
    )


# ============================================================
# START BOT
# ============================================================

if __name__ == "__main__":

    try:

        logger.info(
            "STARTING ELYX TRADING AI DEVELOPER..."
        )

        bot.run(
            RUN_TOKEN,
            reconnect=True,
            log_handler=None
        )

    except KeyboardInterrupt:

        logger.info(
            "ELYX BOT STOPPED BY USER"
        )

    except Exception as error:

        logger.critical(
            "ELYX BOT STARTUP FAILED: %s",
            error
        )

        traceback.print_exc()
        raise

# ============================================================
# END OF PART 5/5
# ============================================================

