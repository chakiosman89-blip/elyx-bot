const {
  Client,
  GatewayIntentBits,
  Events
} = require('discord.js');

// Existing Giveaway system — keep giveaway.js unchanged
const giveaway = require('./giveaway');

// Minecraft game system
const registerMinecraft = require('./minecraft');

// ================= CLIENT =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= MINECRAFT REGISTRATION =================

try {
  registerMinecraft(client);
  console.log('Minecraft commands registered.');
} catch (error) {
  console.error('Minecraft registration error:', error);
  process.exit(1);
}

// ================= BOT READY =================

client.once(Events.ClientReady, async (bot) => {
  console.log(`Elyx bot online: ${bot.user.tag}`);
  console.log('Minecraft + Giveaway systems starting...');

  try {
    // Initialize existing Giveaway system
    await giveaway.setupGiveawaySystem(client);

    // Start existing Giveaway ending timer
    giveaway.startGiveawayTimer(client);

    // Cache server invites for Giveaway tracking
    for (const guild of client.guilds.cache.values()) {
      try {
        await giveaway.cacheGuildInvites(guild);
      } catch (error) {
        console.error(
          `Invite cache failed for ${guild.name}:`,
          error.message
        );
      }
    }

    console.log('Giveaway system initialized.');
    console.log('Minecraft system initialized.');
    console.log('All systems are online.');

  } catch (error) {
    console.error('Startup initialization error:', error);
  }
});

// ================= INTERACTIONS =================

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Let the existing Giveaway system handle its interactions
    const handled = await giveaway.handleInteraction(
      interaction,
      client
    );

    if (handled) return;

    // Minecraft buttons and interactions are handled
    // by the registered Minecraft module.
  } catch (error) {
    console.error('Interaction error:', error);

    if (!interaction.isRepliable()) return;

    const reply = {
      content: 'Something went wrong. Please try again.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// ================= MESSAGE TRACKING =================

client.on(Events.MessageCreate, async (message) => {
  try {
    await giveaway.handleGiveawayMessage(message, client);
  } catch (error) {
    console.error('Giveaway message tracking error:', error);
  }
});

// ================= MEMBER JOIN / INVITE TRACKING =================

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await giveaway.handleMemberJoin(member);
  } catch (error) {
    console.error('Giveaway invite tracking error:', error);
  }
});

// ================= ERROR HANDLING =================

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// ================= LOGIN =================

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error(
    'ERROR: DISCORD_TOKEN is missing from hosting environment.'
  );
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('Bot login failed:', error);
  process.exit(1);
});
