import os
import base64
import aiohttp

from self_coder import validate_file_path


# ================= CONFIGURATION =================

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPOSITORY = os.getenv("GITHUB_REPOSITORY")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")

GITHUB_API = "https://api.github.com"

MAX_FILE_SIZE = 100_000


# ================= GITHUB BUILDER =================

class GitHubBuilder:

    def __init__(self):

        self.token = GITHUB_TOKEN
        self.repository = GITHUB_REPOSITORY
        self.branch = GITHUB_BRANCH

        if not self.token:
            raise ValueError("GITHUB_TOKEN is missing.")

        if not self.repository or "/" not in self.repository:
            raise ValueError("GITHUB_REPOSITORY is invalid.")

        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def get_url(self, file_path):

        path = validate_file_path(file_path)

        return (
            f"{GITHUB_API}/repos/"
            f"{self.repository}/contents/{path.name}"
        )

    async def get_file(self, file_path):

        url = self.get_url(file_path)

        params = {
            "ref": self.branch
        }

        timeout = aiohttp.ClientTimeout(total=30)

        async with aiohttp.ClientSession(
            timeout=timeout
        ) as session:

            async with session.get(
                url,
                headers=self.headers,
                params=params
            ) as response:

                if response.status == 404:
                    return {
                        "success": False,
                        "message": "File not found on GitHub."
                    }

                if response.status != 200:
                    error = await response.text()

                    return {
                        "success": False,
                        "message": f"GitHub error: {error[:500]}"
                    }

                data = await response.json()

                if data.get("encoding") != "base64":
                    return {
                        "success": False,
                        "message": "Unsupported GitHub file encoding."
                    }

                content = base64.b64decode(
                    data["content"]
                ).decode("utf-8")

                return {
                    "success": True,
                    "file": file_path,
                    "content": content,
                    "sha": data["sha"],
                    "message": "File retrieved successfully."
                }

    async def update_file(
        self,
        file_path,
        new_content,
        approved=False,
        commit_message=None
    ):

        if approved is not True:
            return {
                "success": False,
                "message": "Human approval required."
            }

        path = validate_file_path(file_path)

        if not isinstance(new_content, str):
            return {
                "success": False,
                "message": "File content must be text."
            }

        if len(new_content.encode("utf-8")) > MAX_FILE_SIZE:
            return {
                "success": False,
                "message": "File exceeds the 100 KB limit."
            }

        current = await self.get_file(path.name)

        if not current.get("success"):
            return {
                "success": False,
                "message": current.get("message")
            }

        encoded_content = base64.b64encode(
            new_content.encode("utf-8")
        ).decode("utf-8")

        payload = {
            "message": (
                commit_message
                or f"Update {path.name} using Elyx Developer"
            ),
            "content": encoded_content,
            "sha": current["sha"],
            "branch": self.branch,
        }

        timeout = aiohttp.ClientTimeout(total=30)

        async with aiohttp.ClientSession(
            timeout=timeout
        ) as session:

            async with session.put(
                self.get_url(path.name),
                headers=self.headers,
                json=payload
            ) as response:

                data = await response.json()

                if response.status not in (200, 201):
                    return {
                        "success": False,
                        "message": data.get(
                            "message",
                            "GitHub update failed."
                        )
                    }

                return {
                    "success": True,
                    "file": path.name,
                    "commit": data.get("commit", {}).get("sha"),
                    "message": "GitHub file updated successfully."
}
