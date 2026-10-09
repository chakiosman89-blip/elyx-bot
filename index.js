const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ===============================
// ELYX TRADING BOT
// PART 1 - BASIC SETUP
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// DATA STORAGE
const DATA_FILE = path.join(__dirname, "data.json");

let data = {
  aiEnabled: true,
  warnings: {},
  welcomeChannel: {},
  welcomeEnabled: {},
  prefix: "!",
  autoReplies: {
    hi: "WSP BRO 😎🔥",
    hello: "Hello bro 👋",
    hey: "Hey bro 😎",
    wassup: "All good bro 🔥",
    "good morning": "Good morning bro ☀️",
    "good night": "Good night bro 🌙",
    gn: "GN BRO 🌙",
    gm: "GM BRO ☀️",
    bye: "Bye bro 👋",
    "who are you": "I'm Elyx Bot 🤖🔥",
    "how are you": "I'm good bro 😎"
  }
};

// LOAD SAVED DATA
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );

      data = {
        ...data,
        ...saved,
        autoReplies: {
          ...data.autoReplies,
          ...(saved.autoReplies || {})
        }
      };
    }
  } catch (error) {
    console.error("Data loading error:", error);
  }
}

// SAVE DATA
function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error("Data saving error:", error);
  }
}

loadData();

// COMMAND LIST
const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all Elyx Bot commands"),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot response speed"),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user information")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Choose a user")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Choose a user")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Show Elyx Bot information"),

  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Enable or disable automatic chat replies")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    )
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Enable automatic replies?")
        .setRequired(true)
    )
];

console.log("Elyx Bot: Part 1 loaded.");// ===============================
// PART 2 - MORE SLASH COMMANDS
// ===============================

// MODERATION COMMANDS

commands.push(
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.KickMembers
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to kick")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for kick")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.BanMembers
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to ban")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to timeout")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Timeout duration in minutes")
        .setMinValue(1)
        .setMaxValue(10080)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for timeout")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete recent messages")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Number of messages (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
);

// WARN COMMANDS

commands.push(
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to warn")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Warning reason")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Check a member's warnings")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to check")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear a member's warnings")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to clear")
        .setRequired(true)
    )
);

console.log("Elyx Bot: Part 2 loaded.");// ===============================
// PART 3 - FUN & UTILITY COMMANDS
// ===============================

commands.push(
  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a question")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin"),

  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a dice")
    .addIntegerOption(option =>
      option
        .setName("sides")
        .setDescription("Number of dice sides")
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("choose")
    .setDescription("Choose between options")
    .addStringOption(option =>
      option
        .setName("options")
        .setDescription("Separate choices with commas")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a simple poll")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("What are you asking?")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot send a message")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show information about a user")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select a user")
        .setRequired(false)
    )
);

// AUTO-REPLY MANAGEMENT COMMANDS

commands.push(
  new SlashCommandBuilder()
    .setName("addreply")
    .setDescription("Add an automatic chat reply")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("trigger")
        .setDescription("Word or phrase that triggers the reply")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("response")
        .setDescription("Bot's reply")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removereply")
    .setDescription("Remove an automatic chat reply")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("trigger")
        .setDescription("Trigger to remove")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("listreplies")
    .setDescription("Show automatic chat replies")
);

console.log("Elyx Bot: Part 3 loaded.");// ===============================
// PART 4 - WELCOME & SERVER TOOLS
// ===============================

commands.push(
  new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set the welcome channel")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Choose the welcome channel")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("welcome-toggle")
    .setDescription("Enable or disable welcome messages")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Enable welcome messages?")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send a server announcement")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Announcement message")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("membercount")
    .setDescription("Show the server member count"),

  new SlashCommandBuilder()
    .setName("roleinfo")
    .setDescription("Show information about a role")
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Select a role")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("poll-end")
    .setDescription("End a poll by closing voting")
);
// ===============================
// PART 5 - ADVANCED SERVER COMMANDS
// ===============================

commands.push(
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the current channel")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    )
    .addIntegerOption(option =>
      option
        .setName("seconds")
        .setDescription("Delay between messages (0-21600)")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("Change a member's nickname")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageNicknames
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to rename")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("New nickname")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("role-add")
    .setDescription("Give a role to a member")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageRoles
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member receiving the role")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Role to give")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("role-remove")
    .setDescription("Remove a role from a member")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageRoles
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member losing the role")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Role to remove")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Create a simple giveaway announcement")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("Giveaway prize")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Giveaway duration in minutes")
        .setMinValue(1)
        .setMaxValue(10080)
        .setRequired(true)
    )
);

