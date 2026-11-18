import os
import aiohttp


SYSTEM_PROMPT = """
You are ELYX TRADING AI DEVELOPER.

Your job is to understand the user's requests and help manage
and develop their Discord server.

LANGUAGES:
- Understand English.
- Understand Hindi.
- Understand Hinglish.
- Understand Hindi written in English letters.
- Understand mixed Hindi and English.
- Understand common spelling mistakes and informal messages.

SMART UNDERSTANDING:
- Understand incomplete sentences using recent conversation context.
- Understand short follow-up messages.
- Remember the conversation history provided to you.
- If important information is missing, ask a short clarification.
- Do not repeatedly ask for information already provided.

DISCORD DEVELOPMENT:
- Help plan channels, categories, roles, permissions,
  welcome systems, tickets, moderation and other Discord features.
- Help create and improve bot features.
- Understand natural language requests instead of requiring
  fixed commands.

IMPORTANT RULES:
- Never claim a Discord action was completed unless the
  Discord tool actually confirms success.
- Never invent server information.
- Never execute code yourself.
- Sensitive server actions must follow permission checks
  and confirmation requirements.
- Give simple, clear responses.
- Reply in the language the user is using.
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
        role = message["role"].upper()
        parts.append(f"{role}: {message['content']}")

    return "\n\n".join(parts)


async def ask_gemini(session, messages):
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError("Gemini key is missing.")

    model = os.getenv(
        "GEMINI_MODEL",
        "gemini-3.8-flash"
    )

    url = "https://generativelanguage.googleapis.com/v1beta/interactions"

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json"
    }

    payload = {
        "model": model,
        "input": build_gemini_input(messages),
        "system_instruction": SYSTEM_PROMPT,
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
                f"Gemini error {response.status}: {error[:300]}"
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
        raise RuntimeError("Gemini returned an empty response.")

    return result


async def ask_groq(session, messages):
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError("Groq key is missing.")

    model = os.getenv(
        "GROQ_MODEL",
        "openai/gpt-oss-20b"
    )

    url = "https://api.groq.com/openai/v1/chat/completions"

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
            continue

        groq_messages.append(message)

    payload = {
        "model": model,
        "messages": groq_messages,
        "temperature": 0.4,
        "max_completion_tokens": 1000
    }

    async with session.post(
        url,
        headers=headers,
        json=payload
    ) as response:

        if response.status != 200:
            error = await response.text()
            raise RuntimeError(
                f"Groq error {response.status}: {error[:300]}"
            )

        data = await response.json()

    try:
        result = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("Groq returned an invalid response.")

    if not isinstance(result, str) or not result.strip():
        raise RuntimeError("Groq returned an empty response.")

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
            api_key_name = {
                "gemini": "GEMINI_API_KEY",
                "groq": "GROQ_API_KEY"
            }[provider_name]

            if not os.getenv(api_key_name):
                continue

            try:
                response = await providers[provider_name](
                    session,
                    messages
                )

                print(f"ELYX AI Provider: {provider_name}")

                return response

            except Exception as error:
                print(
                    f"ELYX AI Provider {provider_name} failed: "
                    f"{type(error).__name__}"
                )

                errors.append(provider_name)

    raise AIUnavailableError(
        "All configured free AI providers are unavailable."
)
