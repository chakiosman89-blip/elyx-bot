const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const DATA_FILE = path.join(__dirname, "data.json");
const INDIA_TZ = "Asia/Kolkata";

const DAILY_MESSAGE_REWARDS = [
  { messages: 10, reward: 5 },
  { messages: 100, reward: 10 },
  { messages: 1000, reward: 50 }
];

const INVITE_REWARDS = [
  { invites: 5, reward: 5 },
  { invites: 10, reward: 10 },
  { invites: 25, reward: 30 },
  { invites: 50, reward: 75 },
  { invites: 100, reward: 200 }
];

const SHOP_ITEMS = [
  { id: "shadow_wolf", name: "Shadow Wolf", price: 100, rarity: "Common", type: "collectible", emoji: "🐺" },
  { id: "flame_dragon", name: "Flame Dragon", price: 300, rarity: "Rare", type: "collectible", emoji: "🐉" },
  { id: "dark_warrior", name: "Dark Warrior", price: 500, rarity: "Rare", type: "collectible", emoji: "⚔️" },
  { id: "royal_king", name: "Royal King", price: 750, rarity: "Epic", type: "collectible", emoji: "👑" },
  { id: "cosmic_phantom", name: "Cosmic Phantom", price: 1500, rarity: "Legendary", type: "collectible", emoji: "👻" },
  { id: "golden_elyx", name: "Golden Elyx", price: 3000, rarity: "Mythic", type: "collectible", emoji: "🌟" },
  { id: "diamond_frame", name: "Diamond Frame", price: 250, rarity: "Rare", type: "frame", emoji: "💎" },
  { id: "golden_frame", name: "Golden Profile Frame", price: 500, rarity: "Epic", type: "frame", emoji: "✨" },
  { id: "profile_background", name: "Profile Background", price: 200, rarity: "Common", type: "background", emoji: "🎨" },
  { id: "custom_nameplate", name: "Custom Nameplate", price: 400, rarity: "Epic", type: "nameplate", emoji: "🏷️" },
  { id: "upgrade_stone", name: "Upgrade Stone", price: 100, rarity: "Material", type: "material", emoji: "🔨" },
  { id: "diamond_core", name: "Diamond Core", price: 500, rarity: "Material", type: "material", emoji: "💠" },
  { id: "flame_essence", name: "Flame Essence", price: 750, rarity: "Material", type: "material", emoji: "🔥" },
  { id: "cosmic_crystal", name: "Cosmic Crystal", price: 1500, rarity: "Material", type: "material", emoji: "🌌" },
  { id: "elyx_core", name: "Elyx Core", price: 3000, rarity: "Mythic Material", type: "material", emoji: "👑" }
];

function todayIndia() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: INDIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (!parsed.gcubeParty) {
      parsed.gcubeParty = {
        users: {},
        trades: {},
        inviteTracking: {},
        history: []
      };
    }

    return parsed;
  } catch (error) {
    console.error("GCube Party data error:", error.message);
    return null;
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("GCube Party save error:", error.message);
    return false;
  }
}

function getUser(data, userId) {
  if (!data || !data.gcubeParty) {
    throw new Error("GCube Party data is not loaded.");
  }

  if (!data.gcubeParty.users[userId]) {
    data.gcubeParty.users[userId] = {
      balance: 0,
      totalEarned: 0,
      totalSpent: 0,
      messages: { date: todayIndia(), count: 0, claimed: [] },
      invites: { total: 0, claimed: [] },
      quests: { date: todayIndia(), completed: [], claimed: [] },
      collection: [],
      equipped: {
        collectible: null,
        frame: null,
        background: null,
        nameplate: null,
        effect: null
      },
      stats: { tradesCompleted: 0, itemsUpgraded: 0 }
    };
  }

  const user = data.gcubeParty.users[userId];

  if (!Number.isFinite(user.balance)) user.balance = 0;
  if (!Number.isFinite(user.totalEarned)) user.totalEarned = 0;
  if (!Number.isFinite(user.totalSpent)) user.totalSpent = 0;
  if (!user.messages) user.messages = { date: todayIndia(), count: 0, claimed: [] };
  if (!user.invites) user.invites = { total: 0, claimed: [] };
  if (!user.quests) user.quests = { date: todayIndia(), completed: [], claimed: [] };
  if (!Array.isArray(user.collection)) user.collection = [];

  if (user.messages.date !== todayIndia()) {
    user.messages = { date: todayIndia(), count: 0, claimed: [] };
  }

  if (user.quests.date !== todayIndia()) {
    user.quests = { date: todayIndia(), completed: [], claimed: [] };
  }

  return user;
}

function addGC(user, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Invalid GC amount.");
  }

  user.balance += amount;
  user.totalEarned += amount;
}

function spendGC(user, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || user.balance < amount) {
    return false;
  }

  user.balance -= amount;
  user.totalSpent += amount;
  return true;
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x7C4DFF)
    .setTitle(`💎 ${title}`)
    .setDescription(description)
    .setFooter({ text: "GCube Party • Elyx Trading" })
    .setTimestamp();
}

const gcubeHelpCommand = new SlashCommandBuilder()
  .setName("gcube-help")
  .setDescription("GCube Party game tutorial aur commands dekho");

