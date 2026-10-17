const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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
  return String(value || 'Not provided')
    .trim()
    .slice(0, max) || 'Not provided';
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

// ================= CUSTOM DURATION =================

// Accepts: 30m, 12 hours, 5 days, 2 weeks, 1d 12h
function parseDuration(value) {
  const input = String(value || '').trim().toLowerCase();

  const pattern =
    /(\d+)\s*(weeks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m)\b/g;

  let match;
  let total = 0;
  let found = false;
  let remaining = input;

  while ((match = pattern.exec(input)) !== null) {
    found = true;

    const amount = Number(match[1]);
    const unit = match[2];

    if (unit.startsWith('w')) total += amount * 7 * 86400000;
    else if (unit.startsWith('d')) total += amount * 86400000;
    else if (unit.startsWith('h')) total += amount * 3600000;
    else total += amount * 60000;

    remaining = remaining.replace(match[0], '');
  }

  if (!found || remaining.replace(/[\s,]+/g, '') !== '') {
    return null;
  }

  // Minimum 1 minute; maximum 365 days.
  if (total < 60000 || total > 365 * 86400000) {
    return null;
  }

  return total;
}

// Select the automatic winner engine from the host's text.
// Other custom methods are displayed, but use random selection.
function getWinnerEngine(value) {
  const text = String(value || '').toLowerCase();

  if (
    text.includes('invite') ||
    text.includes('referral')
  ) {
    return 'invites';
  }

  if (
    text.includes('message') ||
    text.includes('chat') ||
    text.includes('msg')
  ) {
    return 'messages';
  }

  return 'random';
}

