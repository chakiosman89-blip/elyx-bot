// ============================================
// ELYX MINECRAFT RPG - CORE SYSTEM
// PART 1/5
// ============================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const DESIGN = require('./mc-design');

const PREFIX = '-';
const DATA_FILE = path.join(__dirname, 'minecraft-data.json');

const CONFIG = {
    PREFIX,
    MAX_INVENTORY_SLOTS: 45,
    STARTING_HEALTH: 20,
    MINING_TIMEOUT: 120000,
    SAVE_DELAY: 1500,
    MAX_MINING_HITS: 30
};

// ============================================
// ITEM DATABASE
// ============================================

const ITEMS = {
    oak_log: {
        name: 'Oak Log',
        emoji: '🪵',
        type: 'material',
        rarity: 'common',
        sell: 2
    },

    oak_planks: {
        name: 'Oak Planks',
        emoji: '🪵',
        type: 'material',
        rarity: 'common',
        sell: 1
    },

    stick: {
        name: 'Stick',
        emoji: '🥢',
        type: 'material',
        rarity: 'common',
        sell: 1
    },

    cobblestone: {
        name: 'Cobblestone',
        emoji: '🪨',
        type: 'material',
        rarity: 'common',
        sell: 1
    },

    coal: {
        name: 'Coal',
        emoji: '⚫',
        type: 'material',
        rarity: 'common',
        sell: 3
    },

    raw_iron: {
        name: 'Raw Iron',
        emoji: '🪨',
        type: 'material',
        rarity: 'uncommon',
        sell: 5
    },

    iron_ingot: {
        name: 'Iron Ingot',
        emoji: '🔩',
        type: 'material',
        rarity: 'uncommon',
        sell: 10
    },

    raw_gold: {
        name: 'Raw Gold',
        emoji: '🟡',
        type: 'material',
        rarity: 'rare',
        sell: 12
    },

    gold_ingot: {
        name: 'Gold Ingot',
        emoji: '🪙',
        type: 'material',
        rarity: 'rare',
        sell: 25
    },

    diamond: {
        name: 'Diamond',
        emoji: '💎',
        type: 'material',
        rarity: 'epic',
        sell: 100
    },

    emerald: {
        name: 'Emerald',
        emoji: '💚',
        type: 'material',
        rarity: 'epic',
        sell: 80
    },

    redstone: {
        name: 'Redstone',
        emoji: '🔴',
        type: 'material',
        rarity: 'uncommon',
        sell: 6
    },

    lapis_lazuli: {
        name: 'Lapis Lazuli',
        emoji: '🔵',
        type: 'material',
        rarity: 'uncommon',
        sell: 7
    },

    crafting_table: {
        name: 'Crafting Table',
        emoji: '🪚',
        type: 'utility',
        rarity: 'common',
        sell: 5
    },

    furnace: {
        name: 'Furnace',
        emoji: '🔥',
        type: 'utility',
        rarity: 'common',
        sell: 8
    },

    bread: {
        name: 'Bread',
        emoji: '🍞',
        type: 'food',
        rarity: 'common',
        sell: 3
    },

    golden_apple: {
        name: 'Golden Apple',
        emoji: '🍎',
        type: 'food',
        rarity: 'rare',
        sell: 40
    }
};

// ============================================
// PICKAXE DATABASE
// ============================================

const PICKAXES = {
    wooden: {
        name: 'Wooden Pickaxe',
        emoji: '🪓',
        power: 1,
        durability: 35,
        cost: {
            oak_planks: 3,
            stick: 2
        },
        level: 1
    },

    stone: {
        name: 'Stone Pickaxe',
        emoji: '⛏️',
        power: 2,
        durability: 80,
        cost: {
            cobblestone: 3,
            stick: 2
        },
        level: 2
    },

    iron: {
        name: 'Iron Pickaxe',
        emoji: '⛏️',
        power: 4,
        durability: 180,
        cost: {
            iron_ingot: 3,
            stick: 2
        },
        level: 3
    },

    gold: {
        name: 'Golden Pickaxe',
        emoji: '⛏️',
        power: 5,
        durability: 100,
        cost: {
            gold_ingot: 3,
            stick: 2
        },
        level: 4
    },

    diamond: {
        name: 'Diamond Pickaxe',
        emoji: '💎',
        power: 7,
        durability: 450,
        cost: {
            diamond: 3,
            stick: 2
        },
        level: 5
    }
};

// ============================================
// MINING BLOCK DATABASE
// ============================================

const BLOCKS = {
    stone: {
        name: 'Stone',
        emoji: '🪨',
        hp: 12,
        minPower: 1,
        xp: 2,
        drops: [
            { item: 'cobblestone', min: 1, max: 3, chance: 1 }
        ]
    },

    coal_ore: {
        name: 'Coal Ore',
        emoji: '⚫',
        hp: 18,
        minPower: 1,
        xp: 5,
        drops: [
            { item: 'coal', min: 1, max: 3, chance: 0.85 },
            { item: 'cobblestone', min: 1, max: 2, chance: 0.5 }
        ]
    },

    iron_ore: {
        name: 'Iron Ore',
        emoji: '🪨',
        hp: 30,
        minPower: 2,
        xp: 9,
        drops: [
            { item: 'raw_iron', min: 1, max: 2, chance: 0.8 },
            { item: 'cobblestone', min: 1, max: 3, chance: 0.6 }
        ]
    },

    gold_ore: {
        name: 'Gold Ore',
        emoji: '🟡',
        hp: 42,
        minPower: 3,
        xp: 15,
        drops: [
            { item: 'raw_gold', min: 1, max: 2, chance: 0.65 }
        ]
    },

    diamond_ore: {
        name: 'Diamond Ore',
        emoji: '💎',
        hp: 55,
        minPower: 4,
        xp: 30,
        drops: [
            { item: 'diamond', min: 1, max: 2, chance: 0.65 }
        ]
    },

    emerald_ore: {
        name: 'Emerald Ore',
        emoji: '💚',
        hp: 60,
        minPower: 4,
        xp: 35,
        drops: [
            { item: 'emerald', min: 1, max: 1, chance: 0.45 }
        ]
    }
};

// ============================================
// CRAFTING RECIPES
// ============================================

