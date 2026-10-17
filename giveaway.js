const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// CHANNELS
const HOST_CHANNEL_ID = '1560887434328281190';
const VERIFY_CHANNEL_ID = '1560888011523100803';
const ANNOUNCEMENTS_CHANNEL_ID = '1551437304470573216';

// OWNER
const OWNER_ID = '1535048066875527198';

// DATA
const DATA_FILE = path.join(__dirname, 'giveaway-data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

      return {
        panelMessageId: data.panelMessageId || null,
        applications: data.applications || {},
        approvedUsers: Array.isArray(data.approvedUsers)
          ? data.approvedUsers
          : []
      };
    }
  } catch (error) {
    console.error('Giveaway data read error:', error);
  }

  return {
    panelMessageId: null,
    applications: {},
    approvedUsers: []
  };
}

let data = loadData();

function saveData() {
  try {
    const tempFile = `${DATA_FILE}.tmp`;

    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, DATA_FILE);
  } catch (error) {
    console.error('Giveaway data save error:', error);
  }
}

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎁 Host a Giveaway')
    .setDescription(
      'Want to host a giveaway in Elyx Trading?\n\n' +
      'Click the button below and submit your application.\n\n' +
      '📋 Your application will be reviewed by the server owner.\n' +
      '✅ Once approved, you can post your giveaway.\n' +
      '📢 Approved giveaways will be published in the announcements channel.'
    )
    .setFooter({ text: 'Elyx Trading • Giveaway Hosting' });
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

function applicationEmbed(app) {
  const statusColors = {
    pending: 0xF1C40F,
    approved: 0x2ECC71,
    denied: 0xE74C3C,
    revoked: 0x95A5A6
  };

  return new EmbedBuilder()
    .setColor(statusColors[app.status] || 0x5865F2)
    .setTitle('🎁 Giveaway Hosting Application')
    .addFields(
      {
        name: '👤 Applicant',
        value: `<@${app.userId}>`,
        inline: true
      },
      {
        name: '📌 Status',
        value: app.status.toUpperCase(),
        inline: true
      },
      {
        name: '🏆 Prize',
        value: app.prize
      },
      {
        name: '📝 Details',
        value: app.details
      },
      {
        name: '⏰ Duration',
        value: app.duration,
        inline: true
      },
      {
        name: '👥 Winners',
        value: app.winners,
        inline: true
      },
      {
        name: '📋 Entry Requirements',
        value: app.requirements
      }
    )
    .setTimestamp(new Date(app.createdAt));
}

function reviewRow(appId, status) {
  if (status === 'pending') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:approve:${appId}`)
        .setLabel('APPROVE')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),

      new ButtonBuilder()
        .setCustomId(`giveaway:deny:${appId}`)
        .setLabel('DENY')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );
  }

  if (status === 'approved') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:revoke:${appId}`)
        .setLabel('REVOKE HOST ACCESS')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway:closed')
      .setLabel(status.toUpperCase())
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

async function notifyUser(client, userId, message) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(message);
  } catch (error) {
    console.log(`Could not DM giveaway applicant ${userId}:`, error.message);
  }
}

async function setupGiveawaySystem(client) {
  const guild = client.guilds.cache.find(g =>
    g.channels.cache.has(HOST_CHANNEL_ID) &&
    g.channels.cache.has(VERIFY_CHANNEL_ID) &&
    g.channels.cache.has(ANNOUNCEMENTS_CHANNEL_ID)
  );

  if (!guild) {
    throw new Error(
      'Giveaway channels not found. Check all three channel IDs and bot server.'
    );
  }

  // Fetch actual GuildMember objects to prevent InvalidType errors.
  const owner = await guild.members.fetch(OWNER_ID);
  const botMember = await guild.members.fetchMe();

  const host = await guild.channels.fetch(HOST_CHANNEL_ID);
  const verify = await guild.channels.fetch(VERIFY_CHANNEL_ID);
  const announcements = await guild.channels.fetch(
    ANNOUNCEMENTS_CHANNEL_ID
  );

  for (const channel of [host, verify, announcements]) {
    if (!channel || !channel.isTextBased() ||
        channel.type !== ChannelType.GuildText) {
      throw new Error('One of the giveaway channels is missing or is not a text channel.');
    }
  }

  // HOST CHANNEL: only approved hosts and admins can send messages.
  await host.permissionOverwrites.edit(guild.roles.everyone, {
    SendMessages: false
  });

  await host.permissionOverwrites.edit(botMember, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    ManageMessages: true,
    EmbedLinks: true,
    AttachFiles: true
  });

  // PRIVATE VERIFICATION CHANNEL.
  await verify.permissionOverwrites.edit(guild.roles.everyone, {
    ViewChannel: false
  });

  await verify.permissionOverwrites.edit(owner, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true
  });

  await verify.permissionOverwrites.edit(botMember, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    EmbedLinks: true
  });

  // ANNOUNCEMENTS: bot publishes approved giveaways.
  await announcements.permissionOverwrites.edit(guild.roles.everyone, {
    SendMessages: false
  });

  await announcements.permissionOverwrites.edit(botMember, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    EmbedLinks: true,
    AttachFiles: true
  });

  // Reuse existing application panel when possible.
  let panelMessage = null;

  if (data.panelMessageId) {
    try {
      panelMessage = await host.messages.fetch(data.panelMessageId);
    } catch {
      panelMessage = null;
    }
  }

  if (!panelMessage) {
    const recentMessages = await host.messages.fetch({ limit: 50 });

    panelMessage = recentMessages.find(message =>
      message.author.id === client.user.id &&
      message.components.some(row =>
        row.components.some(component =>
          component.customId === 'giveaway:apply'
        )
      )
    );
  }

  if (!panelMessage) {
    panelMessage = await host.send({
      embeds: [panelEmbed()],
      components: [panelRow()]
    });
  }

  data.panelMessageId = panelMessage.id;
  saveData();

  console.log('Giveaway panel and channel permissions configured.');
}

