const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const HOST_CHANNEL_ID = '1560887434328281190';
const VERIFY_CHANNEL_ID = '1560888011523100803';
const ANNOUNCEMENTS_CHANNEL_ID = '1551437304470573216';

const OWNER_ID = '1535048066875527198';

const DATA_FILE = path.join(__dirname, 'giveaway-data.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {
      panelMessageId: null,
      applications: {},
      approvedUsers: []
    };
  }
}

const data = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function isOwner(interaction) {
  return interaction.user.id === OWNER_ID;
}

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Elyx Trading | Giveaway Hosting')
    .setDescription(
      'Want to host a giveaway in Elyx Trading?\n\n' +
      'Submit an application using the button below. ' +
      'Your application will be reviewed by the server owner.\n\n' +
      '**Application process**\n' +
      '1. Submit your giveaway details.\n' +
      '2. Wait for the approval decision.\n' +
      '3. If approved, post your giveaway in this channel.\n' +
      '4. The bot will publish it in the giveaway announcements channel.'
    )
    .setFooter({ text: 'Elyx Trading • Giveaway Management' });
}

function applicationEmbed(app) {
  return new EmbedBuilder()
    .setColor(
      app.status === 'approved' ? 0x57F287 :
      app.status === 'denied' ? 0xED4245 :
      app.status === 'revoked' ? 0xED4245 :
      0xFEE75C
    )
    .setTitle('Giveaway Hosting Application')
    .addFields(
      { name: 'Applicant', value: `<@${app.userId}>`, inline: true },
      { name: 'Host Name', value: app.hostName, inline: true },
      { name: 'Prize', value: app.prize },
      { name: 'Giveaway Details', value: app.details },
      { name: 'Duration', value: app.duration, inline: true },
      { name: 'Number of Winners', value: app.winners, inline: true },
      { name: 'Entry Requirements', value: app.requirements },
      { name: 'Status', value: app.status.toUpperCase() }
    )
    .setTimestamp();
}

