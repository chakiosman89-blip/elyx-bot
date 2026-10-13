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

// Announcements aur Giveaways channels
const TARGET_CHANNEL_IDS = [
  '1551437304470573216',
  '1550877278144172062'
];

// Sirf tere messages par buttons banenge
const OWNER_USER_ID = '1535048066875527198';

// Server ka Subscriber role
const SUBSCRIBER_ROLE_NAME = 'Subscriber';

// Likes memory mein store honge
const likes = new Map();

client.once(Events.ClientReady, (bot) => {
  console.log(`✅ ${bot.user.tag} online hai!`);
  console.log('✅ Elyx Comments Box + Like + Invite + Subscribe ready!');
});

// Buttons banana
function createButtons(threadId, likeCount = 0) {
  const firstRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`elyx:like:${threadId}`)
      .setLabel(`❤️ Like (${likeCount})`)
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('elyx:invite')
      .setLabel('🔗 Invite Friends')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('elyx:subscribe')
      .setLabel('🔔 Subscribe')
      .setStyle(ButtonStyle.Secondary)
  );

  const secondRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('💬 Comments')
      .setStyle(ButtonStyle.Link)
      .setURL(
        `https://discord.com/channels/${client.guildId || ''}/${threadId}`
      )
  );

  return [firstRow, secondRow];
}