async function handleGCubeHelp(interaction) {
  const embed = makeEmbed(
    "GCUBE PARTY — HOW TO PLAY",
    "Welcome! GC earn karo, rare collectibles collect karo, items upgrade karo aur members ke saath trade karo."
  );

  embed.addFields(
    {
      name: "💬 Daily Message Rewards",
      value: "10 messages = 5 GC\n100 messages = 10 GC\n1,000 messages = 50 GC\nDaily progress India time midnight par reset hogi."
    },
    {
      name: "🎟️ Invite Rewards",
      value: "5 invites = 5 GC\n10 invites = 10 GC\n25 invites = 30 GC\n50 invites = 75 GC\n100 invites = 200 GC\nInvite progress daily reset nahi hogi."
    },
    {
      name: "🎯 Daily Quests",
      value: "Daily missions complete karke extra GC earn karo."
    },
    {
      name: "🛍️ Shop & Collection",
      value: "Collectibles, frames, backgrounds aur upgrade materials khareedo. Apni collection aur profile flex karo."
    },
    {
      name: "⚒️ Upgrades",
      value: "Upgrade materials use karke supported collectibles ko improve karo."
    },
    {
      name: "🔄 Trading",
      value: "Eligible items aur GC ko dusre members ke saath secure confirmation ke through trade karo."
    },
    {
      name: "🌅 Important Rules",
      value: "Refresh sirf progress update karega. Reward claim karna zaroori hai. Daily progress reset hogi, lekin GC balance aur collection safe rahenge."
    }
  );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
  loadData,
  saveData,
  getUser,
  addGC,
  spendGC,
  makeEmbed,
  todayIndia,
  DAILY_MESSAGE_REWARDS,
  INVITE_REWARDS,
  SHOP_ITEMS,
  gcubeHelpCommand,
  handleGCubeHelp,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
};
// ==========================================
// GCUBE PARTY - PART 2: BALANCE & REWARDS
// ==========================================

const gcubeBalanceCommand = new SlashCommandBuilder()
.setName("gcube")
.setDescription("GCube Party ke saare commands")
.addSubcommand(sub =>
sub
.setName("balance")
.setDescription("Apna GCube balance check karo")
)
.addSubcommand(sub =>
sub
.setName("rewards")
.setDescription("Daily rewards aur message progress dekho")
)
.addSubcommand(sub =>
sub
.setName("invites")
.setDescription("Apne invites aur rewards dekho")
)
.addSubcommand(sub =>
sub
.setName("quests")
.setDescription("Available quests dekho")
)
.addSubcommand(sub =>
sub
.setName("shop")
.setDescription("GCube shop dekho")
)
.addSubcommand(sub =>
sub
.setName("collection")
.setDescription("Apni collection dekho")
)
.addSubcommand(sub =>
sub
.setName("profile")
.setDescription("Apna GCube profile dekho")
)
.addSubcommand(sub =>
sub
.setName("top")
.setDescription("GCube leaderboard dekho")
)
.addSubcommand(sub =>
sub
.setName("showcase")
.setDescription("Apna showcase dekho")
)
.addSubcommand(sub =>
sub
.setName("history")
.setDescription("Recent GCube transactions dekho")
);

const gcubeRewardsCommand = new SlashCommandBuilder()
  .setName("gcube-rewards")
  .setDescription("Daily rewards aur message progress dekho");

function buildRewardsEmbed(user) {
  const progress = user.messages.count;
  const claimed = user.messages.claimed;

  const lines = DAILY_MESSAGE_REWARDS.map((tier) => {
    const done = progress >= tier.messages;
    const alreadyClaimed = claimed.includes(tier.messages);

    let status = "🔒 Locked";
    if (alreadyClaimed) status = "✅ Claimed";
    else if (done) status = "🎁 Ready to claim";

    return `${done ? "🟢" : "⚪"} **${tier.messages.toLocaleString()} messages** → **${tier.reward} GC**\n└ ${status}`;
  });

  return makeEmbed(
    "Daily Message Rewards",
    `💬 **Today's messages:** ${progress.toLocaleString()}\n\n` +
    lines.join("\n\n") +
    "\n\n🔄 Refresh sirf progress update karta hai.\n" +
    "🎁 Claim button eligible rewards hi deta hai.\n" +
    "🌅 Daily progress India time midnight par reset hoti hai.\n" +
    "💎 Tumhara GC balance reset nahi hoga."
  );
}

function buildRewardsButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gcube_rewards_refresh")
      .setLabel("Refresh")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("gcube_rewards_claim")
      .setLabel("Claim Reward")
      .setEmoji("🎁")
      .setStyle(ButtonStyle.Success)
  );
}

async function handleGCubeBalance(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua. Bot logs check karo.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  if (!saveData(data)) {
    return interaction.reply({
      content: "❌ Data save nahi hua. Dobara try karo.",
      ephemeral: true
    });
  }

  const embed = makeEmbed(
    "Your GCube Balance",
    `👤 **Member:** ${interaction.user.username}\n` +
    `💎 **Balance:** ${user.balance.toLocaleString()} GC\n` +
    `📈 **Total earned:** ${user.totalEarned.toLocaleString()} GC\n` +
    `🛍️ **Total spent:** ${user.totalSpent.toLocaleString()} GC\n` +
    `🎴 **Collectibles:** ${user.collection.length}`
  );

  embed.setThumbnail(interaction.user.displayAvatarURL({ size: 256 }));

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleGCubeRewards(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua. Bot logs check karo.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  if (!saveData(data)) {
    return interaction.reply({
      content: "❌ Data save nahi hua. Dobara try karo.",
      ephemeral: true
    });
  }

  return interaction.reply({
    embeds: [buildRewardsEmbed(user)],
    components: [buildRewardsButtons()],
    ephemeral: true
  });
}

async function handleGCubeRewardButton(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  if (interaction.customId === "gcube_rewards_refresh") {
    if (!saveData(data)) {
      return interaction.reply({
        content: "❌ Progress save nahi hua.",
        ephemeral: true
      });
    }

    return interaction.update({
      embeds: [buildRewardsEmbed(user)],
      components: [buildRewardsButtons()]
    });
  }

  if (interaction.customId === "gcube_rewards_claim") {
    const eligible = DAILY_MESSAGE_REWARDS.filter((tier) =>
      user.messages.count >= tier.messages &&
      !user.messages.claimed.includes(tier.messages)
    );

    if (eligible.length === 0) {
      return interaction.reply({
        content: "🎁 Abhi koi naya reward claim karne ke liye available nahi hai!",
        ephemeral: true
      });
    }

    const totalReward = eligible.reduce((sum, tier) => sum + tier.reward, 0);

    // Claim all eligible milestones once.
    for (const tier of eligible) {
      user.messages.claimed.push(tier.messages);
    }

    addGC(user, totalReward);

    data.gcubeParty.history.push({
      type: "daily_message_reward",
      userId: interaction.user.id,
      amount: totalReward,
      date: todayIndia(),
      time: new Date().toISOString()
    });

    if (!saveData(data)) {
      // Do not report a successful claim when saving fails.
      return interaction.reply({
        content: "❌ Reward save nahi hua. Admin ko logs check karne bolo.",
        ephemeral: true
      });
    }

    return interaction.update({
      embeds: [
        buildRewardsEmbed(user).setDescription(
          `🎉 **${totalReward} GC claimed!**\n` +
          `💎 New balance: **${user.balance.toLocaleString()} GC**\n\n` +
          DAILY_MESSAGE_REWARDS.map((tier) => {
            const done = user.messages.count >= tier.messages;
            const claimed = user.messages.claimed.includes(tier.messages);
            return `${done && claimed ? "✅" : "⚪"} ${tier.messages.toLocaleString()} messages → ${tier.reward} GC`;
          }).join("\n")
        )
      ],
      components: [buildRewardsButtons()]
    });
  }
}

// Count ordinary member messages.
// This function must be connected to the bot's existing messageCreate event.
async function handleGCubeMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId) return;

  const data = loadData();
  if (!data) return;

  const user = getUser(data, message.author.id);

  user.messages.count += 1;

  // Track today's message quest progress for the future quest system.
  user.quests.messageCount = (user.quests.messageCount || 0) + 1;

  saveData(data);
}

