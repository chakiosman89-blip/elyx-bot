require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActivityType
} = require('discord.js');

const { handleEconomy } = require('./economy');
const { handleGames } = require('./games');
const { addXP } = require('./levels');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '-';

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
    return COLORS[
        Math.floor(Math.random() * COLORS.length)
    ];
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

client.once('ready', () => {
    console.log(`ELYX ONLINE: ${client.user.tag}`);

    client.user.setActivity('ELYX TRADING', {
        type: ActivityType.Playing
    });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Normal messages se XP
    if (!message.content.startsWith(PREFIX)) {
        try {
            addXP(message);
        } catch (error) {
            console.error('XP Error:', error);
        }

        return;
    }

    const args = message.content
        .slice(PREFIX.length)
        .trim()
        .split(/ +/);

    const command = args.shift()?.toLowerCase();

    if (!command) return;

    try {

        // ECONOMY COMMANDS
        const economyCommands = [
            'wallet',
            'daily',
            'profile'
        ];

        if (economyCommands.includes(command)) {
            return await handleEconomy(message, command);
        }

        // GAME COMMANDS
        const gameCommands = [
            'games',
            'guess',
            'quiz'
        ];

        if (gameCommands.includes(command)) {
            return await handleGames(message, command);
        }

        // FORTUNE COMMAND
        if (command === 'fortune') {
            return message.reply({
                embeds: [
                    createEmbed(
                        '🌈 ELYX FORTUNE',
                        'Welcome to ELYX TRADING!\n\n' +
                        '💎 Economy System\n' +
                        '🎁 Daily Rewards\n' +
                        '🏆 Player Profiles\n' +
                        '🎮 Interactive Games\n' +
                        '⭐ Level System\n\n' +
                        'Your adventure starts here!'
                    )
                ]
            });
        }

        // PING COMMAND
        if (command === 'ping') {
            return message.reply({
                embeds: [
                    createEmbed(
                        '⚡ ELYX CONNECTION',
                        `Latency: **${client.ws.ping}ms**`
                    )
                ]
            });
        }

    } catch (error) {
        console.error('Command Error:', error);

        message.reply({
            content: 'Something went wrong. Please try again.'
        }).catch(() => {});
    }
});

client.login(process.env.DISCORD_TOKEN);
