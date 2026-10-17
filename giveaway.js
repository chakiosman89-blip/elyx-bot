const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// ================= CHANNELS =================

const HOST_CHANNEL_ID = '1560887434328281190';
const VERIFY_CHANNEL_ID = '1560888011523100803';
const ANNOUNCEMENTS_CHANNEL_ID = '1551437304470573216';
const OWNER_ID = '1535048066875527198';

const DATA_FILE = path.join(__dirname, 'giveaway-data.json');

// ================= DATA =================

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

      return {
        panelMessageId: saved.panelMessageId || null,
        applications: saved.applications || {},
        approvedUsers: saved.approvedUsers || [],
        giveaways: saved.giveaways || {},
        messageCounts: saved.messageCounts || {},
        inviteCounts: saved.inviteCounts || {}
      };
    }
  } catch (error) {
    console.error('Giveaway data error:', error);
  }

  return {
    panelMessageId: null,
    applications: {},
    approvedUsers: [],
    giveaways: {},
    messageCounts: {},
    inviteCounts: {}
  };
}

let data = loadData();
const drafts = new Map();

function saveData() {
  try {
    const temp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, DATA_FILE);
  } catch (error) {
    console.error('Could not save giveaway data:', error);
  }
}

function safeText(value, max = 1000) {
  return String(value || 'Not provided').trim().slice(0, max) ||
    'Not provided';
}

function imageUrl(value) {
  if (!value || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

// ================= HOST PANEL =================

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎁 HOST A GIVEAWAY')
    .setDescription(
      'Want to host a giveaway in Elyx Trading?\n\n' +
      'Click the button below and submit your application.\n\n' +
      '📋 Your application will be reviewed by the server owner.\n' +
      '✅ Once approved, your giveaway will be published automatically.\n' +
      '📢 All approved giveaways will appear in the announcements channel.\n\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      '📜 **HOSTING RULES**\n\n' +
      '・Provide accurate giveaway and prize details.\n' +
      '・Fake prizes and misleading information are not allowed.\n' +
      '・Choose your giveaway type and winner method carefully.\n' +
      '・Duplicate or incomplete applications may be rejected.\n' +
      '・Only approved applications will be published.\n\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      'Ready to host? Apply below! 👇'
    )
    .setFooter({
      text: 'Elyx Trading • Giveaway Hosting'
    });
}

function panelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway:apply')
      .setLabel('APPLY FOR GIVEAWAY')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎁')
  );
}

// ================= APPLICATION EMBED =================

function applicationEmbed(app) {
  const colors = {
    pending: 0xF1C40F,
    approved: 0x2ECC71,
    denied: 0xE74C3C,
    ended: 0x95A5A6
  };

  const embed = new EmbedBuilder()
    .setColor(colors[app.status] || 0x5865F2)
    .setTitle('🎁 Giveaway Hosting Application')
    .setDescription(`**Host:** <@${app.userId}>`)
    .addFields(
      {
        name: '📌 Status',
        value: app.status.toUpperCase(),
        inline: true
      },
      {
        name: '🎮 Game',
        value: safeText(app.game, 80),
        inline: true
      },
      {
        name: '🏷️ Giveaway Type',
        value: safeText(app.giveawayType, 80),
        inline: true
      },
      {
        name: '📝 Title',
        value: safeText(app.title, 150)
      },
      {
        name: '🏆 Prize',
        value: `${safeText(app.prize, 100)} • ${safeText(app.prizeType, 50)}`,
        inline: true
      },
      {
        name: '⏰ Duration',
        value: safeText(app.duration, 50),
        inline: true
      },
      {
        name: '👥 Winners',
        value: safeText(app.winners, 10),
        inline: true
      },
      {
        name: '🎯 Winner Method',
        value: safeText(app.winnerMode, 100)
      },
      {
        name: '📖 Details',
        value: safeText(app.details, 1000)
      },
      {
        name: '📋 Entry Requirements',
        value: safeText(app.requirements, 1000)
      }
    )
    .setTimestamp(new Date(app.createdAt));

  if (app.imageUrl) embed.setImage(app.imageUrl);

  return embed;
}