// Add these properties to the exports from Part 1.
module.exports.gcubeBalanceCommand = gcubeBalanceCommand;
module.exports.gcubeRewardsCommand = gcubeRewardsCommand;
module.exports.handleGCubeBalance = handleGCubeBalance;
module.exports.handleGCubeRewards = handleGCubeRewards;
module.exports.handleGCubeRewardButton = handleGCubeRewardButton;
module.exports.handleGCubeMessage = handleGCubeMessage;
// ==========================================
// GCUBE PARTY - PART 3: INVITE REWARDS
// ==========================================

const gcubeInviteRewardsCommand = new SlashCommandBuilder()
  .setName("gcube-invites")
  .setDescription("Apna invite progress aur rewards dekho");

const gcubeInviteClaimCommand = new SlashCommandBuilder()
  .setName("gcube-invite-claim")
  .setDescription("Eligible invite milestone rewards claim karo");

// Cache used to compare invite uses when a new member joins.
const gcubeInviteCache = new Map();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    gcubeInviteCache.set(
      guild.id,
      new Map(invites.map(invite => [invite.code, invite.uses || 0]))
    );
  } catch (error) {
    console.error(
      `GCube Party: Could not fetch invites for ${guild.id}:`,
      error.message
    );
  }
}

async function handleGCubeMemberJoin(client, member) {
  if (!member.guild || member.user.bot) return;

  const before = gcubeInviteCache.get(member.guild.id);

  // If cache wasn't initialized, initialize it now.
  // This join cannot safely be attributed, so it isn't counted.
  if (!before) {
    await cacheGuildInvites(member.guild);
    return;
  }

  try {
    const currentInvites = await member.guild.invites.fetch();

    let usedInvite = null;

    for (const invite of currentInvites.values()) {
      const oldUses = before.get(invite.code) || 0;
      const newUses = invite.uses || 0;

      if (newUses > oldUses) {
        usedInvite = invite;
        break;
      }
    }

    // Refresh cache for the next join.
    gcubeInviteCache.set(
      member.guild.id,
      new Map(
        currentInvites.map(invite => [invite.code, invite.uses || 0])
      )
    );

    // Vanity URL, unavailable permissions, or uncertain attribution:
    // don't award an invite to a guessed inviter.
    if (!usedInvite || !usedInvite.inviter || usedInvite.inviter.bot) {
      return;
    }

    const data = loadData();
    if (!data) return;

    const party = data.gcubeParty;
    if (!party.inviteTracking) party.inviteTracking = {};
    if (!party.inviteTracking.countedMembers) {
      party.inviteTracking.countedMembers = {};
    }

    // A person can only count once across leave/rejoin cycles.
    const memberKey = `${member.guild.id}:${member.id}`;

    if (party.inviteTracking.countedMembers[memberKey]) return;

    const inviterId = usedInvite.inviter.id;
    const inviter = getUser(data, inviterId);

    inviter.invites.total += 1;
    party.inviteTracking.countedMembers[memberKey] = {
      inviterId,
      guildId: member.guild.id,
      joinedAt: new Date().toISOString()
    };

    party.history.push({
      type: "successful_invite",
      inviterId,
      memberId: member.id,
      guildId: member.guild.id,
      time: new Date().toISOString()
    });

    saveData(data);
  } catch (error) {
    console.error("GCube Party invite tracking error:", error.message);
  }
}