console.log("Elyx Bot: Part 5 loaded.");
console.log("Elyx Bot: Part 4 loaded.");// ===============================
// PART 6 - EXTRA COMMANDS
// ===============================

commands.push(
  new SlashCommandBuilder()
    .setName("hug")
    .setDescription("Send a virtual hug")
    .addUserOption(o =>
      o.setName("user").setDescription("Choose user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("slap")
    .setDescription("Funny virtual slap")
    .addUserOption(o =>
      o.setName("user").setDescription("Choose user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Check friendship compatibility")
    .addUserOption(o =>
      o.setName("user").setDescription("Choose user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("joke")
    .setDescription("Get a random joke"),

  new SlashCommandBuilder()
    .setName("fact")
    .setDescription("Get a random fact"),

  new SlashCommandBuilder()
    .setName("meme")
    .setDescription("Get a random meme"),

  new SlashCommandBuilder()
    .setName("rate")
    .setDescription("Rate something out of 100")
    .addStringOption(o =>
      o.setName("thing").setDescription("What to rate").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("reverse")
    .setDescription("Reverse some text")
    .addStringOption(o =>
      o.setName("text").setDescription("Text to reverse").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clap")
    .setDescription("Put 👏 between every word")
    .addStringOption(o =>
      o.setName("text").setDescription("Your text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("emojify")
    .setDescription("Turn text into emoji letters")
    .addStringOption(o =>
      o.setName("text").setDescription("Your text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("randomnumber")
    .setDescription("Generate a random number")
    .addIntegerOption(o =>
      o.setName("min").setDescription("Minimum").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("max").setDescription("Maximum").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder message")
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Minutes").setMinValue(1).setMaxValue(10080).setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message").setDescription("Reminder text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a server suggestion")
    .addStringOption(o =>
      o.setName("idea").setDescription("Your suggestion").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("feedback")
    .setDescription("Send feedback about the bot")
    .addStringOption(o =>
      o.setName("message").setDescription("Your feedback").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("support")
    .setDescription("Show server support information"),

  new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Create a server invite"),

  new SlashCommandBuilder()
    .setName("poll-create")
    .setDescription("Create a voting poll")
    .addStringOption(o =>
      o.setName("question").setDescription("Poll question").setRequired(true)
    )
);

console.log("Elyx Bot: Part 6 loaded.");// =====================================
// PART 7 - EVENTS, HANDLERS & REGISTRATION
// =====================================

const { Events, ChannelType } = require("discord.js");

// HELPERS
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function getWarnings(guildId, userId) {
  return data.warnings[`${guildId}_${userId}`] || [];
}

// BOT READY
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const uniqueCommands = [
      ...new Map(
        commands.map(command => [command.name, command])
      ).values()
    ];

    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_TOKEN
    );

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: uniqueCommands.map(command => command.toJSON()) }
    );

    console.log(`✅ Registered ${uniqueCommands.length} slash commands.`);
  } catch (error) {
    console.error("Command registration error:", error);
  }

  client.user.setActivity("Elyx Trading", {
    type: 3
  });
});

// SLASH COMMAND HANDLER
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  const reply = async content => {
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({
        content,
        ephemeral: true
      });
    }

    return interaction.reply({
      content,
      ephemeral: true
    });
  };

  try {
    // HELP
    if (commandName === "help") {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🔥 Elyx Trading — Commands")
        .setDescription(
          "**General:** `/ping` `/help` `/botinfo` `/serverinfo` `/userinfo` `/avatar` `/membercount`\n\n" +
          "**Moderation:** `/kick` `/ban` `/timeout` `/clear` `/warn` `/warnings` `/clearwarnings`\n\n" +
          "**Channels & Roles:** `/lock` `/unlock` `/slowmode` `/nickname` `/role-add` `/role-remove` `/roleinfo`\n\n" +
          "**Fun:** `/8ball` `/coinflip` `/roll` `/choose` `/joke` `/fact` `/meme` `/hug` `/slap` `/ship` `/rate`\n\n" +
          "**Tools:** `/reverse` `/clap` `/randomnumber` `/remind` `/poll` `/poll-create` `/suggest` `/feedback` `/invite`\n\n" +
          "**Server setup:** `/setwelcome` `/welcome-toggle` `/announce` `/giveaway`\n\n" +
          "**Auto replies:** `/ai` `/addreply` `/removereply` `/listreplies`"
        )
        .setFooter({ text: "Elyx Trading • Bot Help" });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // BASIC INFO
    if (commandName === "ping") {
      return reply(`🏓 Pong! ${client.ws.ping}ms`);
    }

    if (commandName === "botinfo") {
      return reply(
        `🤖 **${client.user.tag}**\nServers: ${client.guilds.cache.size}\nUsers: ${client.guilds.cache.reduce((n, g) => n + g.memberCount, 0)}`
      );
    }

    if (commandName === "serverinfo") {
      if (!guild) return reply("Use this command in a server.");

      return reply(
        `🏠 **${guild.name}**\nMembers: ${guild.memberCount}\nCreated: <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`
      );
    }

    if (commandName === "membercount") {
      return reply(`👥 Members: **${guild.memberCount}**`);
    }

    if (commandName === "userinfo") {
      const user = interaction.options.getUser("user") || interaction.user;
      return reply(`👤 **${user.tag}**\nID: \`${user.id}\`\nCreated: <t:${Math.floor(user.createdTimestamp / 1000)}:D>`);
    }

    if (commandName === "avatar") {
      const user = interaction.options.getUser("user") || interaction.user;
      return interaction.reply(user.displayAvatarURL({ size: 1024 }));
    }

    // FUN COMMANDS
    if (commandName === "coinflip") {
      return reply(pick(["🪙 Heads!", "🪙 Tails!"]));
    }

    if (commandName === "roll") {
      const sides = interaction.options.getInteger("sides") || 6;
      return reply(`🎲 You rolled **${1 + Math.floor(Math.random() * sides)}** (1–${sides})`);
    }

    if (commandName === "8ball") {
      return reply(pick([
        "🎱 Definitely!",
        "🎱 Probably!",
        "🎱 Ask again later.",
        "🎱 Not sure!",
        "🎱 I don't think so.",
        "🎱 Absolutely not!"
      ]));
    }

    if (commandName === "choose") {
      const options = interaction.options.getString("options")
        .split(",").map(s => s.trim()).filter(Boolean);

      if (!options.length) return reply("Give me some choices separated by commas.");
      return reply(`🤔 I choose: **${pick(options)}**`);
    }

    if (commandName === "joke") {
      return reply(pick([
        "😂 Why did the computer get cold? It left its Windows open!",
        "🤣 Why was the math book sad? It had too many problems.",
        "😎 My Wi-Fi and I have a connection."
      ]));
    }

    if (commandName === "fact") {
      return reply(pick([
        "🐙 Octopuses have three hearts.",
        "🌍 Earth is not a perfect sphere.",
        "🐝 Bees communicate through movement.",
        "🪐 Saturn has spectacular rings."
      ]));
    }

    if (commandName === "meme") {
      return reply("😂 Meme time! Search your favourite memes and share one in chat.");
    }

    if (commandName === "hug" || commandName === "slap" || commandName === "ship") {
      const user = interaction.options.getUser("user");

      if (commandName === "hug") return reply(`🫂 ${interaction.user} sends a hug to ${user}!`);
      if (commandName === "slap") return reply(`🤚 ${interaction.user} gives ${user} a playful virtual slap!`);
      return reply(`💞 Compatibility: **${Math.floor(Math.random() * 101)}%**`);
    }

    if (commandName === "rate") {
      return reply(`⭐ I'd rate **${interaction.options.getString("thing")}** ${Math.floor(Math.random() * 101)}/100!`);
    }

    if (commandName === "reverse") {
      return reply(interaction.options.getString("text").split("").reverse().join(""));
    }

    if (commandName === "clap") {
      return reply(interaction.options.getString("text").split(/\s+/).join(" 👏 "));
    }

    if (commandName === "emojify") {
      return reply(interaction.options.getString("text").split("").join(" "));
    }

    if (commandName === "randomnumber") {
      const min = interaction.options.getInteger("min");
      const max = interaction.options.getInteger("max");

      if (min > max) return reply("Minimum cannot be greater than maximum.");
      return reply(`🎲 **${Math.floor(Math.random() * (max - min + 1)) + min}**`);
    }

    // MODERATION
    if (commandName === "kick") {
      const user = interaction.options.getUser("user");
      const target = await guild.members.fetch(user.id);
      const reason = interaction.options.getString("reason") || "No reason provided";

      if (!target.kickable) return reply("❌ I cannot kick this member. Check my role position and permissions.");

      await target.kick(reason);
      return reply(`👢 Kicked **${user.tag}**. Reason: ${reason}`);
    }

    if (commandName === "ban") {
      const user = interaction.options.getUser("user");
      const target = await guild.members.fetch(user.id);
      const reason = interaction.options.getString("reason") || "No reason provided";

      if (!target.bannable) return reply("❌ I cannot ban this member. Check my role position and permissions.");

      await target.ban({ reason });
      return reply(`🔨 Banned **${user.tag}**. Reason: ${reason}`);
    }

    if (commandName === "timeout") {
      const user = interaction.options.getUser("user");
      const target = await guild.members.fetch(user.id);
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason") || "No reason provided";

      if (!target.moderatable) return reply("❌ I cannot timeout this member.");

      await target.timeout(minutes * 60 * 1000, reason);
      return reply(`⏳ Timed out **${user.tag}** for ${minutes} minutes.`);
    }

    if (commandName === "clear") {
      const amount = interaction.options.getInteger("amount");
      const messages = await interaction.channel.bulkDelete(amount, true);

      return reply(`🧹 Deleted ${messages.size} messages.`);
    }

    if (commandName === "warn") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const key = `${guild.id}_${user.id}`;

      if (!data.warnings[key]) data.warnings[key] = [];
      data.warnings[key].push({
        reason,
        moderator: interaction.user.id,
        time: Date.now()
      });

      saveData();

      return reply(`⚠️ Warned **${user.tag}**.\nReason: ${reason}\nTotal warnings: ${data.warnings[key].length}`);
    }

    if (commandName === "warnings") {
      const user = interaction.options.getUser("user") || interaction.user;
      const list = getWarnings(guild.id, user.id);

      if (!list.length) return reply(`✅ **${user.tag}** has no warnings.`);

      return reply(`⚠️ Warnings for **${user.tag}**:\n` +
        list.map((w, i) => `${i + 1}. ${w.reason}`).join("\n"));
    }

    if (commandName === "clearwarnings") {
      const user = interaction.options.getUser("user");
      delete data.warnings[`${guild.id}_${user.id}`];
      saveData();
      return reply(`✅ Cleared warnings for **${user.tag}**.`);
    }

    // AUTO REPLIES
    if (commandName === "ai") {
      data.aiEnabled = interaction.options.getBoolean("enabled");
      saveData();

      return reply(`🤖 Automatic chat replies are now **${data.aiEnabled ? "enabled" : "disabled"}**.`);
    }

    if (commandName === "addreply") {
      const trigger = interaction.options.getString("trigger").toLowerCase();
      const response = interaction.options.getString("response");

      data.autoReplies[trigger] = response;
      saveData();

      return reply(`✅ Added auto-reply for **${trigger}**.`);
    }

    if (commandName === "removereply") {
      const trigger = interaction.options.getString("trigger").toLowerCase();

      if (!data.autoReplies[trigger]) return reply("No auto-reply found for that trigger.");

      delete data.autoReplies[trigger];
      saveData();

      return reply(`✅ Removed auto-reply for **${trigger}**.`);
    }

    if (commandName === "listreplies") {
      const keys = Object.keys(data.autoReplies);
      return reply(keys.length ? `💬 Auto-replies:\n${keys.map(k => `• ${k}`).join("\n")}` : "No auto-replies configured.");
    }

    // WELCOME SETUP
    if (commandName === "setwelcome") {
      const channel = interaction.options.getChannel("channel");

      if (!channel.isTextBased()) return reply("Choose a text channel.");
      data.welcomeChannel[guild.id] = channel.id;
      saveData();

      return reply(`✅ Welcome channel set to ${channel}.`);
    }

    if (commandName === "welcome-toggle") {
      data.welcomeEnabled[guild.id] = interaction.options.getBoolean("enabled");
      saveData();

      return reply(`👋 Welcome messages: **${data.welcomeEnabled[guild.id] ? "ON" : "OFF"}**`);
    }

    // ANNOUNCEMENTS
    if (commandName === "announce") {
      const message = interaction.options.getString("message");
      return interaction.channel.send({ content: `📢 **ANNOUNCEMENT**\n${message}` }).then(() => reply("✅ Announcement sent."));
    }

    // POLLS
    if (commandName === "poll" || commandName === "poll-create") {
      const question = interaction.options.getString("question");
      const msg = await interaction.channel.send(`📊 **POLL:** ${question}\n\n👍 Yes\n👎 No`);
      await msg.react("👍");
      await msg.react("👎");

      return reply("✅ Poll created.");
    }

    // SAY
    if (commandName === "say") {
      return interaction.channel.send(interaction.options.getString("message"))
        .then(() => reply("✅ Message sent."));
    }

    // ROLE INFO
    if (commandName === "roleinfo") {
      const role = interaction.options.getRole("role");
      return reply(`🎭 **${role.name}**\nMembers: ${role.members.size}\nID: ${role.id}`);
    }

    // SLOWMODE
    if (commandName === "slowmode") {
      const seconds = interaction.options.getInteger("seconds");
      await interaction.channel.setRateLimitPerUser(seconds);

      return reply(`🐢 Slowmode set to ${seconds} seconds.`);
    }

    // LOCK / UNLOCK
    if (commandName === "lock" || commandName === "unlock") {
      const locked = commandName === "lock";
      const everyone = guild.roles.everyone;

      await interaction.channel.permissionOverwrites.edit(everyone, {
        SendMessages: !locked
      });

      return reply(locked ? "🔒 Channel locked." : "🔓 Channel unlocked.");
    }

    // NICKNAME
    if (commandName === "nickname") {
      const user = interaction.options.getUser("user");
      const name = interaction.options.getString("name");
      const target = await guild.members.fetch(user.id);

      await target.setNickname(name);
      return reply(`✅ Nickname updated for **${user.tag}**.`);
    }

    // ROLE MANAGEMENT
    if (commandName === "role-add" || commandName === "role-remove") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      const target = await guild.members.fetch(user.id);

      if (role.managed || role.position >= guild.members.me.roles.highest.position) {
        return reply("❌ I cannot manage that role. Check my role hierarchy.");
      }

      if (commandName === "role-add") {
        await target.roles.add(role);
        return reply(`✅ Added ${role} to **${user.tag}**.`);
      }

      await target.roles.remove(role);
      return reply(`✅ Removed ${role} from **${user.tag}**.`);
    }

    // GIVEAWAY ANNOUNCEMENT
    if (commandName === "giveaway") {
      const prize = interaction.options.getString("prize");
      const minutes = interaction.options.getInteger("minutes");

      const msg = await interaction.channel.send(
        `🎉 **GIVEAWAY: ${prize}**\nReact with 🎉 to enter!\nEnds <t:${Math.floor((Date.now() + minutes * 60000) / 1000)}:R>`
      );

      await msg.react("🎉");
      return reply("✅ Giveaway posted. Note: this version does not automatically pick a winner.");
    }

    // SUGGESTIONS & FEEDBACK
    if (commandName === "suggest" || commandName === "feedback") {
      const textValue =
        interaction.options.getString("idea") ||
        interaction.options.getString("message");

      return interaction.channel.send(
        `💡 **${commandName === "suggest" ? "Suggestion" : "Feedback"}** from ${interaction.user}:\n${textValue}`
      ).then(() => reply("✅ Submitted."));
    }

    // INVITE
    if (commandName === "invite") {
      const invite = await interaction.channel.createInvite({
        maxAge: 86400,
        maxUses: 0
      });

      return reply(`🔗 ${invite.url}`);
    }

    // REMINDER
    if (commandName === "remind") {
      const minutes = interaction.options.getInteger("minutes");
      const message = interaction.options.getString("message");

      await reply(`⏰ Reminder set for ${minutes} minutes.`);

      setTimeout(() => {
        interaction.user.send(`⏰ Reminder: ${message}`).catch(() => {});
      }, minutes * 60000);

      return;
    }

    // COMMANDS WITHOUT A HANDLER YET
    return reply("This command is registered, but its functionality is not implemented yet.");

  } catch (error) {
    console.error(`/${commandName} error:`, error);

    return reply("❌ Something went wrong. Check the bot permissions and console logs.")
      .catch(() => {});
  }
});

// WELCOME EVENT
client.on(Events.GuildMemberAdd, async member => {
  if (!data.welcomeEnabled[member.guild.id]) return;

  const channelId = data.welcomeChannel[member.guild.id];
  if (!channelId) return;

  const channel = member.guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  channel.send(
    `👋 Welcome ${member} to **${member.guild.name}**! 🎉`
  ).catch(console.error);
});

// AUTOMATIC CHAT REPLIES
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild || !data.aiEnabled) return;

  const content = message.content.trim().toLowerCase();
  const response = data.autoReplies[content];

  if (response) {
    message.reply(response).catch(console.error);
  }
});

// LOGIN
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN environment variable!");
} else {
  client.login(process.env.DISCORD_TOKEN);
}
