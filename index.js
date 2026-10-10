// ============================================
// ELYX AI ULTIMATE + GCUBE PARTY
// Created for Elyx Trading
// Main File: index.js
// ============================================

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  Events,
  SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================
// CONNECT AI AND GCUBE SYSTEMS
// ============================================

const ai = require("./ai.js");
const gcube = require("./games.js");

// ============================================
// ENVIRONMENT CHECK
// ============================================

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN missing in environment variables.");
  process.exit(1);
}

// ============================================
// DISCORD CLIENT
// ============================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

// ============================================
// DATA STORAGE
// Preserve existing data.json
// ============================================

const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {
        aiEnabled: true,
        aiChannels: {},
        aiChats: {},
        aiMemory: {},
        settings: {}
      };
    }

    const saved = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      aiEnabled: true,
      aiChannels: {},
      aiChats: {},
      aiMemory: {},
      settings: {},
      ...saved
    };
  } catch (error) {
    console.error("❌ Could not load data.json:", error.message);
    process.exit(1);
  }
}

const data = loadData();

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
    console.error("❌ Could not save data.json:", error.message);
  }
}

// ============================================
// SLASH COMMAND REGISTRY
// ============================================

const commands = new Map();

function addCommand(command) {
  if (!command || typeof command.toJSON !== "function") {
    console.warn("⚠️ Invalid command skipped.");
    return;
  }

  const json = command.toJSON();

  if (!json.name) {
    console.warn("⚠️ Command without a name skipped.");
    return;
  }

  if (commands.has(json.name)) {
    console.warn(`⚠️ Duplicate command skipped: /${json.name}`);
    return;
  }

  commands.set(json.name, command);
}

console.log("✅ Elyx AI main file initialized.");
console.log("🎮 GCube Party module detected.");
// ============================================
// ELYX AI — SLASH COMMANDS
// ============================================

// AI ON / OFF
addCommand(
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Enable or disable Elyx AI chat")
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Enable or disable AI replies")
        .setRequired(true)
    )
);

// ASK AI
addCommand(
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask Elyx AI anything")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Your question for Elyx AI")
        .setRequired(true)
        .setMaxLength(3000)
    )
);

// AI MEMORY
addCommand(
  new SlashCommandBuilder()
    .setName("memory")
    .setDescription("Manage your Elyx AI memory")
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View your saved AI memories")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("clear")
        .setDescription("Delete your saved AI memories")
    )
);

// AI STATUS
addCommand(
  new SlashCommandBuilder()
    .setName("aistatus")
    .setDescription("Check Elyx AI service status")
);

// ============================================
// COMMAND DEFINITIONS COMPLETE
// ============================================

console.log("✅ Elyx AI command definitions loaded.");
// ============================================
// ELYX AI + GCUBE PARTY HANDLERS
// ============================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;

  try {
    // ========================================
    // AI COMMANDS
    // ========================================

    if (["ai", "ask", "memory", "aistatus"].includes(commandName)) {
      if (typeof ai.handleCommand !== "function") {
        return interaction.reply({
          content: "⚠️ AI module is not ready yet. Please try again later.",
          ephemeral: true
        });
      }

      await ai.handleCommand(interaction, {
        client,
        data,
        saveData
      });

      return;
    }

    // ========================================
    // GCUBE PARTY
    // ========================================

    if (commandName === "gcube") {
      const subcommand = interaction.options.getSubcommand();

      const gcubeHandlers = {
        balance: ["handleGCubeBalance", "handleGCube"],
        rewards: ["handleGCubeRewards"],
        invites: ["handleGCubeInvites", "handleGCubeInvite"],
        quests: ["handleGCubeQuests"],
        shop: ["handleGCubeShop"],
        collection: ["handleGCubeCollection"],
        profile: ["handleGCubeProfile"],
        top: ["handleGCubeTop"],
        showcase: ["handleGCubeShowcase"],
        history: ["handleGCubeHistory"]
      };

      const possibleHandlers = gcubeHandlers[subcommand] || [];

      const handlerName = possibleHandlers.find(
        name => typeof gcube[name] === "function"
      );

      if (!handlerName) {
        return interaction.reply({
          content:
            "⚠️ This GCube command handler is not available yet.",
          ephemeral: true
        });
      }

      await gcube[handlerName](interaction);
      return;
    }

  } catch (error) {
    console.error(
      `Command /${commandName} failed:`,
      error
    );

    const reply = {
      content: "❌ Something went wrong. Please try again.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

console.log("✅ AI and GCube interaction handlers loaded.");
