gold_ingot: 8,
diamond: 3,
stick: 4
}
}
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, '{}');
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    console.error('Minecraft data error:', error);
    return {};
  }
}

let data = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getPlayer(userId) {
  if (!data[userId]) {
    data[userId] = {
      inventory: { oak_log: 10, stick: 20 },
      tool: 'wooden',
      durability: 40,
      mining: null,
      blocksMined: 0,
      diamondsCollected: 0,
      goldCollected: 0,
      totalHits: 0
    };
    saveData();
  }
  return data[userId];
}

function itemName(key) {
  return ITEMS[key]?.name || key;
}

function itemEmoji(key) {
  return ITEMS[key]?.emoji || '📦';
}

function addItem(player, key, amount) {
  player.inventory[key] = (player.inventory[key] || 0) + amount;
}

function hasMaterials(player, materials) {
  return Object.entries(materials).every(
    ([key, amount]) => (player.inventory[key] || 0) >= amount
  );
}

function removeMaterials(player, materials) {
  for (const [key, amount] of Object.entries(materials)) {
    player.inventory[key] -= amount;
  }
}

function formatMaterials(materials) {
  return Object.entries(materials)
    .map(([key, amount]) =>
      `${itemEmoji(key)} **${amount}** ${itemName(key)}`
    )
    .join('\n');
}

