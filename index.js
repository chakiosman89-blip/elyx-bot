const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Elyx Trading announcement channels
const ANNOUNCEMENT_CHANNEL_IDS = [
  '1551437304470573216',
  '1550877278144172062'
];

// Osman ki Discord User ID
const OWNER_USER_ID = '1535048066875527198';

client.once(Events.ClientReady, (bot) => {
  console.log(`✅ ${bot.user.tag} online hai!`);
  console.log('✅ Elyx Comments Box ready!');
});

client.on(Events.MessageCreate, async (message) => {
  // Bots aur server ke bahar ke messages ignore karo
  if (!message.guild || message.author.bot) return;

  // Sirf tere messages par button aayega
  if (message.author.id !== OWNER_USER_ID) return;

  // Sirf selected announcement channels mein
  if (!ANNOUNCEMENT_CHANNEL_IDS.includes(message.channel.id)) return;

  try {
    // Announcement se linked public comments thread
    const thread = await message.startThread({
      name: 'Comments',
      autoArchiveDuration: 1440,
      reason: 'Elyx Trading Comments Box'
    });

    // Sirf ek coloured button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('💬 Comments')
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${message.guild.id}/${thread.id}`
        )
    );

    // Koi extra text ya embed nahi
    await message.channel.send({
      components: [row]
    });

    console.log(`✅ Comments button created for ${message.id}`);
  } catch (error) {
    console.error('❌ Comments Box Error:', error.message);
  }
});

client.login(process.env.DISCORD_TOKEN);