async function handleGCubeInvites(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua. Bot logs check karo.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  const rewardLines = INVITE_REWARDS.map(tier => {
    const eligible = user.invites.total >= tier.invites;
    const claimed = user.invites.claimed.includes(tier.invites);

    let status = "🔒 Locked";
    if (claimed) status = "✅ Claimed";
    else if (eligible) status = "🎁 Ready to claim";

    return `${eligible ? "🟢" : "⚪"} **${tier.invites} invites → ${tier.reward} GC**\n└ ${status}`;
  });

  const embed = makeEmbed(
    "🎟️ Your Invite Rewards",
    `👤 ${interaction.user.username}\n` +
    `🎟️ **Successful invites:** ${user.invites.total}\n\n` +
    rewardLines.join("\n\n") +
    "\n\nInvite progress daily reset nahi hoti.\n" +
    "Reward ke liye `/gcube-invite-claim` use karo."
  );

  if (!saveData(data)) {
    return interaction.reply({
      content: "❌ Data save nahi hua.",
      ephemeral: true
    });
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleGCubeInviteClaim(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  const eligible = INVITE_REWARDS.filter(tier =>
    user.invites.total >= tier.invites &&
    !user.invites.claimed.includes(tier.invites)
  );

  if (eligible.length === 0) {
    return interaction.reply({
      content: "🎟️ Abhi koi naya invite milestone reward available nahi hai.",
      ephemeral: true
    });
  }

  const total = eligible.reduce((sum, tier) => sum + tier.reward, 0);

  for (const tier of eligible) {
    user.invites.claimed.push(tier.invites);
  }

  addGC(user, total);

  data.gcubeParty.history.push({
    type: "invite_milestone_reward",
    userId: interaction.user.id,
    amount: total,
    milestones: eligible.map(tier => tier.invites),
    time: new Date().toISOString()
  });

  if (!saveData(data)) {
    return interaction.reply({
      content: "❌ Reward save nahi hua. Dobara try karne se pehle admin ko logs check karne bolo.",
      ephemeral: true
    });
  }

  return interaction.reply({
    content:
      `🎉 Invite rewards claimed: **${total} GC**!\n` +
      `💎 New balance: **${user.balance} GC**`,
    ephemeral: true
  });
}

// Export commands and handlers for index.js integration later.
module.exports.gcubeInviteRewardsCommand = gcubeInviteRewardsCommand;
module.exports.gcubeInviteClaimCommand = gcubeInviteClaimCommand;
module.exports.handleGCubeInvites = handleGCubeInvites;
module.exports.handleGCubeInviteClaim = handleGCubeInviteClaim;
module.exports.cacheGuildInvites = cacheGuildInvites;
module.exports.handleGCubeMemberJoin = handleGCubeMemberJoin;
// ==========================================
// GCUBE PARTY - PART 4: DAILY QUESTS
// ==========================================

const gcubeQuestsCommand = new SlashCommandBuilder()
  .setName("gcube-quests")
  .setDescription("Daily quests aur progress dekho");

const gcubeQuestClaimCommand = new SlashCommandBuilder()
  .setName("gcube-quest-claim")
  .setDescription("Complete daily quests ke GC claim karo");

const GCUBE_DAILY_QUESTS = [
  { id: "messages_20", messages: 20, reward: 5, name: "Active Member" },
  { id: "messages_50", messages: 50, reward: 10, name: "Chat Champion" },
  { id: "messages_200", messages: 200, reward: 20, name: "Chat Legend" }
];

function buildGCubeQuestEmbed(user) {
  const count = user.quests.messageCount || 0;

  const lines = GCUBE_DAILY_QUESTS.map(quest => {
    const claimed = user.quests.claimed.includes(quest.id);
    const completed = count >= quest.messages;

    let status = "🔒 In progress";

    if (claimed) status = "✅ Claimed";
    else if (completed) status = "🎁 Ready to claim";

    return (
      `**${quest.name}**\n` +
      `💬 Messages: ${Math.min(count, quest.messages)}/${quest.messages}\n` +
      `💎 Reward: ${quest.reward} GC\n` +
      `Status: ${status}`
    );
  });

  return makeEmbed(
    "🎯 Daily Quests",
    `💬 Today's messages: **${count}**\n\n` +
    lines.join("\n\n") +
    "\n\n🌅 Quests reset at midnight India time.\n" +
    "💎 Your existing GC balance will never reset."
  );
}

function buildGCubeQuestButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gcube_quests_refresh")
      .setLabel("Refresh")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("gcube_quests_claim")
      .setLabel("Claim Quest Rewards")
      .setEmoji("🎁")
      .setStyle(ButtonStyle.Success)
  );
}

async function handleGCubeQuests(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua. Admin ko logs check karne bolo.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  if (!user.quests.messageCount) {
    user.quests.messageCount = 0;
  }

  if (!Array.isArray(user.quests.claimed)) {
    user.quests.claimed = [];
  }

  if (!saveData(data)) {
    return interaction.reply({
      content: "❌ Quest data save nahi hua.",
      ephemeral: true
    });
  }

  return interaction.reply({
    embeds: [buildGCubeQuestEmbed(user)],
    components: [buildGCubeQuestButtons()],
    ephemeral: true
  });
}

async function handleGCubeQuestClaim(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  if (!user.quests.messageCount) {
    user.quests.messageCount = 0;
  }

  if (!Array.isArray(user.quests.claimed)) {
    user.quests.claimed = [];
  }

  const eligible = GCUBE_DAILY_QUESTS.filter(quest =>
    user.quests.messageCount >= quest.messages &&
    !user.quests.claimed.includes(quest.id)
  );

  if (eligible.length === 0) {
    return interaction.reply({
      content: "🎯 Abhi koi new quest reward claim karne ke liye available nahi hai.",
      ephemeral: true
    });
  }

  const totalReward = eligible.reduce(
    (total, quest) => total + quest.reward,
    0
  );

  // Mark every eligible quest before saving.
  for (const quest of eligible) {
    user.quests.claimed.push(quest.id);
  }

  addGC(user, totalReward);

  if (!Array.isArray(data.gcubeParty.history)) {
    data.gcubeParty.history = [];
  }

  data.gcubeParty.history.push({
    type: "daily_quest_reward",
    userId: interaction.user.id,
    amount: totalReward,
    quests: eligible.map(quest => quest.id),
    date: todayIndia(),
    time: new Date().toISOString()
  });

  if (!saveData(data)) {
    return interaction.reply({
      content: "❌ Reward save nahi hua. Admin ko logs check karne bolo.",
      ephemeral: true
    });
  }

  return interaction.reply({
    content:
      `🎉 Quest rewards claimed: **${totalReward} GC**!\n` +
      `💎 New balance: **${user.balance} GC**\n` +
      `🎯 Completed quests: ${eligible.map(q => q.name).join(", ")}`,
    ephemeral: true
  });
}