function progressBar(current, max) {
  const filled = Math.round(
    Math.max(0, Math.min(1, current / max)) * 10
  );
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

function randomBlock() {
  const roll = Math.random();

  if (roll < 0.50) return 'stone';
  if (roll < 0.80) return 'deepslate';
  if (roll < 0.94) return 'coal_ore';

  return 'iron_ore';
}

function rollDrops(block) {
  const result = {};

  for (const [key, min, max, chance] of block.drops) {
    if (Math.random() * 100 < chance) {
      result[key] =
        Math.floor(Math.random() * (max - min + 1)) + min;
    }
  }

  return result;
}

function makeMiningEmbed(player) {
  const block = BLOCKS[player.mining.block];
  const tool = TOOLS[player.tool];

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${block.emoji} Minecraft Mining`)
    .setDescription(
      `**Block:** ${block.name}\n` +
      `**Block HP:** ${player.mining.hp}/${block.hp}\n` +
      `${progressBar(player.mining.hp, block.hp)}\n\n` +
      `**Pickaxe:** ${tool.name}\n` +
      `**Durability:** ${player.durability}/${tool.durability}\n` +
      `${progressBar(player.durability, tool.durability)}\n\n` +
      'Press **HIT BLOCK** to mine.'
    )
    .setFooter({
      text: 'Elyx Minecraft • Mining System'
    });
}

function miningRow(player, ownerId) {
  const disabled = !player.mining || player.durability <= 0;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mc:hit:${ownerId}`)
      .setLabel(disabled ? 'Block Broken' : '⛏️ HIT BLOCK')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

function inventoryEmbed(player, user) {
  const entries = Object.entries(player.inventory)
    .filter(([, amount]) => amount > 0);

  const inventoryText = entries.length
    ? entries.map(([key, amount]) =>
        `${itemEmoji(key)} **${itemName(key)}** × ${amount}`
      ).join('\n')
    : 'Your inventory is empty.';

  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle(`🎒 ${user.username}'s Inventory`)
    .setDescription(inventoryText)
    .addFields({
      name: '⛏️ Equipped Pickaxe',
      value:
        `${TOOLS[player.tool].name}\n` +
        `Durability: ${player.durability}/${TOOLS[player.tool].durability}`
    })
    .setFooter({ text: 'Elyx Minecraft' });
}

function toolsEmbed(player) {
  const descriptions = Object.entries(TOOLS).map(([key, tool]) => {
    const equipped = player.tool === key;

    return `${equipped ? '🟢' : '⚪'} **${tool.name}**` +
      `${equipped ? ' (EQUIPPED)' : ''}\n` +
      `Power: ${tool.power} • Durability: ${tool.durability}`;
  });

  return new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('⛏️ Pickaxe Collection')
    .setDescription(descriptions.join('\n\n'));
}

module.exports = function registerMinecraft(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = (args.shift() || '').toLowerCase();
    const player = getPlayer(message.author.id);

    try {
      if (command === 'mine') {
        if (player.durability <= 0) {
          return message.reply('❌ Your pickaxe is broken! Use `-repair` first.');
        }

        const blockKey = randomBlock();

        player.mining = {
          block: blockKey,
          hp: BLOCKS[blockKey].hp
        };

        saveData();

        return message.reply({
          embeds: [makeMiningEmbed(player)],
          components: [miningRow(player, message.author.id)]
        });
      }

      if (command === 'inv' || command === 'inventory') {
        return message.reply({
          embeds: [inventoryEmbed(player, message.author)]
        });
      }

      if (command === 'tools') {
        return message.reply({ embeds: [toolsEmbed(player)] });
      }

      if (command === 'upgrade') {
        const target = (args[0] || '').toLowerCase();
        const recipe = RECIPES[target];

        if (!recipe) {
          return message.reply(
            'Use `-upgrade stone`, `-upgrade iron`, `-upgrade gold` or `-upgrade diamond`.'
          );
        }

        const order = ['wooden', 'stone', 'iron', 'gold', 'diamond'];

        if (order.indexOf(target) !== order.indexOf(player.tool) + 1) {
          return message.reply('❌ Upgrade your current pickaxe to the next tier first.');
        }

        if (!hasMaterials(player, recipe.materials)) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Not Enough Materials')
                .setDescription(
                  `Required materials:\n\n${formatMaterials(recipe.materials)}`
                )
            ]
          });
        }

        removeMaterials(player, recipe.materials);
        player.tool = target;
        player.durability = TOOLS[target].durability;
        player.mining = null;

        saveData();

        return message.reply(
          `✅ **${TOOLS[target].name} crafted!**\n` +
          `Power: ${TOOLS[target].power}\n` +
          `Durability: ${player.durability}/${TOOLS[target].durability}`
        );
      }

      if (command === 'craft') {
        if ((args[0] || '').toLowerCase() !== 'stick') {
          return message.reply('Use `-craft stick`.');
        }

        if ((player.inventory.oak_log || 0) < 2) {
          return message.reply('❌ You need 2 Oak Logs to craft 4 Sticks.');
        }

        player.inventory.oak_log -= 2;
        addItem(player, 'stick', 4);
        saveData();

        return message.reply('🪵 Crafted **4 Sticks** using 2 Oak Logs.');
      }

      if (command === 'smelt') {
        const type = (args[0] || '').toLowerCase();

        const recipes = {
          iron: { raw: 'raw_iron', ingot: 'iron_ingot' },
          gold: { raw: 'raw_gold', ingot: 'gold_ingot' }
        };

        const recipe = recipes[type];

        if (!recipe) {
          return message.reply('Use `-smelt iron` or `-smelt gold`.');
        }

        if (
          (player.inventory[recipe.raw] || 0) < 1 ||
          (player.inventory.coal || 0) < 1
        ) {
          return message.reply(
            `❌ You need 1 ${itemName(recipe.raw)} and 1 Coal.`
          );
        }

        player.inventory[recipe.raw]--;
        player.inventory.coal--;
        addItem(player, recipe.ingot, 1);
        saveData();

        return message.reply(`🔥 Smelted 1 ${itemName(recipe.ingot)}.`);
      }

      if (command === 'repair') {
        const cost = player.tool === 'wooden'
          ? { oak_log: 2 }
          : { cobblestone: 5 };

        if (player.durability >= TOOLS[player.tool].durability) {
          return message.reply('✅ Your pickaxe is already fully repaired.');
        }

        if (!hasMaterials(player, cost)) {
          return message.reply(
            `❌ Repair cost:\n${formatMaterials(cost)}`
          );
        }

        removeMaterials(player, cost);
        player.durability = TOOLS[player.tool].durability;
        saveData();

        return message.reply(`🔧 **${TOOLS[player.tool].name} repaired!**`);
      }

      if (command === 'leaderboard' || command === 'lb') {
        const top = Object.entries(data)
          .sort((a, b) =>
            (b[1].blocksMined || 0) - (a[1].blocksMined || 0)
          )
          .slice(0, 10);

        const lines = top.length
          ? top.map(([id, p], i) =>
              `**${i + 1}.** <@${id}> — ${p.blocksMined || 0} blocks`
            )
          : ['No mining records yet.'];

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498DB)
              .setTitle('🏆 Mining Leaderboard')
              .setDescription(lines.join('\n'))
          ]
        });
      }

      if (command === 'help' || command === 'mchelp') {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('⛏️ Elyx Minecraft Commands')
              .setDescription(
                '`-mine` — Mine a block\n' +
                '`-inv` — View inventory\n' +
                '`-tools` — View pickaxes\n' +
                '`-upgrade stone` — Upgrade pickaxe\n' +
                '`-craft stick` — Craft sticks\n' +
                '`-smelt iron` — Smelt iron\n' +
                '`-smelt gold` — Smelt gold\n' +
                '`-repair` — Repair pickaxe\n' +
                '`-leaderboard` — Top miners'
              )
          ]
        });
      }
    } catch (error) {
      console.error('Minecraft command error:', error);

      return message.reply(
        '❌ Minecraft command error. Please try again.'
      ).catch(() => {});
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('mc:hit:')) return;

    const ownerId = interaction.customId.split(':')[2];

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: '❌ This mining session belongs to another player.',
        ephemeral: true
      });
    }

    const player = getPlayer(ownerId);

    if (!player.mining) {
      return interaction.reply({
        content: 'This block is no longer available. Use `-mine` again.',
        ephemeral: true
      });
    }

    if (player.durability <= 0) {
      player.mining = null;
      saveData();

      return interaction.reply({
        content: '❌ Your pickaxe is broken. Use `-repair`.',
        ephemeral: true
      });
    }

    const block = BLOCKS[player.mining.block];
    const tool = TOOLS[player.tool];

    player.mining.hp -= tool.power;
    player.durability--;
    player.totalHits++;

    if (player.mining.hp <= 0) {
      const drops = rollDrops(block);

      for (const [key, amount] of Object.entries(drops)) {
        addItem(player, key, amount);

        if (key === 'diamond') player.diamondsCollected += amount;
        if (key === 'raw_gold') player.goldCollected += amount;
      }

      player.blocksMined++;
      player.mining = null;
      saveData();

      const dropText = Object.keys(drops).length
        ? Object.entries(drops).map(([key, amount]) =>
            `${itemEmoji(key)} **${itemName(key)}** × ${amount}`
          ).join('\n')
        : 'No drops this time.';

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle(`✅ ${block.name} mined!`)
        .setDescription(
          `**Drops collected:**\n${dropText}\n\n` +
          `**Blocks mined:** ${player.blocksMined}\n` +
          `**Pickaxe durability:** ${player.durability}/${tool.durability}\n\n` +
          'Use `-mine` to find another block.'
        )
        .setFooter({ text: 'Elyx Minecraft' });

      return interaction.update({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`mc:broken:${ownerId}`)
              .setLabel('Block Mined')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          )
        ]
      });
    }

    saveData();

    return interaction.update({
      embeds: [makeMiningEmbed(player)],
      components: [miningRow(player, ownerId)]
    });
  });

  console.log('Elyx Minecraft Mining module loaded.');
};