// Announcement/Giveaway par tera message aane par
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  if (message.author.id !== OWNER_USER_ID) return;
  if (!TARGET_CHANNEL_IDS.includes(message.channel.id)) return;

  try {
    const thread = await message.startThread({
      name: 'Comments',
      autoArchiveDuration: 1440,
      reason: 'Elyx Trading Comments Box'
    });

    const firstRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`elyx:like:${thread.id}`)
        .setLabel('❤️ Like (0)')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('elyx:invite')
        .setLabel('🔗 Invite Friends')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('elyx:subscribe')
        .setLabel('🔔 Subscribe')
        .setStyle(ButtonStyle.Secondary)
    );

    const secondRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('💬 Comments')
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${message.guild.id}/${thread.id}`
        )
    );

    await message.channel.send({
      components: [firstRow, secondRow]
    });

    console.log(`✅ Buttons created for message ${message.id}`);
  } catch (error) {
    console.error('❌ Comments Box Error:', error.message);
  }
});

// Button clicks
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    // ❤️ LIKE BUTTON
    if (interaction.customId.startsWith('elyx:like:')) {
      const threadId = interaction.customId.split(':')[2];
      const messageId = interaction.message.id;

      if (!likes.has(messageId)) {
        likes.set(messageId, new Set());
      }

      const users = likes.get(messageId);

      if (users.has(interaction.user.id)) {
        users.delete(interaction.user.id);
      } else {
        users.add(interaction.user.id);
      }

      const firstRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`elyx:like:${threadId}`)
          .setLabel(`❤️ Like (${users.size})`)
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('elyx:invite')
          .setLabel('🔗 Invite Friends')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('elyx:subscribe')
          .setLabel('🔔 Subscribe')
          .setStyle(ButtonStyle.Secondary)
      );

      const secondRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('💬 Comments')
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guildId}/${threadId}`
          )
      );

      await interaction.update({
        components: [firstRow, secondRow]
      });

      return;
    }

    // 🔗 INVITE FRIENDS BUTTON
    if (interaction.customId === 'elyx:invite') {
      const invite = await interaction.channel.createInvite({
        maxAge: 0,
        maxUses: 0,
        unique: true,
        reason: 'Elyx Trading Invite Friends button'
      });

      await interaction.reply({
        content:
          `🔗 **Elyx Trading Invite Link**\n${invite.url}\n\n` +
          '♾️ Never expires\n👥 Unlimited uses',
        ephemeral: true
      });

      return;
    }

    // 🔔 SUBSCRIBE BUTTON
    if (interaction.customId === 'elyx:subscribe') {
      const guild = interaction.guild;

      if (!guild) {
        await interaction.reply({
          content: '❌ Ye button server ke andar use karo.',
          ephemeral: true
        });
        return;
      }

      const roles = await guild.roles.fetch();

      const role = roles.find(
        (r) => r.name === SUBSCRIBER_ROLE_NAME
      );

      if (!role) {
        await interaction.reply({
          content: '❌ Subscriber role nahi mila.',
          ephemeral: true
        });
        return;
      }

      const member = await guild.members.fetch(interaction.user.id);

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);

        await interaction.reply({
          content: '🔕 Aap unsubscribe ho gaye!',
          ephemeral: true
        });
      } else {
        await member.roles.add(role);

        await interaction.reply({
          content: '🔔 Aap successfully subscribe ho gaye!',
          ephemeral: true
        });
      }

      return;
    }
  } catch (error) {
    console.error('❌ Button Error:', error);

    const reply = {
      content:
        '❌ Button use nahi hua. Bot ki permissions aur role position check karo.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// 🔥 ELYX AUTO CHAT ACTIVITY

const AUTO_CHAT_CHANNEL_ID = '1557419019445731390';

const activityMessages = [
  '👀 Oye Elyx gang, sab gayab ho gaye kya? 😂 Koi toh chat karo! @everyone',
  '💀 Bhai server mein itni shanti kyun hai? Sabki Wi-Fi chali gayi kya? 📶😂 @everyone',
  '🗿 Silent readers, messages padhne aaye ho ya chat bhi karoge? 😂🔥 @everyone',
  '🚨 Elyx gang attendance lagao! Aaj kaun-kaun online hai? 😂 @everyone',
  '🥱 Yahan toh machhar bhi bore ho rahe hain! Koi baat karo 😂🦟 @everyone',
  '🎮 Koi game khelega ya sab statue banke baithe ho? 😂🔥 @everyone',
  '👻 Hello hello, koi hai ya sab ghost ban gaye? 👻😂 @everyone',
  '🔥 Elyx gang, chat mein thodi jaan daalo! Kya chal raha hai? 😎 @everyone',
  '😂 Itni shanti toh exam hall mein bhi nahi hoti! @everyone',
  '📢 Oye legends, ek message toh banta hai bhai! 😂❤️ @everyone'
];

const activityState = {
  lastMessageAt: Date.now(),
  lastBotMessageAt: 0,
  startedAt: Date.now(),
  messages: []
};

// Normal chat ke messages count karo
client.on(Events.MessageCreate, (message) => {
  if (!message.guild || message.author.bot) return;
  if (message.channel.id !== AUTO_CHAT_CHANNEL_ID) return;

  const now = Date.now();

  activityState.lastMessageAt = now;
  activityState.messages.push(now);

  activityState.messages = activityState.messages.filter(
    (time) => now - time <= 30 * 60 * 1000
  );
});

// Har minute activity check karo
setInterval(async () => {
  if (!client.isReady()) return;

  const now = Date.now();

  // Startup ke 30 minute baad checking shuru hogi
  if (now - activityState.startedAt < 30 * 60 * 1000) return;

  activityState.messages = activityState.messages.filter(
    (time) => now - time <= 30 * 60 * 1000
  );

  const noMessagesFor15Min =
    now - activityState.lastMessageAt >= 15 * 60 * 1000;

  const fewerThan10Messages =
    activityState.messages.length < 10;

  const cooldownOver =
    now - activityState.lastBotMessageAt >= 30 * 60 * 1000;

  if (!cooldownOver) return;

  if (noMessagesFor15Min || fewerThan10Messages) {
    try {
      const channel = await client.channels.fetch(
        AUTO_CHAT_CHANNEL_ID
      );

      if (!channel || !channel.isTextBased()) return;

      const randomMessage =
        activityMessages[
          Math.floor(Math.random() * activityMessages.length)
        ];

      await channel.send({
        content: randomMessage,
        allowedMentions: { parse: ['everyone'] }
      });

      activityState.lastBotMessageAt = Date.now();

      console.log('✅ Elyx Auto Activity message sent!');
    } catch (error) {
      console.error('❌ Auto Activity Error:', error.message);
    }
  }
}, 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
