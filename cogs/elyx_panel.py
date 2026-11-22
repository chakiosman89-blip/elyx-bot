import os
import re
import json
import base64
import importlib
import aiohttp
import discord
from discord.ext import commands

# ==========================================
# PART 1: SAFE REPO & FADEHOST MCP ENGINE
# ==========================================
HARD_ACCESS_ID = 1572448688700391454
ALLOWED_IDS = {HARD_ACCESS_ID}
for _item in os.getenv("OWNER_ID", str(HARD_ACCESS_ID)).split(","):
    if _item.strip().isdigit():
        ALLOWED_IDS.add(int(_item.strip()))

DEFAULT_REPO = "chakiosman89-blip/elyx-bot"


def get_clean_repo() -> str:
    raw = os.getenv("GITHUB_REPOSITORY", DEFAULT_REPO).strip()
    raw = re.sub(r"^https?://(www\.)?github\.com/?", "", raw, flags=re.IGNORECASE).strip("/")
    parts = [p for p in raw.split("/") if p]
    if len(parts) >= 2:
        return f"{parts[0]}/{parts[1]}"
    return DEFAULT_REPO


GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main").strip() or "main"
FADEHOST_API_KEY = os.getenv("FADEHOST_API_KEY", "").strip()
FADEHOST_MCP_URL = "https://fadehost.com"

GITHUB_ICON = "https://githubassets.com"
FADEHOST_ICON = "https://google.com"


def is_owner(user: discord.abc.User) -> bool:
    if not user:
        return False
    if user.id in ALLOWED_IDS:
        return True
    if isinstance(user, discord.Member):
        return any(r.id in ALLOWED_IDS for r in user.roles)
    return False


async def fadehost_mcp_call(tool_name: str, arguments: dict = None) -> str:
    if not FADEHOST_API_KEY:
        raise RuntimeError("FADEHOST_API_KEY missing hai! FadeHost Variables mein add karein.")
    headers = {
        "Authorization": f"Bearer {FADEHOST_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    async with aiohttp.ClientSession() as session:
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "elyx-bot", "version": "1.0"},
            },
        }
        async with session.post(FADEHOST_MCP_URL, headers=headers, json=init_payload, timeout=15) as init_resp:
            sid = init_resp.headers.get("Mcp-Session-Id") or init_resp.headers.get("mcp-session-id")
            if sid:
                headers["Mcp-Session-Id"] = sid

        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments or {}},
        }
        async with session.post(FADEHOST_MCP_URL, headers=headers, json=payload, timeout=20) as resp:
            raw = await resp.text()
            if resp.status != 200:
                raise RuntimeError(f"FadeHost HTTP {resp.status}: {raw[:250]}")
            for line in raw.splitlines():
                if line.startswith("data: "):
                    raw = line[6:]
                    break
            data = json.loads(raw)
            if "error" in data:
                raise RuntimeError(data["error"].get("message", str(data["error"])))
            parts = data.get("result", {}).get("content", [])
            return "\n".join([c.get("text", "") for c in parts if c.get("type") == "text"])


async def get_fadehost_bot_id() -> str:
    env_id = os.getenv("FADEHOST_SERVER_ID", "").strip()
    if env_id:
        return env_id
    bots_text = await fadehost_mcp_call("list_bots", {})
    match = re.search(r"(bot_[a-zA-Z0-9_-]+)", bots_text)
    if match:
        return match.group(1)
    raise RuntimeError(f"Bot ID auto-detect nahi ho payi: {bots_text[:180]}")


async def gh_request(method: str, path: str, payload: dict = None):
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN missing hai!")
    repo = get_clean_repo()
    url = f"https://github.com{repo}/{path.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
    }
    async with aiohttp.ClientSession() as session:
        async with session.request(method, url, headers=headers, json=payload, timeout=20) as resp:
            txt = await resp.text()
            return resp.status, (json.loads(txt) if txt else {})


