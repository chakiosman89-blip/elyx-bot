const {
Client,
GatewayIntentBits,
Events
} = require('discord.js');

// Existing Giveaway system — keep giveaway.js unchanged
const giveaway = require('./giveaway');

// Minecraft game
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

// Register Minecraft commands and buttons
registerMinecraft(client);

// ================= BOT READY =================

client.once(Events.ClientReady, async (bot) => {
console.log("Elyx bot online: ${bot.user.tag}");
console.log('Minecraft Mining + Giveaway system starting...');

try {
// Set up existing giveaway application panel
await giveaway.setupGiveawaySystem(client);

// Start existing giveaway ending timer
giveaway.startGiveawayTimer(client);

// Cache server invites for the existing giveaway system
for (const guild of client.guilds.cache.values()) {
  await giveaway.cacheGuildInvites(guild);
}

console.log('Giveaway system initialized.');
console.log('Minecraft Mining system initialized.');

} catch (error) {
console.error('Startup error:', error);
}
});

// ================= GIVEAWAY INTERACTIONS =================

client.on(Events.InteractionCreate, async (interaction) => {
try {
const handled = await giveaway.handleInteraction(
interaction,
client
);

if (handled) return;

} catch (error) {
console.error('Giveaway interaction error:', error);

if (interaction.isRepliable()) {
  const reply = {
    content: 'Giveaway action failed. Please try again.',
    ephemeral: true
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(reply).catch(() => {});
  } else {
    await interaction.reply(reply).catch(() => {});
  }
}

}
});

// ================= GIVEAWAY MESSAGE TRACKING =================

client.on(Events.MessageCreate, async (message) => {
try {
await giveaway.handleGiveawayMessage(message, client);
} catch (error) {
console.error('Giveaway message tracking error:', error);
}
});

// ================= GIVEAWAY INVITE TRACKING =================

client.on(Events.GuildMemberAdd, async (member) => {
try {
await giveaway.handleMemberJoin(member);
} catch (error) {
console.error('Giveaway invite tracking error:', error);
}
});

// ================= LOGIN =================

if (!process.env.DISCORD_TOKEN) {
console.error('ERROR: DISCORD_TOKEN is missing from hosting environment.');
process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch((error) => {
console.error('Bot login failed:', error);
});