const RECIPES = {
    oak_planks: {
        name: 'Oak Planks',
        output: 'oak_planks',
        amount: 4,
        ingredients: {
            oak_log: 1
        }
    },

    stick: {
        name: 'Stick',
        output: 'stick',
        amount: 4,
        ingredients: {
            oak_planks: 2
        }
    },

    crafting_table: {
        name: 'Crafting Table',
        output: 'crafting_table',
        amount: 1,
        ingredients: {
            oak_planks: 4
        }
    },

    furnace: {
        name: 'Furnace',
        output: 'furnace',
        amount: 1,
        ingredients: {
            cobblestone: 8
        }
    },

    bread: {
        name: 'Bread',
        output: 'bread',
        amount: 1,
        ingredients: {
            wheat: 3
        }
    }
};

// ============================================
// MINING ZONES
// ============================================

const ZONES = {
    overworld: {
        name: 'Overworld Mine',
        emoji: '🌳',
        level: 1,
        blocks: [
            { id: 'stone', chance: 55 },
            { id: 'coal_ore', chance: 30 },
            { id: 'iron_ore', chance: 15 }
        ]
    },

    deep_caves: {
        name: 'Deep Caves',
        emoji: '🕳️',
        level: 5,
        blocks: [
            { id: 'stone', chance: 25 },
            { id: 'coal_ore', chance: 25 },
            { id: 'iron_ore', chance: 30 },
            { id: 'gold_ore', chance: 15 },
            { id: 'diamond_ore', chance: 5 }
        ]
    },

    crystal_mines: {
        name: 'Crystal Mines',
        emoji: '💎',
        level: 12,
        blocks: [
            { id: 'iron_ore', chance: 20 },
            { id: 'gold_ore', chance: 30 },
            { id: 'diamond_ore', chance: 35 },
            { id: 'emerald_ore', chance: 15 }
        ]
    }
};

// ============================================
// PLAYER DATA & SAVE SYSTEM
// ============================================

function createPlayer() {
    return {
        inventory: {
            oak_log: 5,
            oak_planks: 0,
            stick: 0,
            cobblestone: 0,
            coal: 0,
            raw_iron: 0,
            iron_ingot: 0,
            raw_gold: 0,
            gold_ingot: 0,
            diamond: 0,
            emerald: 0,
            redstone: 0,
            lapis_lazuli: 0,
            crafting_table: 0,
            furnace: 0,
            bread: 0,
            golden_apple: 0
        },

        pickaxe: 'wooden',
        durability: 35,

        level: 1,
        xp: 0,
        coins: 0,

        blocksMined: 0,
        totalHits: 0,
        diamondsCollected: 0,
        goldCollected: 0,

        zone: 'overworld',
        health: 20,

        mining: null,
        crafting: null,

        createdAt: Date.now()
    };
}

function loadDatabase() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify({}, null, 2)
            );
        }

        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw || '{}');

        return parsed && typeof parsed === 'object'
            ? parsed
            : {};
    } catch (error) {
        console.error('[Minecraft] Database load error:', error);
        return {};
    }
}

const database = loadDatabase();

let saveTimer = null;

function saveDatabase() {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        try {
            const temporaryFile = `${DATA_FILE}.tmp`;

            fs.writeFileSync(
                temporaryFile,
                JSON.stringify(database, null, 2)
            );

            fs.renameSync(temporaryFile, DATA_FILE);
        } catch (error) {
            console.error('[Minecraft] Database save error:', error);
        }
    }, CONFIG.SAVE_DELAY);
}

function getPlayer(userId) {
    if (!database[userId]) {
        database[userId] = createPlayer();
        saveDatabase();
    }

    const player = database[userId];

    if (!player.inventory) player.inventory = {};
    if (!player.pickaxe) player.pickaxe = 'wooden';
    if (!player.level) player.level = 1;
    if (typeof player.xp !== 'number') player.xp = 0;
    if (typeof player.coins !== 'number') player.coins = 0;
    if (typeof player.blocksMined !== 'number') player.blocksMined = 0;
    if (typeof player.totalHits !== 'number') player.totalHits = 0;

    if (typeof player.durability !== 'number') {
        player.durability = PICKAXES[player.pickaxe]?.durability || 35;
    }

    return player;
}

// ============================================
// COMMON HELPERS
// ============================================

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(probability) {
    return Math.random() < probability;
}

function formatNumber(number) {
    return Number(number || 0).toLocaleString('en-US');
}