async function handleGCubeQuestButton(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  if (!user.quests.messageCount) {
    user.quests.messageCount = 0;
  }

  if (!Array.isArray(user.quests.claimed)) {
    user.quests.claimed = [];
  }

  if (interaction.customId === "gcube_quests_refresh") {
    if (!saveData(data)) {
      return interaction.reply({
        content: "❌ Progress save nahi hua.",
        ephemeral: true
      });
    }

    return interaction.update({
      embeds: [buildGCubeQuestEmbed(user)],
      components: [buildGCubeQuestButtons()]
    });
  }

  if (interaction.customId === "gcube_quests_claim") {
    const eligible = GCUBE_DAILY_QUESTS.filter(quest =>
      user.quests.messageCount >= quest.messages &&
      !user.quests.claimed.includes(quest.id)
    );

    if (eligible.length === 0) {
      return interaction.reply({
        content: "🎯 Abhi koi quest reward available nahi hai.",
        ephemeral: true
      });
    }

    const totalReward = eligible.reduce(
      (total, quest) => total + quest.reward,
      0
    );

    for (const quest of eligible) {
      user.quests.claimed.push(quest.id);
    }

    addGC(user, totalReward);

    if (!Array.isArray(data.gcubeParty.history)) {
      data.gcubeParty.history = [];
    }

    data.gcubeParty.history.push({
      type: "daily_quest_reward",
      userId: interaction.user.id,
      amount: totalReward,
      quests: eligible.map(quest => quest.id),
      date: todayIndia(),
      time: new Date().toISOString()
    });

    if (!saveData(data)) {
      return interaction.reply({
        content: "❌ Reward save nahi hua.",
        ephemeral: true
      });
    }

    return interaction.update({
      embeds: [
        buildGCubeQuestEmbed(user).setDescription(
          `🎉 **${totalReward} GC claimed!**\n` +
          `💎 Balance: **${user.balance} GC**\n\n` +
          GCUBE_DAILY_QUESTS.map(quest => {
            const claimed = user.quests.claimed.includes(quest.id);
            return `${claimed ? "✅" : "🔒"} ${quest.name} — ${quest.reward} GC`;
          }).join("\n")
        )
      ],
      components: [buildGCubeQuestButtons()]
    });
  }
}

// Export commands and handlers for index.js integration later.
module.exports.gcubeQuestsCommand = gcubeQuestsCommand;
module.exports.gcubeQuestClaimCommand = gcubeQuestClaimCommand;
module.exports.handleGCubeQuests = handleGCubeQuests;
module.exports.handleGCubeQuestClaim = handleGCubeQuestClaim;
module.exports.handleGCubeQuestButton = handleGCubeQuestButton;
// ==========================================
// GCUBE PARTY - PART 5: SHOP & BUY
// ==========================================

const gcubeShopCommand = new SlashCommandBuilder()
  .setName("gcube-shop")
  .setDescription("GCube Party ki shop dekho");

const gcubeBuyCommand = new SlashCommandBuilder()
  .setName("gcube-buy")
  .setDescription("GC se collectible ya item khareedo")
  .addStringOption(option =>
    option
      .setName("item")
      .setDescription("Item ID select karo")
      .setRequired(true)
      .addChoices(
        { name: "Shadow Wolf - 100 GC", value: "shadow_wolf" },
        { name: "Flame Dragon - 300 GC", value: "flame_dragon" },
        { name: "Dark Warrior - 500 GC", value: "dark_warrior" },
        { name: "Royal King - 750 GC", value: "royal_king" },
        { name: "Cosmic Phantom - 1500 GC", value: "cosmic_phantom" },
        { name: "Golden Elyx - 3000 GC", value: "golden_elyx" },
        { name: "Diamond Frame - 250 GC", value: "diamond_frame" },
        { name: "Golden Frame - 500 GC", value: "golden_frame" },
        { name: "Profile Background - 200 GC", value: "profile_background" },
        { name: "Custom Nameplate - 400 GC", value: "custom_nameplate" },
        { name: "Upgrade Stone - 100 GC", value: "upgrade_stone" },
        { name: "Diamond Core - 500 GC", value: "diamond_core" },
        { name: "Flame Essence - 750 GC", value: "flame_essence" },
        { name: "Cosmic Crystal - 1500 GC", value: "cosmic_crystal" },
        { name: "Elyx Core - 3000 GC", value: "elyx_core" }
      )
  );

