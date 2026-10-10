// ============================================
// ELYX TRADING BOT — PART 1/15
// Main setup, AI, and data storage
// ============================================

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
 
OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const gcube = require("./games.js");

// Stop early if the Discord token is missing.
if (!process.env.DISCORD_TOKEN) {
  console.error("ERROR: DISCORD_TOKEN is missing.");
  process.exit(1);
}

// ============================================
// DISCORD CLIENT
// ============================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User
  ]
});

// ============================================
// GROQ AI
// Add GROQ_API_KEY in FadeHost environment
// variables if you want AI features.
// ============================================

const ai = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1"
    })
  : null;

const AI_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// ============================================
// DATA STORAGE
// ============================================

const DATA_FILE = path.join(__dirname, "data.json");

const defaultData = {
  aiEnabled: true,
  aiChannels: {},
  autoReplies: {},
  aiChats: {},
  warnings: {},
  welcomeChannel: {},
  welcomeEnabled: {},
  goodbyeChannel: {},
  goodbyeEnabled: {},
  autoRole: {},
  autoRoleEnabled: {},
  levels: {},
  economy: {},
  invites: {},
  inviteCache: {},
  tickets: {},
  suggestions: {},
  kbc: {
    questions: {},
    games: {}
  },
  giveaways: {},
  polls: {},
  reminders: {},
  settings: {}
};

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(defaultData));
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );

      // Preserve existing saved data while adding new defaults.
      const merged = {
        ...cloneDefaultData(),
        ...saved
      };

      for (const key of Object.keys(defaultData)) {
        if (
          defaultData[key] &&
          typeof defaultData[key] === "object" &&
          !Array.isArray(defaultData[key])
        ) {
          merged[key] = {
            ...defaultData[key],
            ...(saved[key] || {})
          };
        }
      }

      return merged;
    }
  } catch (error) {
    console.error(
      "Could not load data.json:",
      error.message
    );
  }

  return cloneDefaultData();
}

let data = loadData();

function saveData() {
  try {
    const tempFile = `${DATA_FILE}.tmp`;

    fs.writeFileSync(
      tempFile,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    fs.renameSync(tempFile, DATA_FILE);
  } catch (error) {
    console.error(
      "Could not save bot data:",
      error.message
    );
  }
}

// ============================================
// SHARED HELPERS
// ============================================

const commands = [];

function addCommand(command) {
  commands.push(command);
}

function pick(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  return items[Math.floor(Math.random() * items.length)];
}

function getUserKey(guildId, userId) {
  return `${guildId}_${userId}`;
}

function getWarnings(guildId, userId) {
  return data.warnings[getUserKey(guildId, userId)] || [];
}

function formatDuration(milliseconds) {
  const seconds = Math.max(
    0,
    Math.floor(milliseconds / 1000)
  );

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }

  const hours = Math.floor(minutes / 60);

  return `${hours}h ${minutes % 60}m`;
}

function getGuildData(store, guildId, fallback = {}) {
  if (!store[guildId]) {
    store[guildId] = { ...fallback };
  }

  return store[guildId];
}

function safeText(value, maxLength = 1900) {
  return String(value ?? "").slice(0, maxLength);
}

console.log("Elyx Trading: Part 1 loaded.");
// ============================================
// PART 2/15 — SLASH COMMANDS: AI + GENERAL
// ============================================

addCommand(
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show Elyx Trading bot commands")
);

addCommand(
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot response time")
);

addCommand(
  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information")
);

addCommand(
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show information about a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to check")
        .setRequired(false)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a member's avatar")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member whose avatar you want")
        .setRequired(false)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Enable or disable automatic AI replies")
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Enable automatic AI replies?")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
);

