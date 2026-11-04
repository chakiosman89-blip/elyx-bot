const {
    getPlayer,
    updatePlayer
} = require('./database');

const XP_PER_MESSAGE = 5;
const XP_COOLDOWN = 60 * 1000;

const messageCooldowns = new Map();

function addXP(message) {
    const userId = message.author.id;
    const now = Date.now();

    const lastMessage = messageCooldowns.get(userId) || 0;

    if (now - lastMessage < XP_COOLDOWN) return;

    messageCooldowns.set(userId, now);

    const player = getPlayer(userId);

    const newXP = player.xp + XP_PER_MESSAGE;
    const requiredXP = player.level * 100;

    if (newXP >= requiredXP) {
        updatePlayer(userId, {
            xp: newXP - requiredXP,
            level: player.level + 1
        });

        message.reply(
            `🎉 ${message.author} reached Level ${player.level + 1}!`
        ).catch(() => {});
    } else {
        updatePlayer(userId, {
            xp: newXP
        });
    }
}

module.exports = {
    addXP
};
