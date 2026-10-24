const OWNER_ID = '1535048066875527198';

const BASE_URL =
    'https://project-crafting.github.io/minecraft-auto-updated-textures-api/items/';

const ITEMS = [
    { id: 'oak_log', name: 'mc_oak_log', texture: 'oak_log', fallback: '🪵' },
    { id: 'oak_planks', name: 'mc_oak_planks', texture: 'oak_planks', fallback: '🪵' },
    { id: 'stick', name: 'mc_stick', texture: 'stick', fallback: '🥢' },
    { id: 'cobblestone', name: 'mc_cobblestone', texture: 'cobblestone', fallback: '🪨' },
    { id: 'coal', name: 'mc_coal', texture: 'coal', fallback: '⚫' },
    { id: 'iron_ingot', name: 'mc_iron_ingot', texture: 'iron_ingot', fallback: '🔩' },
    { id: 'gold_ingot', name: 'mc_gold_ingot', texture: 'gold_ingot', fallback: '🪙' },
    { id: 'diamond', name: 'mc_diamond', texture: 'diamond', fallback: '💎' },
    { id: 'emerald', name: 'mc_emerald', texture: 'emerald', fallback: '💚' },
    { id: 'redstone', name: 'mc_redstone', texture: 'redstone', fallback: '🔴' },
    { id: 'wooden_pickaxe', name: 'mc_wooden_pickaxe', texture: 'wooden_pickaxe', fallback: '⛏️' },
    { id: 'iron_pickaxe', name: 'mc_iron_pickaxe', texture: 'iron_pickaxe', fallback: '⛏️' },
    { id: 'diamond_pickaxe', name: 'mc_diamond_pickaxe', texture: 'diamond_pickaxe', fallback: '💎' }
];

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^minecraft:/, '')
        .replace(/[^a-z0-9]/g, '');
}

function findItem(value) {
    const key = normalize(value);

    return ITEMS.find(item =>
        normalize(item.id) === key ||
        normalize(item.name) === key ||
        normalize(item.texture) === key
    );
}

module.exports = function registerMinecraftEmojis(client) {
    client.minecraftEmoji = (guild, itemName) => {
        const item = findItem(itemName);

        if (!item) return '📦';

        const existing = guild?.emojis?.cache?.find(
            emoji => emoji.name === item.name
        );

        return existing ? existing.toString() : item.fallback;
    };

    client.minecraftItemNames = ITEMS.map(item => item.id);

    client.on('messageCreate', async message => {
        if (!message.guild || message.author.bot) return;
        if (message.content.trim() !== '-mcsetup') return;

        if (message.author.id !== OWNER_ID) {
            await message.reply('❌ Sirf bot owner ye command chala sakta hai.');
            return;
        }

        const botMember = message.guild.members.me;

        if (!botMember?.permissions.has('ManageGuildExpressions')) {
            await message.reply(
                '❌ Bot ko Manage Expressions permission do.'
            );
            return;
        }

        const status = await message.reply(
            '⏳ 13 Minecraft textures check kar raha hoon...'
        );

        let created = 0;
        let existed = 0;
        let failed = 0;
        const errors = [];

        for (const item of ITEMS) {
            try {
                const oldEmoji = message.guild.emojis.cache.find(
                    emoji => emoji.name === item.name
                );

                if (oldEmoji) {
                    existed++;
                    continue;
                }

                const response = await fetch(
                    `${BASE_URL}${item.texture}.png`,
                    { signal: AbortSignal.timeout(15000) }
                );

                if (!response.ok) {
                    failed++;
                    errors.push(
                        `${item.id}: Texture URL returned HTTP ${response.status}`
                    );
                    continue;
                }

                const type = response.headers.get('content-type') || '';

                if (!type.startsWith('image/')) {
                    failed++;
                    errors.push(`${item.id}: URL did not return an image.`);
                    continue;
                }

                const buffer = Buffer.from(await response.arrayBuffer());

                if (!buffer.length || buffer.length > 256 * 1024) {
                    failed++;
                    errors.push(`${item.id}: Image size is invalid.`);
                    continue;
                }

                await message.guild.emojis.create({
                    attachment: buffer,
                    name: item.name,
                    reason: 'Minecraft item texture'
                });

                created++;

                await new Promise(resolve => setTimeout(resolve, 1200));
            } catch (error) {
                failed++;

                errors.push(
                    `${item.id}: ${error.code || error.message || 'Unknown error'}`
                );
            }
        }

        const output = [
            '## ⛏️ Minecraft Emoji Setup',
            `✅ Created: **${created}**`,
            `⏭️ Already existed: **${existed}**`,
            `❌ Failed: **${failed}**`
        ];

        if (errors.length) {
            output.push('', '**Error details:**');

            for (const error of errors.slice(0, 8)) {
                output.push(`• ${error}`);
            }

            if (errors.length > 8) {
                output.push(`• ...and ${errors.length - 8} more errors.`);
            }
        }

        await status.edit({ content: output.join('\n') });
    });

    console.log(
        `[Minecraft Emojis] Registered ${ITEMS.length} Minecraft items.`
    );
};