function getItemName(itemId) {
    return ITEMS[itemId]?.name ||
        itemId.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function getItemEmoji(guild, itemId) {
    if (typeof guild?.client?.minecraftEmoji === 'function') {
        const custom = guild.client.minecraftEmoji(guild, itemId);

        if (custom && custom !== '📦') {
            return custom;
        }
    }

    return ITEMS[itemId]?.emoji || '📦';
}

function getItemDisplay(guild, itemId, amount = 1) {
    return `${getItemEmoji(guild, itemId)} **${getItemName(itemId)}** × ${formatNumber(amount)}`;
}

function getPickaxe(player) {
    return PICKAXES[player.pickaxe] || PICKAXES.wooden;
}

function addItem(player, itemId, amount = 1) {
    if (!ITEMS[itemId] || amount <= 0) return false;

    player.inventory[itemId] =
        (player.inventory[itemId] || 0) + amount;

    return true;
}

function removeItem(player, itemId, amount = 1) {
    if ((player.inventory[itemId] || 0) < amount) {
        return false;
    }

    player.inventory[itemId] -= amount;

    if (player.inventory[itemId] <= 0) {
        delete player.inventory[itemId];
    }

    return true;
}

function hasItems(player, ingredients) {
    return Object.entries(ingredients).every(([item, amount]) =>
        (player.inventory[item] || 0) >= amount
    );
}

function getXpRequired(level) {
    return 50 + (Math.max(1, level) - 1) * 25;
}

function addXP(player, amount) {
    player.xp += amount;

    const levelUps = [];

    while (player.xp >= getXpRequired(player.level)) {
        player.xp -= getXpRequired(player.level);
        player.level++;
        levelUps.push(player.level);
    }

    return levelUps;
}

// ============================================
// PART 1 COMPLETE
// Next part adds mining, crafting and gameplay.
// ============================================


// ============================================
// PART 2/5 — MINING SYSTEM
// ============================================

function makeProgressBar(current, maximum, size = 12) {
    maximum = Math.max(1, maximum);
    current = Math.max(0, Math.min(maximum, current));

    const filled = Math.round((current / maximum) * size);

    return '🟩'.repeat(filled) + '⬛'.repeat(size - filled);
}

function weightedBlock(zone) {
    const entries = zone.blocks;
    const total = entries.reduce((sum, item) => sum + item.chance, 0);

    let roll = Math.random() * total;

    for (const entry of entries) {
        roll -= entry.chance;

        if (roll <= 0) {
            return BLOCKS[entry.id];
        }
    }

    return BLOCKS[entries[0].id];
}

function createMiningEmbed(client, guild, player, session) {
    const tool = getPickaxe(player);
    const hpLeft = Math.max(0, session.hp);
    const mined = session.block.hp - hpLeft;

    const embed = new EmbedBuilder()
        .setColor(tool.power >= 5 ? 0x35D8E8 : 0x777777)
        .setTitle(`${session.block.emoji} MINING • ${session.block.name}`)
        .setDescription([
            `**Block HP:** ${hpLeft}/${session.block.hp}`,
            `${makeProgressBar(mined, session.block.hp)}`,
            '',
            `**Pickaxe:** ${tool.emoji} ${tool.name}`,
            `**Durability:** ${player.durability}/${tool.durability}`,
            `${makeProgressBar(player.durability, tool.durability)}`,
            '',
            `**Hits:** ${session.hits}`,
            `**Mining Zone:** ${ZONES[player.zone]?.name || 'Overworld Mine'}`,
            '',
            '🔴 Press **HIT BLOCK** to mine.',
            '⏹️ Press **STOP** to leave mining.'
        ].join('\n'))
        .setFooter({ text: 'ELYX MINECRAFT • SURVIVAL' })
        .setTimestamp();

    return embed;
}

function createMiningButtons(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mc:hit:${userId}`)
            .setLabel('HIT BLOCK')
            .setEmoji('⛏️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),

        new ButtonBuilder()
            .setCustomId(`mc:stop:${userId}`)
            .setLabel('STOP')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
    );
}

async function startMining(message, player) {
    if (player.mining) {
        return message.reply('⛏️ You are already mining! Finish or stop your current block first.');
    }

    const zone = ZONES[player.zone] || ZONES.overworld;

    if (player.level < zone.level) {
        return message.reply(
            `🔒 **${zone.name}** requires Level **${zone.level}**.\n` +
            `Your current level: **${player.level}**`
        );
    }

    const pickaxe = getPickaxe(player);

    if (player.durability <= 0) {
        return message.reply(
            '❌ Your pickaxe is broken!\nUse `-repair` to repair it.'
        );
    }

    const block = weightedBlock(zone);

    if (pickaxe.power < block.minPower) {
        return message.reply(
            `❌ Your ${pickaxe.name} is too weak for **${block.name}**.\n` +
            'Upgrade your pickaxe or select another mining zone.'
        );
    }

    const session = {
        block,
        hp: block.hp,
        hits: 0,
        startedAt: Date.now()
    };

    player.mining = session;
    saveDatabase();

    const sent = await message.reply({
        embeds: [createMiningEmbed(message.client, message.guild, player, session)],
        components: [createMiningButtons(message.author.id)]
    });

    session.messageId = sent.id;
    session.channelId = sent.channel.id;
}

async function handleMiningHit(interaction, player) {
    const session = player.mining;

    if (!session) {
        return interaction.reply({
            content: '❌ You are not mining right now. Use `-mine`.',
            ephemeral: true
        });
    }

    if (Date.now() - session.startedAt > CONFIG.MINING_TIMEOUT) {
        player.mining = null;
        saveDatabase();

        return interaction.update({
            content: '⌛ Mining session expired. Use `-mine` to start again.',
            embeds: [],
            components: []
        });
    }

    const tool = getPickaxe(player);

    if (player.durability <= 0) {
        player.mining = null;
        saveDatabase();

        return interaction.update({
            content: '❌ Your pickaxe broke! Use `-repair`.',
            embeds: [],
            components: []
        });
    }

    if (tool.power < session.block.minPower) {
        player.mining = null;
        saveDatabase();

        return interaction.update({
            content: '❌ This pickaxe is too weak for this block.',
            embeds: [],
            components: []
        });
    }

    session.hits++;
    player.totalHits++;
    player.durability--;

    const damage = tool.power * randomInt(4, 6);
    session.hp = Math.max(0, session.hp - damage);

    if (session.hp > 0) {
        saveDatabase();

        return interaction.update({
            embeds: [
                createMiningEmbed(
                    interaction.client,
                    interaction.guild,
                    player,
                    session
                )
            ],
            components: [createMiningButtons(interaction.user.id)]
        });
    }

    // Block broken: give drops and XP.
    const drops = [];

    for (const drop of session.block.drops) {
        if (!chance(drop.chance)) continue;

        const amount = randomInt(drop.min, drop.max);

        addItem(player, drop.item, amount);
        drops.push(
            `${getItemEmoji(interaction.guild, drop.item)} ` +
            `**${getItemName(drop.item)}** × ${amount}`
        );

        if (drop.item === 'diamond') {
            player.diamondsCollected += amount;
        }

        if (drop.item === 'raw_gold' || drop.item === 'gold_ingot') {
            player.goldCollected += amount;
        }
    }

    player.blocksMined++;

    const xpGained = session.block.xp;
    const levelUps = addXP(player, xpGained);

    player.coins += randomInt(1, 3);
    player.mining = null;

    saveDatabase();

    const result = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('⛏️ BLOCK BROKEN!')
        .setDescription([
            `${session.block.emoji} You mined **${session.block.name}**!`,
            '',
            '**Drops:**',
            drops.length ? drops.join('\n') : '*No items dropped.*',
            '',
            `⭐ XP gained: **${xpGained}**`,
            `🪙 Coins gained: **1–3**`,
            `⛏️ Durability remaining: **${player.durability}/${tool.durability}**`,
            levelUps.length
                ? `\n🎉 **LEVEL UP!** You reached Level **${player.level}**!`
                : ''
        ].join('\n'))
        .setFooter({ text: 'ELYX MINECRAFT • SURVIVAL' })
        .setTimestamp();

    return interaction.update({
        embeds: [result],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mc:again:${interaction.user.id}`)
                    .setLabel('MINE AGAIN')
                    .setEmoji('⛏️')
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`mc:inv:${interaction.user.id}`)
                    .setLabel('INVENTORY')
                    .setEmoji('🎒')
                    .setStyle(ButtonStyle.Secondary)
            )
        ]
    });
}

// ============================================
// PART 2 COMPLETE
// ============================================


// ============================================
// PART 3/5 — INVENTORY, CRAFTING & FURNACE
// ============================================