// SHOP COMMAND
async function handleGCubeShop(interaction) {
  const embed = makeEmbed(
    "🛍️ GCube Party Shop",
    "Items khareedne ke liye `/gcube-buy` use karo.\n" +
    "Neeche available items aur prices hain."
  );

  for (const item of SHOP_ITEMS) {
    embed.addFields({
      name: `${item.emoji} ${item.name}`,
      value:
        `💎 Price: **${item.price.toLocaleString()} GC**\n` +
        `⭐ Rarity: **${item.rarity}**\n` +
        `🆔 ID: \`${item.id}\``,
      inline: true
    });
  }

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

// BUY COMMAND
async function handleGCubeBuy(interaction) {
  const data = loadData();

  if (!data) {
    return interaction.reply({
      content: "❌ Data load nahi hua. Admin ko logs check karne bolo.",
      ephemeral: true
    });
  }

  const itemId = interaction.options.getString("item", true);
  const item = SHOP_ITEMS.find(entry => entry.id === itemId);

  if (!item) {
    return interaction.reply({
      content: "❌ Ye item shop mein available nahi hai.",
      ephemeral: true
    });
  }

  const user = getUser(data, interaction.user.id);

  // Collectibles can only be owned once.
  if (
    item.type === "collectible" &&
    user.collection.some(owned => owned.id === item.id)
  ) {
    return interaction.reply({
      content: `🎴 Tumhare paas **${item.name}** pehle se hai!`,
      ephemeral: true
    });
  }

  if (user.balance < item.price) {
    return interaction.reply({
      content:
        `❌ Tumhare paas enough GC nahi hain!\n` +
        `💎 Price: **${item.price} GC**\n` +
        `💰 Tumhara balance: **${user.balance} GC**`,
      ephemeral: true
    });
  }

  // Deduct GC only after validating the purchase.
  if (!spendGC(user, item.price)) {
    return interaction.reply({
      content: "❌ Purchase nahi ho saka. Dobara try karo.",
      ephemeral: true
    });
  }

  // Save every purchase as an inventory entry.
  user.collection.push({
    id: item.id,
    name: item.name,
    type: item.type,
    rarity: item.rarity,
    emoji: item.emoji,
    paid: item.price,
    purchasedAt: new Date().toISOString(),
    level: 1
  });

  if (!Array.isArray(data.gcubeParty.history)) {
    data.gcubeParty.history = [];
  }

  data.gcubeParty.history.push({
    type: "shop_purchase",
    userId: interaction.user.id,
    itemId: item.id,
    itemName: item.name,
    amount: item.price,
    time: new Date().toISOString()
  });

  if (!saveData(data)) {
    return interaction.reply({
      content: "❌ Purchase save nahi hua. Admin ko logs check karne bolo.",
      ephemeral: true
    });
  }

  const embed = makeEmbed(
    "Purchase Successful!",
    `${item.emoji} **${item.name}** successfully khareed liya!\n\n` +
    `💸 Spent: **${item.price.toLocaleString()} GC**\n` +
    `💎 Remaining balance: **${user.balance.toLocaleString()} GC**\n` +
    `⭐ Rarity: **${item.rarity}**\n\n` +
    "🎴 Item tumhari collection mein save ho gaya!"
  );

  embed.setThumbnail(
    interaction.user.displayAvatarURL({ size: 256 })
  );

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

// EXPORT COMMANDS
module.exports.gcubeShopCommand = gcubeShopCommand;
module.exports.gcubeBuyCommand = gcubeBuyCommand;
module.exports.handleGCubeShop = handleGCubeShop;
module.exports.handleGCubeBuy = handleGCubeBuy;
// ===============================
// GCUBE PARTY — PART 6
// COLLECTION + PROFILE
// ===============================

const gcubeCollectionCommand = new SlashCommandBuilder()
  .setName("gcube-collection")
  .setDescription("View your GCube collectible collection");

const gcubeProfileCommand = new SlashCommandBuilder()
  .setName("gcube-profile")
  .setDescription("View a player's GCube profile")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Player whose profile you want to view")
      .setRequired(false)
  );

function handleGCubeCollection(interaction) {
  const data = loadData();
  const user = getUser(data, interaction.user.id);

  const items = user.collection || [];

  const embed = makeEmbed(
    "🎒 GCube Collection",
    `**${interaction.user.username}**'s collectibles\n\n` +
    `🃏 Total items: **${items.length}**\n` +
    `💰 GC Balance: **${user.balance} GC**`
  );

  if (items.length === 0) {
    embed.addFields({
      name: "Empty Collection",
      value: "You have no collectibles yet. Use `/gcube-shop` to browse items."
    });
  } else {
    const display = items.slice(0, 20).map((item, index) => {
      const level = item.level || 1;
      const rarity = item.rarity || "Common";

      return `**${index + 1}.** ${item.emoji || "🃏"} **${item.name}**\n` +
        `└ Rarity: ${rarity} • Level: ${level} • Paid: ${item.paid || 0} GC`;
    });

    embed.addFields({
      name: "Your Items",
      value: display.join("\n\n").slice(0, 1024)
    });

    if (items.length > 20) {
      embed.setFooter({
        text: `Showing first 20 of ${items.length} items`
      });
    }
  }

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

function handleGCubeProfile(interaction) {
  const data = loadData();

  const target =
    interaction.options.getUser("user") || interaction.user;

  const user = getUser(data, target.id);
  const items = user.collection || [];

  const rarestItem = items.reduce((best, item) => {
    const rarityScore = {
      Common: 1,
      Uncommon: 2,
      Rare: 3,
      Epic: 4,
      Legendary: 5,
      Mythic: 6
    };

    const currentScore = rarityScore[item.rarity] || 1;
    const bestScore = best ? (rarityScore[best.rarity] || 1) : 0;

    return currentScore > bestScore ? item : best;
  }, null);

  const embed = makeEmbed(
    `👤 ${target.username}'s GCube Profile`,
    `**💰 Balance:** ${user.balance} GC\n` +
    `🃏 **Collection:** ${items.length} items\n` +
    `📈 **Total earned:** ${user.totalEarned || 0} GC\n` +
    `📉 **Total spent:** ${user.totalSpent || 0} GC\n` +
    `🏆 **Rarest item:** ${rarestItem ? rarestItem.name : "None yet"}`
  );

  embed.setThumbnail(target.displayAvatarURL({ size: 256 }));

  if (user.equippedFrame) {
    embed.addFields({
      name: "🖼️ Equipped Frame",
      value: String(user.equippedFrame),
      inline: true
    });
  }

  if (user.equippedBackground) {
    embed.addFields({
      name: "🌄 Equipped Background",
      value: String(user.equippedBackground),
      inline: true
    });
  }

  return interaction.reply({
    embeds: [embed],
    ephemeral: false
  });
}

module.exports.gcubeCollectionCommand = gcubeCollectionCommand;
module.exports.gcubeProfileCommand = gcubeProfileCommand;
module.exports.handleGCubeCollection = handleGCubeCollection;
module.exports.handleGCubeProfile = handleGCubeProfile;
// ===============================
// GCUBE PARTY — PART 7
// SHOWCASE + LEADERBOARD
// ===============================

const gcubeShowcaseCommand = new SlashCommandBuilder()
  .setName("gcube-showcase")
  .setDescription("Show your favorite collectible")
  .addStringOption(option =>
    option
      .setName("item")
      .setDescription("Exact name of the item you own")
      .setRequired(true)
  );

const gcubeTopCommand = new SlashCommandBuilder()
  .setName("gcube-top")
  .setDescription("View the GCube Party richest players");

function handleGCubeShowcase(interaction) {
  const data = loadData();
  const user = getUser(data, interaction.user.id);
  const requestedName = interaction.options.getString("item").trim();

  const item = (user.collection || []).find(
    entry => entry.name.toLowerCase() === requestedName.toLowerCase()
  );

  if (!item) {
    return interaction.reply({
      content: "❌ You don't own that item. Check `/gcube-collection` for your items.",
      ephemeral: true
    });
  }

  user.favoriteShowcase = item.id;
  saveData(data);

  const embed = makeEmbed(
    "✨ GCube Showcase",
    `**${interaction.user.username}** is showing off:\n\n` +
    `${item.emoji || "🃏"} **${item.name}**\n` +
    `💎 Rarity: **${item.rarity || "Common"}**\n` +
    `⭐ Level: **${item.level || 1}**\n` +
    `💰 Original price: **${item.paid || 0} GC**`
  );

  embed.setThumbnail(interaction.user.displayAvatarURL({ size: 256 }));

  return interaction.reply({ embeds: [embed] });
}

function handleGCubeTop(interaction) {
  const data = loadData();
  const users = data.gcubeParty?.users || {};

  const ranking = Object.entries(users)
    .map(([userId, user]) => ({
      userId,
      balance: Number(user.balance) || 0,
      totalEarned: Number(user.totalEarned) || 0,
      items: Array.isArray(user.collection) ? user.collection.length : 0
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);

  const embed = makeEmbed(
    "🏆 GCube Party Leaderboard",
    "Top 10 players ranked by current GC balance."
  );

  if (ranking.length === 0) {
    embed.addFields({
      name: "No Players Yet",
      value: "Play GCube Party to appear on the leaderboard!"
    });
  } else {
    embed.addFields({
      name: "💰 Richest Players",
      value: ranking.map((player, index) =>
        `**${index + 1}.** <@${player.userId}> — **${player.balance} GC**`
      ).join("\n")
    });
  }

  embed.setFooter({ text: "GC balances are saved and do not reset daily." });

  return interaction.reply({ embeds: [embed] });
}

module.exports.gcubeShowcaseCommand = gcubeShowcaseCommand;
module.exports.gcubeTopCommand = gcubeTopCommand;
module.exports.handleGCubeShowcase = handleGCubeShowcase;
module.exports.handleGCubeTop = handleGCubeTop;
// ===============================
// GCUBE PARTY — PART 8
// COLLECTIBLE UPGRADE SYSTEM
// ===============================

const gcubeUpgradeCommand = new SlashCommandBuilder()
  .setName("gcube-upgrade")
  .setDescription("Upgrade a collectible you own")
  .addStringOption(option =>
    option
      .setName("item")
      .setDescription("Name of the collectible to upgrade")
      .setRequired(true)
  );

const GCUBE_UPGRADE_PATHS = {
  "Shadow Wolf": {
    next: "Dark Shadow Wolf",
    material: "Upgrade Stone",
    amount: 1,
    cost: 100,
    rarity: "Rare",
    emoji: "🐺"
  },
  "Dark Shadow Wolf": {
    next: "Shadow King",
    material: "Diamond Core",
    amount: 1,
    cost: 250,
    rarity: "Epic",
    emoji: "👑"
  },
  "Flame Dragon": {
    next: "Inferno Dragon",
    material: "Flame Essence",
    amount: 1,
    cost: 300,
    rarity: "Epic",
    emoji: "🐉"
  },
  "Royal King": {
    next: "Cosmic King",
    material: "Cosmic Crystal",
    amount: 1,
    cost: 500,
    rarity: "Legendary",
    emoji: "🌌"
  },
  "Cosmic Phantom": {
    next: "Eternal Phantom",
    material: "Elyx Core",
    amount: 1,
    cost: 750,
    rarity: "Mythic",
    emoji: "👻"
  }
};

function handleGCubeUpgrade(interaction) {
  const data = loadData();
  const user = getUser(data, interaction.user.id);

  const requestedName = interaction.options
    .getString("item")
    .trim();

  const inventory = user.collection || [];

  const itemIndex = inventory.findIndex(item =>
    item.name.toLowerCase() === requestedName.toLowerCase()
  );

  if (itemIndex === -1) {
    return interaction.reply({
      content: "❌ You don't own that collectible. Check `/gcube-collection`.",
      ephemeral: true
    });
  }

  const item = inventory[itemIndex];
  const upgrade = GCUBE_UPGRADE_PATHS[item.name];

  if (!upgrade) {
    return interaction.reply({
      content: "❌ This collectible has no upgrade path yet.",
      ephemeral: true
    });
  }

  const materialIndex = inventory.findIndex(material =>
    material.name === upgrade.material
  );

  if (materialIndex === -1) {
    return interaction.reply({
      content:
        `❌ You need **${upgrade.amount} ${upgrade.material}** to upgrade **${item.name}**.`,
      ephemeral: true
    });
  }

  if ((Number(user.balance) || 0) < upgrade.cost) {
    return interaction.reply({
      content: `❌ You need **${upgrade.cost} GC** for this upgrade.`,
      ephemeral: true
    });
  }

  // Deduct the upgrade fee.
  if (!spendGC(data, user, upgrade.cost)) {
    return interaction.reply({
      content: "❌ Not enough GC.",
      ephemeral: true
    });
  }

  // Consume the required material.
  inventory.splice(materialIndex, 1);

  // Upgrade the existing collectible instead of creating a duplicate.
  item.name = upgrade.next;
  item.rarity = upgrade.rarity;
  item.emoji = upgrade.emoji;
  item.level = (Number(item.level) || 1) + 1;
  item.upgradedAt = new Date().toISOString();

  data.gcubeParty.history.push({
    userId: interaction.user.id,
    type: "upgrade",
    item: item.name,
    cost: upgrade.cost,
    date: new Date().toISOString()
  });

  saveData(data);

  const embed = makeEmbed(
    "✨ Collectible Upgraded!",
    `${upgrade.emoji} **${item.name}**\n\n` +
    `💎 Rarity: **${item.rarity}**\n` +
    `⭐ Level: **${item.level}**\n` +
    `💰 Upgrade fee: **${upgrade.cost} GC**\n` +
    `🧪 Material used: **${upgrade.material}**`
  );

  return interaction.reply({ embeds: [embed] });
}

module.exports.gcubeUpgradeCommand = gcubeUpgradeCommand;
module.exports.gcubeUpgradeCommand = gcubeUpgradeCommand;
module.exports.handleGCubeUpgrade = handleGCubeUpgrade;
// ========================================
// GCUBE PARTY — PART 9
// GC TRANSFER + ITEM SELLING
// ========================================

// TRANSFER GC
const gcubePayCommand = new SlashCommandBuilder()
  .setName("gcube-pay")
  .setDescription("Send GC to another player")
  .addUserOption(option =>
    option.setName("user")
      .setDescription("Player receiving GC")
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName("amount")
      .setDescription("Amount of GC to send")
      .setMinValue(1)
      .setRequired(true)
  );

// SELL A COLLECTIBLE
const gcubeSellCommand = new SlashCommandBuilder()
  .setName("gcube-sell")
  .setDescription("Sell one of your collectibles")
  .addStringOption(option =>
    option.setName("item")
      .setDescription("Exact name of the collectible")
      .setRequired(true)
  );

// Send GC safely
function handleGCubePay(interaction) {
  const data = loadData();

  const senderId = interaction.user.id;
  const receiver = interaction.options.getUser("user");
  const amount = interaction.options.getInteger("amount");

  if (receiver.bot || receiver.id === senderId) {
    return interaction.reply({
      content: "❌ You can't send GC to yourself or a bot.",
      ephemeral: true
    });
  }

  const sender = getUser(data, senderId);
  const recipient = getUser(data, receiver.id);

  if (!Number.isSafeInteger(amount) || amount < 1) {
    return interaction.reply({
      content: "❌ Enter a valid positive amount.",
      ephemeral: true
    });
  }

  if ((Number(sender.balance) || 0) < amount) {
    return interaction.reply({
      content: "❌ You don't have enough GC.",
      ephemeral: true
    });
  }

  if (!spendGC(data, sender, amount)) {
    return interaction.reply({
      content: "❌ Transfer failed: insufficient balance.",
      ephemeral: true
    });
  }

  addGC(data, recipient, amount);

  data.gcubeParty.history.push({
    type: "transfer_sent",
    userId: senderId,
    targetId: receiver.id,
    amount,
    date: new Date().toISOString()
  });

  data.gcubeParty.history.push({
    type: "transfer_received",
    userId: receiver.id,
    targetId: senderId,
    amount,
    date: new Date().toISOString()
  });

  saveData(data);

  return interaction.reply({
    content:
      `✅ <@${senderId}> sent **${amount} GC** to ${receiver}!\n` +
      `💰 Your remaining balance: **${sender.balance} GC**`,
    allowedMentions: { users: [senderId, receiver.id] }
  });
}

// Sell collectible for 50% of its recorded purchase price.
function handleGCubeSell(interaction) {
  const data = loadData();
  const user = getUser(data, interaction.user.id);

  const requestedName = interaction.options
    .getString("item")
    .trim();

  const inventory = user.collection || [];

  const itemIndex = inventory.findIndex(item =>
    item.name.toLowerCase() === requestedName.toLowerCase()
  );

  if (itemIndex === -1) {
    return interaction.reply({
      content: "❌ You don't own that item. Check `/gcube-collection`.",
      ephemeral: true
    });
  }

  const item = inventory[itemIndex];
  const paid = Math.max(0, Number(item.paid) || 0);
  const sellPrice = Math.floor(paid / 2);

  // Remove only the item being sold.
  inventory.splice(itemIndex, 1);

  if (sellPrice > 0) {
    addGC(data, user, sellPrice);
  }

  data.gcubeParty.history.push({
    type: "item_sold",
    userId: interaction.user.id,
    item: item.name,
    amount: sellPrice,
    date: new Date().toISOString()
  });

  saveData(data);

  return interaction.reply({
    content:
      `✅ Sold **${item.name}** for **${sellPrice} GC**.\n` +
      `💰 Current balance: **${user.balance} GC**`,
    ephemeral: true
  });
}

module.exports.gcubePayCommand = gcubePayCommand;
module.exports.gcubeSellCommand = gcubeSellCommand;
module.exports.handleGCubePay = handleGCubePay;
module.exports.handleGCubeSell = handleGCubeSell;
// ========================================
// GCUBE PARTY — PART 10
// TRANSACTION HISTORY
// ========================================

const gcubeHistoryCommand = new SlashCommandBuilder()
  .setName("gcube-history")
  .setDescription("View your recent GCube transactions");

function handleGCubeHistory(interaction) {
  const data = loadData();
  const userId = interaction.user.id;

  const history = Array.isArray(data.gcubeParty?.history)
    ? data.gcubeParty.history
    : [];

  const records = history
    .filter(entry =>
      entry.userId === userId ||
      (
        entry.type === "transfer_received" &&
        entry.userId === userId
      )
    )
    .slice(-10)
    .reverse();

  const embed = makeEmbed(
    "📜 GCube Transaction History",
    `Recent transactions for **${interaction.user.username}**`
  );

  if (records.length === 0) {
    embed.addFields({
      name: "No Transactions",
      value: "Your GCube transactions will appear here."
    });
  } else {
    const lines = records.map((entry, index) => {
      const date = entry.date
        ? new Date(entry.date).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata"
          })
        : "Unknown date";

      let description = entry.type || "Transaction";

      if (entry.type === "purchase") {
        description = `🛒 Purchased ${entry.item || "item"}`;
      } else if (entry.type === "upgrade") {
        description = `⬆️ Upgraded ${entry.item || "item"}`;
      } else if (entry.type === "item_sold") {
        description = `💰 Sold ${entry.item || "item"}`;
      } else if (entry.type === "transfer_sent") {
        description = `📤 Sent GC to <@${entry.targetId}>`;
      } else if (entry.type === "transfer_received") {
        description = `📥 Received GC from <@${entry.targetId}>`;
      } else if (entry.type === "daily_reward") {
        description = "🎁 Claimed daily reward";
      }

      const amount = Number(entry.amount ?? entry.cost ?? 0);

      return `**${index + 1}.** ${description}\n` +
        `└ GC: **${amount}** • ${date}`;
    });

    embed.addFields({
      name: "Latest Transactions",
      value: lines.join("\n\n").slice(0, 1024)
    });
  }

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

module.exports.gcubeHistoryCommand = gcubeHistoryCommand;
module.exports.handleGCubeHistory = handleGCubeHistory;
