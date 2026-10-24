const OWNER_ID = '1535048066875527198';

const TEXTURE_BASE =
    'https://project-crafting.github.io/minecraft-auto-updated-textures-api/items/';

// Game ke items aur unke Minecraft texture links.
// IDs ko minecraft.js ke item IDs ke saath match rakha gaya hai.
const ITEMS = [
    { id: 'oak_log', name: 'Oak Log', texture: 'oak_log', fallback: '🪵' },
    { id: 'oak_planks', name: 'Oak Planks', texture: 'oak_planks', fallback: '🪵' },
    { id: 'stick', name: 'Stick', texture: 'stick', fallback: '🥢' },
    { id: 'cobblestone', name: 'Cobblestone', texture: 'cobblestone', fallback: '🪨' },
    { id: 'stone', name: 'Stone', texture: 'stone', fallback: '🪨' },
    { id: 'coal', name: 'Coal', texture: 'coal', fallback: '⚫' },
    { id: 'raw_iron', name: 'Raw Iron', texture: 'raw_iron', fallback: '🪨' },
    { id: 'iron_ingot', name: 'Iron Ingot', texture: 'iron_ingot', fallback: '🔩' },
    { id: 'raw_gold', name: 'Raw Gold', texture: 'raw_gold', fallback: '🟡' },
    { id: 'gold_ingot', name: 'Gold Ingot', texture: 'gold_ingot', fallback: '🪙' },
    { id: 'diamond', name: 'Diamond', texture: 'diamond', fallback: '💎' },
    { id: 'emerald', name: 'Emerald', texture: 'emerald', fallback: '💚' },
    { id: 'redstone', name: 'Redstone Dust', texture: 'redstone', fallback: '🔴' },
    { id: 'lapis_lazuli', name: 'Lapis Lazuli', texture: 'lapis_lazuli', fallback: '🔵' },
    { id: 'crafting_table', name: 'Crafting Table', texture: 'crafting_table', fallback: '🪵' },
    { id: 'furnace', name: 'Furnace', texture: 'furnace', fallback: '🔥' },
    { id: 'bread', name: 'Bread', texture: 'bread', fallback: '🍞' },
    { id: 'wheat', name: 'Wheat', texture: 'wheat', fallback: '🌾' },

    { id: 'coal_ore', name: 'Coal Ore', texture: 'coal_ore', fallback: '🪨' },
    { id: 'iron_ore', name: 'Iron Ore', texture: 'iron_ore', fallback: '🪨' },
    { id: 'gold_ore', name: 'Gold Ore', texture: 'gold_ore', fallback: '🪨' },
    { id: 'diamond_ore', name: 'Diamond Ore', texture: 'diamond_ore', fallback: '💎' },
    { id: 'emerald_ore', name: 'Emerald Ore', texture: 'emerald_ore', fallback: '💚' },

    { id: 'wooden_pickaxe', name: 'Wooden Pickaxe', texture: 'wooden_pickaxe', fallback: '⛏️' },
    { id: 'stone_pickaxe', name: 'Stone Pickaxe', texture: 'stone_pickaxe', fallback: '⛏️' },
    { id: 'iron_pickaxe', name: 'Iron Pickaxe', texture: 'iron_pickaxe', fallback: '⛏️' },
    { id: 'golden_pickaxe', name: 'Golden Pickaxe', texture: 'golden_pickaxe', fallback: '⛏️' },
    { id: 'diamond_pickaxe', name: 'Diamond Pickaxe', texture: 'diamond_pickaxe', fallback: '⛏️' }
];

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^minecraft:/, '')
        .replace(/[^a-z0-9]/g, '');
}

function getItem(value) {
    const key = normalize(value);

    return ITEMS.find(item =>
        normalize(item.id) === key ||
        normalize(item.name) === key ||
        normalize(item.texture) === key
    );
}

function textureUrl(item) {
    return `${TEXTURE_BASE}${item.texture}.png`;
}

module.exports = function registerMinecraftEmojis(client) {
    // Used by minecraft.js when displaying inventory and drops.
    client.minecraftEmoji = function (guild, itemName) {
        const item = getItem(itemName);

        if (!item || !guild) {
            return item ? item.fallback : '📦';
        }

        const emojiName = `mc_${item.id}`;
        const existing = guild.emojis.cache.find(
            emoji => emoji.name === emojiName
        );

        if (existing) {
            return existing.toString();
        }

        return item.fallback;
    };

    client.minecraftItemNames = ITEMS.map(item => item.id);

    // Register the custom emoji creation command.
    client.on('messageCreate', async message => {
        if (!message.guild || message.author.bot) return;
        if (message.content.trim() !== '-mcsetup') return;

        if (message.author.id !== OWNER_ID) {
            await message.reply('❌ Only the bot owner can run this command.');
            return;
        }

        const guild = message.guild;

        if (!guild.members.me?.permissions.has('ManageGuildExpressions')) {
            await message.reply(
                '❌ Bot ko **Manage Expressions** permission do, phir `-mcsetup` chalao.'
            );
            return;
        }

        const status = await message.reply(
            '⏳ Minecraft textures load ho rahe hain. Please wait...'
        );

        let created = 0;
        let skipped = 0;
        let failed = 0;

        for (const item of ITEMS) {
            const emojiName = `mc_${item.id}`;

            const exists = guild.emojis.cache.find(
                emoji => emoji.name === emojiName
            );

            if (exists) {
                skipped++;
                continue;
            }

            try {
                const response = await fetch(textureUrl(item), {
                    signal: AbortSignal.timeout(12000)
                });

                if (!response.ok) {
                    failed++;
                    console.log(
                        `[Minecraft Emojis] Texture unavailable: ${item.id} (${response.status})`
                    );
                    continue;
                }

                const contentType = response.headers.get('content-type') || '';

                if (!contentType.includes('image/')) {
                    failed++;
                    console.log(
                        `[Minecraft Emojis] Not an image: ${item.id}`
                    );
                    continue;
                }

                const buffer = Buffer.from(await response.arrayBuffer());

                if (!buffer.length || buffer.length > 256 * 1024) {
                    failed++;
                    console.log(
                        `[Minecraft Emojis] Invalid image size: ${item.id}`
                    );
                    continue;
                }

                await guild.emojis.create({
                    attachment: buffer,
                    name: emojiName,
                    reason: `Minecraft item texture: ${item.name}`
                });

                created++;

                console.log(
                    `[Minecraft Emojis] Created ${emojiName}`
                );

                // Slow down requests to reduce rate-limit problems.
                await new Promise(resolve => setTimeout(resolve, 1200));
            } catch (error) {
                failed++;

                console.log(
                    `[Minecraft Emojis] Failed ${item.id}: ${error.message}`
                );

                // Permission/emoji-limit errors usually affect later items too.
                if (
                    error.code === 30008 ||
                    error.code === 50013
                ) {
                    console.log(
                        '[Minecraft Emojis] Emoji limit or permission reached.'
                    );
                    break;
                }
            }
        }

        await status.edit({
            content: [
                '## ⛏️ Minecraft Emoji Setup',
                `✅ Created: **${created}**`,
                `⏭️ Already existed: **${skipped}**`,
                `❌ Failed: **${failed}**`,
                '',
                'Agar failed count zyada hai, Current Run logs check karo.',
                'Server emoji limit poori ho gayi ho toh sab items register nahi ho payenge.'
            ].join('\n')
        });
    });

    console.log(
        `[Minecraft Emojis] System registered: ${ITEMS.length} item textures.`
    );
};
