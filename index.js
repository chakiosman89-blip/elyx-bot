const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");

// ================= CONFIG =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const DATA_FILE = "./data.json";

let data = {
  values: {},
  invites: {},
  warnings: {},
  welcomeChannel: {},
  aiEnabled: true
};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = {
      ...data,
      ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
    };
  } catch (error) {
    console.error("Could not read data.json:", error.message);
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const cooldowns = new Map();
const histories = new Map();
const inviteCache = new Map();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ================= SLASH COMMANDS =================

const commands = [

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all Elyx Trading commands"),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot response speed"),

  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask AI anything")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("value")
    .setDescription("Check an item value")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item name")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("valueadd")
    .setDescription("Add or update an item value")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item name")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("price")
        .setDescription("Item value")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("valuelist")
    .setDescription("Show saved item values"),

  new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Check your tracked invites")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Member to check")
    ),

  new SlashCommandBuilder()
    .setName("inviteboard")
    .setDescription("Show invite leaderboard"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show member information")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Member to check")
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information"),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a member's avatar")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Member")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Member to ban")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason for the ban")
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Member to kick")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("Timeout duration in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Member")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Warning reason")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a member's warnings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of messages to delete")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Poll question")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("option1")
        .setDescription("First option")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("option2")
        .setDescription("Second option")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("option3")
        .setDescription("Optional third option")
    )
    .addStringOption(o =>
      o.setName("option4")
        .setDescription("Optional fourth option")
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an announcement")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Announcement text")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Set the welcome channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel for welcome messages")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("joke")
    .setDescription("Get a random joke"),

  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin"),

  new SlashCommandBuilder()
    .setName("eightball")
    .setDescription("Ask the magic 8-ball a question")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Enable or disable automatic AI chat")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(o =>
      o.setName("enabled")
        .setDescription("Enable automatic AI replies")
        .setRequired(true)
    )

].map(command => command.toJSON());

// ================= GROQ AI =================

async function askGroq(question, userId, username) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const history = histories.get(userId) || [];

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are Elyx, a friendly Discord server assistant. " +
              "Chat naturally like a helpful friend. Answer questions " +
              "accurately, explain things simply, and use the language " +
              "the user uses, including Hindi, Gujarati or English. " +
              "Do not claim you know something if you do not. " +
              "Keep ordinary Discord replies concise. " +
              "Do not claim to have performed actions you did not perform. " +
              "The current user's Discord username is " + username + "."
          },
          ...history,
          {
            role: "user",
            content: question
          }
        ],
        temperature: 0.8,
        max_tokens: 700
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    console.error("Groq API error:", response.status, details);
    throw new Error("Groq API request failed");
  }

  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    throw new Error("AI returned an empty answer");
  }

  const updatedHistory = [
    ...history,
    { role: "user", content: question },
    { role: "assistant", content: answer }
  ].slice(-12);

  histories.set(userId, updatedHistory);

  return answer;
}

// ================= READY =================

