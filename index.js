// ============================================
// ELYX TRADING — AI + GCUBE PARTY + AI IMAGES
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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

// ============================================
// AI DATA STORAGE
// ============================================

const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    let saved = {};

    if (fs.existsSync(DATA_FILE)) {
      saved = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );
    }

    return {
      aiEnabled: true,
      aiChannels: {},
      aiChats: {},
      aiMemory: {},
      settings: {},
      ...saved
    };
  } catch (error) {
    console.error(
      "❌ Could not load data.json:",
      error.message
    );
    process.exit(1);
  }
}

const data = loadData();

function saveData() {
  try {
    const tempFile = `${DATA_FILE}.tmp`;
    let existingData = {};

    if (fs.existsSync(DATA_FILE)) {
      existingData = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );
    }

    const safeData = {
      ...existingData,
      ...data
    };

    if (existingData.gcubeParty) {
      safeData.gcubeParty = existingData.gcubeParty;
    }

    fs.writeFileSync(
      tempFile,
      JSON.stringify(safeData, null, 2),
      "utf8"
    );

    fs.renameSync(tempFile, DATA_FILE);
  } catch (error) {
    console.error(
      "❌ Could not save data.json:",
      error.message
    );
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
    console.warn(
      `⚠️ Duplicate command skipped: /${json.name}`
    );
    return;
  }

  commands.set(json.name, command);
}

// ============================================
// AI COMMANDS
// ============================================

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

addCommand(
  new SlashCommandBuilder()
    .setName("memory")
    .setDescription("Manage your Elyx AI memory")
    .addSubcommand(sub =>
      sub
        .setName("view")
        .setDescription("View your saved AI memories")
    )
    .addSubcommand(sub =>
      sub
        .setName("clear")
        .setDescription("Delete your saved AI memories")
    )
);

addCommand(
  new SlashCommandBuilder()
    .setName("aistatus")
    .setDescription("Check Elyx AI service status")
);

// ============================================
// GCUBE PARTY COMMAND
// ============================================

if (
  gcube.gcubeCommand &&
  typeof gcube.gcubeCommand.toJSON === "function"
) {
  addCommand(gcube.gcubeCommand);
  console.log("✅ Loaded unified /gcube command.");
} else {
  console.error("❌ Unified /gcube command is missing.");
}

// ============================================
// SLASH COMMAND HANDLER
// ============================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;

  try {
    if (
      ["ai", "ask", "memory", "aistatus"].includes(commandName)
    ) {
      if (typeof ai.handleCommand !== "function") {
        await interaction.reply({
          content: "⚠️ AI module is not ready.",
          ephemeral: true
        });
        return;
      }

      await ai.handleCommand(interaction, {
        client,
        data,
        saveData
      });

      return;
    }

    if (commandName === "gcube") {
      if (typeof gcube.handleGCubeRoot !== "function") {
        await interaction.reply({
          content: "❌ GCube system is not loaded.",
          ephemeral: true
        });
        return;
      }

      await gcube.handleGCubeRoot(interaction);
    }

  } catch (error) {
    console.error(
      `❌ Command /${commandName} failed:`,
      error
    );

    const reply = {
      content: "❌ Command error. Please try again.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// ============================================
// AI NORMAL CHAT + IMAGE GENERATOR
// ============================================

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot || !client.user) return;

    // AI responds when mentioned or when a user replies to it.
    const mentioned = message.mentions.has(client.user.id);
    let repliedToBot = false;

    if (message.reference?.messageId) {
      const repliedMessage = await message
        .fetchReference()
        .catch(() => null);

      if (repliedMessage?.author.id === client.user.id) {
        repliedToBot = true;
      }
    }

    if (!mentioned && !repliedToBot) return;

    if (!data.aiEnabled) {
      await message.reply(
        "⚠️ Elyx AI is currently disabled."
      );
      return;
    }

    const cleanMessage = message.content
      .replace(
        new RegExp(`<@!?${client.user.id}>`, "g"),
        ""
      )
      .trim();

    if (!cleanMessage) {
      await message.reply(
        "👋 Haan bhai! Kuch poochna hai toh message kar."
      );
      return;
    }

    // IMAGE GENERATOR
    // Requires handleImageMessage to be exported from ai.js.
    if (typeof ai.handleImageMessage === "function") {
      const imageHandled = await ai.handleImageMessage(message);

      // Image request handled; don't send a second AI text reply.
      if (imageHandled) return;
    } else {
      console.warn(
        "⚠️ Image handler not found in ai.js."
      );
    }

    // NORMAL AI CHAT
    await message.channel.sendTyping();

    const reply = await ai.generateReply({
      data,
      userId: message.author.id,
      guildId: message.guildId || "DM",
      username: message.author.username,
      message: cleanMessage,
      saveData
    });

    await message.reply(
      String(reply || "Bhai, abhi reply nahi bana.")
        .slice(0, 1900)
    );

  } catch (error) {
    console.error(
      "❌ AI chat error:",
      error.message
    );

    await message.reply(
      "❌ AI reply mein error aaya. Thodi der baad try kar."
    ).catch(() => {});
  }
});

