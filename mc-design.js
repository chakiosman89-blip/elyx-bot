const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

// ================= COLORS =================

const COLORS = {
  main: 0x3BA55D,
  stone: 0x777777,
  wood: 0x8B5A2B,
  iron: 0xB8C3CC,
  gold: 0xFFD700,
  diamond: 0x35D8E8,
  emerald: 0x20C997,
  danger: 0xED4245,
  dark: 0x202225,
  success: 0x57F287,
  nether: 0x8B2020,
  xp: 0x9B59B6
};

// ================= ICONS =================

const ICONS = {
  pickaxe: '⛏️',
  inventory: '🎒',
  crafting: '🛠️',
  stone: '🪨',
  wood: '🪵',
  coal: '⚫',
  iron: '🔩',
  gold: '🪙',
  diamond: '💎',
  emerald: '🟢',
  redstone: '🔴',
  level: '⭐',
  xp: '✨',
  durability: '🛡️',
  success: '✅',
  locked: '🔒',
  coin: '🪙',
  fire: '🔥',
  chest: '📦',
  arrow: '➜'
};

// ================= ITEM EMOJIS =================

const ITEM_EMOJIS = {
  oak_log: '🪵',
  stick: '🥢',
  cobblestone: '🪨',
  coal: '⚫',
  raw_iron: '🪨',
  iron_ingot: '🔩',
  raw_gold: '🟡',
  gold_ingot: '🪙',
  diamond: '💎',
  emerald: '🟢',
  redstone: '🔴',
  lapis_lazuli: '🔵',
  wooden_pickaxe: '⛏️',
  stone_pickaxe: '⛏️',
  iron_pickaxe: '⛏️',
  gold_pickaxe: '⛏️',
  diamond_pickaxe: '⛏️',
  netherite_pickaxe: '⛏️'
};

// ================= HELPERS =================

function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.max(min, Math.min(max, number));
}

function formatName(name) {
  return String(name || 'Unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function itemEmoji(name, guild) {
  if (guild && guild.emojis) {
    const custom = guild.emojis.cache.find(
      emoji => emoji.name === String(name)
    );

    if (custom) {
      return `<:${custom.name}:${custom.id}>`;
    }
  }

  return ITEM_EMOJIS[name] || '📦';
}

function progressBar(current, max, size = 10) {
  size = clamp(Math.floor(size), 1, 25);
  max = Math.max(1, Number(max) || 1);
  current = clamp(current, 0, max);

  const filled = Math.round((current / max) * size);

  return '🟩'.repeat(filled) + '⬛'.repeat(size - filled);
}

function baseEmbed(title, description, color = COLORS.main) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || 'No information available.')
    .setFooter({
      text: 'ELYX MINECRAFT • SURVIVAL'
    })
    .setTimestamp();
}

function addDivider() {
  return '━━━━━━━━━━━━━━━━━━━━';
}

// ================= MINING SCREEN =================

function miningEmbed(data = {}) {
  const hp = clamp(data.hp, 0, Math.max(1, data.maxHp || 1));
  const maxHp = Math.max(1, Number(data.maxHp) || 1);

  const durability = clamp(
    data.durability,
    0,
    Math.max(1, data.maxDurability || 1)
  );

  const maxDurability = Math.max(
    1,
    Number(data.maxDurability) || 1
  );

  const hits = Math.max(0, Number(data.hits) || 0);

  return baseEmbed(
    `${data.blockEmoji || '🪨'} ${data.blockName || 'Stone Block'}`,
    [
      '```ansi',
      '      ⛏️  MINING STATION',
      '```',
      addDivider(),
      '**🧱 BLOCK HEALTH**',
      `${progressBar(hp, maxHp)}  \`${hp}/${maxHp} HP\``,
      '',
      '**🛡️ PICKAXE DURABILITY**',
      `${progressBar(durability, maxDurability)}  \`${durability}/${maxDurability}\``,
      '',
      '**⚒️ MINING PROGRESS**',
      `${progressBar(hits, maxHp)}  \`${hits} hits\``,
      addDivider(),
      `**⛏️ Equipped:** ${data.toolName || 'Wooden Pickaxe'}`,
      `**📦 Expected drops:** ${data.dropText || 'Unknown'}`,
      '',
      '*Press HIT BLOCK to continue mining.*'
    ].join('\n'),
    COLORS.stone
  );
}

// Keep this button ID compatible with the existing mining handler.
function miningButtons(ownerId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mc:hit:${ownerId}`)
      .setLabel('HIT BLOCK')
      .setEmoji('⛏️')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

// ================= INVENTORY =================

function inventoryEmbed(data = {}) {
  const items = data.items || {};

  const entries = Object.entries(items)
    .filter(([, amount]) => Number(amount) > 0);

  const lines = entries.slice(0, 35).map(([name, amount]) => {
    return `${itemEmoji(name, data.guild)} **${formatName(name)}**  × \`${amount}\``;
  });

  const total = entries.reduce(
    (sum, [, amount]) => sum + Math.max(0, Number(amount) || 0),
    0
  );

  return baseEmbed(
    `🎒 ${data.username || 'Miner'}'s Inventory`,
    [
      '```ansi',
      '       PLAYER BACKPACK',
      '```',
      addDivider(),
      lines.length ? lines.join('\n') : '*Your backpack is empty.*',
      addDivider(),
      `**📦 Total items:** ${total}`,
      `**⛏️ Equipped:** ${data.toolName || 'Wooden Pickaxe'}`
    ].join('\n'),
    COLORS.main
  );
}

