import asyncio
import json
import os
import random
import time
from typing import Optional
import discord
from discord.ext import commands

# =====================================================================
# 1. ANIMATED NITRO EMOJI CONFIG (NO NORMAL UNICODE EMOJIS)
# =====================================================================
EMOJIS = {
    "elyx_coin": "<a:elyx_coin:000000000000000000>",
    "vip_badge": "<a:vip_badge:000000000000000000>",
    "win_trophy": "<a:win_trophy:000000000000000000>",
    "lose_skull": "<a:lose_skull:000000000000000000>",
    "box_shake": "<a:box_shake:000000000000000000>",
    "boom_blast": "<a:boom_blast:000000000000000000>",
    "slot_spin": "<a:slot_spin:000000000000000000>",
    "coin_spin": "<a:coin_spin:000000000000000000>",
    "roulette_spin": "<a:roulette_spin:000000000000000000>",
    "fire_streak": "<a:fire_streak:000000000000000000>",
}

FALLBACK_VISUALS = {
    "elyx_coin": "[ELYX]",
    "vip_badge": "[VIP]",
    "win_trophy": "[WIN]",
    "lose_skull": "[LOSE]",
    "box_shake": "[SHAKING BOX]",
    "boom_blast": "[BOOOOM!]",
    "slot_spin": "[SPINNING]",
    "coin_spin": "[FLIPPING]",
    "roulette_spin": "[WHEEL]",
    "fire_streak": "[STREAK]",
}


def get_emoji(key: str) -> str:
  raw = EMOJIS.get(key, "")
  if "000000000000000000" in raw or not raw:
    return FALLBACK_VISUALS.get(key, f"[{key.upper()}]")
  return raw


# =====================================================================
# 2. ASYNC JSON DATABASE MANAGER
# =====================================================================
DATA_FILE = "casino_data.json"


