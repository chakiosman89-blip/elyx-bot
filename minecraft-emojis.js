const {
  PermissionFlagsBits
} = require('discord.js');

// ================= CONFIG =================

const OWNER_ID = '1535048066875527198';

const PREFIX = '-';

const BASE_URL =
  'https://project-crafting.github.io/minecraft-auto-updated-textures-api/items/';

// ================= MINECRAFT ITEMS =================
// Emoji names Minecraft item IDs ke matching hain.

const ITEMS = [
  // Building blocks
  'stone',
  'cobblestone',
  'deepslate',
  'dirt',
  'grass_block',
  'sand',
  'gravel',
  'glass',
  'bricks',
  'obsidian',
  'bedrock',

  // Wood
  'oak_log',
  'oak_planks',
  'oak_sapling',
  'stick',
  'crafting_table',
  'chest',
  'barrel',

  // Ores and minerals
  'coal',
  'raw_iron',
  'iron_ingot',
  'raw_gold',
  'gold_ingot',
  'diamond',
  'emerald',
  'redstone',
  'lapis_lazuli',
  'raw_copper',
  'copper_ingot',
  'netherite_ingot',
  'quartz',
  'amethyst_shard',

  // Tools
  'wooden_pickaxe',
  'stone_pickaxe',
  'iron_pickaxe',
  'golden_pickaxe',
  'diamond_pickaxe',
  'netherite_pickaxe',

  'wooden_axe',
  'stone_axe',
  'iron_axe',
  'golden_axe',
  'diamond_axe',
  'netherite_axe',

  'wooden_shovel',
  'stone_shovel',
  'iron_shovel',
  'golden_shovel',
  'diamond_shovel',
  'netherite_shovel',

  'wooden_hoe',
  'stone_hoe',
  'iron_hoe',
  'golden_hoe',
  'diamond_hoe',
  'netherite_hoe',

  // Weapons
  'wooden_sword',
  'stone_sword',
  'iron_sword',
  'golden_sword',
  'diamond_sword',
  'netherite_sword',

  // Armour
  'leather_helmet',
  'iron_helmet',
  'golden_helmet',
  'diamond_helmet',
  'netherite_helmet',

  'iron_chestplate',
  'diamond_chestplate',
  'netherite_chestplate',

  'iron_leggings',
  'diamond_leggings',
  'netherite_leggings',

  'iron_boots',
  'diamond_boots',
  'netherite_boots',

  // Crafting and furnace
  'furnace',
  'blast_furnace',
  'smoker',
  'anvil',
  'stonecutter',
  'grindstone',
  'smithing_table',
  'enchanting_table',

  // Useful materials
  'string',
  'feather',
  'leather',
  'paper',
  'book',
  'bone',
  'gunpowder',
  'flint',
  'brick',
  'iron_nugget',
  'gold_nugget',

  // Food
  'bread',
  'apple',
  'golden_apple',
  'carrot',
  'potato',
  'baked_potato',
  'cooked_beef',
  'cooked_porkchop',

  // Nether
  'netherrack',
  'nether_brick',
  'blaze_rod',
  'blaze_powder',
  'glowstone_dust',
  'ender_pearl',
  'ender_eye',

  // Other useful items
  'bucket',
  'water_bucket',
  'lava_bucket',
  'torch',
  'ladder',
  'arrow',
  'bow',
  'shield',
  'fishing_rod',
  'flint_and_steel',
  'experience_bottle'
];

// ================= HELPERS =================

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getMinecraftEmoji(guild, itemName) {
  const emoji = guild.emojis.cache.find(
    item => item.name === itemName
  );

  return emoji
    ? `<:${emoji.name}:${emoji.id}>`
    : '📦';
}

function getItemImageUrl(itemName) {
  return `${BASE_URL}${encodeURIComponent(itemName)}.png`;
}

// ================= REGISTER SYSTEM =================

module.exports = function registerMinecraftEmojis(client) {

  // Available to other Minecraft modules.
  client.minecraftEmoji = (guild, itemName) => {
    return getMinecraftEmoji(guild, itemName);
  };

  client.minecraftItemNames = ITEMS;

  // ================= SETUP COMMAND =================

  client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content.trim() !== `${PREFIX}mcsetup`) return;

    if (message.author.id !== OWNER_ID) {
      return message.reply(
        '❌ Only the bot owner can run Minecraft emoji setup.'
      );
    }

    const me = message.guild.members.me;

    if (!me) {
      return message.reply(
        '❌ Bot server member information is unavailable.'
      );
    }

    if (!me.permissions.has(
      PermissionFlagsBits.ManageEmojisAndStickers
    )) {
      return message.reply(
        '❌ Give the bot **Manage Emojis and Stickers** permission.'
      );
    }

    const status = await message.reply(
      '⛏️ **ELYX MINECRAFT EMOJI SETUP**\n' +
      'Preparing Minecraft item icons...\n\n' +
      '⏳ Please wait.'
    );

    let created = 0;
    let skipped = 0;
    let failed = 0;

    const failedItems = [];

    for (const name of ITEMS) {

      // Refresh cache to detect newly created emojis.
      await message.guild.emojis.fetch().catch(() => {});

      const existing = message.guild.emojis.cache.find(
        emoji => emoji.name === name
      );

      if (existing) {
        skipped++;
        continue;
      }

      try {
        const response = await fetch(getItemImageUrl(name));

        if (!response.ok) {
          failed++;
          failedItems.push(`${name} (image unavailable)`);
          continue;
        }

        const imageBuffer = Buffer.from(
          await response.arrayBuffer()
        );

        if (!imageBuffer.length) {
          failed++;
          failedItems.push(`${name} (empty image)`);
          continue;
        }

        await message.guild.emojis.create({
          attachment: imageBuffer,
          name
        });

        created++;

      } catch (error) {
        failed++;
        failedItems.push(`${name} (${error.message})`);

        console.error(
          `[Minecraft Emoji] ${name}:`,
          error.message
        );
      }

      // Avoid sending requests too quickly.
      await wait(350);

      // Update progress periodically.
      const completed = created + skipped + failed;

      if (completed % 10 === 0) {
        await status.edit(
          `⛏️ **ELYX MINECRAFT EMOJI SETUP**\n\n` +
          `📊 Progress: ${completed}/${ITEMS.length}\n` +
          `✅ Created: ${created}\n` +
          `♻️ Already existed: ${skipped}\n` +
          `❌ Failed: ${failed}`
        ).catch(() => {});
      }
    }

    const report = [
      '⛏️ **ELYX MINECRAFT EMOJI SETUP COMPLETE**',
      '',
      `📦 Items checked: **${ITEMS.length}**`,
      `✅ Created: **${created}**`,
      `♻️ Already existed: **${skipped}**`,
      `❌ Failed: **${failed}**`,
      '',
      `💎 Diamond: ${getMinecraftEmoji(message.guild, 'diamond')}`,
      `⛏️ Pickaxe: ${getMinecraftEmoji(message.guild, 'diamond_pickaxe')}`,
      `🪵 Oak Log: ${getMinecraftEmoji(message.guild, 'oak_log')}`
    ];

    if (failedItems.length) {
      report.push(
        '',
        '**Failed items (first 15):**',
        failedItems.slice(0, 15).map(
          item => `• \`${item}\``
        ).join('\n')
      );
    }

    await status.edit(report.join('\n'));
  });
};