// ============================================
// GCUBE MESSAGE COUNTER
// ============================================

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  if (typeof gcube.handleGCubeMessage !== "function") {
    return;
  }

  try {
    await gcube.handleGCubeMessage(message);
  } catch (error) {
    console.error(
      "❌ GCube message counter error:",
      error.message
    );
  }
});

// ============================================
// GCUBE BUTTON HANDLERS
// ============================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  try {
    if (
      interaction.customId.startsWith("gcube_rewards_") &&
      typeof gcube.handleGCubeRewardButton === "function"
    ) {
      await gcube.handleGCubeRewardButton(interaction);
      return;
    }

    if (
      interaction.customId.startsWith("gcube_quests_") &&
      typeof gcube.handleGCubeQuestButton === "function"
    ) {
      await gcube.handleGCubeQuestButton(interaction);
    }

  } catch (error) {
    console.error("❌ GCube button error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Button use karte waqt error aaya.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ============================================
// GCUBE INVITE TRACKING
// ============================================

client.once(Events.ClientReady, async () => {
  for (const guild of client.guilds.cache.values()) {
    if (typeof gcube.cacheGuildInvites !== "function") {
      continue;
    }

    try {
      await gcube.cacheGuildInvites(guild);
    } catch (error) {
      console.error(
        `❌ Could not cache invites for ${guild.name}:`,
        error.message
      );
    }
  }
});

client.on(Events.GuildMemberAdd, async member => {
  if (typeof gcube.handleGCubeMemberJoin !== "function") {
    return;
  }

  try {
    await gcube.handleGCubeMemberJoin(client, member);
  } catch (error) {
    console.error(
      "❌ GCube invite tracking error:",
      error.message
    );
  }
});

// ============================================
// SLASH COMMAND REGISTRATION
// ============================================

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    const commandList = [...commands.values()]
      .map(command => command.toJSON());

    console.log(
      `📋 Preparing ${commandList.length} commands...`
    );

    if (commandList.length > 100) {
      throw new Error(
        `Too many commands: ${commandList.length}. Maximum is 100.`
      );
    }

    if (process.env.GUILD_ID) {
      // Clear old global commands and register guild commands.
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: [] }
      );

      await rest.put(
        Routes.applicationGuildCommands(
          client.user.id,
          process.env.GUILD_ID
        ),
        { body: commandList }
      );

      console.log("✅ Server slash commands registered.");

    } else {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commandList }
      );

      console.log("✅ Global slash commands registered.");
      console.log(
        "ℹ️ Global commands may take time to appear."
      );
    }

    console.log(
      `✅ Registered ${commandList.length} commands.`
    );

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

console.log("🤖 Starting Elyx Trading bot...");

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error(
    "❌ Discord login failed:",
    error.message
  );
});
