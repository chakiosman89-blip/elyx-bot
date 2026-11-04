const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'players.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        players: {}
    }, null, 2));
}

function loadDatabase() {
    try {
        return JSON.parse(
            fs.readFileSync(DB_FILE, 'utf8')
        );
    } catch (error) {
        console.error('Database error:', error);
        return { players: {} };
    }
}

function saveDatabase(data) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data, null, 2)
    );
}

function getPlayer(userId) {
    const db = loadDatabase();

    if (!db.players[userId]) {
        db.players[userId] = {
            coins: 0,
            gems: 0,
            xp: 0,
            level: 1,
            streak: 0,
            inventory: [],
            achievements: [],
            lastDaily: null
        };

        saveDatabase(db);
    }

    return db.players[userId];
}

function updatePlayer(userId, updates) {
    const db = loadDatabase();

    if (!db.players[userId]) {
        getPlayer(userId);
        return updatePlayer(userId, updates);
    }

    Object.assign(db.players[userId], updates);
    saveDatabase(db);

    return db.players[userId];
}

module.exports = {
    loadDatabase,
    saveDatabase,
    getPlayer,
    updatePlayer
};