# ==========================================
# PART 2: GITHUB SMART CODER & CLEANER
# ==========================================
async def gh_write_smart_code(file_path: str, instruction: str) -> str:
    clean_path = file_path.strip().lstrip("/")
    if not clean_path or clean_path.upper() == "AUTO":
        slug = re.sub(r"[^a-z0-9]+", "_", instruction.lower())[:22].strip("_") or "feature_mod"
        clean_path = f"cogs/{slug}.py"
    if not clean_path.endswith(".py"):
        clean_path += ".py"
    if clean_path not in ("main.py", "casino_engine.py") and not clean_path.startswith("cogs/"):
        clean_path = f"cogs/{os.path.basename(clean_path)}"

    status, existing = await gh_request("GET", f"contents/{clean_path}?ref={GITHUB_BRANCH}")
    old_code = ""
    sha = None
    if status == 200 and isinstance(existing, dict):
        sha = existing.get("sha")
        old_code = base64.b64decode(existing.get("content", "")).decode("utf-8")

    import __main__
    prompt = (
        f"Write ultra-clean, compact, storage-saving discord.py v2.x code for `{clean_path}`.\n"
        f"USER REQUEST: {instruction}\n"
        f"EXISTING CODE (if updating):\n{old_code[:4000]}\n\n"
        "RULES: Keep code lightweight & modular to save GitHub storage. Fix any deprecated AI models "
        "(use openai/gpt-oss-20b or llama-4-scout-17b-16e-instruct or gemini-3.5-flash-lite). "
        "If file is in `cogs/`, include `class CustomCog(commands.Cog):` and `async def setup(bot): await bot.add_cog(CustomCog(bot))`. "
        "Return STRICT JSON: {\"summary\": \"short Hinglish summary\", \"code\": \"COMPLETE PYTHON CODE\"}"
    )
    res = await __main__.ask_ai(prompt, timeout_sec=18.0)
    new_code = res.get("code", "").strip()
    for fence in ("```python", "```"):
        if new_code.startswith(fence):
            new_code = new_code[len(fence):]
    if new_code.endswith("```"):
        new_code = new_code[:-3]
    new_code = new_code.strip()

    compile(new_code, clean_path, "exec")

    os.makedirs(os.path.dirname(clean_path) or ".", exist_ok=True)
    with open(clean_path, "w", encoding="utf-8") as f:
        f.write(new_code)

    payload = {
        "message": f"Elyx App Studio: {clean_path}",
        "content": base64.b64encode(new_code.encode("utf-8")).decode("utf-8"),
        "branch": GITHUB_BRANCH,
    }
    if sha:
        payload["sha"] = sha

    put_st, _ = await gh_request("PUT", f"contents/{clean_path}", payload)
    if put_st not in (200, 201):
        raise RuntimeError(f"GitHub commit failed (HTTP {put_st})")

    if clean_path.startswith("cogs/") or clean_path == "casino_engine.py":
        ext = clean_path.replace("/", ".").removesuffix(".py")
        importlib.invalidate_caches()
        if ext in __main__.bot.extensions:
            await __main__.bot.reload_extension(ext)
        else:
            await __main__.bot.load_extension(ext)

    kb = round(len(new_code.encode("utf-8")) / 1024, 2)
    return f"📄 **File:** `{clean_path}` (`{kb} KB`)\n✨ **Update:** {res.get('summary', 'Saved & Live!')}"


async def gh_remove_file(file_path: str) -> str:
    clean_path = file_path.strip().lstrip("/")
    if clean_path == "main.py":
        raise RuntimeError("Safety Lock: `main.py` delete nahi kar sakte!")
    status, existing = await gh_request("GET", f"contents/{clean_path}?ref={GITHUB_BRANCH}")
    if status != 200 or not isinstance(existing, dict):
        raise RuntimeError(f"GitHub par `{clean_path}` nahi mili!")

    del_st, _ = await gh_request(
        "DELETE",
        f"contents/{clean_path}",
        {"message": f"Cleanup: {clean_path}", "sha": existing["sha"], "branch": GITHUB_BRANCH},
    )
    if del_st != 200:
        raise RuntimeError(f"Delete failed (HTTP {del_st})")

    import __main__
    ext = clean_path.replace("/", ".").removesuffix(".py")
    if ext in __main__.bot.extensions:
        await __main__.bot.unload_extension(ext)
    if os.path.exists(clean_path):
        os.remove(clean_path)

    return f"🗑️ **`{clean_path}`** GitHub aur Bot se delete ho gayi! (Storage Freed)"

# ==========================================
# PART 3: POP-UP MODALS
# ==========================================
class GitHubStudioModal(discord.ui.Modal, title="GitHub App — Code & Auto-Connect"):
    file_name = discord.ui.TextInput(
        label="File Name (ya AUTO likhein)",
        placeholder="e.g. AUTO ya cogs/giveaway.py ya main.py",
        default="AUTO",
        max_length=60,
    )
    prompt_box = discord.ui.TextInput(
        label="Normal Bhasha mein likhein kya karna hai",
        style=discord.TextStyle.paragraph,
        placeholder="Jaise: Ek ticket system bana de ya error fix kar de...",
        max_length=1500,
    )

    async def on_submit(self, interaction: discord.Interaction):
        if not is_owner(interaction.user):
            return await interaction.response.send_message("🔒 Access Denied!", ephemeral=True)
        await interaction.response.defer(ephemeral=True)
        try:
            info = await gh_write_smart_code(self.file_name.value, self.prompt_box.value)
            embed = discord.Embed(
                title="GitHub App • Saved & Live",
                description=f"{info}\n🔗 **Status:** Auto-Connected & Running",
                color=discord.Color.from_rgb(35, 134, 54),
            )
            embed.set_author(name="GitHub Repository Sync", icon_url=GITHUB_ICON)
            embed.set_thumbnail(url=GITHUB_ICON)
            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ **GitHub Error:** `{e}`", ephemeral=True)


