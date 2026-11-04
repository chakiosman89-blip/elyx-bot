const {
    EmbedBuilder
} = require('discord.js');

const {
    getPlayer,
    updatePlayer
} = require('./database');

const COLORS = [
    0xFF1744,
    0xFF9100,
    0xFFEA00,
    0x00E676,
    0x00B0FF,
    0x651FFF,
    0xF500D4
];

function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function createEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(randomColor())
        .setTitle(title)
        .setDescription(description)
        .setFooter({
            text: 'ELYX TRADING • FORTUNE'
        })
        .setTimestamp();
}

async function handleEconomy(message, command) {
    const userId = message.author.id;
    const player = getPlayer(userId);

    if (command === 'wallet') {
        return message.reply({
            embeds: [
                createEmbed(
                    '💎 ELYX WALLET',
                    `👤 Player: ${message.author.username}\n\n` +
                    `🪙 Coins: **${player.coins.toLocaleString()}**\n` +
                    `💎 Gems: **${player.gems.toLocaleString()}**\n` +
                    `⭐ XP: **${player.xp}**\n` +
                    `🏆 Level: **${player.level}**`
                )
            ]
        });
    }

    if (command === 'daily') {
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;

        if (player.lastDaily && now - player.lastDaily < cooldown) {
            const remaining = cooldown - (now - player.lastDaily);
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);

            return message.reply({
                embeds: [
                    createEmbed(
                        '⏳ DAILY REWARD',
                        `Your next reward is available in **${hours}h ${minutes}m**.`
                    )
                ]
            });
        }

        updatePlayer(userId, {
            coins: player.coins + 250,
            xp: player.xp + 25,
            lastDaily: now,
            streak: player.streak + 1
        });

        return message.reply({
            embeds: [
                createEmbed(
                    '🌈 DAILY REWARD CLAIMED',
                    `🎉 Congratulations ${message.author}!\n\n` +
                    `🪙 **+250 Coins**\n` +
                    `⭐ **+25 XP**\n` +
                    `🔥 Streak: **${player.streak + 1} days**\n\n` +
                    `Your next reward arrives in 24 hours!`
                )
            ]
        });
    }

    if (command === 'profile') {
        return message.reply({
            embeds: [
                createEmbed(
                    '👑 PLAYER PROFILE',
                    `**${message.author.username}**\n\n` +
                    `🪙 Coins: ${player.coins.toLocaleString()}\n` +
                    `💎 Gems: ${player.gems.toLocaleString()}\n` +
                    `⭐ XP: ${player.xp}\n` +
                    `🏆 Level: ${player.level}\n` +
                    `🔥 Streak: ${player.streak}`
                )
            ]
        });
    }
}

module.exports = {
    handleEconomy
};
