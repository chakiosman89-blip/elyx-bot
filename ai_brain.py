import os
import logging
import aiohttp

from dotenv import load_dotenv


load_dotenv()

logger = logging.getLogger("ELYX_AI")

# Existing FadeHost environment variables — unchanged
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-3.8-flash"
)

GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-20b"
)

AI_PROVIDER_ORDER = os.getenv(
    "AI_PROVIDER_ORDER",
    "gemini,groq"
)

TIMEOUT = aiohttp.ClientTimeout(total=60)

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/interactions"
)

GROQ_URL = (
    "https://api.groq.com/openai/v1/chat/completions"
)


SYSTEM_PROMPT = """
You are ELYX TRADING AI DEVELOPER.

Your purpose is to assist members and developers of Elyx Trading.

ACCESS RULES:
- Respect the access level supplied in the conversation.
- Normal members receive normal AI assistance.
- Developers receive advanced development assistance.
- Never claim a Discord action was completed unless confirmed.
- Never claim a GitHub file was changed unless confirmed.
- Never claim code was tested unless it was actually tested.
- Never reveal API keys, tokens or private configuration.

DEVELOPMENT:
- Help build and improve Python Discord bot features.
- Explain technical limitations honestly.
- Require human approval before important code changes.
- Respect Discord permissions and platform rules.

LANGUAGE:
- Understand Hindi, Hinglish and English.
- Reply naturally in the member's language.
- Keep answers clear and useful.
"""


class AIUnavailableError(Exception):
    pass


def build_gemini_input(messages):
    """Convert conversation history into a readable prompt."""

    parts = []

    for message in messages:

        role = message.get("role", "user")
        content = message.get("content", "")

        if not isinstance(content, str):
            continue

        if role == "assistant":
            label = "ELYX AI"
        else:
            label = "MEMBER"

        parts.append(f"{label}: {content}")

    return "\n\n".join(parts)


def build_groq_messages(messages):

    result = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    for message in messages:

        role = message.get("role", "user")
        content = message.get("content", "")

        if role not in ("user", "assistant"):
            role = "user"

        if isinstance(content, str) and content.strip():

            result.append({
                "role": role,
                "content": content
            })

    return result


async def ask_gemini(messages):

    if not GEMINI_API_KEY:
        raise AIUnavailableError("Gemini API key is missing.")

    payload = {
        "model": GEMINI_MODEL,
        "input": build_gemini_input(messages),
        "system_instruction": SYSTEM_PROMPT,
        "store": False
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
        "Api-Revision": "2026-05-20"
    }

    async with aiohttp.ClientSession(
        timeout=TIMEOUT
    ) as session:

        async with session.post(
            GEMINI_URL,
            headers=headers,
            json=payload
        ) as response:

            data = await response.json(content_type=None)

            if response.status != 200:

                logger.error(
                    "Gemini API returned HTTP %s",
                    response.status
                )

                raise AIUnavailableError(
                    "Gemini request failed."
                )

            # Current Interactions API response format
            steps = data.get("steps", [])

            text_parts = []

            for step in steps:

                if step.get("type") != "model_output":
                    continue

                for item in step.get("content", []):

                    if item.get("type") == "text":
                        text_parts.append(
                            item.get("text", "")
                        )

            result = "\n".join(text_parts).strip()

            if not result:
                raise AIUnavailableError(
                    "Gemini returned no text."
                )

            return result


async def ask_groq(messages):

    if not GROQ_API_KEY:
        raise AIUnavailableError("Groq API key is missing.")

    payload = {
        "model": GROQ_MODEL,
        "messages": build_groq_messages(messages),
        "temperature": 0.7,
        "max_completion_tokens": 2048
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    async with aiohttp.ClientSession(
        timeout=TIMEOUT
    ) as session:

        async with session.post(
            GROQ_URL,
            headers=headers,
            json=payload
        ) as response:

            data = await response.json(content_type=None)

            if response.status != 200:

                logger.error(
                    "Groq API returned HTTP %s",
                    response.status
                )

                raise AIUnavailableError(
                    "Groq request failed."
                )

            choices = data.get("choices", [])

            if not choices:
                raise AIUnavailableError(
                    "Groq returned no choices."
                )

            result = (
                choices[0]
                .get("message", {})
                .get("content", "")
            )

            if not isinstance(result, str) or not result.strip():
                raise AIUnavailableError(
                    "Groq returned no text."
                )

            return result.strip()


async def generate_reply(messages):

    providers = [
        item.strip().lower()
        for item in AI_PROVIDER_ORDER.split(",")
        if item.strip()
    ]

    errors = []

    for provider in providers:

        try:

            if provider == "gemini":
                return await ask_gemini(messages)

            if provider == "groq":
                return await ask_groq(messages)

            logger.warning(
                "Unknown AI provider: %s",
                provider
            )

        except Exception as error:

            logger.exception(
                "%s provider failed.",
                provider
            )

            errors.append(
                f"{provider}: {type(error).__name__}"
            )

    raise AIUnavailableError(
        "All configured AI providers failed. "
        + "; ".join(errors)
)