addCommand(
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask the Elyx AI a question")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("What do you want to ask?")
        .setRequired(true)
        .setMaxLength(1000)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text into another language")
    .addStringOption(option =>
      option
        .setName("text")
        .setDescription("Text to translate")
        .setRequired(true)
        .setMaxLength(1500)
    )
    .addStringOption(option =>
      option
        .setName("language")
        .setDescription("Target language, e.g. Hindi or Gujarati")
        .setRequired(true)
        .setMaxLength(50)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("setreply")
    .setDescription("Set a custom automatic reply")
    .addStringOption(option =>
      option
        .setName("trigger")
        .setDescription("Word or phrase that triggers the reply")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName("reply")
        .setDescription("Reply the bot should send")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
);

addCommand(
  new SlashCommandBuilder()
    .setName("delreply")
    .setDescription("Delete a custom automatic reply")
    .addStringOption(option =>
      option
        .setName("trigger")
        .setDescription("Trigger word or phrase to delete")
        .setRequired(true)
        .setMaxLength(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
);

addCommand(
  new SlashCommandBuilder()
    .setName("replies")
    .setDescription("Show custom automatic replies")
);

console.log("Elyx Trading: Part 2 loaded.");
// ============================================
// PART 3/15 — MODERATION COMMANDS
// ============================================

// KICK
addCommand(
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member to kick")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason for the kick")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
);

// BAN
addCommand(
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member to ban")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason for the ban")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
);

// UNBAN
addCommand(
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user using their Discord ID")
    .addStringOption(option =>
      option.setName("user_id")
        .setDescription("Discord user ID")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason for unbanning")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
);

// TIMEOUT
addCommand(
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member to timeout")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("minutes")
        .setDescription("Timeout duration in minutes")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason for timeout")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
);

// REMOVE TIMEOUT
addCommand(
  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member to untimeout")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
);

// CLEAR MESSAGES
addCommand(
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete recent messages in this channel")
    .addIntegerOption(option =>
      option.setName("amount")
        .setDescription("Number of messages to delete (1–100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
);

// WARN
addCommand(
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Give a member a warning")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member to warn")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason for the warning")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
);

// VIEW WARNINGS
addCommand(
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a member's warnings")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member whose warnings to view")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
);

// LOCK CHANNEL
addCommand(
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
);

// UNLOCK CHANNEL
addCommand(
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
);

// SLOWMODE
addCommand(
  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set the current channel's slowmode")
    .addIntegerOption(option =>
      option.setName("seconds")
        .setDescription("Delay between messages (0–21600 seconds)")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
);

// ADD ROLE
addCommand(
  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Give a role to a member")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member who receives the role")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName("role")
        .setDescription("Role to give")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
);

// REMOVE ROLE
addCommand(
  new SlashCommandBuilder()
    .setName("removerole")
    .setDescription("Remove a role from a member")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member who loses the role")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName("role")
        .setDescription("Role to remove")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
);

// CHANGE NICKNAME
addCommand(
  new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("Change a member's nickname")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member whose nickname changes")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("nickname")
        .setDescription("New nickname")
        .setRequired(true)
        .setMaxLength(32)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
);

console.log("Elyx Trading: Part 3 loaded.");
// ============================================
// PART 4/15 — WELCOME, GOODBYE & AUTO ROLE
// ============================================

// SET WELCOME CHANNEL
addCommand(
  new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set the welcome channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for welcome messages")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
);

// ENABLE / DISABLE WELCOME
addCommand(
  new SlashCommandBuilder()
    .setName("welcometoggle")
    .setDescription("Enable or disable welcome messages")
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Enable welcome messages?")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
);

// SET GOODBYE CHANNEL
addCommand(
  new SlashCommandBuilder()
    .setName("setgoodbye")
    .setDescription("Set the goodbye channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for goodbye messages")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
);

// ENABLE / DISABLE GOODBYE
addCommand(
  new SlashCommandBuilder()
    .setName("goodbyetoggle")
    .setDescription("Enable or disable goodbye messages")
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Enable goodbye messages?")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
);

// SET AUTO ROLE
addCommand(
  new SlashCommandBuilder()
    .setName("setautorole")
    .setDescription("Choose the role new members receive")
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Role to give new members")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
);

// ENABLE / DISABLE AUTO ROLE
addCommand(
  new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Enable or disable automatic roles")
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Enable automatic roles?")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
);

// ============================================
// PART 5/15 — FUN COMMANDS
// ============================================

addCommand(
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin")
);

addCommand(
  new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Roll a dice")
    .addIntegerOption(option =>
      option
        .setName("sides")
        .setDescription("Number of sides (2–100)")
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a question")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Your question")
        .setRequired(true)
        .setMaxLength(500)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("choose")
    .setDescription("Choose between options")
    .addStringOption(option =>
      option
        .setName("options")
        .setDescription("Options separated by commas")
        .setRequired(true)
        .setMaxLength(1000)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Play Rock Paper Scissors")
    .addStringOption(option =>
      option
        .setName("choice")
        .setDescription("Choose rock, paper, or scissors")
        .setRequired(true)
        .addChoices(
          { name: "Rock", value: "rock" },
          { name: "Paper", value: "paper" },
          { name: "Scissors", value: "scissors" }
        )
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("hug")
    .setDescription("Send someone a friendly hug")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Who do you want to hug?")
        .setRequired(true)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Get a random friendship compatibility score")
    .addUserOption(option =>
      option
        .setName("user1")
        .setDescription("First user")
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName("user2")
        .setDescription("Second user")
        .setRequired(true)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a simple poll")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Poll question")
        .setRequired(true)
        .setMaxLength(250)
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a server suggestion")
    .addStringOption(option =>
      option
        .setName("idea")
        .setDescription("Your suggestion")
        .setRequired(true)
        .setMaxLength(1000)
    )
);

console.log("Elyx Trading: Part 5 loaded.");
console.log("Elyx Trading: Part 4 loaded.");
// ============================================
// PART 6/15 — ECONOMY COMMANDS
// ============================================

// CHECK BALANCE
addCommand(
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another member's balance")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member whose balance to check")
        .setRequired(false)
    )
);

// DAILY REWARD
addCommand(
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Collect your daily coin reward")
);

// WORK FOR COINS
addCommand(
  new SlashCommandBuilder()
    .setName("work")
    .setDescription("Work to earn coins")
);

// PAY ANOTHER MEMBER
addCommand(
  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Send coins to another member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member receiving the coins")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Number of coins to send")
        .setMinValue(1)
        .setRequired(true)
    )
);

// ECONOMY LEADERBOARD
addCommand(
  new SlashCommandBuilder()
    .setName("richest")
    .setDescription("Show the richest members")
);

// BET COINS ON A COIN FLIP
addCommand(
  new SlashCommandBuilder()
    .setName("bet")
    .setDescription("Bet coins on a coin flip")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Number of coins to bet")
        .setMinValue(1)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("choice")
        .setDescription("Choose heads or tails")
        .setRequired(true)
        .addChoices(
          { name: "Heads", value: "heads" },
          { name: "Tails", value: "tails" }
        )
    )
);

console.log("Elyx Trading: Part 6 loaded.");
// ============================================
// PART 7/15 — XP, LEVELS & PROFILE
// ============================================

// USER RANK
addCommand(
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your or another member's level")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member whose rank to check")
        .setRequired(false)
    )
);

// LEVEL LEADERBOARD
addCommand(
  new SlashCommandBuilder()
    .setName("levels")
    .setDescription("Show the server level leaderboard")
);

// USER PROFILE
addCommand(
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your or another member's profile")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member whose profile to view")
        .setRequired(false)
    )
);

