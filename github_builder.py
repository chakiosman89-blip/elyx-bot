import os
import base64
import aiohttp
from urllib.parse import quote

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPOSITORY = os.getenv("GITHUB_REPOSITORY")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")

API_URL = "https://api.github.com"

ALLOWED_FILES = {
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
}


class GitHubBuilder:
    def __init__(self):
        if not GITHUB_TOKEN:
            raise RuntimeError("GITHUB_TOKEN is missing.")

        if not GITHUB_REPOSITORY or "/" not in GITHUB_REPOSITORY:
            raise RuntimeError("GITHUB_REPOSITORY is missing or invalid.")

        self.headers = {
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }

        self.base_url = (
            f"{API_URL}/repos/{GITHUB_REPOSITORY}/contents"
        )

    def validate_file(self, filename):
        if filename not in ALLOWED_FILES:
            raise ValueError("This file is not allowed.")

        if "/" in filename or "\\" in filename:
            raise ValueError("Invalid file path.")

        return quote(filename, safe="")

    async def get_file(self, filename):
        safe_name = self.validate_file(filename)

        url = f"{self.base_url}/{safe_name}"

        params = {"ref": GITHUB_BRANCH}

        async with aiohttp.ClientSession(
            headers=self.headers
        ) as session:

            async with session.get(
                url,
                params=params
            ) as response:

                if response.status == 404:
                    return None

                if response.status != 200:
                    error = await response.text()
                    raise RuntimeError(
                        f"GitHub read failed: {response.status} {error}"
                    )

                data = await response.json()

                content = base64.b64decode(
                    data["content"]
                ).decode("utf-8")

                return {
                    "filename": filename,
                    "content": content,
                    "sha": data["sha"]
                }

    async def update_file(
        self,
        filename,
        new_content,
        commit_message,
        expected_sha=None,
        approved=False
    ):
        if approved is not True:
            raise PermissionError(
                "Human approval is required before updating GitHub."
            )

        safe_name = self.validate_file(filename)

        if not isinstance(new_content, str):
            raise ValueError("File content must be text.")

        if len(new_content.encode("utf-8")) > 100_000:
            raise ValueError("File exceeds the 100 KB limit.")

        if not isinstance(commit_message, str) or not commit_message.strip():
            raise ValueError("Commit message is required.")

        current_file = await self.get_file(filename)

        payload = {
            "message": commit_message,
            "content": base64.b64encode(
                new_content.encode("utf-8")
            ).decode("ascii"),
            "branch": GITHUB_BRANCH
        }

        if current_file:
            if expected_sha != current_file["sha"]:
                raise RuntimeError(
                    "File changed on GitHub. Read the latest version first."
                )

            payload["sha"] = current_file["sha"]

        elif expected_sha is not None:
            raise RuntimeError(
                "Expected existing file was not found."
            )

        url = f"{self.base_url}/{safe_name}"

        async with aiohttp.ClientSession(
            headers=self.headers
        ) as session:

            async with session.put(
                url,
                json=payload
            ) as response:

                result = await response.json()

                if response.status not in (200, 201):
                    raise RuntimeError(
                        f"GitHub update failed: {result}"
                    )

                return {
                    "success": True,
                    "filename": filename,
                    "commit": result["commit"]["sha"],
                    "message": "GitHub file updated successfully."
}
