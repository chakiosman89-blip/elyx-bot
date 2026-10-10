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
// ============================================
// ELYX AI — NORMAL CHAT HANDLER
// ============================================

client.on(Events.MessageCreate, async message => {
  try {
    // Ignore bots
    if (message.author.bot) return;

    if (!client.user) return;

    // Check if user mentions Elyx AI
    const mentioned = message.mentions.has(client.user.id);

    // Check if user replied to Elyx AI
    let repliedToBot = false;

    if (message.reference && message.reference.messageId) {
      const repliedMessage = await message.fetchReference()
        .catch(() => null);

      if (
        repliedMessage &&
        repliedMessage.author.id === client.user.id
      ) {
        repliedToBot = true;
      }
    }

    // Reply only when mentioned or when replying to the bot
    if (!mentioned && !repliedToBot) return;

    // AI disabled check
    if (!data.aiEnabled) {
      await message.reply(
        "⚠️ Elyx AI is currently disabled."
      );
      return;
    }

    // Remove bot mention from the message
    const cleanMessage = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    if (!cleanMessage) {
      await message.reply(
        "👋 Haan bhai! Kuch poochna hai toh message kar."
      );
      return;
    }

    await message.channel.sendTyping();

    const reply = await ai.generateReply({
      data,
      userId: message.author.id,
      guildId: message.guildId || "DM",
      username: message.author.username,
      message: cleanMessage,
      saveData
    });

    const safeReply = String(reply || "Bhai, abhi reply nahi bana.")
      .slice(0, 1900);

    await message.reply(safeReply);

  } catch (error) {
    console.error("AI chat error:", error.message);

    await message.reply(
      "❌ AI reply mein error aaya. Thodi der baad try kar."
    ).catch(() => {});
  }
});

console.log("✅ AI normal chat handler loaded.");

// ============================================
// REGISTER SLASH COMMANDS + START BOT
// ============================================

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    const commandList = [...commands.values()]
      .map(command => command.toJSON());

    if (process.env.GUILD_ID) {
      // Register commands in your Discord server
      await rest.put(
        Routes.applicationGuildCommands(
          client.user.id,
          process.env.GUILD_ID
        ),
        { body: commandList }
      );

      console.log("✅ Server slash commands registered.");
    } else {
      // Register commands globally
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commandList }
      );

      console.log(
        "✅ Global commands registered. They may take time to appear."
      );
    }

    console.log(`📋 Registered ${commandList.length} commands.`);
  } catch (error) {
    console.error(
      "❌ Slash command registration failed:",
      error.message
    );
  }
});

// ============================================
// LOGIN
// ============================================

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("❌ Discord login failed:", error.message);
});