// GIVE A MEMBER REP
addCommand(
  new SlashCommandBuilder()
    .setName("rep")
    .setDescription("Give a member a reputation point")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member receiving reputation")
        .setRequired(true)
    )
);

// CHECK BOT INFORMATION
addCommand(
  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Show Elyx Trading bot information")
);

// CHECK SERVER MEMBER COUNT
addCommand(
  new SlashCommandBuilder()
    .setName("membercount")
    .setDescription("Show the server member count")
);

console.log("Elyx Trading: Part 7 loaded.");
// ============================================
// PART 8/15 — TICKETS, GIVEAWAYS & SUGGESTIONS
// ============================================

// CREATE TICKET
addCommand(
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create a support ticket")
);

// CLOSE TICKET
addCommand(
  new SlashCommandBuilder()
    .setName("close-ticket")
    .setDescription("Close the current support ticket")
);

// SET TICKET SUPPORT ROLE
addCommand(
  new SlashCommandBuilder()
    .setName("ticket-role")
    .setDescription("Set the support role for tickets")
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Role allowed to manage tickets")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// START GIVEAWAY
addCommand(
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Start a giveaway")
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("Giveaway prize")
        .setRequired(true)
        .setMaxLength(200)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Giveaway duration in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10080)
    )
    .addIntegerOption(option =>
      option
        .setName("winners")
        .setDescription("Number of winners")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// END GIVEAWAY
addCommand(
  new SlashCommandBuilder()
    .setName("endgiveaway")
    .setDescription("End a giveaway early")
    .addStringOption(option =>
      option
        .setName("message_id")
        .setDescription("Giveaway message ID")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// PICK A RANDOM WINNER
addCommand(
  new SlashCommandBuilder()
    .setName("pickwinner")
    .setDescription("Pick a random member from the server")
);

// SET SUGGESTION CHANNEL
addCommand(
  new SlashCommandBuilder()
    .setName("setsuggestions")
    .setDescription("Set the suggestion channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for suggestions")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

console.log("Elyx Trading: Part 8 loaded.");
// ============================================
// PART 9/15 — INVITES & SERVER TOOLS
// ============================================

// INVITE LEADERBOARD
addCommand(
  new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Check your or another member's invites")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member whose invites to check")
        .setRequired(false)
    )
);

// INVITE LEADERBOARD
addCommand(
  new SlashCommandBuilder()
    .setName("invite-leaderboard")
    .setDescription("Show the invite leaderboard")
);

// CREATE SERVER INVITE
addCommand(
  new SlashCommandBuilder()
    .setName("createinvite")
    .setDescription("Create a server invite")
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Invite expiry in minutes; 0 means never")
        .setMinValue(0)
        .setMaxValue(10080)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("uses")
        .setDescription("Maximum uses; 0 means unlimited")
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.CreateInstantInvite
    )
);

// SERVER INFORMATION
addCommand(
  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Show information about this server")
);

// SHOW CHANNEL INFORMATION
addCommand(
  new SlashCommandBuilder()
    .setName("channelinfo")
    .setDescription("Show information about a channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel to inspect")
        .setRequired(false)
    )
);

// SHOW ROLE INFORMATION
addCommand(
  new SlashCommandBuilder()
    .setName("roleinfo")
    .setDescription("Show information about a role")
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Role to inspect")
        .setRequired(true)
    )
);

// SHOW SERVER EMOJI LIST
addCommand(
  new SlashCommandBuilder()
    .setName("emojis")
    .setDescription("Show custom emojis in this server")
);

// SHOW SERVER ROLES
addCommand(
  new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Show the server's roles")
);

console.log("Elyx Trading: Part 9 loaded.");
// ============================================
// PART 10/15 — ELYX KBC COMMANDS
// ============================================