class CasinoDB:

  def __init__(self, filename: str = DATA_FILE):
    self.filename = filename
    self.lock = asyncio.Lock()
    self.data = self._load()

  def _load(self) -> dict:
    if not os.path.exists(self.filename):
      return {}
    try:
      with open(self.filename, "r", encoding="utf-8") as f:
        return json.load(f)
    except (json.JSONDecodeError, IOError):
      return {}

  async def save(self):
    async with self.lock:
      with open(self.filename, "w", encoding="utf-8") as f:
        json.dump(self.data, f, indent=4)

  def get_user(self, user_id: int) -> dict:
    uid = str(user_id)
    if uid not in self.data:
      self.data[uid] = {
          "balance": 1000,
          "vip": False,
          "wins": 0,
          "losses": 0,
          "wagered": 0,
          "last_daily": 0,
          "daily_streak": 0,
          "last_lootbox": 0,
      }
    return self.data[uid]

  def parse_bet(self, user_id: int, raw_bet: str) -> Optional[int]:
    user = self.get_user(user_id)
    bal = user["balance"]
    cleaned = raw_bet.strip().lower()
    if cleaned in ("all", "max"):
      return bal if bal > 0 else None
    if cleaned == "half":
      return (bal // 2) if (bal // 2) > 0 else None
    try:
      val = int(cleaned)
      return val if val > 0 else None
    except ValueError:
      return None


# =====================================================================
# 3. INTERACTIVE BIG-SCREEN LOOT BOX VIEW (4.5s SHAKE -> BOOM)
# =====================================================================
class LootBoxView(discord.ui.View):

  def __init__(self, author_id: int, db: CasinoDB):
    super().__init__(timeout=60.0)
    self.author_id = author_id
    self.db = db
    self.opened = False

  @discord.ui.button(
      label="TAP TO OPEN LOOT BOX", style=discord.ButtonStyle.danger
  )
  async def open_box(
      self, interaction: discord.Interaction, button: discord.ui.Button
  ):
    if interaction.user.id != self.author_id:
      await interaction.response.send_message(
          "Yeh Loot Box kisi aur player ke liye hai! Apna kholne ke liye"
          " `!lootbox` ya `-lootbox` likho.",
          ephemeral=True,
      )
      return

    if self.opened:
      await interaction.response.send_message(
          "Yeh box pehle hi khul chuka hai!", ephemeral=True
      )
      return

    self.opened = True
    button.disabled = True
    button.label = "OPENING..."
    button.style = discord.ButtonStyle.secondary

    shake = get_emoji("box_shake")
    boom = get_emoji("boom_blast")
    coin = get_emoji("elyx_coin")
    vip_icon = get_emoji("vip_badge")
    win_icon = get_emoji("win_trophy")

    # Stage 1: Initial Tap & Shake (0.0s - 1.5s)
    embed = discord.Embed(
        title=f"{shake} ELYX MYSTERY VAULT — ACTIVATED!",
        description=(
            "```ansi\n"
            "\u001b[1;35m[ STAGE 1/3 ] SEAL BREAKING... BOX IS SHAKING!\u001b[0m\n"
            "```\n"
            f"### {shake}  {shake}  {shake}\n"
            "*Vault locks are vibrating violently...*"
        ),
        color=discord.Color.purple(),
    )
    await interaction.response.edit_message(embed=embed, view=self)
    await asyncio.sleep(1.5)

    # Stage 2: Heavy Cracking (1.5s - 3.0s)
    embed.title = f"{shake} CRACKS APPEARING — HOLD ON!"
    embed.description = (
        "```ansi\n"
        "\u001b[1;33m[ STAGE 2/3 ] ENERGY SURGING INSIDE THE VAULT!\u001b[0m\n"
        "```\n"
        f"## {shake}  >>> CRACK <<<  {shake}\n"
        "*Purple neon light is leaking through the cracks...*"
    )
    embed.color = discord.Color.gold()
    await interaction.edit_original_response(embed=embed, view=self)
    await asyncio.sleep(1.5)

    # Stage 3: Critical Overload (3.0s - 4.5s)
    embed.title = f"{shake} CRITICAL OVERLOAD — ABOUT TO BLOW!"
    embed.description = (
        "```ansi\n"
        "\u001b[1;31m[ STAGE 3/3 ] MAXIMUM PRESSURE — 3... 2... 1...\u001b[0m\n"
        "```\n"
        f"# {shake}  {shake}  {shake}\n"
        "*STAND BACK!*"
    )
    embed.color = discord.Color.red()
    await interaction.edit_original_response(embed=embed, view=self)
    await asyncio.sleep(1.5)

    # Stage 4: BOOOOM & Loot Calculation
    user = self.db.get_user(self.author_id)
    roll = random.randint(1, 100)

    if roll <= 50:
      tier = "RARE ELYX STASH"
      reward_coins = random.randint(500, 1200)
      grant_vip = False
    elif roll <= 85:
      tier = "EPIC NEON JACKPOT"
      reward_coins = random.randint(1500, 3500)
      grant_vip = False
    else:
      tier = "MYTHIC ELYX OVERLORD DROP"
      reward_coins = random.randint(4000, 8000)
      grant_vip = True

    if user["vip"]:
      reward_coins = int(reward_coins * 1.5)

    user["balance"] += reward_coins
    user["wins"] += 1
    if grant_vip:
      user["vip"] = True
    await self.db.save()

    button.label = "LOOT CLAIMED"
    vip_text = (
        f"\n{vip_icon} **BONUS UNLOCK:** Permanent **ELYX VIP STATUS**"
        " activated!"
        if grant_vip
        else ""
    )
    vip_mult_note = (
        f" *(Includes 1.5x {vip_icon} VIP Boost)*" if user["vip"] else ""
    )

    final_embed = discord.Embed(
        title=f"{boom} BOOOOM!! {tier} {boom}",
        description=(
            f"# {boom}  {win_icon}  {boom}\n\n"
            f"**Player:** {interaction.user.mention}\n"
            f"**Loot Won:** {coin} **`+{reward_coins:,}` Elyx"
            f" Coins**{vip_mult_note}"
            f"{vip_text}\n\n"
            f"**Updated Wallet:** {coin} **`{user['balance']:,}` Elyx Coins**"
        ),
        color=discord.Color.brand_green(),
    )
    final_embed.set_footer(text="ELYX CASINO ENGINE • Use !bal or -bal anytime")
    await interaction.edit_original_response(embed=final_embed, view=self)
    self.stop()
# =====================================================================
# 4. INTERACTIVE BLACKJACK VIEW (HIT / STAND / DOUBLE)
# =====================================================================
class BlackjackView(discord.ui.View):

  def __init__(self, author_id: int, bet: int, db: CasinoDB):
    super().__init__(timeout=60.0)
    self.author_id = author_id
    self.bet = bet
    self.db = db
    self.deck = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11] * 4
    random.shuffle(self.deck)
    self.player_hand = [self.deck.pop(), self.deck.pop()]
    self.dealer_hand = [self.deck.pop(), self.deck.pop()]
    self.ended = False

  def hand_value(self, hand: list) -> int:
    total = sum(hand)
    aces = hand.count(11)
    while total > 21 and aces:
      total -= 10
      aces -= 1
    return total

  def format_cards(self, hand: list, hide_second: bool = False) -> str:
    if hide_second:
      return f"`[ {hand[0]} ]` `[ ? ]`"
    return " ".join(f"`[ {c} ]`" for c in hand)

  def build_embed(
      self, status_text: str, color: discord.Color
  ) -> discord.Embed:
    coin = get_emoji("elyx_coin")
    p_val = self.hand_value(self.player_hand)
    d_val = "?" if not self.ended else str(self.hand_value(self.dealer_hand))

    embed = discord.Embed(
        title=f"{coin} ELYX HIGH-STAKES BLACKJACK",
        description=status_text,
        color=color,
    )
    embed.add_field(
        name=f"Your Hand ({p_val})",
        value=self.format_cards(self.player_hand),
        inline=True,
    )
    embed.add_field(
        name=f"Dealer Hand ({d_val})",
        value=self.format_cards(self.dealer_hand, hide_second=not self.ended),
        inline=True,
    )
    embed.set_footer(text=f"Current Wager: {self.bet:,} Elyx Coins")
    return embed

  async def finish_game(self, interaction: discord.Interaction, outcome: str):
    self.ended = True
    for child in self.children:
      child.disabled = True

    user = self.db.get_user(self.author_id)
    coin = get_emoji("elyx_coin")
    win_icon = get_emoji("win_trophy")
    lose_icon = get_emoji("lose_skull")
    vip_icon = get_emoji("vip_badge")

    if outcome == "win":
      payout = int(self.bet * (2.25 if user["vip"] else 2.0))
      user["balance"] += payout
      user["wins"] += 1
      vip_tag = f" ({vip_icon} VIP Bonus)" if user["vip"] else ""
      msg = (
          f"### {win_icon} YOU BEAT THE DEALER!\nWon {coin}"
          f" **`+{payout:,}` Elyx Coins**{vip_tag}"
      )
      color = discord.Color.brand_green()
    elif outcome == "push":
      user["balance"] += self.bet
      msg = (
          f"### PUSH (TIE)!\nYour bet of {coin} **`{self.bet:,}`** has been"
          " refunded."
      )
      color = discord.Color.gold()
    else:
      user["losses"] += 1
      msg = (
          f"### {lose_icon} DEALER WINS!\nLost {coin} **`-{self.bet:,}` Elyx"
          " Coins**"
      )
      color = discord.Color.red()

    await self.db.save()
    await interaction.response.edit_message(
        embed=self.build_embed(msg, color), view=self
    )
    self.stop()

  @discord.ui.button(label="HIT", style=discord.ButtonStyle.primary)
  async def hit(
      self, interaction: discord.Interaction, button: discord.ui.Button
  ):
    if interaction.user.id != self.author_id:
      return await interaction.response.send_message(
          "Yeh tumhara table nahi hai!", ephemeral=True
      )

    self.player_hand.append(self.deck.pop())
    if self.hand_value(self.player_hand) > 21:
      await self.finish_game(interaction, "lose")
    else:
      await interaction.response.edit_message(
          embed=self.build_embed(
              "Choose your next move:", discord.Color.blurple()
          ),
          view=self,
      )

  @discord.ui.button(label="STAND", style=discord.ButtonStyle.success)
  async def stand(
      self, interaction: discord.Interaction, button: discord.ui.Button
  ):
    if interaction.user.id != self.author_id:
      return await interaction.response.send_message(
          "Yeh tumhara table nahi hai!", ephemeral=True
      )

    while self.hand_value(self.dealer_hand) < 17:
      self.dealer_hand.append(self.deck.pop())

    p_val = self.hand_value(self.player_hand)
    d_val = self.hand_value(self.dealer_hand)

    if d_val > 21 or p_val > d_val:
      await self.finish_game(interaction, "win")
    elif p_val == d_val:
      await self.finish_game(interaction, "push")
    else:
      await self.finish_game(interaction, "lose")

  @discord.ui.button(label="DOUBLE DOWN", style=discord.ButtonStyle.danger)
  async def double_down(
      self, interaction: discord.Interaction, button: discord.ui.Button
  ):
    if interaction.user.id != self.author_id:
      return await interaction.response.send_message(
          "Yeh tumhara table nahi hai!", ephemeral=True
      )

    user = self.db.get_user(self.author_id)
    if user["balance"] < self.bet:
      return await interaction.response.send_message(
          "Double Down ke liye enough Elyx Coins nahi hain!", ephemeral=True
      )

    user["balance"] -= self.bet
    user["wagered"] += self.bet
    self.bet *= 2
    self.player_hand.append(self.deck.pop())

    if self.hand_value(self.player_hand) > 21:
      await self.finish_game(interaction, "lose")
      return

    while self.hand_value(self.dealer_hand) < 17:
      self.dealer_hand.append(self.deck.pop())

    p_val = self.hand_value(self.player_hand)
    d_val = self.hand_value(self.dealer_hand)

    if d_val > 21 or p_val > d_val:
      await self.finish_game(interaction, "win")
    elif p_val == d_val:
      await self.finish_game(interaction, "push")
    else:
      await self.finish_game(interaction, "lose")