function reviewButtons(appId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:approve:${appId}`)
      .setLabel('APPROVE')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`giveaway:deny:${appId}`)
      .setLabel('DENY')
      .setStyle(ButtonStyle.Danger)
  );
}

async function notifyUser(client, userId, text) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(text);
  } catch {
    console.log(`Could not DM giveaway applicant ${userId}`);
  }
}

// Startup: channel permissions and application panel
async function setupGiveawaySystem(client) {
  try {
    const host = await client.channels.fetch(HOST_CHANNEL_ID);
    const verify = await client.channels.fetch(VERIFY_CHANNEL_ID);

    if (!host || !verify || !host.isTextBased() || !verify.isTextBased()) {
      throw new Error('Giveaway channels not found or not text channels.');
    }

    const guild = host.guild;

    // Only approved members can send messages in the host channel.
    await host.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false
    });

    await host.permissionOverwrites.edit(client.user.id, {
      ViewChannel: true,
      SendMessages: true,
      ManageMessages: true,
      EmbedLinks: true,
      AttachFiles: true
    });

    // Keep verification hidden from @everyone.
    await verify.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: false
    });

    await verify.permissionOverwrites.edit(OWNER_ID, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    let panel = null;

    if (data.panelMessageId) {
      panel = await host.messages.fetch(data.panelMessageId).catch(() => null);
    }

    if (!panel) {
      panel = await host.send({
        embeds: [panelEmbed()],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('giveaway:apply')
              .setLabel('APPLY FOR GIVEAWAY')
              .setStyle(ButtonStyle.Primary)
          )
        ]
      });

      data.panelMessageId = panel.id;
      saveData();
    }

    console.log('Giveaway approval system ready.');
  } catch (error) {
    console.error('Giveaway setup error:', error);
  }
}

async function handleInteraction(interaction, client) {
  // Application form
  if (
    interaction.isButton() &&
    interaction.customId === 'giveaway:apply'
  ) {
    if (data.approvedUsers.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'You are already approved to host giveaways.',
        ephemeral: true
      });
    }

    const existing = Object.values(data.applications).find(
      app => app.userId === interaction.user.id &&
        app.status === 'pending'
    );

    if (existing) {
      return interaction.reply({
        content: 'You already have a pending application.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('giveaway:application-form')
      .setTitle('Giveaway Hosting Application');

    const fields = [
      ['prize', 'Prize', 'What will you give away?', 100],
      ['details', 'Giveaway Details', 'Describe your giveaway', 500],
      ['duration', 'Duration', 'Example: 24 hours', 100],
      ['winners', 'Number of Winners', 'Example: 1', 20],
      ['requirements', 'Entry Requirements', 'Example: Join the server', 300]
    ];

    modal.addComponents(
      ...fields.map(([id, label, placeholder, max]) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setPlaceholder(placeholder)
            .setStyle(
              id === 'details' || id === 'requirements'
                ? TextInputStyle.Paragraph
                : TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(max)
        )
      )
    );

    await interaction.showModal(modal);
    return true;
  }

  // Form submitted
  if (
    interaction.isModalSubmit() &&
    interaction.customId === 'giveaway:application-form'
  ) {
    await interaction.deferReply({ ephemeral: true });

    const appId = `${Date.now().toString(36)}-${interaction.user.id}`;

    const app = {
      userId: interaction.user.id,
      hostName: interaction.user.username,
      prize: interaction.fields.getTextInputValue('prize'),
      details: interaction.fields.getTextInputValue('details'),
      duration: interaction.fields.getTextInputValue('duration'),
      winners: interaction.fields.getTextInputValue('winners'),
      requirements: interaction.fields.getTextInputValue('requirements'),
      status: 'pending',
      submittedAt: Date.now(),
      reviewMessageId: null
    };

    const verify = await client.channels.fetch(VERIFY_CHANNEL_ID);

    const reviewMessage = await verify.send({
      embeds: [applicationEmbed(app)],
      components: [reviewButtons(appId)]
    });

    app.reviewMessageId = reviewMessage.id;
    data.applications[appId] = app;
    saveData();

    await interaction.editReply(
      'Your application has been submitted. Wait for the owner to review it.'
    );

    return true;
  }

  if (!interaction.isButton()) return false;

  const parts = interaction.customId.split(':');

  if (parts[0] !== 'giveaway') return false;

  const action = parts[1];
  const appId = parts[2];

  // Owner-only review controls
  if (['approve', 'deny', 'revoke'].includes(action) && !isOwner(interaction)) {
    await interaction.reply({
      content: 'Only the server owner can manage giveaway approvals.',
      ephemeral: true
    });
    return true;
  }

  if (action === 'approve' || action === 'deny') {
    const app = data.applications[appId];

    if (!app || app.status !== 'pending') {
      await interaction.reply({
        content: 'This application has already been reviewed or is unavailable.',
        ephemeral: true
      });
      return true;
    }

    if (action === 'approve') {
      const host = await client.channels.fetch(HOST_CHANNEL_ID);

      try {
        await host.permissionOverwrites.edit(app.userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        });
      } catch (error) {
        console.error('Could not grant host permission:', error);
        await interaction.reply({
          content: 'Could not grant permission. Check the bot permissions.',
          ephemeral: true
        });
        return true;
      }

      app.status = 'approved';

      if (!data.approvedUsers.includes(app.userId)) {
        data.approvedUsers.push(app.userId);
      }

      saveData();

      await interaction.update({
        embeds: [applicationEmbed(app)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`giveaway:revoke:${app.userId}`)
              .setLabel('REVOKE HOST ACCESS')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });

      await notifyUser(
        client,
        app.userId,
        'Your Elyx Trading giveaway hosting application has been approved. You can now post your giveaway in #host-a-giveaway.'
      );
    } else {
      app.status = 'denied';
      saveData();

      await interaction.update({
        embeds: [applicationEmbed(app)],
        components: []
      });

      await notifyUser(
        client,
        app.userId,
        'Your Elyx Trading giveaway hosting application was not approved.'
      );
    }

    return true;
  }

  if (action === 'revoke') {
    const userId = appId;
    const host = await client.channels.fetch(HOST_CHANNEL_ID);

    data.approvedUsers = data.approvedUsers.filter(id => id !== userId);

    await host.permissionOverwrites.delete(userId).catch(() => {});
    saveData();

    await interaction.update({
      content: `Host access revoked for <@${userId}>.`,
      components: []
    });

    await notifyUser(
      client,
      userId,
      'Your Elyx Trading giveaway hosting access has been revoked.'
    );

    return true;
  }

  return false;
}

// Publish approved member's message to announcements
async function handleGiveawayMessage(message, client) {
  if (!message.guild || message.author.bot) return;
  if (message.channel.id !== HOST_CHANNEL_ID) return;

  if (!data.approvedUsers.includes(message.author.id)) {
    await message.delete().catch(() => {});
    return;
  }

  try {
    const announcement = await client.channels.fetch(
      ANNOUNCEMENTS_CHANNEL_ID
    );

    if (!announcement || !announcement.isTextBased()) {
      throw new Error('Announcements channel not found.');
    }

    const content = [
      `**Giveaway Host:** ${message.author.username}`,
      message.content || ''
    ].filter(Boolean).join('\n\n');

    const files = [...message.attachments.values()].map(file => file.url);

    await announcement.send({
      content: content.slice(0, 2000),
      embeds: message.embeds.slice(0, 10),
      files,
      allowedMentions: { parse: [] }
    });

    await message.delete();
  } catch (error) {
    console.error('Giveaway publish error:', error);
    await message.reply(
      'I could not publish this giveaway. Please contact the server owner.'
    ).catch(() => {});
  }
}

module.exports = {
  setupGiveawaySystem,
  handleInteraction,
  handleGiveawayMessage
};