// ---------- INVENTORY ----------

function createInventoryEmbed(client, guild, user, player) {
    const entries = Object.entries(player.inventory)
        .filter(([, amount]) => Number(amount) > 0)
        .sort(([a], [b]) => a.localeCompare(b));

    const totalItems = entries.reduce(
        (sum, [, amount]) => sum + amount,
        0
    );

    const inventoryText = entries.length
        ? entries.map(([item, amount], index) => {
            return `\`${String(index + 1).padStart(2, '0')}\` ${getItemDisplay(guild, item, amount)}`;
        }).join('\n')
        : '*Your inventory is empty.*';

    const pickaxe = getPickaxe(player);

    return new EmbedBuilder()
        .setColor(0x8B5A2B)
        .setAuthor({
            name: `${user.username} • Minecraft Inventory`,
            iconURL: user.displayAvatarURL()
        })
        .setDescription([
            '```ansi',
            '       ELYX SURVIVAL INVENTORY',
            '```',
            `⛏️ **Equipped:** ${pickaxe.emoji} ${pickaxe.name}`,
            `🛡️ **Durability:** ${player.durability}/${pickaxe.durability}`,
            `🪙 **Coins:** ${formatNumber(player.coins)}`,
            `⭐ **Level:** ${player.level}`,
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '**ITEM STORAGE**',
            '',
            inventoryText,
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            `📦 **Different items:** ${entries.length}`,
            `🧮 **Total quantity:** ${totalItems}`
        ].join('\n'))
        .setFooter({
            text: 'ELYX MINECRAFT • SURVIVAL'
        })
        .setTimestamp();
}

async function openInventory(message, player) {
    return message.reply({
        embeds: [
            createInventoryEmbed(
                message.client,
                message.guild,
                message.author,
                player
            )
        ]
    });
}

// ---------- CRAFTING TABLE ----------

function createCraftingEmbed(client, guild, player) {
    const recipe = RECIPES[player.selectedRecipe] || RECIPES.stick;

    const grid = [
        '⬜ ⬜ ⬜',
        '⬜ ⬜ ⬜',
        '⬜ ⬜ ⬜'
    ];

    const ingredients = Object.entries(recipe.ingredients)
        .map(([item, amount]) => {
            const owned = player.inventory[item] || 0;
            const enough = owned >= amount;

            return `${enough ? '🟢' : '🔴'} ${getItemDisplay(guild, item, owned)} / ${amount} required`;
        });

    return new EmbedBuilder()
        .setColor(0x8B5A2B)
        .setTitle('🛠️ Crafting Table')
        .setDescription([
            '```',
            '   3 × 3 CRAFTING GRID',
            ...grid,
            '```',
            `**Selected recipe:** ${recipe.name}`,
            '',
            '**Required Materials**',
            ingredients.join('\n'),
            '',
            '**Crafting Result**',
            `${getItemEmoji(guild, recipe.output)} **${getItemName(recipe.output)} × ${recipe.amount}**`,
            '',
            hasItems(player, recipe.ingredients)
                ? '🟢 Materials available — ready to craft.'
                : '🔴 You need more materials.'
        ].join('\n'))
        .setFooter({
            text: 'ELYX MINECRAFT • SURVIVAL'
        });
}

function createRecipeMenu() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mc:recipe')
            .setPlaceholder('📖 Choose a crafting recipe')
            .addOptions(
                Object.entries(RECIPES).map(([id, recipe]) => ({
                    label: recipe.name,
                    value: id,
                    description: `Craft ${recipe.amount} ${getItemName(recipe.output)}`,
                    emoji: '🛠️'
                }))
            )
    );
}

function createCraftingButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mc:craft:${userId}`)
            .setLabel('CRAFT ITEM')
            .setEmoji('🛠️')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`mc:inv:${userId}`)
            .setLabel('INVENTORY')
            .setEmoji('🎒')
            .setStyle(ButtonStyle.Secondary)
    );
}

async function openCrafting(message, player) {
    if (!player.selectedRecipe || !RECIPES[player.selectedRecipe]) {
        player.selectedRecipe = 'stick';
    }

    return message.reply({
        embeds: [
            createCraftingEmbed(
                message.client,
                message.guild,
                player
            )
        ],
        components: [
            createRecipeMenu(),
            createCraftingButtons(message.author.id)
        ]
    });
}

async function handleRecipeSelection(interaction, player) {
    const recipeId = interaction.values[0];

    if (!RECIPES[recipeId]) {
        return interaction.reply({
            content: '❌ Invalid recipe.',
            ephemeral: true
        });
    }

    player.selectedRecipe = recipeId;
    saveDatabase();

    return interaction.update({
        embeds: [
            createCraftingEmbed(
                interaction.client,
                interaction.guild,
                player
            )
        ],
        components: [
            createRecipeMenu(),
            createCraftingButtons(interaction.user.id)
        ]
    });
}

async function handleCrafting(interaction, player) {
    const recipe = RECIPES[player.selectedRecipe];

    if (!recipe) {
        return interaction.reply({
            content: '❌ Select a valid recipe first.',
            ephemeral: true
        });
    }

    if (!hasItems(player, recipe.ingredients)) {
        return interaction.reply({
            content: '❌ You do not have enough materials!',
            ephemeral: true
        });
    }

    removeItems(player, recipe.ingredients);
    addItem(player, recipe.output, recipe.amount);

    saveDatabase();

    const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🛠️ CRAFTING SUCCESSFUL')
        .setDescription([
            `You crafted ${getItemEmoji(interaction.guild, recipe.output)} **${recipe.name}**!`,
            '',
            `**Received:** ${getItemName(recipe.output)} × ${recipe.amount}`,
            '',
            '**Materials used:**',
            ...Object.entries(recipe.ingredients).map(([item, amount]) =>
                `• ${getItemDisplay(interaction.guild, item, amount)}`
            ),
            '',
            'Your inventory has been updated.'
        ].join('\n'))
        .setFooter({
            text: 'ELYX MINECRAFT • SURVIVAL'
        });

    return interaction.update({
        embeds: [embed],
        components: [
            createRecipeMenu(),
            createCraftingButtons(interaction.user.id)
        ]
    });
}

// ---------- FURNACE / SMELTING ----------

const SMELTING_RECIPES = {
    raw_iron: {
        output: 'iron_ingot',
        inputName: 'Raw Iron',
        outputName: 'Iron Ingot'
    },

    raw_gold: {
        output: 'gold_ingot',
        inputName: 'Raw Gold',
        outputName: 'Gold Ingot'
    }
};

function createFurnaceEmbed(client, guild, player) {
    const lines = Object.entries(SMELTING_RECIPES).map(([input, recipe]) => {
        const quantity = player.inventory[input] || 0;

        return [
            `${getItemDisplay(guild, input, quantity)}`,
            `↳ ${getItemEmoji(guild, recipe.output)} **${recipe.outputName}**`
        ].join('\n');
    });

    return new EmbedBuilder()
        .setColor(0xED8B35)
        .setTitle('🔥 Elyx Furnace')
        .setDescription([
            'Smelt raw ores into useful ingots.',
            '',
            ...lines,
            '',
            `🔥 **Fuel:** ${getItemDisplay(guild, 'coal', 1)}`,
            '',
            'Choose an ore below to smelt one ingot.'
        ].join('\n'))
        .setFooter({
            text: 'ELYX MINECRAFT • SURVIVAL'
        });
}

function createFurnaceMenu() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mc:smelt')
            .setPlaceholder('🔥 Select an ore to smelt')
            .addOptions([
                {
                    label: 'Smelt Raw Iron',
                    value: 'raw_iron',
                    description: '1 Raw Iron + 1 Coal → 1 Iron Ingot',
                    emoji: '🔩'
                },
                {
                    label: 'Smelt Raw Gold',
                    value: 'raw_gold',
                    description: '1 Raw Gold + 1 Coal → 1 Gold Ingot',
                    emoji: '🪙'
                }
            ])
    );
}

async function openFurnace(message, player) {
    if (
        (player.inventory.crafting_table || 0) < 1 &&
        (player.inventory.furnace || 0) < 1
    ) {
        return message.reply(
            '🔥 You need a Furnace first!\n' +
            'Craft one using `-craft`.'
        );
    }

    return message.reply({
        embeds: [
            createFurnaceEmbed(
                message.client,
                message.guild,
                player
            )
        ],
        components: [createFurnaceMenu()]
    });
}

async function handleSmelting(interaction, player) {
    const input = interaction.values[0];
    const recipe = SMELTING_RECIPES[input];

    if (!recipe) {
        return interaction.reply({
            content: '❌ Invalid smelting recipe.',
            ephemeral: true
        });
    }

    if ((player.inventory[input] || 0) < 1) {
        return interaction.reply({
            content: `❌ You need ${recipe.inputName}.`,
            ephemeral: true
        });
    }

    if ((player.inventory.coal || 0) < 1) {
        return interaction.reply({
            content: '❌ You need 1 Coal as furnace fuel.',
            ephemeral: true
        });
    }

    removeItem(player, input, 1);
    removeItem(player, 'coal', 1);
    addItem(player, recipe.output, 1);

    saveDatabase();

    return interaction.update({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🔥 SMELTING COMPLETE')
                .setDescription([
                    `Input: ${getItemEmoji(interaction.guild, input)} **${recipe.inputName} × 1**`,
                    `Fuel: ${getItemEmoji(interaction.guild, 'coal')} **Coal × 1**`,
                    '',
                    `Output: ${getItemEmoji(interaction.guild, recipe.output)} **${recipe.outputName} × 1**`,
                    '',
                    'The ingot has been added to your inventory.'
                ].join('\n'))
                .setFooter({
                    text: 'ELYX MINECRAFT • SURVIVAL'
                })
        ],
        components: [createFurnaceMenu()]
    });
}

// ---------- PICKAXE REPAIR ----------

async function repairPickaxe(message, player) {
    const tool = getPickaxe(player);

    if (player.durability >= tool.durability) {
        return message.reply(
            `✅ Your **${tool.name}** is already fully repaired!`
        );
    }

    const repairCost = Math.max(
        1,
        Math.ceil((tool.durability - player.durability) / 20)
    );

    if ((player.inventory.coal || 0) < repairCost) {
        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('🔧 Pickaxe Repair')
                    .setDescription([
                        `**Tool:** ${tool.emoji} ${tool.name}`,
                        `**Durability:** ${player.durability}/${tool.durability}`,
                        '',
                        `**Required:** ⚫ Coal × ${repairCost}`,
                        `**You have:** ${player.inventory.coal || 0}`,
                        '',
                        'Mine more Coal to repair your pickaxe.'
                    ].join('\n'))
            ]
        });
    }

    removeItem(player, 'coal', repairCost);
    player.durability = tool.durability;

    saveDatabase();

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🔧 PICKAXE REPAIRED')
                .setDescription([
                    `${tool.emoji} **${tool.name}**`,
                    '',
                    `Durability: **${player.durability}/${tool.durability}**`,
                    `Coal used: **${repairCost}**`,
                    '',
                    'Your pickaxe is ready for mining!'
                ].join('\n'))
                .setFooter({
                    text: 'ELYX MINECRAFT • SURVIVAL'
                })
        ]
    });
}

// ============================================
// PART 3 COMPLETE
// ============================================


// ============================================
// PART 4/5 — UPGRADES, ZONES, PROFILE, LEADERBOARD
// ============================================

// ---------- PICKAXE UPGRADES ----------

async function upgradePickaxe(message, player, requestedTool) {
    const toolId = String(requestedTool || '').toLowerCase();

    if (!PICKAXES[toolId]) {
        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('⛏️ Pickaxe Upgrade')
                    .setDescription([
                        'Choose a valid pickaxe:',
                        '',
                        '`-upgrade stone`',
                        '`-upgrade iron`',
                        '`-upgrade gold`',
                        '`-upgrade diamond`'
                    ].join('\n'))
            ]
        });
    }

    const target = PICKAXES[toolId];
    const current = PICKAXES[player.pickaxe];

    if (target.level <= current.level) {
        return message.reply(
            '❌ You already own this pickaxe or a higher-tier pickaxe!'
        );
    }

    if (player.level < target.level) {
        return message.reply(
            `🔒 You need **Level ${target.level}** to unlock ${target.name}.\n` +
            `Your level: **${player.level}**`
        );
    }

    if (!hasItems(player, target.cost)) {
        const missing = Object.entries(target.cost)
            .filter(([item, amount]) => (player.inventory[item] || 0) < amount)
            .map(([item, amount]) =>
                `❌ ${getItemName(item)}: ${player.inventory[item] || 0}/${amount}`
            );

        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('⛏️ Upgrade Materials Missing')
                    .setDescription([
                        `**Target:** ${target.emoji} ${target.name}`,
                        '',
                        '**Still needed:**',
                        ...missing
                    ].join('\n'))
            ]
        });
    }

    removeItems(player, target.cost);

    player.pickaxe = toolId;
    player.durability = target.durability;

    saveDatabase();

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x35D8E8)
                .setTitle('⛏️ PICKAXE UPGRADED!')
                .setDescription([
                    `You equipped ${target.emoji} **${target.name}**!`,
                    '',
                    `⚔️ **Mining Power:** ${target.power}`,
                    `🛡️ **Durability:** ${target.durability}`,
                    `⭐ **Required Level:** ${target.level}`,
                    '',
                    '**Materials used:**',
                    ...Object.entries(target.cost).map(([item, amount]) =>
                        `• ${getItemDisplay(message.guild, item, amount)}`
                    ),
                    '',
                    'Your new pickaxe is ready!'
                ].join('\n'))
                .setFooter({
                    text: 'ELYX MINECRAFT • SURVIVAL'
                })
        ]
    });
}

// ---------- MINING ZONES ----------

function createZonesEmbed(player) {
    const description = Object.entries(ZONES).map(([id, zone]) => {
        const unlocked = player.level >= zone.level;
        const current = player.zone === id;

        return [
            `${current ? '🟢' : unlocked ? '🔓' : '🔒'} ${zone.emoji} **${zone.name}**`,
            `Required level: **${zone.level}**`,
            `Status: **${current ? 'CURRENT ZONE' : unlocked ? 'Unlocked' : 'Locked'}**`
        ].join('\n');
    });

    return new EmbedBuilder()
        .setColor(0x3BA55D)
        .setTitle('🗺️ MINING WORLD')
        .setDescription([
            'Choose your mining location.',
            '',
            ...description,
            '',
            'Higher-level zones contain rarer ores.'
        ].join('\n'))
        .setFooter({
            text: 'ELYX MINECRAFT • SURVIVAL'
        });
}

function createZoneMenu(player) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mc:zone')
            .setPlaceholder('🗺️ Choose a mining zone')
            .addOptions(
                Object.entries(ZONES).map(([id, zone]) => ({
                    label: zone.name,
                    value: id,
                    description: `Required level: ${zone.level}`,
                    emoji: zone.emoji,
                    default: player.zone === id
                }))
            )
    );
}

async function openZones(message, player) {
    return message.reply({
        embeds: [createZonesEmbed(player)],
        components: [createZoneMenu(player)]
    });
}

async function handleZoneSelection(interaction, player) {
    const zoneId = interaction.values[0];
    const zone = ZONES[zoneId];

    if (!zone) {
        return interaction.reply({
            content: '❌ Invalid mining zone.',
            ephemeral: true
        });
    }

    if (player.level < zone.level) {
        return interaction.reply({
            content:
                `🔒 **${zone.name}** requires Level **${zone.level}**.\n` +
                `Your current level is **${player.level}**.`,
            ephemeral: true
        });
    }

    if (player.mining) {
        return interaction.reply({
            content: '⛏️ Stop your current mining session before changing zones.',
            ephemeral: true
        });
    }

    player.zone = zoneId;

    saveDatabase();

    return interaction.update({
        embeds: [createZonesEmbed(player)],
        components: [createZoneMenu(player)]
    });
}

// ---------- PLAYER PROFILE ----------

function createProfileEmbed(user, player) {
    const pickaxe = getPickaxe(player);
    const xpRequired = getXpRequired(player.level);

    const totalItems = Object.values(player.inventory)
        .reduce((sum, amount) => sum + Math.max(0, amount), 0);

    return new EmbedBuilder()
        .setColor(0x9B59B6)
        .setAuthor({
            name: `${user.username} • Survival Profile`,
            iconURL: user.displayAvatarURL()
        })
        .setThumbnail(user.displayAvatarURL())
        .setDescription([
            '```ansi',
            '       ELYX SURVIVAL PROFILE',
            '```',
            `⭐ **Level:** ${player.level}`,
            `✨ **XP:** ${player.xp}/${xpRequired}`,
            `${makeProgressBar(player.xp, xpRequired)}`,
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '**PLAYER STATS**',
            '',
            `⛏️ Blocks mined: **${formatNumber(player.blocksMined)}**`,
            `🖱️ Total hits: **${formatNumber(player.totalHits)}**`,
            `💎 Diamonds collected: **${formatNumber(player.diamondsCollected || 0)}**`,
            `🪙 Gold collected: **${formatNumber(player.goldCollected || 0)}**`,
            `💰 Coins: **${formatNumber(player.coins)}**`,
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '**EQUIPMENT**',
            '',
            `${pickaxe.emoji} ${pickaxe.name}`,
            `🛡️ Durability: **${player.durability}/${pickaxe.durability}**`,
            `🗺️ Zone: **${ZONES[player.zone]?.name || ZONES.overworld.name}**`,
            `🎒 Items in inventory: **${totalItems}**`
        ].join('\n'))
        .setFooter({
            text: 'ELYX MINECRAFT • SURVIVAL'
        })
        .setTimestamp();
}

