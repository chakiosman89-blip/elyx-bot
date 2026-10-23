const { PermissionFlagsBits } = require('discord.js');

const OWNER_ID = '1535048066875527198';

const ITEMS = [
  'oak_log',
  'stick',
  'cobblestone',
  'coal',
  'raw_iron',
  'iron_ingot',
  'raw_gold',
  'gold_ingot',
  'diamond',
  'emerald',
  'redstone',
  'lapis_lazuli'
];

const BASE_URL =
  'https://project-crafting.github.io/minecraft-auto-updated-textures-api/items/';

module.exports = function (client) {
  client.minecraftEmoji = (guild, name) => {
    const emoji = guild.emojis.cache.find(e => e.name === name);
    return emoji ? `<:${emoji.name}:${emoji.id}>` : '▫️';
  };

  client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (message.content.trim() !== '-mcsetup') return;

    if (message.author.id !== OWNER_ID) {
      return message.reply('Only the bot owner can run this setup.');
    }

    const me = message.guild.members.me;

    if (!me.permissions.has(
      PermissionFlagsBits.ManageEmojisAndStickers
    )) {
      return message.reply(
        'Bot ko Manage Emojis and Stickers permission do.'
      );
    }

    const status = await message.reply(
      '⛏️ Minecraft item emojis setup ho raha hai...'
    );

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const name of ITEMS) {
      if (message.guild.emojis.cache.some(e => e.name === name)) {
        skipped++;
        continue;
      }

      try {
        const response = await fetch(`${BASE_URL}${name}.png`);

        if (!response.ok) {
          failed++;
          continue;
        }

        const imageBuffer = Buffer.from(
          await response.arrayBuffer()
        );

        await message.guild.emojis.create({
          attachment: imageBuffer,
          name: name
        });

        created++;

      } catch (error) {
        failed++;
        console.error(`Emoji ${name} failed:`, error.message);
      }
    }

    await status.edit(
      `⛏️ **Minecraft Emoji Setup**\n\n` +
      `✅ Created: ${created}\n` +
      `♻️ Already existed: ${skipped}\n` +
      `❌ Failed: ${failed}\n\n` +
      `Diamond: ${client.minecraftEmoji(message.guild, 'diamond')}`
    );
  });
};
