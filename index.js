const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const FILE = "./data.json";

let data = { values: {}, invites: {}, questions: [] };

if (fs.existsSync(FILE)) {
  try {
    data = { ...data, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {}
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

client.once("ready", () => {
  console.log(`Elyx Trading is online as ${client.user.tag}`);
});

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const user = message.author.id;

  // VALUE CHECKER
  if (cmd === "!valueadd") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
      return message.reply("You need Manage Server permission.");

    const input = message.content.slice(10).split("|");
    if (input.length < 2)
      return message.reply("Use: !valueadd Hammer | 500M");

    const item = input[0].trim().toLowerCase();
    const value = input.slice(1).join("|").trim();

    if (!item || !value) return message.reply("Enter an item and its value.");

    data.values[item] = value;
    save();
    return message.reply(`✅ ${input[0].trim()} value saved: ${value}`);
  }

  if (cmd === "!value") {
    const item = args.slice(1).join(" ").toLowerCase();
    if (!item) return message.reply("Use: !value Hammer");

    const value = data.values[item];
    return message.reply(
      value
        ? `💰 **${item}** value is **${value}**`
        : "I don't have that item's value yet."
    );
  }

  // VALUE LIST
  if (cmd === "!valuelist") {
    const entries = Object.entries(data.values);
    if (!entries.length) return message.reply("No item values saved yet.");

    return message.reply(
      entries.slice(0, 30).map(([name, value]) => `🔹 ${name}: ${value}`).join("\n")
    );
  }

  // INVITE LEADERBOARD
  if (cmd === "!invites") {
    const count = data.invites[user] || 0;
    return message.reply(`🎟️ Your tracked invites: **${count}**`);
  }

  if (cmd === "!inviteboard") {
    const entries = Object.entries(data.invites)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (!entries.length) return message.reply("No invite data yet.");

    return message.reply(
      "🏆 **Invite Leaderboard**\n" +
      entries.map(([id, count], i) => `${i + 1}. <@${id}> — ${count}`).join("\n")
    );
  }

  // MODERATION
  if (cmd === "!kick" || cmd === "!ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return message.reply("You don't have permission to do that.");

    const target = message.mentions.members.first();
    if (!target) return message.reply(`Use: ${cmd} @user`);

    if (target.id === message.author.id)
      return message.reply("You can't use this command on yourself.");

    if (!target.kickable && cmd === "!kick")
      return message.reply("I can't kick this member. Check my role position.");

    if (!target.bannable && cmd === "!ban")
      return message.reply("I can't ban this member. Check my role position.");

    const reason = args.slice(2).join(" ") || "No reason provided";

    try {
      if (cmd === "!kick") await target.kick(reason);
      else {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
          return message.reply("You also need Ban Members permission.");
        await target.ban({ reason });
      }
      return message.reply(`✅ ${target.user.tag} ${cmd === "!kick" ? "kicked" : "banned"}.`);
    } catch {
      return message.reply("Action failed. Check bot permissions.");
    }
  }

  if (cmd === "!clear") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return message.reply("You need Manage Messages permission.");

    const amount = Number(args[1]);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100)
      return message.reply("Use: !clear 10 (maximum 100)");

    try {
      const deleted = await message.channel.bulkDelete(amount + 1, true);
      const notice = await message.channel.send(`🧹 Deleted ${deleted.size - 1} messages.`);
      setTimeout(() => notice.delete().catch(() => {}), 4000);
    } catch {
      return message.reply("Couldn't clear messages. Check permissions and message age.");
    }
  }

  // NATURAL BASIC AUTO-REPLY WHEN MENTIONED
  if (message.mentions.has(client.user)) {
    const text = message.content
      .replace(/<@!?\d+>/g, "")
      .trim()
      .toLowerCase();

    if (/hello|hi\b|hey/.test(text))
      return message.reply("Hey bro! 👋 What's up?");
    if (text.includes("elyx"))
      return message.reply("Elyx Trading! 🔥 Ask me about item values, invites or commands.");
    if (text.includes("value") || text.includes("hammer"))
      return message.reply("Try `!value Hammer` to check a saved item value.");
    if (text.includes("help") || text.includes("commands"))
      return message.reply("Commands: `!value`, `!valueadd`, `!valuelist`, `!invites`, `!inviteboard`, `!kick`, `!ban`, `!clear`.");
    return message.reply("Hey bro! I can help with Elyx Trading. Try asking about an item value or type `!help`.");
  }

  // BASIC KBC COMMANDS
  if (cmd === "!setq") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
      return message.reply("You need Manage Server permission.");

    const input = message.content.slice(5).split("|").map(x => x.trim());
    if (input.length !== 7)
      return message.reply("Use: !setq 1 | Question | A | B | C | D | A");

    const number = Number(input[0]);
    const correct = input[6].toUpperCase();

    if (!Number.isInteger(number) || number < 1 || number > 12)
      return message.reply("Question number must be 1–12.");

    if (!["A", "B", "C", "D"].includes(correct))
      return message.reply("Correct answer must be A, B, C or D.");

    data.questions[number - 1] = {
      question: input[1],
      options: input.slice(2, 6),
      correct
    };
    save();
    return message.reply(`✅ KBC question ${number} saved.`);
  }

  if (cmd === "!kbc") {
    if (data.questions.length < 12 || data.questions.some(q => !q))
      return message.reply("Admin must set all 12 questions first using !setq.");

    return message.reply("🏆 Elyx KBC questions are saved! Full live game mode still needs to be added.");
  }
});

client.on("inviteCreate", () => {});
client.on("guildMemberAdd", async member => {
  try {
    const invites = await member.guild.invites.fetch();
    const used = invites.find(inv => inv.uses > (inv._elyxUses || 0));
    if (used && used.inviter) {
      const id = used.inviter.id;
      data.invites[id] = (data.invites[id] || 0) + 1;
      save();
    }
    invites.forEach(inv => inv._elyxUses = inv.uses);
  } catch {
    // Invite tracking requires the bot to have Manage Guild permission.
  }
});

client.login(process.env.DISCORD_TOKEN);