// START KBC
addCommand(
  new SlashCommandBuilder()
    .setName("kbc")
    .setDescription("Start the Elyx KBC quiz")
);

// ANSWER A QUESTION
addCommand(
  new SlashCommandBuilder()
    .setName("kbc-answer")
    .setDescription("Submit your KBC answer")
    .addStringOption(option =>
      option
        .setName("answer")
        .setDescription("Choose your answer")
        .setRequired(true)
        .addChoices(
          { name: "A", value: "A" },
          { name: "B", value: "B" },
          { name: "C", value: "C" },
          { name: "D", value: "D" }
        )
    )
);

// ADD A KBC QUESTION
addCommand(
  new SlashCommandBuilder()
    .setName("kbc-add-question")
    .setDescription("Add a question to Elyx KBC")
    .addIntegerOption(option =>
      option
        .setName("number")
        .setDescription("Question number (1–12)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(12)
    )
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Question text")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption(option =>
      option
        .setName("a")
        .setDescription("Option A")
        .setRequired(true)
        .setMaxLength(300)
    )
    .addStringOption(option =>
      option
        .setName("b")
        .setDescription("Option B")
        .setRequired(true)
        .setMaxLength(300)
    )
    .addStringOption(option =>
      option
        .setName("c")
        .setDescription("Option C")
        .setRequired(true)
        .setMaxLength(300)
    )
    .addStringOption(option =>
      option
        .setName("d")
        .setDescription("Option D")
        .setRequired(true)
        .setMaxLength(300)
    )
    .addStringOption(option =>
      option
        .setName("correct")
        .setDescription("Correct answer")
        .setRequired(true)
        .addChoices(
          { name: "A", value: "A" },
          { name: "B", value: "B" },
          { name: "C", value: "C" },
          { name: "D", value: "D" }
        )
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// VIEW KBC QUESTIONS
addCommand(
  new SlashCommandBuilder()
    .setName("kbc-questions")
    .setDescription("Show how many KBC questions are configured")
);

// REMOVE A KBC QUESTION
addCommand(
  new SlashCommandBuilder()
    .setName("kbc-remove-question")
    .setDescription("Remove a KBC question")
    .addIntegerOption(option =>
      option
        .setName("number")
        .setDescription("Question number (1–12)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(12)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// RESET YOUR KBC GAME
addCommand(
  new SlashCommandBuilder()
    .setName("kbc-reset")
    .setDescription("Reset your current KBC game")
);

// KBC LIFELINES
addCommand(
  new SlashCommandBuilder()
    .setName("kbc-lifeline")
    .setDescription("Use a KBC lifeline")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Choose a lifeline")
        .setRequired(true)
        .addChoices(
          { name: "50:50", value: "5050" },
          { name: "Audience Poll", value: "audience" },
          { name: "Phone a Friend", value: "phone" }
        )
    )
);

console.log("Elyx Trading: Part 10 loaded.");
// ============================================
// PART 11/15 — UTILITY COMMANDS
// ============================================

// REMINDERS
addCommand(
  new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder")
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Reminder delay in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10080)
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("What should I remind you about?")
        .setRequired(true)
        .setMaxLength(500)
    )
);

// TEXT REVERSE
addCommand(
  new SlashCommandBuilder()
    .setName("reverse")
    .setDescription("Reverse a piece of text")
    .addStringOption(option =>
      option
        .setName("text")
        .setDescription("Text to reverse")
        .setRequired(true)
        .setMaxLength(1000)
    )
);

// TEXT COUNT
addCommand(
  new SlashCommandBuilder()
    .setName("textcount")
    .setDescription("Count characters and words")
    .addStringOption(option =>
      option
        .setName("text")
        .setDescription("Text to count")
        .setRequired(true)
        .setMaxLength(2000)
    )
);

// RANDOM NUMBER
addCommand(
  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Generate a random number")
    .addIntegerOption(option =>
      option
        .setName("minimum")
        .setDescription("Minimum number")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("maximum")
        .setDescription("Maximum number")
        .setRequired(true)
    )
);

// CALCULATOR
addCommand(
  new SlashCommandBuilder()
    .setName("calculate")
    .setDescription("Calculate a basic math expression")
    .addStringOption(option =>
      option
        .setName("expression")
        .setDescription("Example: (12 + 8) * 2")
        .setRequired(true)
        .setMaxLength(100)
    )
);

// BOT UPTIME
addCommand(
  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Show how long the bot has been online")
);

// BOT LATENCY
addCommand(
  new SlashCommandBuilder()
    .setName("latency")
    .setDescription("Check bot and Discord latency")
);

console.log("Elyx Trading: Part 11 loaded.");
// ============================================
// PART 12/15 — ANNOUNCEMENTS & SERVER SETTINGS
// ============================================

// ANNOUNCEMENT
addCommand(
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send a server announcement")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for the announcement")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Announcement message")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// SEND A MESSAGE AS THE BOT
addCommand(
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot send a message")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Message to send")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    )
);

