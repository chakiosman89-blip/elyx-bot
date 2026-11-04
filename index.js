require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActivityType
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '-';

const rainbowColors = [
    0xFF1744,
    0xFF9100,
    0xFFEA00,
    0x00E676,
    0x00B0FF,
    0x651FFF,
    0xF500D4
];

function randomColor() {
    return rainbowColors[
        Math.floor(Math.random() * rainbowColors.length)
    ];
}

function createEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(randomColor())
        .setTitle(title)
        .setDescription(description)
        .setFooter({
            text: '🌈 ELYX TRADING • FORTUNE'
        })
        .setTimestamp();
}

client.once('ready', () => {
    console.log(`🌈 ${client.user.tag} is online!`);

    client.user.setActivity('ELYX FORTUNE', {
        type: ActivityType.Playing
    });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    try {
        if (command === 'fortune') {
            return message.reply({
                embeds: [
                    createEmbed(
                        '🌈 ELYX FORTUNE',
                        'Welcome to ELYX TRADING!\n\nGaming system is online.\n\n🎁 Rewards\n💎 Treasures\n🏆 Achievements'
                    )
                ]
            });
        }

        if (command === 'ping') {
            return message.reply({
                embeds: [
                    createEmbed(
                        '⚡ ELYX CONNECTION',
                        `Bot latency: ${client.ws.ping}ms`
                    )
                ]
            });
        }

    } catch (error) {
        console.error('Command error:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