class GitHubDeleteModal(discord.ui.Modal, title="GitHub App — Free Storage"):
    target_path = discord.ui.TextInput(
        label="Kaunsi file delete karni hai?",
        placeholder="e.g. cogs/old_feature.py",
        max_length=80,
    )

    async def on_submit(self, interaction: discord.Interaction):
        if not is_owner(interaction.user):
            return await interaction.response.send_message("🔒 Access Denied!", ephemeral=True)
        await interaction.response.defer(ephemeral=True)
        try:
            msg = await gh_remove_file(self.target_path.value)
            await interaction.followup.send(msg, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ **Delete Error:** `{e}`", ephemeral=True)

# ==========================================
# PART 4: GITHUB & FADEHOST APP VIEWS
# ==========================================
class GitHubAppView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=300)

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if not is_owner(interaction.user):
            await interaction.response.send_message("🔒 Sirf Owner hi use kar sakta hai!", ephemeral=True)
            return False
        return True

    @discord.ui.button(label="Create / Edit Code", style=discord.ButtonStyle.success, emoji="✍️")
    async def create_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(GitHubStudioModal())

    @discord.ui.button(label="Auto-Fix Errors", style=discord.ButtonStyle.primary, emoji="🛠️")
    async def autofix_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        try:
            import __main__
            err = getattr(__main__, "LAST_RUNTIME_ERROR", "")
            if not err:
                return await interaction.followup.send("✅ **Repo Clean!** Abhi koi error nahi mila.", ephemeral=True)
            msg = await gh_write_smart_code("main.py", f"Fix this runtime error cleanly:\n{err}")
            __main__.LAST_RUNTIME_ERROR = ""
            await interaction.followup.send(f"🛠️ **Fixed & Pushed to GitHub:**\n{msg}", ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ **Fix Error:** `{e}`", ephemeral=True)

    @discord.ui.button(label="Delete File", style=discord.ButtonStyle.danger, emoji="🗑️")
    async def del_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(GitHubDeleteModal())


class FadehostAppView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=300)

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if not is_owner(interaction.user):
            await interaction.response.send_message("🔒 Sirf Owner hi use kar sakta hai!", ephemeral=True)
            return False
        return True

    @discord.ui.button(label="Restart", style=discord.ButtonStyle.primary, emoji="🔄")
    async def restart_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        try:
            bot_id = await get_fadehost_bot_id()
            out = await fadehost_mcp_call("power_bot", {"bot_id": bot_id, "action": "restart"})
            embed = discord.Embed(
                title="FadeHost App • Restarting",
                description=f"🔄 **Bot ID:** `{bot_id}`\n{out[:250] or 'Restart signal bhej diya gaya hai!'}",
                color=discord.Color.from_rgb(88, 101, 242),
            )
            embed.set_thumbnail(url=FADEHOST_ICON)
            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ **Restart Error:** `{e}`", ephemeral=True)

    @discord.ui.button(label="Deploy & Run", style=discord.ButtonStyle.success, emoji="🚀")
    async def deploy_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        try:
            bot_id = await get_fadehost_bot_id()
            out = await fadehost_mcp_call("redeploy_app", {"app_id": bot_id})
            embed = discord.Embed(
                title="FadeHost App • Deploying Latest Code",
                description=f"🚀 **Bot ID:** `{bot_id}`\n{out[:250] or 'GitHub se latest commit pull aur run ho raha hai!'}",
                color=discord.Color.from_rgb(35, 134, 54),
            )
            embed.set_thumbnail(url=FADEHOST_ICON)
            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ **Deploy Error:** `{e}`", ephemeral=True)

    @discord.ui.button(label="Smart Console", style=discord.ButtonStyle.secondary, emoji="🖥️")
    async def console_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        try:
            import __main__
            bot_id = await get_fadehost_bot_id()
            logs = await fadehost_mcp_call("get_bot_logs", {"bot_id": bot_id, "lines": 60})
            err_lines = [
                ln for ln in logs.splitlines()
                if any(k in ln.lower() for k in ("error", "traceback", "exception", "❌", "failed"))
            ]
            local_err = getattr(__main__, "LAST_RUNTIME_ERROR", "").strip()
            if local_err:
                err_lines.append(local_err)

            if err_lines:
                embed = discord.Embed(
                    title="FadeHost Console • Error Detected",
                    description="```py\n" + "\n".join(err_lines[-15:])[:1600] + "\n```",
                    color=discord.Color.red(),
                )
            else:
                embed = discord.Embed(
                    title="FadeHost Smart Console",
                    description=(
                        "✅ **Successfully Bot Online**\n"
                        "🟢 **0 Errors in Console & Runtime**\n"
                        f"📡 **Instance:** `{bot_id}`"
                    ),
                    color=discord.Color.green(),
                )
            embed.set_author(name="FadeHost Laplace Cloud", icon_url=FADEHOST_ICON)
            embed.set_thumbnail(url=FADEHOST_ICON)
            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ **Console Error:** `{e}`", ephemeral=True)