// SET MODERATION LOG CHANNEL
addCommand(
  new SlashCommandBuilder()
    .setName("setlogs")
    .setDescription("Set the moderation log channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for moderation logs")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// VIEW SERVER SETTINGS
addCommand(
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("View Elyx Trading bot settings")
);

// SET LEVEL-UP ANNOUNCEMENT CHANNEL
addCommand(
  new SlashCommandBuilder()
    .setName("setlevelchannel")
    .setDescription("Set the level-up announcement channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for level-up messages")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// SET SUGGESTION REVIEW CHANNEL
addCommand(
  new SlashCommandBuilder()
    .setName("setsuggestionreview")
    .setDescription("Set the suggestion review channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for reviewing suggestions")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
);

// CLEAR ALL WARNINGS FOR A MEMBER
addCommand(
  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear a member's warnings")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member whose warnings to clear")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    )
);

// SHOW BOT INVITE LINK
addCommand(
  new SlashCommandBuilder()
    .setName("botinvite")
    .setDescription("Get an invite link for this bot")
);

console.log("Elyx Trading: Part 12 loaded.");
// ============================================
// PART 13/15 — AUTOMATIC EVENTS
// AI CHAT, AUTO REPLIES, WELCOME, AUTOROLE, XP
// ============================================

// AUTOMATIC CHAT REPLIES + XP
client.on(Events.MessageCreate, async message => {
  try {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const content = message.content.trim();
    const userKey = getUserKey(guildId, userId);

    // ------------------------------
    // XP AND LEVEL SYSTEM
    // ------------------------------
    if (content.length > 0) {
      if (!data.levels[userKey]) {
        data.levels[userKey] = {
          xp: 0,
          level: 0,
          lastMessage: 0
        };
      }

      const profile = data.levels[userKey];
      const now = Date.now();

      // Give XP once every 60 seconds
      if (now - (profile.lastMessage || 0) >= 60000) {
        profile.lastMessage = now;
        profile.xp = (profile.xp || 0) +
          Math.floor(Math.random() * 11) + 10;

        const requiredXP = (profile.level + 1) * 100;

        if (profile.xp >= requiredXP) {
          profile.xp -= requiredXP;
          profile.level += 1;

          message.channel.send(
            `🎉 ${message.author} reached **Level ${profile.level}**!`
          ).catch(() => {});
        }

        saveData();
      }
    }

    // ------------------------------
    // CUSTOM AUTOMATIC REPLIES
    // ------------------------------
    const guildReplies = data.autoReplies[guildId] || {};
    const lowerContent = content.toLowerCase();

    for (const [trigger, reply] of Object.entries(guildReplies)) {
      if (
        trigger &&
        lowerContent.includes(trigger.toLowerCase()) &&
        typeof reply === "string" &&
        reply.length > 0
      ) {
        await message.reply({
          content: safeText(reply),
          allowedMentions: { repliedUser: false }
        });
        return;
      }
    }

    // ------------------------------
    // AI CHAT
    // Requires GROQ_API_KEY for AI
    // ------------------------------
    if (!data.aiEnabled || !ai) return;

    const allowedChannels = data.aiChannels[guildId];

    // If channels are configured, reply only there.
    if (
      Array.isArray(allowedChannels) &&
      allowedChannels.length > 0 &&
      !allowedChannels.includes(message.channel.id)
    ) {
      return;
    }

    // Reply when bot is mentioned or someone replies to the bot.
    const mentioned = message.mentions.has(client.user);

    const repliedToBot =
      message.reference &&
      message.reference.messageId;

    let isReplyToBot = false;

    if (repliedToBot) {
      try {
        const referencedMessage =
          await message.channel.messages.fetch(
            message.reference.messageId
          );

        isReplyToBot =
          referencedMessage.author.id === client.user.id;
      } catch {
        isReplyToBot = false;
      }
    }

    if (!mentioned && !isReplyToBot) return;

    const prompt = content
      .replaceAll(`<@${client.user.id}>`, "")
      .replaceAll(`<@!${client.user.id}>`, "")
      .trim();

    if (!prompt) {
      await message.reply(
        "Hey! 👋 Ask me something and I'll try to help."
      );
      return;
    }

    await message.channel.sendTyping();

    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Elyx, a friendly Discord server assistant. " +
            "Reply naturally, casually, and helpfully. " +
            "Keep answers clear and concise."
        },
        {
          role: "user",
          content: prompt.slice(0, 3000)
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim();

    if (answer) {
      await message.reply({
        content: safeText(answer),
        allowedMentions: { repliedUser: false }
      });
    }
  } catch (error) {
    console.error("Message event error:", error.message);
  }
});

// ------------------------------
// WELCOME + AUTOMATIC ROLE
// ------------------------------
client.on(Events.GuildMemberAdd, async member => {
  try {
    const guildId = member.guild.id;

    // AUTOMATIC ROLE
    if (data.autoRoleEnabled[guildId]) {
      const roleId = data.autoRole[guildId];
      const role = roleId
        ? member.guild.roles.cache.get(roleId)
        : null;

      if (role && role.editable) {
        await member.roles.add(role).catch(error => {
          console.error("Auto-role error:", error.message);
        });
      }
    }

    // WELCOME MESSAGE
    if (data.welcomeEnabled[guildId]) {
      const channelId = data.welcomeChannel[guildId];
      const channel = channelId
        ? member.guild.channels.cache.get(channelId)
        : null;

      if (channel && channel.isTextBased()) {
        await channel.send({
          content:
            `👋 Welcome ${member} to **${member.guild.name}**!\n` +
            `You're member **#${member.guild.memberCount}**. Enjoy your stay!`,
          allowedMentions: {
            users: [member.id]
          }
        });
      }
    }
  } catch (error) {
    console.error("Member join event error:", error.message);
  }
});

// ------------------------------
// GOODBYE MESSAGE
// ------------------------------
client.on(Events.GuildMemberRemove, async member => {
  try {
    const guildId = member.guild.id;

    if (!data.goodbyeEnabled[guildId]) return;

    const channelId = data.goodbyeChannel[guildId];
    const channel = channelId
      ? member.guild.channels.cache.get(channelId)
      : null;

    if (channel && channel.isTextBased()) {
      await channel.send(
        `👋 **${member.user.username}** has left the server.`
      );
    }
  } catch (error) {
    console.error("Member leave event error:", error.message);
  }
});

console.log("Elyx Trading: Part 13 loaded.");
// ============================================
// PART 14/15 — BOT STARTUP & BASIC COMMANDS
// ============================================

// REGISTER ALL SLASH COMMANDS
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_TOKEN
    );

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands.map(command => command.toJSON())
      }
    );

    console.log("✅ Slash commands registered successfully.");
  } catch (error) {
    console.error(
      "❌ Slash command registration failed:",
      error
    );
  }
});