// ================= HOST PANEL =================

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎁 HOST A GIVEAWAY')
    .setDescription(
      'Want to host a giveaway in Elyx Trading?\n\n' +
      'Click below and submit your application.\n\n' +
      '✅ Your application will be reviewed by the owner.\n' +
      '📢 Approved giveaways will be published automatically.\n\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      '📜 **HOSTING RULES**\n\n' +
      '・Provide accurate prize details.\n' +
      '・Fake prizes and misleading information are not allowed.\n' +
      '・Write clear entry requirements.\n' +
      '・Incomplete applications may be rejected.\n' +
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
    denied: 0xE74C3C
  };

  const embed = new EmbedBuilder()
    .setColor(colors[app.status] || 0x5865F2)
    .setTitle('🎁 Giveaway Hosting Application')
    .setDescription(
      `**Host:** <@${app.userId}>\n` +
      `**Discord Username:** ${safeText(app.username, 80)}`
    )
    .addFields(
      {
        name: '📌 Status',
        value: app.status.toUpperCase(),
        inline: true
      },
      {
        name: '🎮 Game',
        value: safeText(app.game, 100),
        inline: true
      },
      {
        name: '🏷️ Giveaway Type',
        value: safeText(app.giveawayType, 100),
        inline: true
      },
      {
        name: '📝 Title',
        value: safeText(app.title, 200)
      },
      {
        name: '🏆 Prize',
        value: `${safeText(app.prize, 150)} • ${safeText(app.prizeType, 100)}`
      },
      {
        name: '⏳ Duration',
        value: safeText(app.duration, 80),
        inline: true
      },
      {
        name: '👥 Winners',
        value: String(app.winners),
        inline: true
      },
      {
        name: '🎯 Winner Method',
        value: safeText(app.winnerMode, 200)
      },
      {
        name: '📖 Description',
        value: safeText(app.details, 1000)
      },
      {
        name: '📋 Entry Requirements',
        value: safeText(app.requirements, 1000)
      },
      {
        name: '💬 Message / Invite Competition Rules',
        value: safeText(app.competitionRules, 1000)
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
      .setLabel(status === 'approved' ? 'PUBLISHED' : 'DENIED')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

// ================= FORM 1 =================

function firstModal() {
  const modal = new ModalBuilder()
    .setCustomId('giveaway:form1')
    .setTitle('Giveaway Application • 1/3');

  const fields = [
    ['game', 'Game name', 'Any game name', TextInputStyle.Short, 80],
    ['title', 'Giveaway title', 'Write your own title', TextInputStyle.Short, 100],
    ['prize', 'Prize amount or value', 'Coins, RC, Nitro, etc.', TextInputStyle.Short, 100],
    ['prizeType', 'Prize type', 'Write any prize type', TextInputStyle.Short, 50],
    ['details', 'Giveaway description', 'Explain the giveaway', TextInputStyle.Paragraph, 1000]
  ];

  for (const [id, label, placeholder, style, max] of fields) {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(style)
      .setMaxLength(max)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return modal;
}

// ================= FORM 2 =================

function secondModal() {
  const modal = new ModalBuilder()
    .setCustomId('giveaway:form2')
    .setTitle('Giveaway Application • 2/3');

  const fields = [
    [
      'giveawayType',
      'Giveaway type',
      'Normal, weekly, coin, custom, etc.',
      100
    ],
    [
      'duration',
      'Duration',
      'Example: 12 hours, 5 days, 2 weeks',
      50
    ],
    [
      'winnerMode',
      'Winner selection method',
      'Random, most messages, most invites',
      100
    ],
    [
      'winners',
      'Number of winners (1-20)',
      'Example: 1',
      2
    ],
    [
      'requirements',
      'Entry requirements',
      'Write the rules to enter',
      1000
    ]
  ];

  for (const [id, label, placeholder, max] of fields) {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(
        id === 'requirements'
          ? TextInputStyle.Paragraph
          : TextInputStyle.Short
      )
      .setMaxLength(max)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return modal;
}

// ================= FORM 3 =================

function thirdModal() {
  const modal = new ModalBuilder()
    .setCustomId('giveaway:form3')
    .setTitle('Giveaway Application • 3/3');

  const rules = new TextInputBuilder()
    .setCustomId('competitionRules')
    .setLabel('Message / invite competition rules')
    .setPlaceholder('Example: 100 messages or 10 valid invites')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(false);

  const image = new TextInputBuilder()
    .setCustomId('image')
    .setLabel('Image URL (optional)')
    .setPlaceholder('https://example.com/image.png')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(false);

  const extra = new TextInputBuilder()
    .setCustomId('extra')
    .setLabel('Extra information (optional)')
    .setPlaceholder('Anything else people should know')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(800)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(rules),
    new ActionRowBuilder().addComponents(image),
    new ActionRowBuilder().addComponents(extra)
  );

  return modal;
}

// ================= SETUP =================

async function setupGiveawaySystem(client) {
  const channel = await client.channels
    .fetch(HOST_CHANNEL_ID)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    console.error('Giveaway host channel not found.');
    return;
  }

  const messages = await channel.messages
    .fetch({ limit: 20 })
    .catch(() => null);

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

  const duration = app.durationMs || parseDuration(app.duration);

  if (!duration) {
    throw new Error('Invalid giveaway duration.');
  }

  const now = Date.now();
  const giveawayId = `${app.id}-${now}`;
  const engine = getWinnerEngine(app.winnerMode);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎁 ${safeText(app.title, 200)}`)
    .setDescription(
      `${safeText(app.details, 1000)}\n\n` +
      '━━━━━━━━━━━━━━━━━━━━\n' +
      `🎮 **Game:** ${safeText(app.game, 100)}\n` +
      `🏆 **Prize:** ${safeText(app.prize, 150)} (${safeText(app.prizeType, 100)})\n` +
      `🏷️ **Type:** ${safeText(app.giveawayType, 100)}\n` +
      `👑 **Host:** <@${app.userId}> (${safeText(app.username, 80)})\n` +
      `👥 **Winners:** ${app.winners}\n` +
      `🎯 **Winner method:** ${safeText(app.winnerMode, 150)}\n` +
      `📋 **Requirements:** ${safeText(app.requirements, 800)}\n` +
      `💬 **Competition rules:** ${safeText(app.competitionRules, 800)}\n` +
      `🗒️ **Extra info:** ${safeText(app.extra, 500)}\n` +
      `⏰ **Ends:** <t:${Math.floor((now + duration) / 1000)}:F>\n\n` +
      (
        engine === 'random'
          ? 'Press **ENTER GIVEAWAY** below to participate.'
          : 'Participate by following the competition rules above.'
      )
    )
    .setFooter({ text: 'Elyx Trading • Good luck!' })
    .setTimestamp(new Date(now));

  if (app.imageUrl) embed.setImage(app.imageUrl);

  const components = engine === 'random'
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway:enter:${giveawayId}`)
            .setLabel('ENTER GIVEAWAY')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎉')
        )
      ]
    : [];

  const message = await channel.send({
    content: `🎉 <@${app.userId}> is hosting a giveaway! @everyone`,
    embeds: [embed],
    components,
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
    engine,
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

  const channel = await client.channels
    .fetch(giveaway.channelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error('Giveaway channel not found while ending.');
  }

  let winners = [];

  const engine =
    giveaway.engine || getWinnerEngine(giveaway.winnerMode);

  if (engine === 'messages') {
    const counts = data.messageCounts[giveaway.id] || {};

    winners = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, giveaway.winners)
      .map(([userId]) => userId);
  } else if (engine === 'invites') {
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
    content:
      `🏆 **GIVEAWAY ENDED!**\n` +
      `🎁 **${safeText(giveaway.title, 150)}**\n` +
      `Winner(s): ${winnerText}`,
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

  giveaway.ended = true;
  giveaway.endedAt = Date.now();
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
  }, 30000);
}

