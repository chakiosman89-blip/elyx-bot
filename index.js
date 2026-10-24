const {
  Client,
  GatewayIntentBits,
  Events
} = require('discord.js');

// ================= EXISTING GIVEAWAY =================
// giveaway.js ko change nahi karna.

const giveaway = require('./giveaway');

// ================= MINECRAFT SYSTEMS =================

const registerMinecraft = require('./minecraft');
const registerMinecraftEmojis = require('./minecraft-emojis');

// ================= CLIENT =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= REGISTER SYSTEMS =================

try {
  registerMinecraft(client);
  console.log('Minecraft gameplay registered.');

  registerMinecraftEmojis(client);
  console.log('Minecraft emoji system registered.');

} catch (error) {
  console.error('System registration failed:', error);
  process.exit(1);
}

// ================= BOT READY =================

client.once(Events.ClientReady, async (bot) => {
  console.log(`Elyx bot online: ${bot.user.tag}`);
  console.log('Initializing Minecraft and Giveaway systems...');

  try {
    // Existing Giveaway system
    await giveaway.setupGiveawaySystem(client);

    giveaway.startGiveawayTimer(client);

    // Cache invites for Giveaway tracking
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
    console.log('Minecraft emoji system initialized.');
    console.log('All systems are online.');

  } catch (error) {
    console.error('Startup initialization error:', error);
  }
});

// ================= INTERACTIONS =================

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Existing Giveaway interaction handling
    const handled = await giveaway.handleInteraction(
      interaction,
      client
    );

    if (handled) return;

    // Minecraft interactions are handled by minecraft.js.

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

// ================= DISCORD CLIENT ERRORS =================

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

// ================= PROCESS ERRORS =================

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
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
