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

// Tere announcement channels
const ANNOUNCEMENT_CHANNEL_IDS = [
  '1551437304470573216',
  '1550877278144172062'
];

// Yahan apni Discord USER ID daalna
const OWNER_USER_ID = 'PASTE_YOUR_USER_ID';

client.once(Events.ClientReady, (bot) => {
  console.log(`✅ ${bot.user.tag} online hai!`);
  console.log('✅ Elyx Comments Box ready!');
});

client.on(Events.MessageCreate, async (message) => {
  // Server ke messages aur bot messages ignore karo
  if (!message.guild || message.author.bot) return;

  // Sirf tere messages par button aayega
  if (message.author.id !== OWNER_USER_ID) return;

  // Sirf selected announcement channels mein
  if (!ANNOUNCEMENT_CHANNEL_IDS.includes(message.channel.id)) return;

  try {
    // Tere announcement se linked discussion thread
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

    // Button-only message: no embed, no extra text
    await message.channel.send({
      components: [row]
    });

    console.log(`✅ Comments button created for ${message.author.tag}`);
  } catch (error) {
    console.error('❌ Comments Box Error:', error.message);
  }
});

client.login(process.env.DISCORD_TOKEN);