// ================= PICKAXES =================

function toolsEmbed(data = {}) {
  const tools = data.tools || [];

  const lines = tools.slice(0, 15).map(tool => {
    const status = tool.owned ? '✅' : '🔒';
    const cost = tool.owned
      ? 'Unlocked'
      : `Cost: ${tool.cost || 'Materials required'}`;

    return `${status} **${tool.name || 'Pickaxe'}**\n└ ${cost}`;
  });

  return baseEmbed(
    '⛏️ PICKAXE COLLECTION',
    [
      '*Choose your next mining tool.*',
      addDivider(),
      lines.length ? lines.join('\n\n') : 'No pickaxes available.',
      addDivider(),
      `**Equipped:** ${data.equipped || 'Wooden Pickaxe'}`
    ].join('\n'),
    COLORS.iron
  );
}

// ================= CRAFTING =================

function craftingEmbed(data = {}) {
  const recipes = data.recipes || [];

  const lines = recipes.slice(0, 15).map(recipe => {
    return [
      `${recipe.available ? '🟢' : '🔒'} **${recipe.name || 'Recipe'}**`,
      `└ ${recipe.ingredients || 'Ingredients unavailable'}`,
      recipe.available ? '*Ready to craft*' : '*Missing materials*'
    ].join('\n');
  });

  return baseEmbed(
    '🛠️ CRAFTING TABLE',
    [
      '*Combine materials to craft useful items.*',
      addDivider(),
      lines.length ? lines.join('\n\n') : 'No recipes available.',
      addDivider(),
      'Crafting consumes the required materials.'
    ].join('\n'),
    COLORS.gold
  );
}

// ================= UPGRADE =================

function upgradeEmbed(data = {}) {
  const requirements = data.requirements || [];

  const lines = requirements.map(item => {
    return `${item.available ? '✅' : '❌'} ${item.name} × ${item.amount}`;
  });

  return baseEmbed(
    '⚒️ PICKAXE UPGRADE',
    [
      `**Current tool:** ${data.currentTool || 'Wooden Pickaxe'}`,
      `**Next tool:** ${data.nextTool || 'Stone Pickaxe'}`,
      addDivider(),
      '**Required materials**',
      lines.length ? lines.join('\n') : 'Requirements not supplied.',
      '',
      data.canUpgrade
        ? '✅ You have the required materials.'
        : '🔒 Collect the missing materials first.'
    ].join('\n'),
    COLORS.gold
  );
}

// ================= SMELTING =================

function smeltingEmbed(data = {}) {
  return baseEmbed(
    '🔥 FURNACE',
    [
      '**Input**',
      `${itemEmoji(data.input, data.guild)} ${formatName(data.input || 'Raw Iron')} × ${data.inputAmount || 1}`,
      '',
      '**Output**',
      `${itemEmoji(data.output, data.guild)} ${formatName(data.output || 'Iron Ingot')} × ${data.outputAmount || 1}`,
      addDivider(),
      data.canSmelt
        ? '✅ Ready to smelt.'
        : '❌ You do not have enough materials.'
    ].join('\n'),
    COLORS.gold
  );
}

// ================= REPAIR =================

function repairEmbed(data = {}) {
  const current = clamp(data.durability, 0, data.maxDurability || 1);
  const max = Math.max(1, Number(data.maxDurability) || 1);

  return baseEmbed(
    '🛠️ PICKAXE REPAIR',
    [
      `**Tool:** ${data.toolName || 'Wooden Pickaxe'}`,
      '',
      '**Current durability**',
      `${progressBar(current, max)}  \`${current}/${max}\``,
      '',
      `**Repair cost:** ${data.cost || 'Materials required'}`,
      '',
      data.canRepair
        ? '✅ Your pickaxe can be repaired.'
        : '❌ You do not have the required materials.'
    ].join('\n'),
    COLORS.iron
  );
}

// ================= RARE DROP =================

function rareDropEmbed(data = {}) {
  return baseEmbed(
    '✨ RARE DISCOVERY',
    [
      '```ansi',
      '     A RARE ITEM WAS FOUND!',
      '```',
      addDivider(),
      `${data.emoji || '💎'} **${data.name || 'Rare Item'}**`,
      '',
      `**Amount:** \`${data.amount || 1}\``,
      `**Miner:** ${data.username || 'Unknown Miner'}`,
      addDivider(),
      '*A valuable discovery from the depths!*'
    ].join('\n'),
    COLORS.diamond
  );
}

// ================= MINING COMPLETE =================