// BASIC + FUN COMMAND HANDLERS
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    // AI ON/OFF
if (commandName === "ai") {
  const enabled = interaction.options.getBoolean("enabled");
  data.aiEnabled = enabled;
  saveData();

  return interaction.reply(
    `🤖 Automatic AI replies are now **${enabled ? "enabled" : "disabled"}**.`
  );
}

// ASK AI
if (commandName === "ask") {
  if (!ai) {
    return interaction.reply({
      content: "❌ GROQ_API_KEY missing in FadeHost.",
      ephemeral: true
    });
  }

  await interaction.deferReply();

  try {
    const question = interaction.options.getString("question");

    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are Elyx, a friendly and helpful Discord assistant. Give clear, concise answers."
        },
        {
          role: "user",
          content: question.slice(0, 3000)
        }
      ],
      max_tokens: 500
    });

    const answer = completion.choices?.[0]?.message?.content?.trim();

    return interaction.editReply(
      answer || "I couldn't generate a reply. Try again."
    );
  } catch (error) {
    console.error("AI command error:", error.message);
    return interaction.editReply(
      "❌ AI error. Check the FadeHost console."
    );
  }
}
    // HELP
    if (commandName === "help") {
      const commandList = commands
        .map(command => `\`/${command.name}\``)
        .join(", ");

      return interaction.reply({
        content: `🤖 **Elyx Trading — Commands**\n\n${commandList}`,
        allowedMentions: { parse: [] }
      });
    }

    // PING
    if (commandName === "ping") {
      return interaction.reply(
        `🏓 Pong! Latency: **${client.ws.ping}ms**`
      );
    }

    // BOT INFO
    if (commandName === "botinfo") {
      return interaction.reply({
        content:
          `🤖 **Elyx Trading Bot**\n` +
          `🏓 Ping: ${client.ws.ping}ms\n` +
          `👥 Servers: ${client.guilds.cache.size}\n` +
          `⏱️ Uptime: ${formatDuration(client.uptime || 0)}`,
        allowedMentions: { parse: [] }
      });
    }

    // SERVER INFO
    if (
      commandName === "serverinfo" ||
      commandName === "server"
    ) {
      if (!interaction.guild) {
        return interaction.reply({
          content: "Use this command inside a server.",
          ephemeral: true
        });
      }

      const guild = interaction.guild;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(
              guild.iconURL({ size: 256 }) || null
            )
            .addFields(
              {
                name: "Members",
                value: `${guild.memberCount}`,
                inline: true
              },
              {
                name: "Channels",
                value: `${guild.channels.cache.size}`,
                inline: true
              },
              {
                name: "Roles",
                value: `${guild.roles.cache.size}`,
                inline: true
              },
              {
                name: "Server ID",
                value: guild.id
              }
            )
            .setTimestamp()
        ]
      });
    }

    // USER INFO
    if (commandName === "userinfo") {
      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`👤 ${user.username}`)
            .setThumbnail(user.displayAvatarURL())
            .addFields(
              {
                name: "User ID",
                value: user.id
              },
              {
                name: "Account Created",
                value: `<t:${Math.floor(
                  user.createdTimestamp / 1000
                )}:D>`
              }
            )
        ]
      });
    }

    // AVATAR
    if (commandName === "avatar") {
      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${user.username}'s Avatar`)
            .setImage(user.displayAvatarURL({ size: 1024 }))
        ]
      });
    }

    // MEMBER COUNT
    if (commandName === "membercount") {
      return interaction.reply(
        `👥 This server has **${interaction.guild?.memberCount ?? 0} members**.`
      );
    }

    // COINFLIP
    if (commandName === "coinflip") {
      const result = Math.random() < 0.5 ? "Heads" : "Tails";

      return interaction.reply(`🪙 The coin landed on **${result}**!`);
    }

    // DICE
    if (commandName === "dice") {
      const sides = interaction.options.getInteger("sides") || 6;
      const result = Math.floor(Math.random() * sides) + 1;

      return interaction.reply(
        `🎲 You rolled **${result}** on a ${sides}-sided dice!`
      );
    }

    // MAGIC 8 BALL
    if (commandName === "8ball") {
      const answers = [
        "Definitely!",
        "Looks good to me!",
        "Maybe!",
        "Ask me again later.",
        "Probably not.",
        "I don't think so.",
        "Absolutely not!"
      ];

      return interaction.reply(
        `🎱 ${pick(answers)}`
      );
    }

    // CHOOSE
    if (commandName === "choose") {
      const options = interaction.options
        .getString("options")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

      if (options.length < 2) {
        return interaction.reply({
          content: "Give me at least two options separated by commas.",
          ephemeral: true
        });
      }

      return interaction.reply(
        `🤔 I choose: **${pick(options)}**`
      );
    }

    // ROCK PAPER SCISSORS
    if (commandName === "rps") {
      const player = interaction.options.getString("choice");
      const bot = pick(["rock", "paper", "scissors"]);

      let result;

      if (player === bot) {
        result = "It's a draw!";
      } else if (
        (player === "rock" && bot === "scissors") ||
        (player === "paper" && bot === "rock") ||
        (player === "scissors" && bot === "paper")
      ) {
        result = "You win! 🎉";
      } else {
        result = "I win! 😎";
      }

      return interaction.reply(
        `🪨 You: **${player}**\n` +
        `🤖 Elyx: **${bot}**\n\n${result}`
      );
    }

    // FRIENDLY HUG
    if (commandName === "hug") {
      const user = interaction.options.getUser("user");

      return interaction.reply(
        `🫂 ${interaction.user} sends ${user} a friendly hug!`
      );
    }

    // FRIENDSHIP SCORE
    if (commandName === "ship") {
      const user1 = interaction.options.getUser("user1");
      const user2 = interaction.options.getUser("user2");
      const score = Math.floor(Math.random() * 101);

      return interaction.reply(
        `🤝 **Friendship Score**\n` +
        `${user1.username} + ${user2.username}\n` +
        `💯 Compatibility: **${score}%**`
      );
    }

    // REVERSE TEXT
    if (commandName === "reverse") {
      const value = interaction.options.getString("text");

      return interaction.reply({
        content: safeText([...value].reverse().join("")),
        allowedMentions: { parse: [] }
      });
    }

    // COUNT TEXT
    if (commandName === "textcount") {
      const value = interaction.options.getString("text");
      const words = value.trim()
        ? value.trim().split(/\s+/).length
        : 0;

      return interaction.reply(
        `📝 Characters: **${value.length}**\n` +
        `🔤 Words: **${words}**`
      );
    }

    // RANDOM NUMBER
    if (commandName === "random") {
      const min = interaction.options.getInteger("minimum");
      const max = interaction.options.getInteger("maximum");

      if (min > max) {
        return interaction.reply({
          content: "Minimum cannot be greater than maximum.",
          ephemeral: true
        });
      }

      if (max - min > 1000000000) {
        return interaction.reply({
          content: "The range is too large.",
          ephemeral: true
        });
      }

      return interaction.reply(
        `🎲 Random number: **${Math.floor(
          Math.random() * (max - min + 1)
        ) + min}**`
      );
    }