function reviewRow(appId, status) {
  if (status === 'pending') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:approve:${appId}`)
        .setLabel('APPROVE & PUBLISH')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`giveaway:deny:${appId}`)
        .setLabel('DENY')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway:closed')
      .setLabel(status === 'approved' ? 'PUBLISHED' : status.toUpperCase())
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

// ================= FORM STEP 1 =================

function firstModal() {
  const modal = new ModalBuilder()
    .setCustomId('giveaway:form1')
    .setTitle('Giveaway Application • 1/2');

  const fields = [
    ['game', 'Game name', 'Example: BMGO', TextInputStyle.Short, 80],
    ['title', 'Giveaway title', 'Example: Weekly Coin Giveaway', TextInputStyle.Short, 100],
    ['prize', 'Prize amount or value', 'Example: 100M coins', TextInputStyle.Short, 100],
    ['prizeType', 'Prize type', 'Coins, RC, Nitro, etc.', TextInputStyle.Short, 50],
    ['details', 'Giveaway description', 'Explain your giveaway.', TextInputStyle.Paragraph, 1000]
  ];

  for (const [id, label, placeholder, style, max] of fields) {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(style)
      .setMaxLength(max)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return modal;
}

// ================= FORM OPTIONS =================

function optionRows(draft) {
  const type = new StringSelectMenuBuilder()
    .setCustomId('giveaway:type')
    .setPlaceholder('Choose giveaway type')
    .addOptions(
      { label: 'Normal Giveaway', value: 'Normal Giveaway' },
      { label: 'Coin Giveaway', value: 'Coin Giveaway' },
      { label: 'Weekly Giveaway', value: 'Weekly Giveaway' },
      { label: 'Message Competition', value: 'Message Competition' },
      { label: 'Invite Competition', value: 'Invite Competition' },
      { label: 'Random Giveaway', value: 'Random Giveaway' }
    );

  const duration = new StringSelectMenuBuilder()
    .setCustomId('giveaway:duration')
    .setPlaceholder('Choose duration')
    .addOptions(
      { label: '24 Hours', value: '24 hours' },
      { label: '3 Days', value: '3 days' },
      { label: '7 Days', value: '7 days' },
      { label: '14 Days', value: '14 days' },
      { label: 'Custom (explain in details)', value: 'Custom duration' }
    );

  const winner = new StringSelectMenuBuilder()
    .setCustomId('giveaway:winner')
    .setPlaceholder('Choose winner method')
    .addOptions(
      { label: 'Random Winner', value: 'Random winner' },
      { label: 'Most Eligible Messages', value: 'Most eligible messages' },
      { label: 'Most Valid Invites', value: 'Most valid invites' }
    );

  const next = new ButtonBuilder()
    .setCustomId('giveaway:continue')
    .setLabel('CONTINUE APPLICATION')
    .setStyle(ButtonStyle.Success)
    .setEmoji('➡️');

  return [
    new ActionRowBuilder().addComponents(type),
    new ActionRowBuilder().addComponents(duration),
    new ActionRowBuilder().addComponents(winner),
    new ActionRowBuilder().addComponents(next)
  ];
}

// ================= FORM STEP 2 =================

function secondModal() {
  const modal = new ModalBuilder()
    .setCustomId('giveaway:form2')
    .setTitle('Giveaway Application • 2/2');

  const winners = new TextInputBuilder()
    .setCustomId('winners')
    .setLabel('Number of winners')
    .setPlaceholder('Example: 1')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(3)
    .setRequired(true);

  const requirements = new TextInputBuilder()
    .setCustomId('requirements')
    .setLabel('Entry requirements')
    .setPlaceholder('Example: Join server and follow rules.')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true);

  const image = new TextInputBuilder()
    .setCustomId('image')
    .setLabel('Image URL (optional)')
    .setPlaceholder('https://example.com/image.png')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(winners),
    new ActionRowBuilder().addComponents(requirements),
    new ActionRowBuilder().addComponents(image)
  );

  return modal;
  }
// ================= SETUP =================

async function setupGiveawaySystem(client) {
  const channel = await client.channels.fetch(HOST_CHANNEL_ID).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    console.error('Giveaway host channel not found.');
    return;
  }

  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);

  let panelMessage = data.panelMessageId
    ? messages?.get(data.panelMessageId)
    : null;

  if (!panelMessage) {
    panelMessage = messages?.find(
      message =>
        message.author.id === client.user.id &&
        message.embeds[0]?.title === '🎁 HOST A GIVEAWAY'
    );
  }

  if (panelMessage) {
    await panelMessage.edit({
      embeds: [panelEmbed()],
      components: [panelRow()]
    });
  } else {
    panelMessage = await channel.send({
      embeds: [panelEmbed()],
      components: [panelRow()]
    });
  }

  data.panelMessageId = panelMessage.id;
  saveData();

  console.log('Giveaway application panel is ready.');
}

// ================= PUBLISH GIVEAWAY =================

async function publishGiveaway(app, client) {
  const channel = await client.channels
    .fetch(ANNOUNCEMENTS_CHANNEL_ID)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error('Giveaway announcements channel not found.');
  }

  const durationMs = {
    '24 hours': 24 * 60 * 60 * 1000,
    '3 days': 3 * 24 * 60 * 60 * 1000,
    '7 days': 7 * 24 * 60 * 60 * 1000,
    '14 days': 14 * 24 * 60 * 60 * 1000
  };

  const duration = durationMs[app.duration] || 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const giveawayId = `${app.id}-${now}`;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎁 ${safeText(app.title, 200)}`)
    .setDescription(
      `${safeText(app.details, 1500)}\n\n` +
      '━━━━━━━━━━━━━━━━━━━━\n' +
      `🎮 **Game:** ${safeText(app.game, 80)}\n` +
      `🏆 **Prize:** ${safeText(app.prize, 100)} (${safeText(app.prizeType, 50)})\n` +
      `👑 **Host:** <@${app.userId}>\n` +
      `👥 **Winners:** ${app.winners}\n` +
      `🎯 **Winner method:** ${app.winnerMode}\n` +
      `📋 **Requirements:** ${safeText(app.requirements, 800)}\n` +
      `⏰ **Ends:** <t:${Math.floor((now + duration) / 1000)}:F>\n\n` +
      'Press **ENTER GIVEAWAY** below to participate.'
    )
    .setFooter({ text: 'Elyx Trading • Good luck!' })
    .setTimestamp(new Date(now));

  if (app.imageUrl) embed.setImage(app.imageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:enter:${giveawayId}`)
      .setLabel('ENTER GIVEAWAY')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎉')
  );

  const message = await channel.send({
    content: `🎉 <@${app.userId}> is hosting a giveaway! @everyone`,
    embeds: [embed],
    components: [row],
    allowedMentions: {
      parse: ['everyone'],
      users: [app.userId]
    }
  });

  data.giveaways[giveawayId] = {
    id: giveawayId,
    applicationId: app.id,
    guildId: app.guildId,
    channelId: channel.id,
    messageId: message.id,
    userId: app.userId,
    title: app.title,
    giveawayType: app.giveawayType,
    winnerMode: app.winnerMode,
    winners: Number(app.winners) || 1,
    startsAt: now,
    endsAt: now + duration,
    entrants: [],
    ended: false
  };

  saveData();
  return message;
}

// ================= FINISH GIVEAWAY =================

async function finishGiveaway(giveaway, client) {
  if (giveaway.ended) return;

  giveaway.ended = true;
  saveData();

  const channel = await client.channels
    .fetch(giveaway.channelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) return;

  let winners = [];

  if (giveaway.winnerMode === 'Most eligible messages') {
    const counts = data.messageCounts[giveaway.id] || {};

    winners = Object.entries(counts)
      .filter(([userId, count]) =>
        count > 0 && !client.users.cache.get(userId)?.bot
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, giveaway.winners)
      .map(([userId]) => userId);
  } else if (giveaway.winnerMode === 'Most valid invites') {
    const counts = data.inviteCounts[giveaway.id] || {};

    winners = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, giveaway.winners)
      .map(([userId]) => userId);
  } else {
    const entrants = [...new Set(giveaway.entrants || [])];

    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
    }

    winners = entrants.slice(0, giveaway.winners);
  }

  const winnerText = winners.length
    ? winners.map(id => `<@${id}>`).join(', ')
    : 'No eligible winners found.';

  await channel.send({
    content: `🏆 **GIVEAWAY ENDED!**\n🎁 **${safeText(giveaway.title, 150)}**\nWinner(s): ${winnerText}`,
    allowedMentions: {
      users: winners
    }
  });

  const originalMessage = await channel.messages
    .fetch(giveaway.messageId)
    .catch(() => null);

  if (originalMessage) {
    await originalMessage.edit({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('giveaway:ended')
            .setLabel('GIVEAWAY ENDED')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        )
      ]
    }).catch(() => {});
  }

  saveData();
}

// ================= AUTOMATIC TIMER =================

let timerStarted = false;

function startGiveawayTimer(client) {
  if (timerStarted) return;
  timerStarted = true;

  setInterval(async () => {
    for (const giveaway of Object.values(data.giveaways)) {
      if (!giveaway.ended && Date.now() >= giveaway.endsAt) {
        try {
          await finishGiveaway(giveaway, client);
        } catch (error) {
          console.error('Giveaway ending error:', error);
        }
      }
    }
  }, 30_000);
}

// ================= INTERACTIONS =================

async function handleInteraction(interaction, client) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() &&
      !interaction.isModalSubmit()) {
    return false;
  }

  const id = interaction.customId;

  if (!id.startsWith('giveaway:')) return false;

  // APPLY
  if (id === 'giveaway:apply' && interaction.isButton()) {
    drafts.set(interaction.user.id, {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      createdAt: Date.now()
    });

    await interaction.showModal(firstModal());
    return true;
  }

  // FIRST FORM SUBMITTED
  if (id === 'giveaway:form1' && interaction.isModalSubmit()) {
    const draft = drafts.get(interaction.user.id);

    if (!draft) {
      await interaction.reply({
        content: 'Your application expired. Please press APPLY again.',
        ephemeral: true
      });
      return true;
    }

    draft.game = interaction.fields.getTextInputValue('game');
    draft.title = interaction.fields.getTextInputValue('title');
    draft.prize = interaction.fields.getTextInputValue('prize');
    draft.prizeType = interaction.fields.getTextInputValue('prizeType');
    draft.details = interaction.fields.getTextInputValue('details');

    drafts.set(interaction.user.id, draft);

    await interaction.reply({
      content: 'Choose your giveaway type, duration and winner method, then continue.',
      components: optionRows(draft),
      ephemeral: true
    });

    return true;
  }

  // FORM OPTIONS
  if (interaction.isStringSelectMenu()) {
    const draft = drafts.get(interaction.user.id);

    if (!draft) {
      await interaction.reply({
        content: 'Your application expired. Press APPLY again.',
        ephemeral: true
      });
      return true;
    }

    if (id === 'giveaway:type') draft.giveawayType = interaction.values[0];
    else if (id === 'giveaway:duration') draft.duration = interaction.values[0];
    else if (id === 'giveaway:winner') draft.winnerMode = interaction.values[0];
    else return false;

    drafts.set(interaction.user.id, draft);

    await interaction.deferUpdate();
    return true;
  }

  // CONTINUE TO SECOND FORM
  if (id === 'giveaway:continue' && interaction.isButton()) {
    const draft = drafts.get(interaction.user.id);

    if (!draft || !draft.giveawayType || !draft.duration || !draft.winnerMode) {
      await interaction.reply({
        content: 'Please select all three options before continuing.',
        ephemeral: true
      });
      return true;
    }

    await interaction.showModal(secondModal());
    return true;
  }

  // SECOND FORM SUBMITTED
  if (id === 'giveaway:form2' && interaction.isModalSubmit()) {
    const draft = drafts.get(interaction.user.id);

    if (!draft) {
      await interaction.reply({
        content: 'Your application expired. Press APPLY again.',
        ephemeral: true
      });
      return true;
    }

    const winnersText = interaction.fields.getTextInputValue('winners').trim();
    const winners = Number(winnersText);

    if (!Number.isInteger(winners) || winners < 1 || winners > 20) {
      await interaction.reply({
        content: 'Number of winners must be between 1 and 20.',
        ephemeral: true
      });
      return true;
    }

    draft.winners = winners;
    draft.requirements = interaction.fields.getTextInputValue('requirements');
    draft.imageUrl = imageUrl(interaction.fields.getTextInputValue('image'));
    draft.status = 'pending';
    draft.createdAt = draft.createdAt || Date.now();
    draft.id = `${interaction.user.id}-${Date.now()}`;

    data.applications[draft.id] = draft;
    saveData();

    const verifyChannel = await client.channels
      .fetch(VERIFY_CHANNEL_ID)
      .catch(() => null);

    if (!verifyChannel || !verifyChannel.isTextBased()) {
      delete data.applications[draft.id];
      saveData();

      await interaction.reply({
        content: 'Verification channel not found. Please contact the server owner.',
        ephemeral: true
      });
      return true;
    }

    try {
      await verifyChannel.send({
        embeds: [applicationEmbed(draft)],
        components: [reviewRow(draft.id, 'pending')]
      });
    } catch (error) {
      delete data.applications[draft.id];
      saveData();
      throw error;
    }

    drafts.delete(interaction.user.id);

    await interaction.reply({
      content: '✅ Your application has been submitted for owner review.',
      ephemeral: true
    });

    return true;
  }

  // OWNER APPROVES
  if (id.startsWith('giveaway:approve:') && interaction.isButton()) {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({
        content: 'Only the server owner can approve applications.',
        ephemeral: true
      });
      return true;
    }

    const appId = id.split(':')[2];
    const app = data.applications[appId];

    if (!app || app.status !== 'pending') {
      await interaction.reply({
        content: 'This application has already been handled or cannot be found.',
        ephemeral: true
      });
      return true;
    }

    await interaction.deferUpdate();

    try {
      await publishGiveaway(app, client);

      app.status = 'approved';
      app.publishedAt = Date.now();
      data.approvedUsers = [...new Set([...data.approvedUsers, app.userId])];
      saveData();

      await interaction.message.edit({
        embeds: [applicationEmbed(app)],
        components: [reviewRow(appId, 'approved')]
      });

      const user = await client.users.fetch(app.userId).catch(() => null);
      if (user) {
        await user.send(
          `✅ Your giveaway **${safeText(app.title, 150)}** has been approved and published!`
        ).catch(() => {});
      }
    } catch (error) {
      console.error('Giveaway publish error:', error);

      await interaction.followUp({
        content: 'Publishing failed. Check the bot permissions and announcement channel.',
        ephemeral: true
      });
    }

    return true;
  }

  // OWNER DENIES
  if (id.startsWith('giveaway:deny:') && interaction.isButton()) {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({
        content: 'Only the server owner can deny applications.',
        ephemeral: true
      });
      return true;
    }

    const appId = id.split(':')[2];
    const app = data.applications[appId];

    if (!app || app.status !== 'pending') {
      await interaction.reply({
        content: 'This application has already been handled or cannot be found.',
        ephemeral: true
      });
      return true;
    }

    app.status = 'denied';
    app.deniedAt = Date.now();
    saveData();

    await interaction.update({
      embeds: [applicationEmbed(app)],
      components: [reviewRow(appId, 'denied')]
    });

    const user = await client.users.fetch(app.userId).catch(() => null);
    if (user) {
      await user.send(
        `❌ Your giveaway application **${safeText(app.title, 150)}** was denied.`
      ).catch(() => {});
    }

    return true;
  }

  // ENTER RANDOM GIVEAWAY
  if (id.startsWith('giveaway:enter:') && interaction.isButton()) {
    const giveawayId = id.slice('giveaway:enter:'.length);
    const giveaway = data.giveaways[giveawayId];

    if (!giveaway || giveaway.ended || Date.now() >= giveaway.endsAt) {
      await interaction.reply({
        content: 'This giveaway has ended or is unavailable.',
        ephemeral: true
      });
      return true;
    }

    if (giveaway.winnerMode !== 'Random winner') {
      await interaction.reply({
        content: 'This competition selects winners using its message or invite leaderboard.',
        ephemeral: true
      });
      return true;
    }

    if (giveaway.entrants.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You have already entered this giveaway.',
        ephemeral: true
      });
      return true;
    }

    giveaway.entrants.push(interaction.user.id);
    saveData();

    await interaction.reply({
      content: '🎉 You have entered the giveaway. Good luck!',
      ephemeral: true
    });

    return true;
  }

  if (id === 'giveaway:closed' || id === 'giveaway:ended') {
    await interaction.reply({
      content: 'This giveaway action is closed.',
      ephemeral: true
    });
    return true;
  }

  return false;
}

// ================= MESSAGE TRACKING =================

async function handleGiveawayMessage(message, client) {
  if (!message.guild || message.author.bot) return;
  if (message.content.trim().length < 3) return;
  if (message.content.startsWith('/')) return;

  const excludedChannels = [
    HOST_CHANNEL_ID,
    VERIFY_CHANNEL_ID,
    ANNOUNCEMENTS_CHANNEL_ID
  ];

  if (excludedChannels.includes(message.channel.id)) return;

  for (const giveaway of Object.values(data.giveaways)) {
    if (
      giveaway.ended ||
      giveaway.winnerMode !== 'Most eligible messages' ||
      Date.now() < giveaway.startsAt ||
      Date.now() >= giveaway.endsAt ||
      giveaway.guildId !== message.guild.id
    ) {
      continue;
    }

    if (!data.messageCounts[giveaway.id]) {
      data.messageCounts[giveaway.id] = {};
    }

    const counts = data.messageCounts[giveaway.id];
    counts[message.author.id] = (counts[message.author.id] || 0) + 1;
  }

  saveData();
}

// ================= INVITE TRACKING =================

const inviteCache = new Map();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();

    inviteCache.set(
      guild.id,
      new Map(invites.map(invite => [invite.code, invite.uses || 0]))
    );
  } catch (error) {
    console.warn(
      `Cannot track invites in ${guild.id}. Give the bot Manage Server permission.`,
      error.message
    );
  }
}

async function handleMemberJoin(member) {
  if (!member.guild) return;

  try {
    const oldInvites = inviteCache.get(member.guild.id) || new Map();
    const newInvites = await member.guild.invites.fetch();

    const usedInvite = newInvites.find(invite =>
      (invite.uses || 0) > (oldInvites.get(invite.code) || 0)
    );

    inviteCache.set(
      member.guild.id,
      new Map(newInvites.map(invite => [invite.code, invite.uses || 0]))
    );

    if (!usedInvite || !usedInvite.inviter) return;

    const inviterId = usedInvite.inviter.id;

    for (const giveaway of Object.values(data.giveaways)) {
      if (
        giveaway.ended ||
        giveaway.winnerMode !== 'Most valid invites' ||
        Date.now() < giveaway.startsAt ||
        Date.now() >= giveaway.endsAt ||
        giveaway.guildId !== member.guild.id ||
        inviterId === member.id
      ) {
        continue;
      }

      if (!data.inviteCounts[giveaway.id]) {
        data.inviteCounts[giveaway.id] = {};
      }

      const counts = data.inviteCounts[giveaway.id];
      counts[inviterId] = (counts[inviterId] || 0) + 1;
    }

    saveData();
  } catch (error) {
    console.error('Invite tracking error:', error);
  }
}

// ================= EXPORTS =================

module.exports = {
  setupGiveawaySystem,
  handleInteraction,
  handleGiveawayMessage,
  handleMemberJoin,
  cacheGuildInvites,
  startGiveawayTimer
};
