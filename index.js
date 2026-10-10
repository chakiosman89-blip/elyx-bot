// ============================================
// ELYX TRADING — AI + GCUBE PARTY
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
// DATA STORAGE
// Preserve AI and GCube data
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
    console.error("❌ Could not load data.json:", error.message);
    process.exit(1);
  }
}

const data = loadData();

function saveData() {
  try {
    const tempFile = `${DATA_FILE}.tmp`;

    // Read the latest saved file first
    let existingData = {};

    if (fs.existsSync(DATA_FILE)) {
      existingData = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );
    }

    // Merge AI data without deleting other saved data
    const safeData = {
      ...existingData,
      ...data
    };

    // Keep the latest GCube data saved by games.js
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
    console.warn(`⚠️ Duplicate command skipped: /${json.name}`);
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

addCommand(
  new SlashCommandBuilder()
    .setName("aistatus")
    .setDescription("Check Elyx AI service status")
);

// ============================================
// GCUBE COMMAND REGISTRATION
// ============================================

const gcubeCommandNames = [
  "gcubeHelpCommand",
  "gcubeBalanceCommand",
  "gcubeRewardsCommand",
  "gcubeInviteRewardsCommand",
  "gcubeInviteClaimCommand",
  "gcubeQuestsCommand",
  "gcubeQuestClaimCommand",
  "gcubeShopCommand",
  "gcubeBuyCommand",
  "gcubeCollectionCommand",
  "gcubeProfileCommand",
  "gcubeShowcaseCommand",
  "gcubeTopCommand",
  "gcubeUpgradeCommand",
  "gcubePayCommand",
  "gcubeSellCommand",
  "gcubeHistoryCommand"
];

for (const name of gcubeCommandNames) {
  const command = gcube[name];

  if (command && typeof command.toJSON === "function") {
    addCommand(command);
    console.log(`✅ Loaded /${command.name}`);
  } else {
    console.warn(
      `⚠️ GCube command missing or not exported: ${name}`
    );
  }
}

// ============================================
// GCUBE STANDALONE COMMAND HANDLERS
// ============================================

const gcubeHandlers = {
  "gcube-help": "handleGCubeHelp",
  "gcube-rewards": "handleGCubeRewards",
  "gcube-invites": "handleGCubeInvites",
  "gcube-invite-claim": "handleGCubeInviteClaim",
  "gcube-quests": "handleGCubeQuests",
  "gcube-quest-claim": "handleGCubeQuestClaim",
  "gcube-shop": "handleGCubeShop",
  "gcube-buy": "handleGCubeBuy",
  "gcube-collection": "handleGCubeCollection",
  "gcube-profile": "handleGCubeProfile",
  "gcube-showcase": "handleGCubeShowcase",
  "gcube-top": "handleGCubeTop",
  "gcube-upgrade": "handleGCubeUpgrade",
  "gcube-pay": "handleGCubePay",
  "gcube-sell": "handleGCubeSell",
  "gcube-history": "handleGCubeHistory"
};

// ============================================
// INTERACTION HANDLER
// AI + GCUBE SLASH COMMANDS
// ============================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;

  try {
    // ----------------------------------------
    // AI COMMANDS
    // ----------------------------------------

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

    // ----------------------------------------
    // GCUBE ROOT COMMAND
    // /gcube balance, rewards, invites, etc.
    // ----------------------------------------

    if (commandName === "gcube") {
      const subcommand = interaction.options.getSubcommand();

      const rootHandlers = {
        balance: "handleGCubeBalance",
        rewards: "handleGCubeRewards",
        invites: "handleGCubeInvites",
        quests: "handleGCubeQuests",
        shop: "handleGCubeShop",
        collection: "handleGCubeCollection",
        profile: "handleGCubeProfile",
        top: "handleGCubeTop",
        showcase: "handleGCubeShowcase",
        history: "handleGCubeHistory"
      };

      const handlerName = rootHandlers[subcommand];
      const handler = handlerName ? gcube[handlerName] : null;

      if (typeof handler !== "function") {
        await interaction.reply({
          content:
            "⚠️ This GCube subcommand is missing or not exported.",
          ephemeral: true
        });
        return;
      }

      await handler(interaction);
      return;
    }

    // ----------------------------------------
    // GCUBE STANDALONE COMMANDS
    // ----------------------------------------

    const handlerName = gcubeHandlers[commandName];

    if (handlerName) {
      const handler = gcube[handlerName];

      if (typeof handler !== "function") {
        await interaction.reply({
          content:
            "⚠️ This GCube command handler is not available yet.",
          ephemeral: true
        });
        return;
      }

      await handler(interaction);
      return;
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
// AI NORMAL CHAT
// Reply when mentioned or when replied to
// ============================================

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    if (!client.user) return;

    const mentioned = message.mentions.has(client.user.id);

    let repliedToBot = false;

    if (message.reference?.messageId) {
      const repliedMessage = await message.fetchReference()
        .catch(() => null);

      if (
        repliedMessage &&
        repliedMessage.author.id === client.user.id
      ) {
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
    console.error("❌ AI chat error:", error.message);

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
    if (typeof gcube.cacheGuildInvites === "function") {
      try {
        await gcube.cacheGuildInvites(guild);
      } catch (error) {
        console.error(
          `❌ Could not cache invites for ${guild.name}:`,
          error.message
        );
      }
    }
  }
});

client.on(Events.GuildMemberAdd, async member => {
  if (typeof gcube.handleGCubeMemberJoin !== "function") return;

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
// REGISTER COMMANDS
// ============================================

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    const commandList = [...commands.values()]
      .map(command => command.toJSON());

    if (process.env.GUILD_ID) {
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
// LOGIN — KEEP THIS AT THE END
// ============================================

console.log("🤖 Starting Elyx Trading bot...");

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("❌ Discord login failed:", error.message);
});