// KBC — VIEW QUESTIONS
if (commandName === "kbc-questions") {
const questions = data.kbc?.questions || {};
const count = Object.keys(questions).length;

  return interaction.reply(
    `📚 **Elyx KBC**\nQuestions configured: **${count}/12**`
  );
}

// KBC — ADD QUESTION
if (commandName === "kbc-add-question") {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: "❌ You need Manage Server permission.",
      ephemeral: true
    });
  }

  const number = interaction.options.getInteger("number");
  const question = interaction.options.getString("question");
  const a = interaction.options.getString("a");
  const b = interaction.options.getString("b");
  const c = interaction.options.getString("c");
  const d = interaction.options.getString("d");
  const correct = interaction.options.getString("correct");

  if (!data.kbc) data.kbc = { questions: {}, games: {} };
  if (!data.kbc.questions) data.kbc.questions = {};
  if (!data.kbc.games) data.kbc.games = {};

  data.kbc.questions[number] = {
    question,
    options: { A: a, B: b, C: c, D: d },
    correct
  };

  saveData();

  return interaction.reply(
    `✅ KBC Question **${number}/12** saved successfully!`
  );
  }
    // KBC — START GAME
if (commandName === "kbc") {
const questions = data.kbc?.questions || {};
const first = questions[1];

  if (!first) {
    return interaction.reply({
      content: "❌ No KBC questions found! An admin must add questions first using `/kbc-add-question`.",
      ephemeral: true
    });
  }

  if (!data.kbc.games) data.kbc.games = {};

  data.kbc.games[interaction.user.id] = {
    question: 1,
    prize: 0,
    lifelines: ["5050", "audience", "phone"],
    guildId: interaction.guildId
  };

  saveData();

  return interaction.reply(
    `🎙️ **ELYX KBC — Question 1/12**\n\n` +
    `**${first.question}**\n\n` +
    `🇦 ${first.options.A}\n` +
    `🇧 ${first.options.B}\n` +
    `🇨 ${first.options.C}\n` +
    `🇩 ${first.options.D}\n\n` +
    `Answer with \`/kbc-answer\`.`
  );
}