# =====================================================================
# 5. MAIN CASINO COG (SUPPORTS BOTH '!' AND '-' PREFIXES)
# =====================================================================
class CasinoEngine(commands.Cog):

  def __init__(self, bot: commands.Bot):
    self.bot = bot
    self.db = CasinoDB()

  @commands.Cog.listener()
  async def on_message(self, message: discord.Message):
    if message.author.bot or not message.content.startswith("-"):
      return
    ctx = await self.bot.get_context(message)
    if ctx.valid:
      return
    parts = message.content[1:].strip().split()
    if not parts:
      return
    cmd_name = parts[0].lower()
    cmd = self.bot.get_command(cmd_name)
    if cmd and cmd.cog_name == self.qualified_name:
      message.content = "!" + message.content[1:]
      await self.bot.process_commands(message)

  # -----------------------------------------------------------------
  # ECONOMY COMMANDS: BAL, DAILY, GIVE, LEADERBOARD
  # -----------------------------------------------------------------
  @commands.command(name="bal", aliases=["balance", "wallet"])
  async def balance(
      self, ctx: commands.Context, member: Optional[discord.Member] = None
  ):
    target = member or ctx.author
    user = self.db.get_user(target.id)
    coin = get_emoji("elyx_coin")
    vip_icon = get_emoji("vip_badge")
    win_icon = get_emoji("win_trophy")
    lose_icon = get_emoji("lose_skull")

    status_badge = (
        f"{vip_icon} **ELYX VIP MEMBER (1.5x Payouts)**"
        if user["vip"]
        else "Standard Player"
    )

    embed = discord.Embed(
        title=f"{coin} {target.display_name}'s ELYX WALLET",
        description=(
            f"**Status:** {status_badge}\n"
            f"### Balance: {coin} **`{user['balance']:,}` Elyx Coins**\n"
        ),
        color=(
            discord.Color.purple() if user["vip"] else discord.Color.blurple()
        ),
    )
    embed.add_field(
        name=f"{win_icon} Total Wins", value=f"**{user['wins']}**", inline=True
    )
    embed.add_field(
        name=f"{lose_icon} Total Losses",
        value=f"**{user['losses']}**",
        inline=True,
    )
    embed.add_field(
        name=f"{coin} Total Wagered",
        value=f"**{user['wagered']:,}**",
        inline=True,
    )
    embed.set_thumbnail(url=target.display_avatar.url)
    await ctx.send(embed=embed)

  @commands.command(name="daily")
  async def daily(self, ctx: commands.Context):
    user = self.db.get_user(ctx.author.id)
    now = int(time.time())
    cooldown = 86400
    elapsed = now - user["last_daily"]

    coin = get_emoji("elyx_coin")
    vip_icon = get_emoji("vip_badge")
    streak_icon = get_emoji("fire_streak")

    if elapsed < cooldown:
      rem = cooldown - elapsed
      hrs, rem_m = divmod(rem, 3600)
      mins, _ = divmod(rem_m, 60)
      embed = discord.Embed(
          title=f"{coin} DAILY REWARD ON COOLDOWN",
          description=f"Agla claim **{hrs}h {mins}m** baad milega!",
          color=discord.Color.orange(),
      )
      return await ctx.send(embed=embed)

    if elapsed <= cooldown * 2:
      user["daily_streak"] += 1
    else:
      user["daily_streak"] = 1

    base_reward = 1000 + (user["daily_streak"] * 150)
    if user["vip"]:
      base_reward *= 2

    user["balance"] += base_reward
    user["last_daily"] = now
    await self.db.save()

    vip_note = (
        f"\n{vip_icon} **2x VIP Daily Multiplier Applied!**"
        if user["vip"]
        else ""
    )
    embed = discord.Embed(
        title=f"{coin} DAILY ELYX DROP CLAIMED!",
        description=(
            f"You received {coin} **`+{base_reward:,}` Elyx Coins**!\n"
            f"{streak_icon} **Login Streak:** `{user['daily_streak']} Days`"
            f"{vip_note}\n\n"
            f"**New Balance:** {coin} **`{user['balance']:,}`**"
        ),
        color=discord.Color.brand_green(),
    )
    await ctx.send(embed=embed)

  @commands.command(name="give", aliases=["pay", "send"])
  async def give(
      self, ctx: commands.Context, member: discord.Member, amount: str
  ):
    if member.bot or member.id == ctx.author.id:
      return await ctx.send("Valid player ko mention karo!")

    bet = self.db.parse_bet(ctx.author.id, amount)

    sender = self.db.get_user(ctx.author.id)
    if not bet or sender["balance"] < bet:
      return await ctx.send("Invalid amount ya insufficient Elyx Coins!")

    receiver = self.db.get_user(member.id)
    sender["balance"] -= bet
    receiver["balance"] += bet
    await self.db.save()

    coin = get_emoji("elyx_coin")
    embed = discord.Embed(
        title=f"{coin} ELYX COIN TRANSFER COMPLETE",
        description=(
            f"{ctx.author.mention} sent {coin} **`{bet:,}` Elyx Coins** to"
            f" {member.mention}!"
        ),
        color=discord.Color.purple(),
    )
    await ctx.send(embed=embed)

  @commands.command(name="lb", aliases=["leaderboard", "top"])
  async def leaderboard(self, ctx: commands.Context):
    coin = get_emoji("elyx_coin")
    vip_icon = get_emoji("vip_badge")
    win_icon = get_emoji("win_trophy")

    sorted_users = sorted(
        self.db.data.items(), key=lambda x: x[1].get("balance", 0), reverse=True
    )[:10]

    if not sorted_users:
      return await ctx.send("Abhi tak koi player data nahi hai!")

    lines = []
    for idx, (uid, info) in enumerate(sorted_users, start=1):
      vip_tag = f" {vip_icon}" if info.get("vip") else ""
      lines.append(
          f"**`#{idx}`** <@{uid}>{vip_tag} — {coin} **`{info['balance']:,}`**"
      )

    embed = discord.Embed(
        title=f"{win_icon} ELYX CASINO RICHEST PLAYERS",
        description="\n".join(lines),
        color=discord.Color.gold(),
    )
    await ctx.send(embed=embed)

  @commands.command(name="lootbox", aliases=["box", "crate", "drop"])
  async def lootbox(self, ctx: commands.Context):
    user = self.db.get_user(ctx.author.id)
    now = int(time.time())
    cooldown = 300
    elapsed = now - user["last_lootbox"]

    shake = get_emoji("box_shake")
    coin = get_emoji("elyx_coin")

    if elapsed < cooldown:
      rem = cooldown - elapsed
      mins, secs = divmod(rem, 60)
      return await ctx.send(
          f"{shake} Agla **Elyx Loot Box** **{mins}m {secs}s** mein ready hoga!"
      )

    user["last_lootbox"] = now
    await self.db.save()

    embed = discord.Embed(
        title=f"{shake} MYSTERIOUS ELYX LOOT BOX APPEARED!",
        description=(
            "```ansi\n"
            "\u001b[1;35m[ UNOPENED VAULT ] TAP BUTTON BELOW TO BREACH!\u001b[0m\n"
            "```\n"
            f"# {shake}   {shake}   {shake}\n\n"
            f"**Inside Rewards:** Up to {coin} **`8,000` Elyx Coins** + **VIP"
            " Status**\n"
            "*Click the button below — box will shake for 4.5s and"
            " **BOOM**!*"
        ),
        color=discord.Color.purple(),
    )
    view = LootBoxView(ctx.author.id, self.db)
    await ctx.send(embed=embed, view=view)

     # -----------------------------------------------------------------
  # CASINO GAMES: SLOTS, COINFLIP, ROULETTE, BLACKJACK
  # -----------------------------------------------------------------
  @commands.command(name="slots", aliases=["slot"])
  async def slots(self, ctx: commands.Context, amount: str = "100"):
    bet = self.db.parse_bet(ctx.author.id, amount)
    user = self.db.get_user(ctx.author.id)
    if not bet or user["balance"] < bet:
      return await ctx.send(
          "Valid bet daalo ya balance check karo (`!bal` / `-bal`)!"
      )

    user["balance"] -= bet
    user["wagered"] += bet
    await self.db.save()

    spin = get_emoji("slot_spin")
    coin = get_emoji("elyx_coin")
    vip_icon = get_emoji("vip_badge")
    win_icon = get_emoji("win_trophy")
    lose_icon = get_emoji("lose_skull")

    embed = discord.Embed(
        title=f"{spin} ELYX NEON SLOTS",
        description=(
            f"## [ {spin} | {spin} | {spin} ]\n\n"
            f"**Bet:** {coin} **`{bet:,}`** — *Reels spinning...*"
        ),
        color=discord.Color.purple(),
    )
    msg = await ctx.send(embed=embed)
    await asyncio.sleep(1.5)

    symbols = [
        get_emoji("elyx_coin"),
        get_emoji("vip_badge"),
        get_emoji("win_trophy"),
        get_emoji("fire_streak"),
    ]
    reels = [random.choice(symbols) for _ in range(3)]

    if reels[0] == reels[1] == reels[2]:
      mult = 5.0
      outcome = "JACKPOT TRIPLE MATCH!"
    elif reels[0] == reels[1] or reels[1] == reels[2] or reels[0] == reels[2]:
      mult = 2.0
      outcome = "DOUBLE MATCH WIN!"
    else:
      mult = 0.0
      outcome = "NO MATCH"

    if mult > 0:
      if user["vip"]:
        mult *= 1.25
      payout = int(bet * mult)
      user["balance"] += payout
      user["wins"] += 1
      vip_note = f" ({vip_icon} VIP Boost)" if user["vip"] else ""
      res_embed = discord.Embed(
          title=f"{win_icon} {outcome}",
          description=(
              f"## [ {reels[0]} | {reels[1]} | {reels[2]} ]\n\n"
              f"**Won:** {coin} **`+{payout:,}` Elyx Coins**{vip_note}\n"
              f"**Wallet:** {coin} **`{user['balance']:,}`**"
          ),
          color=discord.Color.brand_green(),
      )
    else:
      user["losses"] += 1
      res_embed = discord.Embed(
          title=f"{lose_icon} {outcome}",
          description=(
              f"## [ {reels[0]} | {reels[1]} | {reels[2]} ]\n\n"
              f"**Lost:** {coin} **`-{bet:,}` Elyx Coins**\n"
              f"**Wallet:** {coin} **`{user['balance']:,}`**"
          ),
          color=discord.Color.red(),
      )

    await self.db.save()
    await msg.edit(embed=res_embed)

  @commands.command(name="cf", aliases=["coinflip", "flip"])
  async def coinflip(
      self, ctx: commands.Context, side: str = "heads", amount: str = "100"
  ):
    choice = side.lower()
    if choice in ("h", "head", "heads"):
      choice = "heads"
    elif choice in ("t", "tail", "tails"):
      choice = "tails"
    else:
      return await ctx.send("Usage: `!cf heads 500` ya `-cf tails all`")

    bet = self.db.parse_bet(ctx.author.id, amount)
    user = self.db.get_user(ctx.author.id)
    if not bet or user["balance"] < bet:
      return await ctx.send("Insufficient Elyx Coins ya invalid amount!")

    user["balance"] -= bet
    user["wagered"] += bet
    await self.db.save()

    spin = get_emoji("coin_spin")
    coin = get_emoji("elyx_coin")
    win_icon = get_emoji("win_trophy")
    lose_icon = get_emoji("lose_skull")
    vip_icon = get_emoji("vip_badge")

    embed = discord.Embed(
        title=f"{spin} ELYX COINFLIP",
        description=(
            f"### {spin} Flipping Elyx Coin in the air...\n"
            f"**Your Call:** `{choice.upper()}` | **Bet:** {coin}"
            f" **`{bet:,}`**"
        ),
        color=discord.Color.gold(),
    )
    msg = await ctx.send(embed=embed)
    await asyncio.sleep(1.5)

    landed = random.choice(["heads", "tails"])
    if landed == choice:
      payout = int(bet * (2.25 if user["vip"] else 2.0))
      user["balance"] += payout
      user["wins"] += 1
      vip_note = f" ({vip_icon} VIP Boost)" if user["vip"] else ""
      res_embed = discord.Embed(
          title=f"{win_icon} LANDED ON {landed.upper()} — YOU WON!",
          description=(
              f"**Payout:** {coin} **`+{payout:,}` Elyx Coins**{vip_note}\n"
              f"**Wallet:** {coin} **`{user['balance']:,}`**"
          ),
          color=discord.Color.brand_green(),
      )
    else:
      user["losses"] += 1
      res_embed = discord.Embed(
          title=f"{lose_icon} LANDED ON {landed.upper()} — YOU LOST!",
          description=(
              f"**Lost:** {coin} **`-{bet:,}` Elyx Coins**\n"
              f"**Wallet:** {coin} **`{user['balance']:,}`**"
          ),
          color=discord.Color.red(),
      )

    await self.db.save()
    await msg.edit(embed=res_embed)

  @commands.command(name="roulette", aliases=["rl"])
  async def roulette(
      self, ctx: commands.Context, color_pick: str = "red", amount: str = "100"
  ):
    pick = color_pick.lower()
    if pick not in ("red", "black", "green"):
      return await ctx.send(
          "Choose `red` (2x), `black` (2x), ya `green` (10x)! Example: `-rl red"
          " 500`"
      )

    bet = self.db.parse_bet(ctx.author.id, amount)
    user = self.db.get_user(ctx.author.id)
    if not bet or user["balance"] < bet:
      return await ctx.send("Insufficient Elyx Coins ya invalid amount!")

    user["balance"] -= bet
    user["wagered"] += bet
    await self.db.save()

    wheel = get_emoji("roulette_spin")
    coin = get_emoji("elyx_coin")
    win_icon = get_emoji("win_trophy")
    lose_icon = get_emoji("lose_skull")
    vip_icon = get_emoji("vip_badge")

    embed = discord.Embed(
        title=f"{wheel} ELYX VIP ROULETTE",
        description=(
            f"### {wheel} Ball spinning on the wheel...\n"
            f"**Your Pick:** `{pick.upper()}` | **Bet:** {coin} **`{bet:,}`**"
        ),
        color=discord.Color.purple(),
    )
    msg = await ctx.send(embed=embed)
    await asyncio.sleep(1.8)

    number = random.randint(0, 36)
    if number == 0:
      landed_color = "green"
      mult = 10.0
    elif number <= 18:
      landed_color = "red"
      mult = 2.0
    else:
      landed_color = "black"
      mult = 2.0

    if landed_color == pick:
      if user["vip"]:
        mult *= 1.25
      payout = int(bet * mult)
      user["balance"] += payout
      user["wins"] += 1
      vip_note = f" ({vip_icon} VIP Boost)" if user["vip"] else ""
      res_embed = discord.Embed(
          title=(
              f"{win_icon} BALL LANDED ON {number} ({landed_color.upper()})!"
          ),
          description=(
              f"**Won:** {coin} **`+{payout:,}` Elyx Coins**{vip_note}\n"
              f"**Wallet:** {coin} **`{user['balance']:,}`**"
          ),
          color=discord.Color.brand_green(),
      )
    else:
      user["losses"] += 1
      res_embed = discord.Embed(
          title=(
              f"{lose_icon} BALL LANDED ON {number} ({landed_color.upper()})!"
          ),
          description=(
              f"**Lost:** {coin} **`-{bet:,}` Elyx Coins**\n"
              f"**Wallet:** {coin} **`{user['balance']:,}`**"
          ),
          color=discord.Color.red(),
      )

    await self.db.save()
    await msg.edit(embed=res_embed)

  @commands.command(name="bj", aliases=["blackjack"])
  async def blackjack(self, ctx: commands.Context, amount: str = "200"):
    bet = self.db.parse_bet(ctx.author.id, amount)
    user = self.db.get_user(ctx.author.id)
    if not bet or user["balance"] < bet:
      return await ctx.send("Valid bet daalo ya balance check karo (`-bal`)!")

    user["balance"] -= bet
    user["wagered"] += bet
    await self.db.save()

    view = BlackjackView(ctx.author.id, bet, self.db)
    embed = view.build_embed(
        "Tap **HIT**, **STAND**, or **DOUBLE DOWN**:", discord.Color.blurple()
    )
    await ctx.send(embed=embed, view=view)


async def setup(bot: commands.Bot):
  await bot.add_cog(CasinoEngine(bot))
  
