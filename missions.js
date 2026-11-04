const {
    getPlayer,
    updatePlayer
} = require('./database');

const MISSIONS = [
    {
        id: 'chat_10',
        name: 'Active Player',
        description: 'Send 10 messages in the server.',
        target: 10,
        reward: 100,
        xp: 25
    },
    {
        id: 'chat_25',
        name: 'Social Player',
        description: 'Send 25 messages in the server.',
        target: 25,
        reward: 250,
        xp: 50
    },
    {
        id: 'daily_3',
        name: 'Daily Explorer',
        description: 'Claim your daily reward 3 times.',
        target: 3,
        reward: 300,
        xp: 75
    }
];

function ensureMissionData(player) {
    if (!player.missions) {
        player.missions = {
            chat_10: 0,
            chat_25: 0,
            daily_3: 0
        };
    }

    if (!player.completedMissions) {
        player.completedMissions = [];
    }
}

function getMissionProgress(userId) {
    const player = getPlayer(userId);
    ensureMissionData(player);

    return MISSIONS.map(mission => ({
        ...mission,
        progress: player.missions[mission.id] || 0,
        completed: player.completedMissions.includes(mission.id)
    }));
}

function trackMission(userId, missionId, amount = 1) {
    const player = getPlayer(userId);
    ensureMissionData(player);

    const mission = MISSIONS.find(item => item.id === missionId);

    if (!mission) return null;

    if (player.completedMissions.includes(missionId)) {
        return null;
    }

    player.missions[missionId] = Math.min(
        mission.target,
        (player.missions[missionId] || 0) + amount
    );

    let completed = false;

    if (player.missions[missionId] >= mission.target) {
        player.completedMissions.push(missionId);

        player.coins += mission.reward;
        player.xp += mission.xp;

        completed = true;
    }

    updatePlayer(userId, {
        missions: player.missions,
        completedMissions: player.completedMissions,
        coins: player.coins,
        xp: player.xp
    });

    return {
        mission,
        progress: player.missions[missionId],
        completed
    };
}

module.exports = {
    MISSIONS,
    getMissionProgress,
    trackMission
};