// KBC — SUBMIT ANSWER
if (commandName === "kbc-answer") {
  const game = data.kbc?.games?.[interaction.user.id];

  if (!game) {
    return interaction.reply({
      content: "❌ Start a game first using `/kbc`.",
      ephemeral: true
    });
  }

  const questions = data.kbc.questions || {};
  const current = questions[game.question];

  if (!current) {
    return interaction.reply({
      content: "❌ This question is missing. Ask an admin to add it.",
      ephemeral: true
    });
  }

  const answer = interaction.options.getString("answer");

  if (answer !== current.correct) {
    delete data.kbc.games[interaction.user.id];
    saveData();

    return interaction.reply(
      `❌ Wrong answer! The correct answer was **${current.correct}**.\n` +
      `Game over! Use \`/kbc\` to play again.`
    );
  }

  game.prize = game.question;
  game.question++;

  const next = questions[game.question];

  if (!next) {
    delete data.kbc.games[interaction.user.id];
    saveData();

    return interaction.reply(
      `🎉 **Congratulations!** You completed all configured questions!`
    );
  }

  saveData();

  return interaction.reply(
    `✅ Correct answer!\n\n` +
    `🎙️ **ELYX KBC — Question ${game.question}/12**\n\n` +
    `**${next.question}**\n\n` +
    `🇦 ${next.options.A}\n` +
    `🇧 ${next.options.B}\n` +
    `🇨 ${next.options.C}\n` +
    `🇩 ${next.options.D}`
  );
}

// KBC — RESET GAME
if (commandName === "kbc-reset") {
  if (data.kbc?.games) {
    delete data.kbc.games[interaction.user.id];
  }

  saveData();

  return interaction.reply(
    "🔄 Your KBC game has been reset. Use `/kbc` to start again."
  );
}

// KBC — LIFELINE
if (commandName === "kbc-lifeline") {
  const game = data.kbc?.games?.[interaction.user.id];

  if (!game) {
    return interaction.reply({
      content: "❌ Start a game first using `/kbc`.",
      ephemeral: true
    });
  }

  const type = interaction.options.getString("type");

  if (!game.lifelines.includes(type)) {
    return interaction.reply({
      content: "❌ You have already used this lifeline.",
      ephemeral: true
    });
  }

  game.lifelines = game.lifelines.filter(item => item !== type);

  const current = data.kbc.questions?.[game.question];

  if (!current) {
    return interaction.reply({
      content: "❌ Current question not found.",
      ephemeral: true
    });
  }

  saveData();

  if (type === "5050") {
    const wrong = ["A", "B", "C", "D"]
      .filter(item => item !== current.correct);

    const removed = wrong.sort(() => Math.random() - 0.5).slice(0, 2);

    return interaction.reply(
      `🃏 **50:50 Lifeline**\n` +
      `Correct answer: **${current.correct}**\n` +
      `Removed options: **${removed.join(", ")}**`
    );
  }

  if (type === "audience") {
    return interaction.reply(
      `📊 **Audience Poll**\n` +
      `🇦 ${current.correct === "A" ? "79%" : "7%"}\n` +
      `🇧 ${current.correct === "B" ? "79%" : "7%"}\n` +
      `🇨 ${current.correct === "C" ? "79%" : "7%"}\n` +
      `🇩 ${current.correct === "D" ? "79%" : "7%"}`
    );
  }

  return interaction.reply(
    `📞 **Phone a Friend**\nYour friend thinks the answer might be **${current.correct}**.`
  );
  }
    // UPTIME
    if (commandName === "uptime") {
      return interaction.reply(
        `⏱️ I've been online for **${formatDuration(client.uptime || 0)}**.`
      );
    }

    // LATENCY
    if (commandName === "latency") {
      return interaction.reply(
        `🏓 Discord latency: **${client.ws.ping}ms**`
      );
    }

  } catch (error) {
    console.error(
      `Command /${commandName} failed:`,
      error
    );

    const reply = {
      content: "❌ Something went wrong while running this command.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

console.log("Elyx Trading: Part 14 loaded.");
client.login(process.env.DISCORD_TOKEN).catch(console.error);