function miningCompleteEmbed(data = {}) {
  return baseEmbed(
    '⛏️ BLOCK MINED!',
    [
      `${data.blockEmoji || '🪨'} **${data.blockName || 'Block'}**`,
      '',
      '**Loot collected**',
      data.dropText || 'No items dropped.',
      addDivider(),
      `**Blocks mined:** ${data.blocksMined || 0}`,
      `**XP earned:** +${data.xp || 0}`,
      data.rareDrop ? `\n✨ **Rare drop:** ${data.rareDrop}` : ''
    ].join('\n'),
    COLORS.success
  );
}

// ================= PLAYER PROFILE =================

function profileEmbed(data = {}) {
  const xp = Math.max(0, Number(data.xp) || 0);
  const xpNeeded = Math.max(1, Number(data.xpNeeded) || 100);

  return baseEmbed(
    `⭐ ${data.username || 'Miner'}'s Profile`,
    [
      '```ansi',
      '        MINER PROFILE',
      '```',
      addDivider(),
      `**⭐ Level:** ${data.level || 1}`,
      `**✨ XP:** ${xp}/${xpNeeded}`,
      progressBar(xp, xpNeeded),
      '',
      `**⛏️ Blocks mined:** ${data.blocksMined || 0}`,
      `**💎 Diamonds found:** ${data.diamondsCollected || 0}`,
      `**🪙 Gold found:** ${data.goldCollected || 0}`,
      `**🛠️ Pickaxe:** ${data.toolName || 'Wooden Pickaxe'}`,
      addDivider(),
      `**🏆 Rank:** ${data.rank || 'Unranked'}`
    ].join('\n'),
    COLORS.xp
  );
}

// ================= MINING ZONES =================

function zonesEmbed(zones = []) {
  const lines = zones.slice(0, 15).map(zone => {
    return [
      `${zone.unlocked ? '🟢' : '🔒'} **${zone.name}**`,
      `└ ${zone.description || 'Explore this mining zone.'}`,
      `└ Required level: ${zone.level || 1}`
    ].join('\n');
  });

  return baseEmbed(
    '🗺️ MINING ZONES',
    [
      '*Choose where your next adventure begins.*',
      addDivider(),
      lines.length ? lines.join('\n\n') : 'No zones available.',
      addDivider(),
      'Higher-level zones may contain rarer resources.'
    ].join('\n'),
    COLORS.main
  );
}

// ================= LEADERBOARD =================

function leaderboardEmbed(players = []) {
  const medals = ['🥇', '🥈', '🥉'];

  const lines = players.slice(0, 10).map((player, index) => {
    const rank = medals[index] || `**${index + 1}.**`;

    return `${rank} **${player.username || 'Miner'}**\n└ ⛏️ \`${player.blocksMined || 0} blocks\``;
  });

  return baseEmbed(
    '🏆 MINING LEADERBOARD',
    [
      '*The most active miners in Elyx.*',
      addDivider(),
      lines.length ? lines.join('\n\n') : 'No miners ranked yet.'
    ].join('\n'),
    COLORS.gold
  );
}

// ================= HELP =================

function helpEmbed() {
  return baseEmbed(
    '📖 ELYX MINECRAFT GUIDE',
    [
      '*Your mining adventure starts here.*',
      addDivider(),
      '⛏️ **Mining**',
      '`-mine` — Start mining',
      '`-inv` — View inventory',
      '`-tools` — View pickaxes',
      '',
      '🛠️ **Workshop**',
      '`-upgrade stone` — Upgrade pickaxe',
      '`-craft stick` — Craft an item',
      '`-smelt iron` — Smelt raw iron',
      '`-repair` — Repair your pickaxe',
      '',
      '🏆 **Statistics**',
      '`-leaderboard` — Top miners',
      '`-mchelp` — Show this guide',
      addDivider(),
      '*More features depend on the active game system.*'
    ].join('\n'),
    COLORS.main
  );
}

// ================= SIMPLE STATUS EMBEDS =================

function successEmbed(title, description) {
  return baseEmbed(
    `✅ ${title || 'Success'}`,
    description || 'Action completed successfully.',
    COLORS.success
  );
}

function errorEmbed(title, description) {
  return baseEmbed(
    `❌ ${title || 'Something went wrong'}`,
    description || 'Please try again.',
    COLORS.danger
  );
}

function infoEmbed(title, description) {
  return baseEmbed(
    `ℹ️ ${title || 'Information'}`,
    description || 'No additional information.',
    COLORS.dark
  );
}

// ================= EXPORTS =================

module.exports = {
  COLORS,
  ICONS,
  progressBar,
  formatName,
  itemEmoji,
  baseEmbed,
  miningEmbed,
  miningButtons,
  inventoryEmbed,
  toolsEmbed,
  craftingEmbed,
  upgradeEmbed,
  smeltingEmbed,
  repairEmbed,
  rareDropEmbed,
  miningCompleteEmbed,
  profileEmbed,
  zonesEmbed,
  leaderboardEmbed,
  helpEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed
};
