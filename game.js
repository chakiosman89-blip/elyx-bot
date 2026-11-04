const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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
    return COLORS[
        Math.floor(Math.random() * COLORS.length)
    ];
}

function createGameEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(randomColor())
        .setTitle(title)
        .setDescription(description)
        .setFooter({
            text: 'ELYX FORTUNE • ARCADE'
        })
        .setTimestamp();
}

function randomNumber(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

function giveReward(userId, coins, xp) {
    const player = getPlayer(userId);

    updatePlayer(userId, {
        coins: player.coins + coins,
        xp: player.xp + xp
    });
}


function createGuessButtons(userId) {
    const row = new ActionRowBuilder();

    for (let i = 1; i <= 5; i++) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`guess_${userId}_${i}`)
                .setLabel(String(i))
                .setStyle(ButtonStyle.Primary)
        );
    }

    return row;
}

async function startGuess(message) {
    const number = randomNumber(1, 5);

    const embed = createGameEmbed(
        '🎯 NUMBER CHALLENGE',
        'Secret number **1 se 5** ke beech hai!\n\n' +
        'Buttons mein se apna answer choose karo.\n' +
        'Sahi answer par bonus reward milega!'
    );

    const row = createGuessButtons(message.author.id);

    const gameMessage = await message.reply({
        embeds: [embed],
        components: [row]
    });

    const collector = gameMessage.createMessageComponentCollector({
        time: 30000
    });

    collector.on('collect', async interaction => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({
                content: 'Ye game kisi aur player ka hai!',
                ephemeral: true
            });
        }

        const choice = Number(
            interaction.customId.split('_')[2]
        );

        collector.stop();

        if (choice === number) {
            giveReward(message.author.id, 100, 25);

            await interaction.update({
                embeds: [
                    createGameEmbed(
                        '🎉 PERFECT GUESS!',
                        `Correct number: **${number}**\n\n` +
                        '🪙 +100 Coins\n⭐ +25 XP'
                    )
                ],
                components: []
            });
        } else {
            giveReward(message.author.id, 10, 5);

            await interaction.update({
                embeds: [
                    createGameEmbed(
                        '🎮 GAME COMPLETE',
                        `Secret number: **${number}**\n` +
                        `Your choice: **${choice}**\n\n` +
                        '🪙 +10 Participation Coins\n⭐ +5 XP'
                    )
                ],
                components: []
            });
        }
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'time') {
            await gameMessage.edit({
                embeds: [
                    createGameEmbed(
                        '⏰ TIME OVER',
                        'Game ka time khatam ho gaya!'
                    )
                ],
                components: []
            }).catch(() => {});
        }
    });
                  }


const QUIZ_QUESTIONS = [
    {
        question: 'Which planet is known as the Red Planet?',
        options: ['Earth', 'Mars', 'Venus'],
        answer: 1
    },
    {
        question: 'How many days are in a week?',
        options: ['5', '6', '7'],
        answer: 2
    },
    {
        question: 'Which animal is known as the King of the Jungle?',
        options: ['Lion', 'Tiger', 'Elephant'],
        answer: 0
    }
];

async function startQuiz(message) {
    const quiz = QUIZ_QUESTIONS[
        randomNumber(0, QUIZ_QUESTIONS.length - 1)
    ];

    const row = new ActionRowBuilder();

    quiz.options.forEach((option, index) => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`quiz_${message.author.id}_${index}`)
                .setLabel(option)
                .setStyle(ButtonStyle.Primary)
        );
    });

    const gameMessage = await message.reply({
        embeds: [
            createGameEmbed(
                '🧠 ELYX QUIZ',
                `**${quiz.question}**\n\n` +
                'Choose your answer below!'
            )
        ],
        components: [row]
    });

    const collector = gameMessage.createMessageComponentCollector({
        time: 30000
    });

    collector.on('collect', async interaction => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({
                content: 'Ye quiz kisi aur player ka hai!',
                ephemeral: true
            });
        }

        const answer = Number(
            interaction.customId.split('_')[2]
        );

        collector.stop();

        if (answer === quiz.answer) {
            giveReward(message.author.id, 75, 20);

            await interaction.update({
                embeds: [
                    createGameEmbed(
                        '🏆 CORRECT ANSWER!',
                        `Answer: **${quiz.options[quiz.answer]}**\n\n` +
                        '🪙 +75 Coins\n⭐ +20 XP'
                    )
                ],
                components: []
            });
        } else {
            giveReward(message.author.id, 10, 5);

            await interaction.update({
                embeds: [
                    createGameEmbed(
                        '📚 QUIZ COMPLETED',
                        `Correct answer: **${quiz.options[quiz.answer]}**\n\n` +
                        '🪙 +10 Participation Coins\n⭐ +5 XP'
                    )
                ],
                components: []
            });
        }
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'time') {
            await gameMessage.edit({
                embeds: [
                    createGameEmbed(
                        '⏰ QUIZ EXPIRED',
                        'Quiz ka time khatam ho gaya!'
                    )
                ],
                components: []
            }).catch(() => {});
        }
    });
}


async function handleGames(message, command) {
    if (command === 'guess') {
        return startGuess(message);
    }

    if (command === 'quiz') {
        return startQuiz(message);
    }

    if (command === 'games') {
        return message.reply({
            embeds: [
                createGameEmbed(
                    '🎮 ELYX ARCADE',
                    '**Available Games**\n\n' +
                    '🎯 `-guess` — Number Challenge\n' +
                    '🧠 `-quiz` — Knowledge Quiz\n\n' +
                    'Play free and earn rewards!'
                )
            ]
        });
    }
}

module.exports = {
    handleGames
};