async function handleInteraction(interaction, client) {
  // APPLY BUTTON
  if (
    interaction.isButton() &&
    interaction.customId === 'giveaway:apply'
  ) {
    const existingApplication = Object.values(data.applications).find(
      app =>
        app.userId === interaction.user.id &&
        app.status === 'pending'
    );

    if (existingApplication) {
      await interaction.reply({
        content: '⏳ You already have a pending giveaway application.',
        ephemeral: true
      });

      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId('giveaway:application')
      .setTitle('Giveaway Hosting Application');

    const prize = new TextInputBuilder()
      .setCustomId('prize')
      .setLabel('What is the giveaway prize?')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true)
      .setPlaceholder('Example: Discord Nitro');

    const details = new TextInputBuilder()
      .setCustomId('details')
      .setLabel('Giveaway details')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(800)
      .setRequired(true)
      .setPlaceholder('Describe your giveaway.');

    const duration = new TextInputBuilder()
      .setCustomId('duration')
      .setLabel('Giveaway duration')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(50)
      .setRequired(true)
      .setPlaceholder('Example: 24 hours');

    const winners = new TextInputBuilder()
      .setCustomId('winners')
      .setLabel('Number of winners')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(20)
      .setRequired(true)
      .setPlaceholder('Example: 1');

    const requirements = new TextInputBuilder()
      .setCustomId('requirements')
      .setLabel('Entry requirements')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(500)
      .setRequired(true)
      .setPlaceholder('Example: Join the server and react.');

    modal.addComponents(
      new ActionRowBuilder().addComponents(prize),
      new ActionRowBuilder().addComponents(details),
      new ActionRowBuilder().addComponents(duration),
      new ActionRowBuilder().addComponents(winners),
      new ActionRowBuilder().addComponents(requirements)
    );

    await interaction.showModal(modal);
    return true;
  }

  // APPLICATION FORM SUBMISSION
  if (
    interaction.isModalSubmit() &&
    interaction.customId === 'giveaway:application'
  ) {
    await interaction.deferReply({ ephemeral: true });

    const verify = await client.channels.fetch(VERIFY_CHANNEL_ID);

    if (!verify || !verify.isTextBased()) {
      await interaction.editReply(
        '❌ Verification channel not found. Please contact the owner.'
      );
      return true;
    }

    const appId = `${Date.now()}_${interaction.user.id}`;

    const app = {
      userId: interaction.user.id,
      prize: interaction.fields.getTextInputValue('prize').trim(),
      details: interaction.fields.getTextInputValue('details').trim(),
      duration: interaction.fields.getTextInputValue('duration').trim(),
      winners: interaction.fields.getTextInputValue('winners').trim(),
      requirements: interaction.fields.getTextInputValue('requirements').trim(),
      status: 'pending',
      createdAt: Date.now(),
      reviewMessageId: null
    };

    try {
      const reviewMessage = await verify.send({
        embeds: [applicationEmbed(app)],
        components: [reviewRow(appId, 'pending')]
      });

      app.reviewMessageId = reviewMessage.id;
      data.applications[appId] = app;
      saveData();

      await interaction.editReply(
        '✅ Your application has been submitted! Please wait for the owner to review it.'
      );
    } catch (error) {
      console.error('Giveaway application error:', error);

      await interaction.editReply(
        '❌ Application could not be submitted. Please try again later.'
      );
    }

    return true;
  }

  // OTHER BUTTONS
  if (!interaction.isButton()) return false;

  const parts = interaction.customId.split(':');

  if (parts[0] !== 'giveaway') return false;
  if (parts[1] === 'closed') {
    await interaction.reply({
      content: 'This application has already been reviewed.',
      ephemeral: true
    });
    return true;
  }

  const action = parts[1];
  const appId = parts.slice(2).join(':');

  // Only the server owner can review applications.
  if (['approve', 'deny', 'revoke'].includes(action)) {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({
        content: '❌ Only the server owner can manage giveaway applications.',
        ephemeral: true
      });
      return true;
    }
  }

  const app = data.applications[appId];

  if (!app) {
    await interaction.reply({
      content: '❌ Application not found. It may have expired or been removed.',
      ephemeral: true
    });
    return true;
  }

  if (action === 'approve') {
    if (app.status !== 'pending') {
      await interaction.reply({
        content: 'This application has already been reviewed.',
        ephemeral: true
      });
      return true;
    }

    const guild = interaction.guild;
    const host = await client.channels.fetch(HOST_CHANNEL_ID);
    const member = await guild.members.fetch(app.userId);

    await host.permissionOverwrites.edit(member, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    });

    app.status = 'approved';

    if (!data.approvedUsers.includes(app.userId)) {
      data.approvedUsers.push(app.userId);
    }

    saveData();

    await interaction.update({
      embeds: [applicationEmbed(app)],
      components: [reviewRow(appId, 'approved')]
    });

    await notifyUser(
      client,
      app.userId,
      '🎉 Your giveaway hosting application in Elyx Trading has been APPROVED!\n\n' +
      `Prize: ${app.prize}\n` +
      `Duration: ${app.duration}\n\n` +
      'You can now post your giveaway in #host-a-giveaway. ' +
      'The bot will publish it in the giveaway announcements channel.'
    );

    return true;
  }

  if (action === 'deny') {
    if (app.status !== 'pending') {
      await interaction.reply({
        content: 'This application has already been reviewed.',
        ephemeral: true
      });
      return true;
    }

    app.status = 'denied';
    saveData();

    await interaction.update({
      embeds: [applicationEmbed(app)],
      components: [reviewRow(appId, 'denied')]
    });

    await notifyUser(
      client,
      app.userId,
      '❌ Your giveaway hosting application in Elyx Trading was denied by the server owner.'
    );

    return true;
  }

  if (action === 'revoke') {
    if (app.status !== 'approved') {
      await interaction.reply({
        content: 'This host is not currently approved.',
        ephemeral: true
      });
      return true;
    }

    const guild = interaction.guild;
    const host = await client.channels.fetch(HOST_CHANNEL_ID);
    const member = await guild.members.fetch(app.userId);

    await host.permissionOverwrites.delete(member).catch(() => null);

    data.approvedUsers = data.approvedUsers.filter(
      id => id !== app.userId
    );

    app.status = 'revoked';
    saveData();

    await interaction.update({
      embeds: [applicationEmbed(app)],
      components: [reviewRow(appId, 'revoked')]
    });

    await notifyUser(
      client,
      app.userId,
      'ℹ️ Your giveaway hosting permission in Elyx Trading has been revoked.'
    );

    return true;
  }

  return false;
}