async function openProfile(message, player) {
    return message.reply({
        embeds: [createProfileEmbed(message.author, player)]
    });
}

// ---------- LEADERBOARD ----------

function createLeaderboardEmbed() {
    const players = Object.entries(database)
        .map(([id, player]) => ({
            id,
            level: Number(player.level) || 1,
            xp: Number(player.xp) || 0,
            blocks: Number(player.blocksMined) || 0,
            diamonds: Number(player.diamondsCollected) || 0,
            coins: Number(player.coins) || 0
        }))
        .sort((a, b) =>
            b.level - a.level ||
            b.xp - a.xp ||
            b.blocks - a.blocks
        )
        .slice(0, 10);

    const description = players.length
        ? players.map((player, index) => {
            const medal = ['🥇', '🥈', '🥉'][index] || '🏅';

            return [
                `${medal} **#${index + 1}** <@${player.id}>`,
                `⭐ Level ${player.level} • ✨ ${player.xp} XP`,
                `⛏️ ${player.blocks} blocks • 💎 ${player.diamonds} diamonds`
            ].join('\n');
        }).join('\n\n')
        : 'No players have joined the leaderboard yet.';

    return new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 ELYX MINECRAFT LEADERBOARD')
        .setDescription(description)
        .setFooter({
            text: 'Ranking: Level → XP → Blocks mined'
        })
        .setTimestamp();
}