// ================= INTERACTIONS =================

async function handleInteraction(interaction, client) {
  if (
    !interaction.isButton() &&
    !interaction.isModalSubmit()
  ) {
    return false;
  }

  const id = interaction.customId;

  if (!id.startsWith('giveaway:')) return false;

  // APPLY
  if (id === 'giveaway:apply' && interaction.isButton()) {
    drafts.set(interaction.user.id, {
      userId: interaction.user.id,
      username: interaction.user.username,
      guildId: interaction.guildId,
      createdAt: Date.now()
    });

    await interaction.showModal(firstModal());
    return true;
  }

  // FORM 1 SUBMITTED
  if (id === 'giveaway:form1' && interaction.isModalSubmit()) {
    const draft = drafts.get(interaction.user.id);

    if (!draft) {
      await interaction.reply({
        content: 'Application expired. Press APPLY again.',
        ephemeral: true
      });
      return true;
    }

    draft.game = interaction.fields.getTextInputValue('game').trim();
    draft.title = interaction.fields.getTextInputValue('title').trim();
    draft.prize = interaction.fields.getTextInputValue('prize').trim();
    draft.prizeType = interaction.fields.getTextInputValue('prizeType').trim();
    draft.details = interaction.fields.getTextInputValue('details').trim();

    drafts.set(interaction.user.id, draft);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway:openform2')
        .setLabel('CONTINUE TO STEP 2')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➡️')
    );

    await interaction.reply({
      content: '✅ Step 1 saved. Click below to enter your custom giveaway settings.',
      components: [row],
      ephemeral: true
    });

    return true;
  }

  // OPEN FORM 2
  if (id === 'giveaway:openform2' && interaction.isButton()) {
    if (!drafts.has(interaction.user.id)) {
      await interaction.reply({
        content: 'Application expired. Press APPLY again.',
        ephemeral: true
      });
      return true;
    }

    await interaction.showModal(secondModal());
    return true;
  }

  // FORM 2 SUBMITTED
  if (id === 'giveaway:form2' && interaction.isModalSubmit()) {
    const draft = drafts.get(interaction.user.id);

    if (!draft) {
      await interaction.reply({
        content: 'Application expired. Press APPLY again.',
        ephemeral: true
      });
      return true;
    }

    draft.giveawayType =
      interaction.fields.getTextInputValue('giveawayType').trim();

    draft.duration =
      interaction.fields.getTextInputValue('duration').trim();

    draft.winnerMode =
      interaction.fields.getTextInputValue('winnerMode').trim();

    const durationMs = parseDuration(draft.duration);

    if (!durationMs) {
      await interaction.reply({
        content:
          '❌ Invalid duration. Examples: `30 minutes`, `12 hours`, `5 days`, `2 weeks`. Maximum is 365 days.',
        ephemeral: true
      });
      return true;
    }

    const winnersText =
      interaction.fields.getTextInputValue('winners').trim();

    const winners = Number(winnersText);

    if (!Number.isInteger(winners) || winners < 1 || winners > 20) {
      await interaction.reply({
        content: '❌ Number of winners must be between 1 and 20.',
        ephemeral: true
      });
      return true;
    }

    draft.durationMs = durationMs;
    draft.winners = winners;
    draft.requirements =
      interaction.fields.getTextInputValue('requirements').trim();

    drafts.set(interaction.user.id, draft);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway:openform3')
        .setLabel('CONTINUE TO STEP 3')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➡️')
    );

    await interaction.reply({
      content:
        '✅ Step 2 saved. Add competition rules and an optional image in the final step.',
      components: [row],
      ephemeral: true
    });

    return true;
  }

  // OPEN FORM 3
  if (id === 'giveaway:openform3' && interaction.isButton()) {
    if (!drafts.has(interaction.user.id)) {
      await interaction.reply({
        content: 'Application expired. Press APPLY again.',
        ephemeral: true
      });
      return true;
    }

    await interaction.showModal(thirdModal());
    return true;
  }

  // FORM 3 SUBMITTED
  if (id === 'giveaway:form3' && interaction.isModalSubmit()) {
    const draft = drafts.get(interaction.user.id);

    if (!draft) {
      await interaction.reply({
        content: 'Application expired. Press APPLY again.',
        ephemeral: true
      });
      return true;
    }

    draft.competitionRules =
      interaction.fields.getTextInputValue('competitionRules').trim();

    draft.imageUrl = imageUrl(
      interaction.fields.getTextInputValue('image')
    );

    draft.extra =
      interaction.fields.getTextInputValue('extra').trim();

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
        content: 'Verification channel not found. Contact the server owner.',
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
      content: '✅ Application submitted! The owner will review it.',
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

      data.approvedUsers = [
        ...new Set([...data.approvedUsers, app.userId])
      ];

      saveData();

      await interaction.message.edit({
        embeds: [applicationEmbed(app)],
        components: [reviewRow(appId, 'approved')]
      });

      const user = await client.users
        .fetch(app.userId)
        .catch(() => null);

      if (user) {
        await user.send(
          `✅ Your giveaway **${safeText(app.title, 150)}** was approved and published!`
        ).catch(() => {});
      }
    } catch (error) {
      console.error('Giveaway publish error:', error);

      await interaction.followUp({
        content: 'Publishing failed. Check bot permissions and channel settings.',
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

    const user = await client.users
      .fetch(app.userId)
      .catch(() => null);

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

    if (
      (giveaway.engine || getWinnerEngine(giveaway.winnerMode)) !== 'random'
    ) {
      await interaction.reply({
        content: 'This competition uses message or invite tracking.',
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

async function handleGiveawayMessage(message) {
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
    const engine =
      giveaway.engine || getWinnerEngine(giveaway.winnerMode);

    if (
      giveaway.ended ||
      engine !== 'messages' ||
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

    counts[message.author.id] =
      (counts[message.author.id] || 0) + 1;
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
      new Map(invites.map(invite => [
        invite.code,
        invite.uses || 0
      ]))
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
    const oldInvites =
      inviteCache.get(member.guild.id) || new Map();

    const newInvites = await member.guild.invites.fetch();

    const usedInvite = newInvites.find(invite =>
      (invite.uses || 0) >
      (oldInvites.get(invite.code) || 0)
    );

    inviteCache.set(
      member.guild.id,
      new Map(newInvites.map(invite => [
        invite.code,
        invite.uses || 0
      ]))
    );

    if (!usedInvite || !usedInvite.inviter) return;

    const inviterId = usedInvite.inviter.id;

    for (const giveaway of Object.values(data.giveaways)) {
      const engine =
        giveaway.engine || getWinnerEngine(giveaway.winnerMode);

      if (
        giveaway.ended ||
        engine !== 'invites' ||
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
