import discord
from discord.ext import commands

class BotStartupUpdate(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_ready(self):
        print(f"{self.bot.user} is online - Elyx Test")

async def setup(bot):
    await bot.add_cog(BotStartupUpdate(bot))