async function handleGiveawayMessage(message) {
  if (!message.guild || message.author.bot) return;

  if (message.channel.id !== HOST_CHANNEL_ID) return;

  // Owner can host giveaways without applying.
  const isOwner = message.author.id === OWNER_ID;
  const isApproved = data.approvedUsers.includes(message.author.id);

  if (!isOwner && !isApproved) {
    try {
      await message.delete();
    } catch (error) {
      console.error('Could not delete unauthorized giveaway post:', error.message);
    }

    try {
      await message.author.send(
        '❌ You need approval before posting a giveaway in Elyx Trading. ' +
        'Please use the APPLY FOR GIVEAWAY button in #host-a-giveaway.'
      );
    } catch {
      // User may have DMs disabled.
    }

    return;
  }

  const announcementChannel = await message.client.channels.fetch(
    ANNOUNCEMENTS_CHANNEL_ID
  );

  if (!announcementChannel || !announcementChannel.isTextBased()) {
    console.error('Giveaway announcements channel not found.');
    return;
  }

  try {
    const payload = {
      content: message.content || undefined,
      allowedMentions: { parse: [] }
    };

    if (message.embeds.length > 0) {
      payload.embeds = message.embeds.map(embed => embed.toJSON());
    }

    if (message.attachments.size > 0) {
      payload.files = [...message.attachments.values()].map(file => file.url);
    }

    // Avoid sending an empty message.
    if (
      !payload.content &&
      (!payload.embeds || payload.embeds.length === 0) &&
      (!payload.files || payload.files.length === 0)
    ) {
      payload.content = `🎁 Giveaway hosted by ${message.author}.`;
    }

    await announcementChannel.send(payload);

    // Delete the original only after successful publishing.
    await message.delete();
  } catch (error) {
    console.error('Giveaway publishing error:', error);

    try {
      await message.author.send(
        '⚠️ Your giveaway could not be published. Please contact the server owner.'
      );
    } catch {
      // User may have DMs disabled.
    }
  }
}

module.exports = {
  setupGiveawaySystem,
  handleInteraction,
  handleGiveawayMessage
};