async function openLeaderboard(message) {
    return message.reply({
        embeds: [createLeaderboardEmbed()]
    });
}

// ---------- SELL ITEMS FOR COINS ----------

async function sellItems(message, player, itemName, quantityText) {
    const itemId = String(itemName || '').toLowerCase();
    const item = ITEMS[itemId];

    if (!item || !item.sell) {
        return message.reply(
            '❌ Invalid or unsellable item. Use the exact item ID, for example `-sell coal 5`.'
        );
    }

    const quantity = Number(quantityText);

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
        return message.reply(
            '❌ Enter a valid quantity. Example: `-sell coal 5`'
        );
    }

    if ((player.inventory[itemId] || 0) < quantity) {
        return message.reply(
            `❌ You only have **${player.inventory[itemId] || 0} ${item.name}**.`
        );
    }

    const earned = item.sell * quantity;

    if (!Number.isSafeInteger(earned) || earned <= 0) {
        return message.reply('❌ Invalid sale amount.');
    }

    removeItem(player, itemId, quantity);
    player.coins += earned;

    saveDatabase();

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('💰 ITEM SOLD')
                .setDescription([
                    `Sold: ${getItemDisplay(message.guild, itemId, quantity)}`,
                    '',
                    `🪙 Coins earned: **${formatNumber(earned)}**`,
                    `💰 New balance: **${formatNumber(player.coins)}**`
                ].join('\n'))
        ]
    });
}

// ============================================
// PART 4 COMPLETE
// ============================================



// ============================================
// PART 5/5 — FINAL INTEGRATION
// COMMANDS + BUTTONS + SELECT MENUS
// ============================================

// Compatibility fixes for earlier parts.

ITEMS.wheat = {
    name: 'Wheat',
    emoji: '🌾',
    type: 'material',
    rarity: 'common',
    sell: 1
};

function removeItems(player, ingredients) {
    if (!hasItems(player, ingredients)) return false;

    for (const [item, amount] of Object.entries(ingredients)) {
        removeItem(player, item, amount);
    }

    return true;
}

// Prevent weak pickaxes from receiving blocks they cannot mine.
function weightedBlock(zone) {
    const power = PICKAXES.wooden.power;
    const entries = zone.blocks.filter(entry => {
        const block = BLOCKS[entry.id];
        return block && block.minPower <= power;
    });

    if (!entries.length) return BLOCKS.stone;

    const total = entries.reduce((sum, entry) => sum + entry.chance, 0);
    let roll = Math.random() * total;

    for (const entry of entries) {
        roll -= entry.chance;
        if (roll <= 0) return BLOCKS[entry.id];
    }

    return BLOCKS[entries[0].id];
}

// Keep track of users who opened menus.
const mcMenuOwners = new Map();

function checkMenuOwner(interaction) {
    const owner = mcMenuOwners.get(interaction.message.id);
    return !owner || owner === interaction.user.id;
}

async function replySafe(message, content) {
    try {
        return await message.reply(content);
    } catch (error) {
        console.error('[Minecraft] Reply error:', error.message);
        return null;
    }
}

// ---------- DIRECT CRAFT COMMAND ----------

async function craftFromCommand(message, player, recipeId) {
    const recipe = RECIPES[recipeId];

    if (!recipe) {
        return replySafe(
            message,
            '❌ Unknown recipe. Use `-craft` to open the crafting table.'
        );
    }

    if (!hasItems(player, recipe.ingredients)) {
        const missing = Object.entries(recipe.ingredients)
            .filter(([item, amount]) =>
                (player.inventory[item] || 0) < amount
            )
            .map(([item, amount]) =>
                `• ${getItemName(item)}: ${player.inventory[item] || 0}/${amount}`
            );

        return replySafe(message, {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('🛠️ Not Enough Materials')
                    .setDescription(missing.join('\n'))
            ]
        });
    }

    removeItems(player, recipe.ingredients);
    addItem(player, recipe.output, recipe.amount);

    saveDatabase();

    return replySafe(message, {
        embeds: [
            new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🛠️ CRAFTING COMPLETE')
                .setDescription([
                    `Created ${getItemEmoji(message.guild, recipe.output)} **${recipe.name} × ${recipe.amount}**`,
                    '',
                    '**Materials used:**',
                    ...Object.entries(recipe.ingredients).map(([item, amount]) =>
                        `• ${getItemDisplay(message.guild, item, amount)}`
                    )
                ].join('\n'))
                .setFooter({
                    text: 'ELYX MINECRAFT • SURVIVAL'
                })
        ]
    });
}

// ---------- INTERACTION ROUTER ----------

