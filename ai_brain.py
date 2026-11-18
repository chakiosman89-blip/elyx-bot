import os
import aiohttp


SYSTEM_PROMPT = """
You are ELYX TRADING AI DEVELOPER.

Understand English, Hindi, Hinglish and informal messages.

You have two access levels:

DEVELOPER:
Help with advanced development, planning and authorized
Discord administration.

NORMAL MEMBER:
Help with ordinary member features and general questions.
Never claim normal members can perform developer-only actions.

IMPORTANT:
- Never claim an action was completed without tool confirmation.
- Never invent server information.
- Never pretend to execute code or Discord actions.
- Ask short clarification questions when necessary.
- Reply in the user's language.
"""


class AIUnavailableError(Exception):
    pass


def get_messages(messages):
    if not isinstance(messages, list):
        raise ValueError("Messages must be a list.")

    cleaned = []

    for message in messages:
        if not isinstance(message, dict):
            continue

        role = message.get("role")
        content = message.get("content")

        if role not in ("user", "assistant", "system"):
            continue

        if not isinstance(content, str) or not content.strip():
            continue

        cleaned.append({
            "role": role,
            "content": content.strip()
        })

    if not cleaned:
        raise ValueError("No valid messages provided.")

    return cleaned


def build_gemini_input(messages):
    parts = []

    for message in messages:
        if message["role"] == "system":
            continue

        role = (
            "User"
            if message["role"] == "user"
            else "Assistant"
        )

        parts.append(
            f"{role}: {message['content']}"
        )

    return "\n\n".join(parts)


def get_extra_instructions(messages):
    extra = [
        message["content"]
        for message in messages
        if message["role"] == "system"
    ]

    return "\n\n".join(extra)


async def ask_gemini(session, messages):
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError("Gemini key missing.")

    model = os.getenv(
        "GEMINI_MODEL",
        "gemini-3.8-flash"
    )

    url = (
        "https://generativelanguage.googleapis.com/"
        "v1beta/interactions"
    )

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20"
    }

    instructions = SYSTEM_PROMPT
    extra = get_extra_instructions(messages)

    if extra:
        instructions += "\n\n" + extra

    payload = {
        "model": model,
        "input": build_gemini_input(messages),
        "system_instruction": instructions,
        "store": False
    }

    async with session.post(
        url,
        headers=headers,
        json=payload
    ) as response:

        if response.status != 200:
            error = await response.text()
            raise RuntimeError(
                f"Gemini HTTP {response.status}: {error[:250]}"
            )

        data = await response.json()

    output = []

    for step in data.get("steps", []):
        if step.get("type") != "model_output":
            continue

        for item in step.get("content", []):
            if item.get("type") == "text":
                output.append(item.get("text", ""))

    result = "\n".join(output).strip()

    if not result:
        raise RuntimeError("Gemini returned empty response.")

    return result


async def ask_groq(session, messages):
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError("Groq key missing.")

    model = os.getenv(
        "GROQ_MODEL",
        "openai/gpt-oss-20b"
    )

    url = (
        "https://api.groq.com/openai/v1/"
        "chat/completions"
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    groq_messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    for message in messages:
        if message["role"] == "system":
            groq_messages[0]["content"] += (
                "\n\n" + message["content"]
            )
        else:
            groq_messages.append(message)

    payload = {
        "model": model,
        "messages": groq_messages,
        "temperature": 0.4,
        "max_completion_tokens": 1200
    }

    async with session.post(
        url,
        headers=headers,
        json=payload
    ) as response:

        if response.status != 200:
            error = await response.text()
            raise RuntimeError(
                f"Groq HTTP {response.status}: {error[:250]}"
            )

        data = await response.json()

    try:
        result = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("Invalid Groq response.")

    if not isinstance(result, str) or not result.strip():
        raise RuntimeError("Groq returned empty response.")

    return result.strip()


async def generate_reply(messages):
    messages = get_messages(messages)

    providers = {
        "gemini": ask_gemini,
        "groq": ask_groq
    }

    order = os.getenv(
        "AI_PROVIDER_ORDER",
        "gemini,groq"
    )

    provider_order = [
        name.strip().lower()
        for name in order.split(",")
        if name.strip().lower() in providers
    ]

    timeout = aiohttp.ClientTimeout(total=45)
    errors = []

    async with aiohttp.ClientSession(
        timeout=timeout
    ) as session:

        for provider_name in provider_order:

            key_name = {
                "gemini": "GEMINI_API_KEY",
                "groq": "GROQ_API_KEY"
            }[provider_name]

            if not os.getenv(key_name):
                continue

            try:
                result = await providers[provider_name](
                    session,
                    messages
                )

                print(
                    f"ELYX AI Provider: {provider_name}"
                )

                return result

            except Exception as error:
                print(
                    f"ELYX {provider_name} failed: "
                    f"{type(error).__name__}"
                )

                errors.append(provider_name)

    raise AIUnavailableError(
        "All configured AI providers are unavailable."
          )

