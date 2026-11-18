import os
import aiohttp

from dotenv import load_dotenv

load_dotenv()

AI_API_URL = os.getenv("AI_API_URL")
AI_API_KEY = os.getenv("AI_API_KEY")
AI_MODEL = os.getenv("AI_MODEL")

SYSTEM_PROMPT = """
You are Elyx Trading AI Developer.

Your goal is to understand user requests and help build
features for the Elyx Trading Discord server.

You can understand Hindi, Hinglish and English.

You must:
- Understand the user's actual request.
- Ask for clarification when necessary.
- Plan changes before suggesting implementation.
- Respect developer and normal member permissions.
- Never claim an action was completed if it was not.
- Never execute unverified generated code.
- Respect Discord API and hosting limitations.

You are an AI developer, not just a fixed-command bot.
"""


async def ask_ai(user_message: str) -> str:
    if not AI_API_URL or not AI_API_KEY or not AI_MODEL:
        return "AI setup incomplete. API settings are missing."

    headers = {
        "Authorization": f"Bearer {AI_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": AI_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.4
    }

    timeout = aiohttp.ClientTimeout(total=30)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                AI_API_URL,
                headers=headers,
                json=payload
            ) as response:

                if response.status != 200:
                    return f"AI API error: HTTP {response.status}"

                data = await response.json()

                return data["choices"][0]["message"]["content"]

    except aiohttp.ClientError:
        return "AI connection failed. Please try again."

    except (KeyError, IndexError, TypeError):
        return "AI returned an unexpected response."

    except Exception:
        return "Something went wrong while contacting AI."