client.once("ready", async () => {
  console.log(`Elyx Trading online as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("Slash commands registered successfully.");
  } catch (error) {
    console.error("Slash command registration failed:", error);
  }

  // Cache current invite counts for tracking future joins.
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      inviteCache.set(
        guild.id,
        new Map(invites.map(invite => [invite.code, invite.uses || 0]))
      );
    } catch {
      console.log(`Invite tracking unavailable in ${guild.name}`);
    }
  }
});

// ================= SLASH COMMAND HANDLER =================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, member } = interaction;

  try {

    // HELP
    if (commandName === "help") {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("⚡ Elyx Trading — Commands")
        .setDescription(
          "**🤖 AI**\n" +
          "`/ask` `/ai`\n\n" +
          "**💰 Trading**\n" +
          "`/value` `/valueadd` `/valuelist`\n\n" +
          "**🎟️ Invites**\n" +
          "`/invites` `/inviteboard`\n\n" +
          "**🛡️ Moderation**\n" +
          "`/ban` `/kick` `/timeout` `/warn` `/warnings` `/purge`\n\n" +
          "**👤 Information**\n" +
          "`/userinfo` `/serverinfo` `/avatar`\n\n" +
          "**🎉 Fun**\n" +
          "`/joke` `/coinflip` `/eightball`\n\n" +
          "**⚙️ Utility**\n" +
          "`/poll` `/announce` `/welcome` `/ping`"
        )
        .setFooter({ text: "Elyx Trading • All-in-One Bot" });

      return interaction.reply({ embeds: [embed] });
    }

    // PING
    if (commandName === "ping") {
      return interaction.reply(
        `🏓 Pong! WebSocket: ${client.ws.ping}ms`
      );
    }

    // ASK AI
    if (commandName === "ask") {
      await interaction.deferReply();

      try {
        const question = options.getString("question");
        const answer = await askGroq(
          question,
          interaction.user.id,
          interaction.user.username
        );

        return interaction.editReply(answer.slice(0, 2000));
      } catch {
        return interaction.editReply(
          "AI reply failed. Check the Groq API key, usage limits and console."
        );
      }
    }

    // ENABLE / DISABLE AUTO AI
    if (commandName === "ai") {
      data.aiEnabled = options.getBoolean("enabled");
      saveData();

      return interaction.reply(
        `🤖 Automatic AI chat is now **${data.aiEnabled ? "enabled" : "disabled"}**.`
      );
    }

    // VALUE ADD
    if (commandName === "valueadd") {
      const item = options.getString("item").trim().toLowerCase();
      const price = options.getString("price").trim();

      data.values[item] = price;
      saveData();

      return interaction.reply(`✅ **${item}** value saved: **${price}**`);
    }

    // VALUE
    if (commandName === "value") {
      const item = options.getString("item").trim().toLowerCase();
      const price = data.values[item];

      return interaction.reply(
        price
          ? `💰 **${item}** value: **${price}**`
          : `I don't have a saved value for **${item}** yet.`
      );
    }

    // VALUE LIST
    if (commandName === "valuelist") {
      const entries = Object.entries(data.values);

      if (!entries.length) {
        return interaction.reply("No item values saved yet.");
      }

      const description = entries
        .slice(0, 40)
        .map(([item, price]) => `🔹 **${item}** — ${price}`)
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle("💰 Trading Values")
            .setDescription(description)
        ]
      });
    }

    // INVITES
    if (commandName === "invites") {
      const user = options.getUser("user") || interaction.user;
      const count = data.invites[user.id] || 0;

      return interaction.reply(
        `🎟️ ${user.username} has **${count}** tracked invites.`
      );
    }

    // INVITE LEADERBOARD
    if (commandName === "inviteboard") {
      const entries = Object.entries(data.invites)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      if (!entries.length) {
        return interaction.reply("No invite data available yet.");
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle("🏆 Invite Leaderboard")
            .setDescription(
              entries.map(([id, count], i) =>
                `**${i + 1}.** <@${id}> — ${count} invites`
              ).join("\n")
            )
        ]
      });
    }

    // USER INFO
    if (commandName === "userinfo") {
      const user = options.getUser("user") || interaction.user;
      const targetMember = await guild.members.fetch(user.id).catch(() => null);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`👤 ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "User ID", value: user.id },
          { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>` },
          {
            name: "Joined Server",
            value: targetMember
              ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D>`
              : "Unknown"
          }
        );

      return interaction.reply({ embeds: [embed] });
    }

    // SERVER INFO
    if (commandName === "serverinfo") {
      const owner = await guild.fetchOwner();

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🏠 ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: "Owner", value: owner.user.username, inline: true },
          { name: "Members", value: String(guild.memberCount), inline: true },
          { name: "Channels", value: String(guild.channels.cache.size), inline: true },
          { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>` }
        );

      return interaction.reply({ embeds: [embed] });
    }

    // AVATAR
    if (commandName === "avatar") {
      const user = options.getUser("user") || interaction.user;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`${user.username}'s Avatar`)
        .setImage(user.displayAvatarURL({ size: 1024 }));

      return interaction.reply({ embeds: [embed] });
    }

    // BAN / KICK
    if (commandName === "ban" || commandName === "kick") {
      const user = options.getUser("user");
      const reason = options.getString("reason") || "No reason provided";
      const target = await guild.members.fetch(user.id).catch(() => null);

      if (!target) {
        return interaction.reply({
          content: "That member isn't in this server.",
          ephemeral: true
        });
      }

      if (user.id === interaction.user.id) {
        return interaction.reply({
          content: "You can't use this command on yourself.",
          ephemeral: true
        });
      }

      if (user.id === client.user.id) {
        return interaction.reply({
          content: "I can't moderate myself.",
          ephemeral: true
        });
      }

      if (target.roles.highest.position >= member.roles.highest.position &&
          guild.ownerId !== interaction.user.id) {
        return interaction.reply({
          content: "You can't moderate someone with an equal or higher role.",
          ephemeral: true
        });
      }

      try {
        if (commandName === "ban") {
          if (!target.bannable) {
            return interaction.reply({
              content: "I can't ban this member. Check my role position and permissions.",
              ephemeral: true
            });
          }

          await target.ban({ reason });
        } else {
          if (!target.kickable) {
            return interaction.reply({
              content: "I can't kick this member. Check my role position and permissions.",
              ephemeral: true
            });
          }

          await target.kick(reason);
        }

        return interaction.reply(
          `✅ **${user.username}** was ${commandName === "ban" ? "banned" : "kicked"}. Reason: ${reason}`
        );
      } catch {
        return interaction.reply({
          content: "Action failed. Check bot permissions.",
          ephemeral: true
        });
      }
    }

    // TIMEOUT
    if (commandName === "timeout") {
      const user = options.getUser("user");
      const minutes = options.getInteger("minutes");
      const reason = options.getString("reason") || "No reason provided";
      const target = await guild.members.fetch(user.id).catch(() => null);

      if (!target) {
        return interaction.reply({
          content: "Member not found.",
          ephemeral: true
        });
      }

      if (user.id === interaction.user.id ||
          user.id === client.user.id) {
        return interaction.reply({
          content: "You can't timeout yourself or the bot.",
          ephemeral: true
        });
      }

      if (target.roles.highest.position >= member.roles.highest.position &&
          guild.ownerId !== interaction.user.id) {
        return interaction.reply({
          content: "You can't timeout someone with an equal or higher role.",
          ephemeral: true
        });
      }

      if (!target.moderatable) {
        return interaction.reply({
          content: "I can't timeout that member. Check role positions and permissions.",
          ephemeral: true
        });
      }

      await target.timeout(minutes * 60 * 1000, reason);

      return interaction.reply(
        `🔇 **${user.username}** timed out for **${minutes} minutes**.`
      );
    }

    // WARN
    if (commandName === "warn") {
      const user = options.getUser("user");
      const reason = options.getString("reason");

      if (user.id === interaction.user.id ||
          user.id === client.user.id) {
        return interaction.reply({
          content: "You can't warn yourself or the bot.",
          ephemeral: true
        });
      }

      const target = await guild.members.fetch(user.id).catch(() => null);

      if (!target) {
        return interaction.reply({
          content: "Member not found.",
          ephemeral: true
        });
      }

      if (target.roles.highest.position >= member.roles.highest.position &&
          guild.ownerId !== interaction.user.id) {
        return interaction.reply({
          content: "You can't warn someone with an equal or higher role.",
          ephemeral: true
        });
      }

      const key = `${guild.id}:${user.id}`;

      data.warnings[key] ||= [];
      data.warnings[key].push({
        reason,
        moderator: interaction.user.id,
        date: new Date().toISOString()
      });

      saveData();

      return interaction.reply(
        `⚠️ **${user.username}** has been warned. Total warnings: **${data.warnings[key].length}**. Reason: ${reason}`
      );
    }

    // WARNINGS
    if (commandName === "warnings") {
      const user = options.getUser("user");
      const key = `${guild.id}:${user.id}`;
      const warnings = data.warnings[key] || [];

      if (!warnings.length) {
        return interaction.reply(`${user.username} has no saved warnings.`);
      }

      const description = warnings.slice(-10).map((w, i) =>
        `**${i + 1}.** ${w.reason}\nModerator: <@${w.moderator}>`
      ).join("\n\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xE67E22)
            .setTitle(`⚠️ Warnings — ${user.username}`)
            .setDescription(description)
        ],
        ephemeral: true
      });
    }

    // PURGE
    if (commandName === "purge") {
      const amount = options.getInteger("amount");

      const messages = await interaction.channel.bulkDelete(amount, true);

      return interaction.reply({
        content: `🧹 Deleted **${messages.size}** recent messages. Messages older than 14 days may not be deleted.`,
        ephemeral: true
      });
    }

    // POLL
    if (commandName === "poll") {
      const question = options.getString("question");
      const optionsList = [
        options.getString("option1"),
        options.getString("option2"),
        options.getString("option3"),
        options.getString("option4")
      ].filter(Boolean);

      const emojis = ["🇦", "🇧", "🇨", "🇩"];

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📊 ${question}`)
        .setDescription(
          optionsList.map((option, i) =>
            `${emojis[i]} ${option}`
          ).join("\n\n")
        )
        .setFooter({ text: `Poll by ${interaction.user.username}` });

      await interaction.reply({ embeds: [embed], fetchReply: true });

      const pollMessage = await interaction.fetchReply();

      for (let i = 0; i < optionsList.length; i++) {
        await pollMessage.react(emojis[i]);
      }

      return;
    }

    // ANNOUNCEMENT
    if (commandName === "announce") {
      const text = options.getString("message");

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("📢 Announcement")
        .setDescription(text)
        .setFooter({ text: `Posted by ${interaction.user.username}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // WELCOME CHANNEL SETUP
    if (commandName === "welcome") {
      const channel = options.getChannel("channel");

      if (!channel.isTextBased()) {
        return interaction.reply({
          content: "Choose a text channel.",
          ephemeral: true
        });
      }

      data.welcomeChannel[guild.id] = channel.id;
      saveData();

      return interaction.reply(`✅ Welcome channel set to ${channel}.`);
    }

    // JOKE
    if (commandName === "joke") {
      await interaction.deferReply();

      try {
        const joke = await askGroq(
          "Tell me one short, funny, clean joke. Do not explain it.",
          interaction.user.id,
          interaction.user.username
        );

        return interaction.editReply(joke.slice(0, 2000));
      } catch {
        return interaction.editReply("Couldn't get a joke right now. Try again later.");
      }
    }

    // COIN FLIP
    if (commandName === "coinflip") {
      return interaction.reply(
        `🪙 The coin landed on **${Math.random() < 0.5 ? "Heads" : "Tails"}**!`
      );
    }

    // EIGHTBALL
    if (commandName === "eightball") {
      const answers = [
        "Yes, definitely! ✅",
        "Looks good to me. 😎",
        "Probably!",
        "Ask me again later. 🤔",
        "Not sure yet.",
        "I don't think so.",
        "Very unlikely. ❌"
      ];

      return interaction.reply(
        `🎱 **Question:** ${options.getString("question")}\n${answers[Math.floor(Math.random() * answers.length)]}`
      );
    }

  } catch (error) {
    console.error(`Command /${commandName} failed:`, error);

    const response = {
      content: "Something went wrong. Check the bot console and permissions.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// ================= AUTOMATIC WELCOME =================

client.on("guildMemberAdd", async member => {
  try {
    const channelId = data.welcomeChannel[member.guild.id];
    if (channelId) {
      const channel = member.guild.channels.cache.get(channelId);

      if (channel) {
        await channel.send(
          `👋 Welcome ${member} to **${member.guild.name}**! 🎉`
        );
      }
    }

    const oldInvites = inviteCache.get(member.guild.id) || new Map();
    const newInvites = await member.guild.invites.fetch();

    const used = newInvites.find(invite =>
      (invite.uses || 0) > (oldInvites.get(invite.code) || 0)
    );

    if (used && used.inviter && used.inviter.id !== member.id) {
      const inviterId = used.inviter.id;
      data.invites[inviterId] = (data.invites[inviterId] || 0) + 1;
      saveData();
    }

    inviteCache.set(
      member.guild.id,
      new Map(newInvites.map(invite => [invite.code, invite.uses || 0]))
    );
  } catch (error) {
    console.error("Welcome/invite tracking error:", error.message);
  }
});

// ================= AI AUTO CHAT =================

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot || !data.aiEnabled) return;

  // Do not respond to commands or empty messages.
  if (message.content.startsWith("/") || !message.content.trim()) return;

  // Only respond to messages with enough text to be a conversation.
  const text = message.content.trim();
  if (text.length < 3) return;

  // Per-user cooldown to avoid spamming the channel.
  const now = Date.now();
  const lastMessage = cooldowns.get(message.author.id) || 0;

  if (now - lastMessage < 10000) return;
  cooldowns.set(message.author.id, now);

  // Keep a special greeting for "hi".
  if (/^(hi|hii|hello|hey|wsp)\b[!. ]*$/i.test(text)) {
    return message.reply("WSP BRO 😎🔥");
  }

  // Do not let AI chat with every bot or reply to slash command output.
  try {
    await message.channel.sendTyping();

    const answer = await askGroq(
      text,
      message.author.id,
      message.author.username
    );

    // Split long answers safely.
    if (answer.length <= 1900) {
      await message.reply(answer);
    } else {
      await message.reply(answer.slice(0, 1900));
    }
  } catch (error) {
    console.error("AI auto-chat error:", error.message);
    // Do not spam the channel with API errors.
  }
});

// ================= START BOT =================

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN environment variable.");
  process.exit(1);
}

client.login(DISCORD_TOKEN);