async function handleMinecraftInteraction(interaction) {
    if (!interaction.guild) return false;

    const id = interaction.customId || '';

    if (!id.startsWith('mc:')) return false;

    // User-specific buttons contain the owner's Discord ID.
    const parts = id.split(':');
    const action = parts[1];
    const targetUserId = parts[2];

    if (targetUserId && targetUserId !== interaction.user.id) {
        await interaction.reply({
            content: '❌ This Minecraft control belongs to another player.',
            ephemeral: true
        }).catch(() => {});

        return true;
    }

    // Menus without an owner ID are checked against the stored owner.
    if (
        (action === 'recipe' || action === 'smelt' || action === 'zone') &&
        !checkMenuOwner(interaction)
    ) {
        await interaction.reply({
            content: '❌ This menu belongs to another player.',
            ephemeral: true
        }).catch(() => {});

        return true;
    }

    const player = getPlayer(interaction.user.id);

    try {
        // Mining hit
        if (action === 'hit' && interaction.isButton()) {
            await handleMiningHit(interaction, player);
            return true;
        }

        // Stop mining
        if (action === 'stop' && interaction.isButton()) {
            player.mining = null;
            saveDatabase();

            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x777777)
                        .setTitle('⏹️ Mining Stopped')
                        .setDescription(
                            'Your mining session has ended.\nUse `-mine` whenever you are ready.'
                        )
                ],
                components: []
            });

            return true;
        }

        // Mine another block from the result screen
        if (action === 'again' && interaction.isButton()) {
            if (player.mining) {
                await interaction.reply({
                    content: '⛏️ You already have an active mining session.',
                    ephemeral: true
                });
                return true;
            }

            if (player.durability <= 0) {
                await interaction.reply({
                    content: '❌ Your pickaxe is broken. Use `-repair`.',
                    ephemeral: true
                });
                return true;
            }

            const zone = ZONES[player.zone] || ZONES.overworld;
            const pickaxe = getPickaxe(player);

            const available = zone.blocks.filter(entry =>
                BLOCKS[entry.id] &&
                BLOCKS[entry.id].minPower <= pickaxe.power
            );

            if (!available.length) {
                await interaction.reply({
                    content: '❌ No mineable blocks are available here for your tool.',
                    ephemeral: true
                });
                return true;
            }

            const total = available.reduce((sum, block) => sum + block.chance, 0);
            let roll = Math.random() * total;
            let chosen = available[0];

            for (const entry of available) {
                roll -= entry.chance;
                if (roll <= 0) {
                    chosen = entry;
                    break;
                }
            }

            const block = BLOCKS[chosen.id];

            player.mining = {
                block,
                hp: block.hp,
                hits: 0,
                startedAt: Date.now()
            };

            saveDatabase();

            await interaction.update({
                embeds: [
                    createMiningEmbed(
                        interaction.client,
                        interaction.guild,
                        player,
                        player.mining
                    )
                ],
                components: [
                    createMiningButtons(interaction.user.id)
                ]
            });

            player.mining.messageId = interaction.message.id;
            player.mining.channelId = interaction.channelId;

            return true;
        }

        // Inventory
        if (action === 'inv' && interaction.isButton()) {
            await interaction.update({
                embeds: [
                    createInventoryEmbed(
                        interaction.client,
                        interaction.guild,
                        interaction.user,
                        player
                    )
                ],
                components: []
            });

            return true;
        }

        // Crafting
        if (action === 'recipe' && interaction.isStringSelectMenu()) {
            await handleRecipeSelection(interaction, player);
            return true;
        }

        if (action === 'craft' && interaction.isButton()) {
            await handleCrafting(interaction, player);
            return true;
        }

        // Furnace
        if (action === 'smelt' && interaction.isStringSelectMenu()) {
            await handleSmelting(interaction, player);
            return true;
        }

        // Mining zone
        if (action === 'zone' && interaction.isStringSelectMenu()) {
            await handleZoneSelection(interaction, player);
            return true;
        }

        return false;
    } catch (error) {
        console.error('[Minecraft] Interaction error:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Something went wrong. Please try again.',
                ephemeral: true
            }).catch(() => {});
        }

        return true;
    }
}

// ---------- HELP COMMAND ----------

function createHelpEmbed() {
    return new EmbedBuilder()
        .setColor(0x3BA55D)
        .setTitle('⛏️ ELYX MINECRAFT • COMMANDS')
        .setDescription([
            '**MINING**',
            '`-mine` — Start mining',
            '`-repair` — Repair pickaxe',
            '`-zones` — Choose mining zone',
            '',
            '**INVENTORY & CRAFTING**',
            '`-inv` — Open inventory',
            '`-craft` — Open crafting table',
            '`-craft stick` — Craft sticks',
            '`-craft oak_planks` — Make planks',
            '`-craft crafting_table` — Craft table',
            '`-craft furnace` — Craft furnace',
            '`-furnace` — Open furnace',
            '',
            '**PROGRESSION**',
            '`-tools` — View pickaxes',
            '`-upgrade stone` — Upgrade pickaxe',
            '`-upgrade iron` — Upgrade pickaxe',
            '`-upgrade gold` — Upgrade pickaxe',
            '`-upgrade diamond` — Upgrade pickaxe',
            '`-profile` — View your stats',
            '`-leaderboard` — Top players',
            '',
            '**ECONOMY**',
            '`-sell coal 5` — Sell five coal',
            '`-mchelp` — Show this help'
        ].join('\n'))
        .setFooter({
            text: 'ELYX MINECRAFT • SURVIVAL'
        });
}

// ---------- MAIN COMMAND HANDLER ----------

function registerMinecraft(client) {
    client.on('messageCreate', async message => {
        if (message.author.bot || !message.guild) return;

        const content = message.content.trim();

        if (!content.startsWith(PREFIX)) return;

        const args = content.slice(PREFIX.length).trim().split(/\s+/);
        const command = (args.shift() || '').toLowerCase();

        const commands = [
            'mine', 'inv', 'inventory', 'craft', 'furnace',
            'repair', 'upgrade', 'tools', 'zones', 'zone',
            'profile', 'stats', 'leaderboard', 'lb', 'sell',
            'mchelp', 'mc'
        ];

        if (!commands.includes(command)) return;

        const player = getPlayer(message.author.id);

        try {
            switch (command) {
                case 'mine':
                    await startMining(message, player);
                    break;

                case 'inv':
                case 'inventory':
                    await openInventory(message, player);
                    break;

                case 'craft': {
                    const recipeId = (args[0] || '').toLowerCase();

                    if (!recipeId) {
                        player.selectedRecipe = 'stick';

                        const sent = await openCrafting(message, player);

                        if (sent) mcMenuOwners.set(sent.id, message.author.id);
                    } else {
                        await craftFromCommand(message, player, recipeId);
                    }

                    break;
                }

                case 'furnace': {
                    const sent = await openFurnace(message, player);

                    if (sent) mcMenuOwners.set(sent.id, message.author.id);

                    break;
                }

                case 'repair':
                    await repairPickaxe(message, player);
                    break;

                case 'upgrade':
                    await upgradePickaxe(message, player, args[0]);
                    break;

                case 'tools':
                    await message.reply({
                        embeds: [
                            toolEmbed(client, message.guild, player)
                        ]
                    });
                    break;

                case 'zones':
                case 'zone': {
                    const sent = await openZones(message, player);

                    if (sent) mcMenuOwners.set(sent.id, message.author.id);

                    break;
                }

                case 'profile':
                case 'stats':
                    await openProfile(message, player);
                    break;

                case 'leaderboard':
                case 'lb':
                    await openLeaderboard(message);
                    break;

                case 'sell':
                    await sellItems(message, player, args[0], args[1]);
                    break;

                case 'mchelp':
                case 'mc':
                    await message.reply({
                        embeds: [createHelpEmbed()]
                    });
                    break;
            }
        } catch (error) {
            console.error('[Minecraft] Command error:', error);

            await message.reply(
                '❌ Minecraft command failed. Check the bot logs for details.'
            ).catch(() => {});
        }
    });

    client.on('interactionCreate', async interaction => {
        await handleMinecraftInteraction(interaction);
    });

    console.log('[Minecraft] Module registered.');
}

module.exports = registerMinecraft;

// ============================================
// PART 5 COMPLETE
// ============================================