# ==========================================
# PART 5: HOME LAUNCHER & -PANEL COMMAND
# ==========================================
class HomeLauncherView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if not is_owner(interaction.user):
            await interaction.response.send_message("🔒 Ye Smartphone App sirf Owner ke liye locked hai!", ephemeral=True)
            return False
        return True

    @discord.ui.button(label="GitHub", style=discord.ButtonStyle.secondary, emoji="🐙")
    async def github_app(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        try:
            repo_name = get_clean_repo()
            st, files = await gh_request("GET", f"contents/cogs?ref={GITHUB_BRANCH}")
            cog_files = [f for f in files if isinstance(files, list) and f["name"].endswith(".py")] if st == 200 else []
            total_kb = round(sum(f.get("size", 0) for f in cog_files) / 1024, 2)
            names = ", ".join([f"`{f['name']}`" for f in cog_files]) or "None"

            embed = discord.Embed(
                title="GitHub App",
                description=(
                    f"📦 **Repository:** `{repo_name}`\n"
                    f"💾 **Cogs Storage Used:** `{total_kb} KB` ({len(cog_files)} files)\n"
                    f"📂 **Files:** {names}\n\n"
                    "Neeche se **Create/Edit**, **Auto-Fix**, ya **Delete** chunein:"
                ),
                color=discord.Color.from_rgb(36, 41, 47),
            )
            embed.set_author(name="GitHub Developer Cloud", icon_url=GITHUB_ICON)
            embed.set_thumbnail(url=GITHUB_ICON)
            await interaction.followup.send(embed=embed, view=GitHubAppView(), ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ **GitHub App Error:** `{e}`", ephemeral=True)

    @discord.ui.button(label="Fadehost", style=discord.ButtonStyle.primary, emoji="🚀")
    async def fadehost_app(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        embed = discord.Embed(
            title="FadeHost App",
            description=(
                "☁️ **Cloud Runtime:** `FadeHost Laplace`\n"
                "• 🔄 **Restart:** Server restart karein\n"
                "• 🚀 **Deploy & Run:** GitHub ka naya code live chalayein\n"
                "• 🖥️ **Smart Console:** Sirf errors ya `Successfully Bot Online` dekhein"
            ),
            color=discord.Color.from_rgb(88, 101, 242),
        )
        embed.set_author(name="FadeHost Cloud Panel", icon_url=FADEHOST_ICON)
        embed.set_thumbnail(url=FADEHOST_ICON)
        await interaction.followup.send(embed=embed, view=FadehostAppView(), ephemeral=True)


class ElyxPanelCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(name="panel", aliases=["app", "studio"])
    async def panel_cmd(self, ctx: commands.Context):
        if not is_owner(ctx.author):
            return await ctx.reply("🔒 Ye Control App sirf Owner ke liye hai!")
        embed = discord.Embed(
            title="📱 Elyx OS — Control Center",
            description=(
                "Apne bot ko control karne ke liye neeche diye gaye **Apps** par tap karein:\n\n"
                "🐙 **GitHub** — Normal bhasha mein code likhein, save karein, fix karein ya storage free karein\n"
                "🚀 **Fadehost** — Restart, Deploy & Run, aur Smart Console dekhein"
            ),
            color=discord.Color.from_rgb(30, 31, 34),
        )
        embed.set_thumbnail(url=self.bot.user.display_avatar.url)
        embed.set_footer(text=f"Locked to Owner ID: {HARD_ACCESS_ID}")
        await ctx.reply(embed=embed, view=HomeLauncherView())


async def setup(bot: commands.Bot):
    bot.remove_command("panel")
    await bot.add_cog(ElyxPanelCog(bot))
    
