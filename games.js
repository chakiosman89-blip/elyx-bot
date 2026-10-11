// ==================================================
// ELYX TRADING — GCUBE PARTY
// PART 1: CORE SYSTEM + BALANCE
// ==================================================

const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ==================================================
// DATA STORAGE
// ==================================================

const GCUBE_DATA_FILE = path.join(__dirname, "data.json");

function loadGCubeData() {
  try {
    if (!fs.existsSync(GCUBE_DATA_FILE)) {
      return {
        gcubeParty: {
          users: {},
          history: [],
          invites: {},
          settings: {}
        }
      };
    }

    const raw = fs.readFileSync(GCUBE_DATA_FILE, "utf8");
    const data = JSON.parse(raw);

    if (!data.gcubeParty) {
      data.gcubeParty = {};
    }

    const party = data.gcubeParty;

    if (!party.users) party.users = {};
    if (!Array.isArray(party.history)) party.history = [];
    if (!party.invites) party.invites = {};
    if (!party.settings) party.settings = {};

    return data;
  } catch (error) {
    console.error(
      "[GCube] Failed to load data:",
      error.message
    );

    throw new Error("GCube data could not be loaded.");
  }
}

// ==================================================
// SAFE DATA SAVING
// Preserves AI and other existing data.
// ==================================================

function saveGCubeData(data) {
  const tempFile = `${GCUBE_DATA_FILE}.gcube.tmp`;

  try {
    const serialized = JSON.stringify(data, null, 2);

    fs.writeFileSync(tempFile, serialized, "utf8");
    fs.renameSync(tempFile, GCUBE_DATA_FILE);

    return true;
  } catch (error) {
    console.error(
      "[GCube] Failed to save data:",
      error.message
    );

    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {}

    throw new Error("GCube data could not be saved.");
  }
}

// ==================================================
// USER ACCOUNT
// ==================================================

function getGCubeUser(data, userId) {
  const party = data.gcubeParty;

  if (!party.users[userId]) {
    party.users[userId] = {
      balance: 0,

      totalEarned: 0,
      totalSpent: 0,

      messagesToday: 0,
      messageDay: "",

      claimedMessageRewards: [],

      collection: [],
      materials: {},

      dailyQuests: {},
      weeklyQuests: {},

      achievements: [],
      titles: [],

      frames: [],
      backgrounds: [],
      nameplates: [],

      equipped: {
        frame: null,
        background: null,
        nameplate: null
      },

      createdAt: new Date().toISOString()
    };
  }

  const user = party.users[userId];

  if (!Number.isFinite(Number(user.balance))) {
    user.balance = 0;
  }

  if (!Array.isArray(user.collection)) {
    user.collection = [];
  }

  if (!user.materials || typeof user.materials !== "object") {
    user.materials = {};
  }

  if (!Array.isArray(user.claimedMessageRewards)) {
    user.claimedMessageRewards = [];
  }

  if (!user.equipped) {
    user.equipped = {
      frame: null,
      background: null,
      nameplate: null
    };
  }

  return user;
}

// ==================================================
// ECONOMY HELPERS
// ==================================================

function addGC(data, user, amount) {
  const value = Math.floor(Number(amount));

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid GC amount.");
  }

  const current = Number(user.balance) || 0;

  if (current + value > Number.MAX_SAFE_INTEGER) {
    throw new Error("GC balance limit reached.");
  }

  user.balance = current + value;
  user.totalEarned =
    (Number(user.totalEarned) || 0) + value;

  return user.balance;
}

function spendGC(data, user, amount) {
  const value = Math.floor(Number(amount));

  if (!Number.isSafeInteger(value) || value <= 0) {
    return false;
  }

  const balance = Number(user.balance) || 0;

  if (balance < value) {
    return false;
  }

  user.balance = balance - value;
  user.totalSpent =
    (Number(user.totalSpent) || 0) + value;

  return true;
}

function formatGC(amount) {
  return Math.floor(Number(amount) || 0).toLocaleString("en-IN");
}

// ==================================================
// ROOT COMMAND
// Every GCube feature will use /gcube.
// ==================================================

const gcubeCommand = new SlashCommandBuilder()
  .setName("gcube")
  .setDescription("GCube Party — economy, rewards and collectibles")

  .addSubcommand(sub =>
    sub
      .setName("balance")
      .setDescription("Check your GC wallet")
  );

// ==================================================
// SUBCOMMAND REGISTRY
// Later parts will register their handlers here.
// ==================================================

const gcubeSubcommandHandlers = new Map();

function registerGCubeSubcommand(name, handler) {
  if (gcubeSubcommandHandlers.has(name)) {
    throw new Error(
      `[GCube] Duplicate subcommand handler: ${name}`
    );
  }

  gcubeSubcommandHandlers.set(name, handler);
}

// ==================================================
// BALANCE COMMAND
// ==================================================

async function handleGCubeBalance(interaction) {
  const data = loadGCubeData();

  const user = getGCubeUser(
    data,
    interaction.user.id
  );

  // Save a newly created account.
  saveGCubeData(data);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("💰 GCube Wallet")
    .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription(
      `**${interaction.user.username}**'s GCube account`
    )
    .addFields(
      {
        name: "🪙 Current Balance",
        value: `**${formatGC(user.balance)} GC**`,
        inline: true
      },
      {
        name: "📈 Total Earned",
        value: `**${formatGC(user.totalEarned)} GC**`,
        inline: true
      },
      {
        name: "🛒 Total Spent",
        value: `**${formatGC(user.totalSpent)} GC**`,
        inline: true
      },
      {
        name: "🎒 Collectibles",
        value: `**${user.collection.length}**`,
        inline: true
      }
    )
    .setFooter({
      text: "Elyx Trading • GCube Party"
    })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

registerGCubeSubcommand(
  "balance",
  handleGCubeBalance
);

// ==================================================
// ROOT INTERACTION HANDLER
// ==================================================

async function handleGCubeRoot(interaction) {
  const subcommand = interaction.options.getSubcommand();

  const handler = gcubeSubcommandHandlers.get(subcommand);

  if (typeof handler !== "function") {
    return interaction.reply({
      content: "❌ This GCube feature is not available yet.",
      ephemeral: true
    });
  }

  try {
    await handler(interaction);
  } catch (error) {
    console.error(
      `[GCube] /gcube ${subcommand} failed:`,
      error
    );

    const reply = {
      content: "❌ GCube mein error aaya. Please try again.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

// ==================================================
// EXPORTS
// ==================================================

module.exports.gcubeCommand = gcubeCommand;
module.exports.handleGCubeRoot = handleGCubeRoot;
module.exports.loadGCubeData = loadGCubeData;
module.exports.saveGCubeData = saveGCubeData;
module.exports.getGCubeUser = getGCubeUser;
module.exports.addGC = addGC;
module.exports.spendGC = spendGC;
module.exports.formatGC = formatGC;
module.exports.registerGCubeSubcommand =
  registerGCubeSubcommand;
// ==================================================
// GCUBE PARTY — PART 2
// DAILY REWARDS + CLAIM SYSTEM
// ==================================================

const GCUBE_DAILY_REWARDS = [
  { day: 1, amount: 100 },
  { day: 2, amount: 150 },
  { day: 3, amount: 200 },
  { day: 4, amount: 250 },
  { day: 5, amount: 350 },
  { day: 6, amount: 450 },
  { day: 7, amount: 750 }
];

// India calendar date: YYYY-MM-DD
function getGCubeIndiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getGCubeYesterday() {
  const today = getGCubeIndiaDate();
  const date = new Date(`${today}T12:00:00+05:30`);

  date.setUTCDate(date.getUTCDate() - 1);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

// Add the subcommand to the existing root command.
gcubeCommand.addSubcommand(sub =>
  sub
    .setName("rewards")
    .setDescription("View and claim your daily GC rewards")
);

// Daily rewards handler
async function handleGCubeRewards(interaction) {
  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  if (!user.dailyRewards || typeof user.dailyRewards !== "object") {
    user.dailyRewards = {
      lastClaimDate: null,
      streak: 0,
      totalClaims: 0
    };
  }

  const today = getGCubeIndiaDate();
  const yesterday = getGCubeYesterday();

  const rewards = user.dailyRewards;
  const alreadyClaimed = rewards.lastClaimDate === today;

  let nextStreak;

  if (alreadyClaimed) {
    nextStreak = Math.max(1, Number(rewards.streak) || 1);
  } else if (rewards.lastClaimDate === yesterday) {
    nextStreak = (Number(rewards.streak) || 0) + 1;
  } else {
    nextStreak = 1;
  }

  const rewardDay = ((nextStreak - 1) % 7) + 1;
  const nextReward = GCUBE_DAILY_REWARDS[rewardDay - 1];

  const embed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle("🎁 GCube Daily Rewards")
    .setDescription(
      alreadyClaimed
        ? "✅ You have already claimed today's reward."
        : "Claim your daily GC and keep your streak alive!"
    )
    .addFields(
      {
        name: "💰 Today's Reward",
        value: `**${nextReward.amount.toLocaleString("en-IN")} GC**`,
        inline: true
      },
      {
        name: "🔥 Current Streak",
        value: `**${alreadyClaimed ? rewards.streak : nextStreak - 1} day(s)**`,
        inline: true
      },
      {
        name: "📅 Reward Day",
        value: `**Day ${rewardDay}/7**`,
        inline: true
      }
    )
    .setFooter({
      text: "Elyx Trading • GCube Party"
    })
    .setTimestamp();

  const button = new (
    require("discord.js").ActionRowBuilder
  )().addComponents(
    new (
      require("discord.js").ButtonBuilder
    )()
      .setCustomId("gcube_rewards_claim")
      .setLabel(alreadyClaimed ? "Already Claimed" : "Claim Daily Reward")
      .setStyle(
        alreadyClaimed
          ? require("discord.js").ButtonStyle.Secondary
          : require("discord.js").ButtonStyle.Success
      )
      .setDisabled(alreadyClaimed)
  );

  saveGCubeData(data);

  return interaction.reply({
    embeds: [embed],
    components: [button],
    ephemeral: true
  });
}

// Handle the claim button.
async function handleGCubeRewardButton(interaction) {
  if (interaction.customId !== "gcube_rewards_claim") {
    return;
  }

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  if (!user.dailyRewards || typeof user.dailyRewards !== "object") {
    user.dailyRewards = {
      lastClaimDate: null,
      streak: 0,
      totalClaims: 0
    };
  }

  const today = getGCubeIndiaDate();
  const yesterday = getGCubeYesterday();
  const rewards = user.dailyRewards;

  if (rewards.lastClaimDate === today) {
    return interaction.reply({
      content: "❌ You have already claimed today's reward.",
      ephemeral: true
    });
  }

  const streak =
    rewards.lastClaimDate === yesterday
      ? (Number(rewards.streak) || 0) + 1
      : 1;

  const rewardDay = ((streak - 1) % 7) + 1;
  const reward = GCUBE_DAILY_REWARDS[rewardDay - 1];

  addGC(data, user, reward.amount);

  rewards.lastClaimDate = today;
  rewards.streak = streak;
  rewards.totalClaims = (Number(rewards.totalClaims) || 0) + 1;

  data.gcubeParty.history.push({
    type: "daily_reward",
    userId: interaction.user.id,
    amount: reward.amount,
    date: today,
    timestamp: new Date().toISOString()
  });

  // Keep the history bounded.
  if (data.gcubeParty.history.length > 2000) {
    data.gcubeParty.history =
      data.gcubeParty.history.slice(-2000);
  }

  saveGCubeData(data);

  return interaction.update({
    content: `🎉 Daily reward claimed! You received **${reward.amount.toLocaleString("en-IN")} GC**.`,
    embeds: [],
    components: []
  });
}

// Register rewards in the existing subcommand system.
registerGCubeSubcommand(
  "rewards",
  handleGCubeRewards
);

// Export this handler for index.js button integration.
module.exports.handleGCubeRewardButton =
  handleGCubeRewardButton;
// ==================================================
// GCUBE PARTY — PART 3
// INVITE TRACKING + INVITE REWARDS
// ==================================================

const GCUBE_INVITE_REWARD = 100;

const gcubeInviteCache = new Map();

// Add /gcube invites to the existing root command.
gcubeCommand.addSubcommand(sub =>
  sub
    .setName("invites")
    .setDescription("View your invite statistics and rewards")
);

// Cache invite usage for a guild.
async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();

    const inviteData = new Map();

    for (const invite of invites.values()) {
      inviteData.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null
      });
    }

    gcubeInviteCache.set(guild.id, inviteData);

    return true;
  } catch (error) {
    console.error(
      `[GCube] Could not cache invites for ${guild.id}:`,
      error.message
    );

    return false;
  }
}

// Track a new member joining a server.
async function handleGCubeMemberJoin(client, member) {
  if (!member || !member.guild || member.user.bot) {
    return;
  }

  const guild = member.guild;
  const previousInvites = gcubeInviteCache.get(guild.id);

  if (!previousInvites) {
    await cacheGuildInvites(guild);
    return;
  }

  let currentInvites;

  try {
    currentInvites = await guild.invites.fetch();
  } catch (error) {
    console.error(
      `[GCube] Invite fetch failed for ${guild.id}:`,
      error.message
    );

    return;
  }

  let usedInvite = null;

  for (const invite of currentInvites.values()) {
    const previous = previousInvites.get(invite.code);

    const previousUses = previous?.uses || 0;
    const currentUses = invite.uses || 0;

    if (
      currentUses > previousUses &&
      invite.inviter?.id
    ) {
      usedInvite = invite;
      break;
    }
  }

  // Refresh the cache even when the inviter cannot be identified.
  const refreshedInvites = new Map();

  for (const invite of currentInvites.values()) {
    refreshedInvites.set(invite.code, {
      uses: invite.uses || 0,
      inviterId: invite.inviter?.id || null
    });
  }

  gcubeInviteCache.set(guild.id, refreshedInvites);

  if (!usedInvite || !usedInvite.inviter) {
    return;
  }

  const inviterId = usedInvite.inviter.id;

  // Never reward self-invites.
  if (inviterId === member.id) {
    return;
  }

  const data = loadGCubeData();

  const inviter = getGCubeUser(data, inviterId);

  if (!inviter.inviteStats) {
    inviter.inviteStats = {
      total: 0,
      rewarded: 0,
      invitedUsers: []
    };
  }

  if (!Array.isArray(inviter.inviteStats.invitedUsers)) {
    inviter.inviteStats.invitedUsers = [];
  }

  // Prevent duplicate rewards for the same member.
  if (inviter.inviteStats.invitedUsers.includes(member.id)) {
    return;
  }

  inviter.inviteStats.invitedUsers.push(member.id);
  inviter.inviteStats.total += 1;
  inviter.inviteStats.rewarded += GCUBE_INVITE_REWARD;

  addGC(data, inviter, GCUBE_INVITE_REWARD);

  data.gcubeParty.history.push({
    type: "invite_reward",
    userId: inviterId,
    invitedUserId: member.id,
    guildId: guild.id,
    amount: GCUBE_INVITE_REWARD,
    timestamp: new Date().toISOString()
  });

  if (data.gcubeParty.history.length > 2000) {
    data.gcubeParty.history =
      data.gcubeParty.history.slice(-2000);
  }

  saveGCubeData(data);

  console.log(
    `[GCube] Awarded ${GCUBE_INVITE_REWARD} GC to ${inviterId} for an invite.`
  );
}

// Show invite statistics.
async function handleGCubeInvites(interaction) {
  const data = loadGCubeData();

  const user = getGCubeUser(
    data,
    interaction.user.id
  );

  const stats = user.inviteStats || {
    total: 0,
    rewarded: 0,
    invitedUsers: []
  };

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle("🎟️ GCube Invite Rewards")
    .setDescription(
      "Invite real members and earn GC when their invite can be verified."
    )
    .addFields(
      {
        name: "👥 Tracked Invites",
        value: `**${stats.total || 0}**`,
        inline: true
      },
      {
        name: "💰 GC Earned",
        value: `**${formatGC(stats.rewarded || 0)} GC**`,
        inline: true
      },
      {
        name: "🎁 Reward Per Invite",
        value: `**${GCUBE_INVITE_REWARD} GC**`,
        inline: true
      }
    )
    .setFooter({
      text: "Elyx Trading • GCube Party"
    })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

// Register the subcommand handler.
registerGCubeSubcommand(
  "invites",
  handleGCubeInvites
);
// ==================================================
// GCUBE PARTY — PART 4
// DAILY QUESTS + MESSAGE TRACKING
// ==================================================

const GCUBE_QUESTS = [
  {
    id: "messages_10",
    name: "Chat Starter",
    description: "Send 10 messages in the server",
    target: 10,
    reward: 100
  },
  {
    id: "messages_25",
    name: "Active Member",
    description: "Send 25 messages in the server",
    target: 25,
    reward: 250
  },
  {
    id: "messages_50",
    name: "Chat Champion",
    description: "Send 50 messages in the server",
    target: 50,
    reward: 500
  }
];

gcubeCommand.addSubcommand(sub =>
  sub.setName("quests")
    .setDescription("View and claim your daily GCube quests")
);

function getGCubeQuestState(user) {
  const today = getGCubeIndiaDate();

  if (!user.questProgress || user.questProgress.date !== today) {
    user.questProgress = {
      date: today,
      messages: 0,
      claimed: []
    };
  }

  if (!Array.isArray(user.questProgress.claimed)) {
    user.questProgress.claimed = [];
  }

  return user.questProgress;
}

async function handleGCubeQuests(interaction) {
  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);
  const progress = getGCubeQuestState(user);

  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } =
    require("discord.js");

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("📜 GCube Daily Quests")
    .setDescription(
      `💬 Messages today: **${progress.messages}**\n\n` +
      "Complete quests to earn GC. Progress resets daily."
    )
    .setFooter({ text: "Elyx Trading • GCube Party" })
    .setTimestamp();

  const rows = [];

  for (const quest of GCUBE_QUESTS) {
    const claimed = progress.claimed.includes(quest.id);
    const completed = progress.messages >= quest.target;

    embed.addFields({
      name: `${claimed ? "✅" : completed ? "🎁" : "📌"} ${quest.name}`,
      value:
        `${quest.description}\n` +
        `Progress: **${Math.min(progress.messages, quest.target)}/${quest.target}**\n` +
        `Reward: **${formatGC(quest.reward)} GC**\n` +
        `Status: **${claimed ? "Claimed" : completed ? "Ready to claim" : "In progress"}**`,
      inline: false
    });

    if (completed && !claimed) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`gcube_quests_claim_${quest.id}`)
            .setLabel(`Claim ${quest.reward} GC`)
            .setStyle(ButtonStyle.Success)
        )
      );
    }
  }

  saveGCubeData(data);

  return interaction.reply({
    embeds: [embed],
    components: rows.slice(0, 5),
    ephemeral: true
  });
}

async function handleGCubeQuestButton(interaction) {
  if (!interaction.customId.startsWith("gcube_quests_claim_")) return;

  const questId = interaction.customId.replace(
    "gcube_quests_claim_",
    ""
  );

  const quest = GCUBE_QUESTS.find(item => item.id === questId);

  if (!quest) {
    return interaction.reply({
      content: "❌ This quest does not exist.",
      ephemeral: true
    });
  }

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);
  const progress = getGCubeQuestState(user);

  if (progress.claimed.includes(quest.id)) {
    return interaction.reply({
      content: "❌ You have already claimed this quest today.",
      ephemeral: true
    });
  }

  if (progress.messages < quest.target) {
    return interaction.reply({
      content: "❌ You haven't completed this quest yet.",
      ephemeral: true
    });
  }

  addGC(data, user, quest.reward);
  progress.claimed.push(quest.id);

  data.gcubeParty.history.push({
    type: "quest_reward",
    userId: interaction.user.id,
    questId: quest.id,
    amount: quest.reward,
    timestamp: new Date().toISOString()
  });

  if (data.gcubeParty.history.length > 2000) {
    data.gcubeParty.history = data.gcubeParty.history.slice(-2000);
  }

  saveGCubeData(data);

  return interaction.update({
    content: `✅ Quest completed! You received **${formatGC(quest.reward)} GC**.`,
    embeds: [],
    components: []
  });
}

async function handleGCubeMessage(message) {
  if (!message || !message.guild || message.author.bot) return;

  try {
    const data = loadGCubeData();
    const user = getGCubeUser(data, message.author.id);
    const progress = getGCubeQuestState(user);

    progress.messages += 1;
    user.messagesToday = progress.messages;
    user.messageDay = progress.date;

    saveGCubeData(data);
  } catch (error) {
    console.error("[GCube] Message tracking failed:", error.message);
  }
}

registerGCubeSubcommand("quests", handleGCubeQuests);

module.exports.handleGCubeQuestButton = handleGCubeQuestButton;
module.exports.handleGCubeMessage = handleGCubeMessage;
// ==================================================
// GCUBE PARTY — PART 5
// SHOP + BUY SYSTEM
// ==================================================

const GCUBE_SHOP_ITEMS = [
  { id: "bronze_crate", name: "📦 Bronze Crate", price: 250, rarity: "Common" },
  { id: "silver_crate", name: "🥈 Silver Crate", price: 750, rarity: "Uncommon" },
  { id: "gold_crate", name: "🥇 Gold Crate", price: 1500, rarity: "Rare" },
  { id: "diamond_crate", name: "💎 Diamond Crate", price: 5000, rarity: "Epic" },
  { id: "ruby", name: "❤️ Ruby", price: 400, rarity: "Rare" },
  { id: "sapphire", name: "💙 Sapphire", price: 400, rarity: "Rare" },
  { id: "emerald", name: "💚 Emerald", price: 600, rarity: "Epic" },
  { id: "golden_crown", name: "👑 Golden Crown", price: 10000, rarity: "Legendary" },
  { id: "fire_frame", name: "🔥 Fire Frame", price: 2500, rarity: "Epic" },
  { id: "ice_frame", name: "❄️ Ice Frame", price: 2500, rarity: "Epic" },
  { id: "neon_frame", name: "🌈 Neon Frame", price: 4000, rarity: "Legendary" },
  { id: "galaxy_bg", name: "🌌 Galaxy Background", price: 3500, rarity: "Epic" },
  { id: "sunset_bg", name: "🌅 Sunset Background", price: 1800, rarity: "Rare" },
  { id: "elite_plate", name: "⚡ Elite Nameplate", price: 3000, rarity: "Epic" },
  { id: "elyx_trophy", name: "🏆 Elyx Trophy", price: 15000, rarity: "Legendary" }
];

gcubeCommand.addSubcommand(sub =>
  sub.setName("shop")
    .setDescription("Browse GCube collectibles and cosmetics")
);

gcubeCommand.addSubcommand(sub =>
  sub.setName("buy")
    .setDescription("Purchase an item from the GCube shop")
    .addStringOption(option =>
      option.setName("item")
        .setDescription("Choose an item to purchase")
        .setRequired(true)
        .addChoices(
          ...GCUBE_SHOP_ITEMS.map(item => ({
            name: `${item.name} — ${item.price} GC`,
            value: item.id
          }))
        )
    )
);

async function handleGCubeShop(interaction) {
  const { EmbedBuilder } = require("discord.js");

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle("🛒 Elyx GCube Shop")
    .setDescription(
      "Purchase collectibles using your GC balance.\n" +
      "Use `/gcube buy` to choose an item."
    )
    .setFooter({ text: "Elyx Trading • GCube Party" })
    .setTimestamp();

  for (const item of GCUBE_SHOP_ITEMS) {
    embed.addFields({
      name: item.name,
      value: `Price: **${formatGC(item.price)} GC**\nRarity: **${item.rarity}**`,
      inline: true
    });
  }

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function handleGCubeBuy(interaction) {
  const itemId = interaction.options.getString("item", true);
  const item = GCUBE_SHOP_ITEMS.find(entry => entry.id === itemId);

  if (!item) {
    return interaction.reply({
      content: "❌ This item doesn't exist in the shop.",
      ephemeral: true
    });
  }

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  if (!Array.isArray(user.collection)) {
    user.collection = [];
  }

  if (user.collection.includes(item.id)) {
    return interaction.reply({
      content: "❌ You already own this item!",
      ephemeral: true
    });
  }

  if ((Number(user.balance) || 0) < item.price) {
    return interaction.reply({
      content:
        `❌ Not enough GC!\n` +
        `Item price: **${formatGC(item.price)} GC**\n` +
        `Your balance: **${formatGC(user.balance)} GC**`,
      ephemeral: true
    });
  }

  if (!spendGC(data, user, item.price)) {
    return interaction.reply({
      content: "❌ Purchase failed. Please try again.",
      ephemeral: true
    });
  }

  user.collection.push(item.id);

  data.gcubeParty.history.push({
    type: "shop_purchase",
    userId: interaction.user.id,
    itemId: item.id,
    amount: item.price,
    timestamp: new Date().toISOString()
  });

  if (data.gcubeParty.history.length > 2000) {
    data.gcubeParty.history = data.gcubeParty.history.slice(-2000);
  }

  saveGCubeData(data);

  return interaction.reply({
    content:
      `✅ Purchase successful!\n\n` +
      `Item: **${item.name}**\n` +
      `Rarity: **${item.rarity}**\n` +
      `Spent: **${formatGC(item.price)} GC**\n` +
      `Remaining balance: **${formatGC(user.balance)} GC**`,
    ephemeral: true
  });
}

registerGCubeSubcommand("shop", handleGCubeShop);
registerGCubeSubcommand("buy", handleGCubeBuy);
// ==================================================
// GCUBE PARTY — PART 6
// COLLECTION SYSTEM
// ==================================================

gcubeCommand.addSubcommand(sub =>
  sub.setName("collection")
    .setDescription("View your GCube item collection")
);

async function handleGCubeCollection(interaction) {
  const { EmbedBuilder } = require("discord.js");

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  const collection = Array.isArray(user.collection)
    ? user.collection
    : [];

  const ownedItems = collection
    .map(itemId => GCUBE_SHOP_ITEMS.find(item => item.id === itemId))
    .filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎒 ${interaction.user.username}'s Collection`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription(
      ownedItems.length
        ? ownedItems.map((item, index) =>
            `**${index + 1}. ${item.name}**\n` +
            `Rarity: ${item.rarity} • Price: ${formatGC(item.price)} GC`
          ).join("\n\n")
        : "Your collection is empty!\nUse `/gcube shop` to browse items."
    )
    .addFields({
      name: "📦 Total Items",
      value: `**${ownedItems.length}**`,
      inline: true
    })
    .setFooter({ text: "Elyx Trading • GCube Party" })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}


registerGCubeSubcommand("collection", handleGCubeCollection);
// ==================================================
// GCUBE PARTY — PART 7
// USER PROFILE SYSTEM
// ==================================================

gcubeCommand.addSubcommand(sub =>
  sub.setName("profile")
    .setDescription("View your GCube Party profile")
);

async function handleGCubeProfile(interaction) {
  const { EmbedBuilder } = require("discord.js");

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  const collection = Array.isArray(user.collection)
    ? user.collection
    : [];

  const questProgress = getGCubeQuestState(user);

  const inviteStats = user.inviteStats || {
    total: 0,
    rewarded: 0,
    invitedUsers: []
  };

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`👤 ${interaction.user.username}'s GCube Profile`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription(
      "Welcome to your **Elyx GCube Party profile!**"
    )
    .addFields(
      {
        name: "💰 Wallet",
        value:
          `Balance: **${formatGC(user.balance)} GC**\n` +
          `Total Earned: **${formatGC(user.totalEarned)} GC**\n` +
          `Total Spent: **${formatGC(user.totalSpent)} GC**`,
        inline: false
      },
      {
        name: "🎒 Collection",
        value: `**${collection.length}** items owned`,
        inline: true
      },
      {
        name: "📜 Daily Quests",
        value:
          `Messages Today: **${questProgress.messages}**\n` +
          `Quests Claimed: **${questProgress.claimed.length}/${GCUBE_QUESTS.length}**`,
        inline: true
      },
      {
        name: "🎟️ Invites",
        value:
          `Tracked: **${inviteStats.total || 0}**\n` +
          `Rewards Earned: **${formatGC(inviteStats.rewarded || 0)} GC**`,
        inline: true
      },
      {
        name: "📅 Member Since",
        value: `<t:${Math.floor(new Date(user.createdAt).getTime() / 1000)}:D>`,
        inline: true
      }
    )
    .setFooter({ text: "Elyx Trading • GCube Party" })
    .setTimestamp();

  saveGCubeData(data);

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

registerGCubeSubcommand("profile", handleGCubeProfile);
// ==================================================
// GCUBE PARTY — PART 8
// LEADERBOARD SYSTEM
// ==================================================

gcubeCommand.addSubcommand(sub =>
  sub.setName("top")
    .setDescription("View the richest GCube players")
);

async function handleGCubeTop(interaction) {
  const { EmbedBuilder } = require("discord.js");

  const data = loadGCubeData();
  const users = data.gcubeParty.users || {};

  const leaderboard = Object.entries(users)
    .map(([userId, user]) => ({
      userId,
      balance: Math.max(0, Number(user.balance) || 0),
      totalEarned: Math.max(0, Number(user.totalEarned) || 0)
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);

  const medals = ["🥇", "🥈", "🥉"];

  const description = leaderboard.length
    ? leaderboard.map((player, index) => {
        const rank = medals[index] || `**${index + 1}.**`;

        return (
          `${rank} <@${player.userId}>\n` +
          `┗ 💰 **${formatGC(player.balance)} GC**`
        );
      }).join("\n\n")
    : "No GCube players yet. Start earning GC to appear here!";

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle("🏆 GCube Rich List")
    .setDescription(description)
    .setFooter({
      text: "Elyx Trading • Top 10 players by current balance"
    })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    ephemeral: false
  });
}

registerGCubeSubcommand("top", handleGCubeTop);
// ==================================================
// GCUBE PARTY — PART 9
// PROFILE SHOWCASE
// ==================================================

gcubeCommand.addSubcommand(sub =>
  sub.setName("showcase")
    .setDescription("Show your GCube collection and equipped cosmetics")
);

async function handleGCubeShowcase(interaction) {
  const { EmbedBuilder } = require("discord.js");

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  const collection = Array.isArray(user.collection)
    ? user.collection
    : [];

  const equipped = user.equipped || {
    frame: null,
    background: null,
    nameplate: null
  };

  const ownedItems = collection
    .map(id => GCUBE_SHOP_ITEMS.find(item => item.id === id))
    .filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`✨ ${interaction.user.username}'s Showcase`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription(
      `**GC Balance:** ${formatGC(user.balance)} GC\n` +
      `**Items Collected:** ${ownedItems.length}`
    )
    .addFields(
      {
        name: "🖼️ Equipped Frame",
        value: equipped.frame || "None equipped",
        inline: true
      },
      {
        name: "🌌 Equipped Background",
        value: equipped.background || "None equipped",
        inline: true
      },
      {
        name: "🏷️ Equipped Nameplate",
        value: equipped.nameplate || "None equipped",
        inline: true
      },
      {
        name: "🎒 Featured Collection",
        value: ownedItems.length
          ? ownedItems.slice(0, 10)
              .map(item => `${item.name} — ${item.rarity}`)
              .join("\n")
          : "No items collected yet. Visit `/gcube shop`!",
        inline: false
      }
    )
    .setFooter({ text: "Elyx Trading • GCube Party" })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    ephemeral: false
  });
}

registerGCubeSubcommand("showcase", handleGCubeShowcase);
// ==================================================
// GCUBE PARTY — PART 10
// TRANSACTION HISTORY
// ==================================================

gcubeCommand.addSubcommand(sub =>
  sub.setName("history")
    .setDescription("View your recent GCube transactions")
);

async function handleGCubeHistory(interaction) {
  const { EmbedBuilder } = require("discord.js");

  const data = loadGCubeData();
  const history = Array.isArray(data.gcubeParty.history)
    ? data.gcubeParty.history
    : [];

  const userHistory = history
    .filter(entry => entry.userId === interaction.user.id)
    .slice(-10)
    .reverse();

  const description = userHistory.length
    ? userHistory.map((entry, index) => {
        const amount = formatGC(entry.amount || 0);
        const date = Math.floor(
          new Date(entry.timestamp).getTime() / 1000
        );

        let label = entry.type || "transaction";

        if (label === "daily_reward") label = "Daily Reward";
        if (label === "invite_reward") label = "Invite Reward";
        if (label === "quest_reward") label = "Quest Reward";
        if (label === "shop_purchase") label = "Shop Purchase";

        const sign = entry.type === "shop_purchase" ? "−" : "+";

        return (
          `**${index + 1}. ${label}**\n` +
          `Amount: **${sign}${amount} GC**\n` +
          `${Number.isFinite(date) ? `<t:${date}:R>` : "Date unavailable"}`
        );
      }).join("\n\n")
    : "No transactions yet. Start earning or spending GC!";

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("📜 Your GCube History")
    .setDescription(description)
    .setFooter({ text: "Elyx Trading • Last 10 transactions" })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

registerGCubeSubcommand("history", handleGCubeHistory);
// ==================================================
// GCUBE PARTY — PART 11
// GC TRANSFER SYSTEM
// ==================================================

gcubeCommand.addSubcommand(sub =>
  sub.setName("pay")
    .setDescription("Send GC to another server member")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Member receiving the GC")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount")
        .setDescription("Amount of GC to send")
        .setMinValue(1)
        .setRequired(true)
    )
);

async function handleGCubePay(interaction) {
  const recipient = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (recipient.bot) {
    return interaction.reply({
      content: "❌ You cannot send GC to a bot.",
      ephemeral: true
    });
  }

  if (recipient.id === interaction.user.id) {
    return interaction.reply({
      content: "❌ You cannot send GC to yourself.",
      ephemeral: true
    });
  }

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return interaction.reply({
      content: "❌ Enter a valid positive GC amount.",
      ephemeral: true
    });
  }

  const data = loadGCubeData();

  const sender = getGCubeUser(data, interaction.user.id);
  const receiver = getGCubeUser(data, recipient.id);

  if ((Number(sender.balance) || 0) < amount) {
    return interaction.reply({
      content:
        `❌ Insufficient balance!\n` +
        `Your balance: **${formatGC(sender.balance)} GC**`,
      ephemeral: true
    });
  }

  if (
    (Number(receiver.balance) || 0) + amount >
    Number.MAX_SAFE_INTEGER
  ) {
    return interaction.reply({
      content: "❌ The recipient's balance limit would be exceeded.",
      ephemeral: true
    });
  }

  if (!spendGC(data, sender, amount)) {
    return interaction.reply({
      content: "❌ Transfer failed. Please try again.",
      ephemeral: true
    });
  }

  receiver.balance = (Number(receiver.balance) || 0) + amount;
  receiver.totalEarned = (Number(receiver.totalEarned) || 0) + amount;

  data.gcubeParty.history.push({
    type: "transfer_sent",
    userId: interaction.user.id,
    recipientId: recipient.id,
    amount,
    timestamp: new Date().toISOString()
  });

  data.gcubeParty.history.push({
    type: "transfer_received",
    userId: recipient.id,
    senderId: interaction.user.id,
    amount,
    timestamp: new Date().toISOString()
  });

  if (data.gcubeParty.history.length > 2000) {
    data.gcubeParty.history =
      data.gcubeParty.history.slice(-2000);
  }

  saveGCubeData(data);

  return interaction.reply({
    content:
      `✅ GC transfer successful!\n\n` +
      `👤 Sent to: ${recipient}\n` +
      `💸 Amount: **${formatGC(amount)} GC**\n` +
      `💰 Your balance: **${formatGC(sender.balance)} GC**`,
    ephemeral: false
  });
}

registerGCubeSubcommand("pay", handleGCubePay);
// ==================================================
// GCUBE PARTY — PART 12
// EQUIP / UNEQUIP COSMETICS
// ==================================================

const GCUBE_EQUIP_ITEMS = [
  { id: "fire_frame", name: "🔥 Fire Frame", slot: "frame" },
  { id: "ice_frame", name: "❄️ Ice Frame", slot: "frame" },
  { id: "neon_frame", name: "🌈 Neon Frame", slot: "frame" },
  { id: "galaxy_bg", name: "🌌 Galaxy Background", slot: "background" },
  { id: "sunset_bg", name: "🌅 Sunset Background", slot: "background" },
  { id: "elite_plate", name: "⚡ Elite Nameplate", slot: "nameplate" }
];

gcubeCommand.addSubcommand(sub =>
  sub.setName("equip")
    .setDescription("Equip a cosmetic you own")
    .addStringOption(option =>
      option.setName("item")
        .setDescription("Choose a cosmetic")
        .setRequired(true)
        .addChoices(
          ...GCUBE_EQUIP_ITEMS.map(item => ({
            name: item.name,
            value: item.id
          }))
        )
    )
);

gcubeCommand.addSubcommand(sub =>
  sub.setName("unequip")
    .setDescription("Remove an equipped cosmetic")
    .addStringOption(option =>
      option.setName("slot")
        .setDescription("Choose the cosmetic slot")
        .setRequired(true)
        .addChoices(
          { name: "Frame", value: "frame" },
          { name: "Background", value: "background" },
          { name: "Nameplate", value: "nameplate" }
        )
    )
);

async function handleGCubeEquip(interaction) {
  const itemId = interaction.options.getString("item", true);
  const item = GCUBE_EQUIP_ITEMS.find(entry => entry.id === itemId);

  if (!item) {
    return interaction.reply({
      content: "❌ This cosmetic is unavailable.",
      ephemeral: true
    });
  }

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  if (!user.collection.includes(item.id)) {
    return interaction.reply({
      content: "❌ You don't own this cosmetic. Buy it from `/gcube shop` first.",
      ephemeral: true
    });
  }

  if (!user.equipped) {
    user.equipped = {
      frame: null,
      background: null,
      nameplate: null
    };
  }

  user.equipped[item.slot] = item.id;
  saveGCubeData(data);

  return interaction.reply({
    content: `✅ Equipped **${item.name}** successfully!`,
    ephemeral: true
  });
}

async function handleGCubeUnequip(interaction) {
  const slot = interaction.options.getString("slot", true);

  if (!["frame", "background", "nameplate"].includes(slot)) {
    return interaction.reply({
      content: "❌ Invalid cosmetic slot.",
      ephemeral: true
    });
  }

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  if (!user.equipped) {
    user.equipped = {
      frame: null,
      background: null,
      nameplate: null
    };
  }

  if (!user.equipped[slot]) {
    return interaction.reply({
      content: `❌ You don't have anything equipped in the ${slot} slot.`,
      ephemeral: true
    });
  }

  user.equipped[slot] = null;
  saveGCubeData(data);

  return interaction.reply({
    content: `✅ Your ${slot} has been unequipped.`,
    ephemeral: true
  });
}

registerGCubeSubcommand("equip", handleGCubeEquip);
registerGCubeSubcommand("unequip", handleGCubeUnequip);
// ==================================================
// GCUBE PARTY — PART 13
// MATERIALS + ITEM UPGRADES
// ==================================================

gcubeCommand.addSubcommand(sub =>
  sub.setName("materials")
    .setDescription("View your GCube materials")
);

gcubeCommand.addSubcommand(sub =>
  sub.setName("upgrade")
    .setDescription("Upgrade a collectible you own")
    .addStringOption(option =>
      option.setName("item")
        .setDescription("Choose an item from your collection")
        .setRequired(true)
        .addChoices(
          ...GCUBE_SHOP_ITEMS.map(item => ({
            name: item.name,
            value: item.id
          }))
        )
    )
);

async function handleGCubeMaterials(interaction) {
  const { EmbedBuilder } = require("discord.js");

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  if (!user.materials || typeof user.materials !== "object") {
    user.materials = {};
  }

  const materialEntries = Object.entries(user.materials)
    .filter(([, amount]) => Number(amount) > 0);

  const description = materialEntries.length
    ? materialEntries.map(([name, amount]) =>
        `🧱 **${name}** — ${formatGC(amount)}`
      ).join("\n")
    : "Your materials inventory is empty.\nMore material-earning activities can be added later.";

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle("🧱 GCube Materials")
    .setDescription(description)
    .setFooter({ text: "Elyx Trading • GCube Party" })
    .setTimestamp();

  saveGCubeData(data);

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function handleGCubeUpgrade(interaction) {
  const itemId = interaction.options.getString("item", true);
  const item = GCUBE_SHOP_ITEMS.find(entry => entry.id === itemId);

  if (!item) {
    return interaction.reply({
      content: "❌ This item is unavailable.",
      ephemeral: true
    });
  }

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  if (!user.collection.includes(itemId)) {
    return interaction.reply({
      content: "❌ You must own this item before upgrading it.",
      ephemeral: true
    });
  }

  if (!user.itemLevels || typeof user.itemLevels !== "object") {
    user.itemLevels = {};
  }

  const currentLevel = Math.max(
    0,
    Math.floor(Number(user.itemLevels[itemId]) || 0)
  );

  const maxLevel = 5;

  if (currentLevel >= maxLevel) {
    return interaction.reply({
      content: `🏆 **${item.name}** is already at maximum level ${maxLevel}.`,
      ephemeral: true
    });
  }

  const nextLevel = currentLevel + 1;
  const price = nextLevel * 1000;

  if ((Number(user.balance) || 0) < price) {
    return interaction.reply({
      content:
        `❌ Not enough GC to upgrade **${item.name}**.\n` +
        `Upgrade cost: **${formatGC(price)} GC**\n` +
        `Your balance: **${formatGC(user.balance)} GC**`,
      ephemeral: true
    });
  }

  if (!spendGC(data, user, price)) {
    return interaction.reply({
      content: "❌ Upgrade failed. Please try again.",
      ephemeral: true
    });
  }

  user.itemLevels[itemId] = nextLevel;

  data.gcubeParty.history.push({
    type: "item_upgrade",
    userId: interaction.user.id,
    itemId,
    level: nextLevel,
    amount: price,
    timestamp: new Date().toISOString()
  });

  if (data.gcubeParty.history.length > 2000) {
    data.gcubeParty.history = data.gcubeParty.history.slice(-2000);
  }

  saveGCubeData(data);

  return interaction.reply({
    content:
      `⬆️ **Upgrade successful!**\n\n` +
      `Item: **${item.name}**\n` +
      `Level: **${currentLevel} → ${nextLevel}**\n` +
      `Cost: **${formatGC(price)} GC**\n` +
      `Remaining balance: **${formatGC(user.balance)} GC**`,
    ephemeral: true
  });
}

registerGCubeSubcommand("materials", handleGCubeMaterials);
registerGCubeSubcommand("upgrade", handleGCubeUpgrade);
// ==================================================
// GCUBE PARTY — PART 14
// SELL COLLECTIBLES
// ==================================================

gcubeCommand.addSubcommand(sub =>
  sub.setName("sell")
    .setDescription("Sell a collectible from your collection")
    .addStringOption(option =>
      option.setName("item")
        .setDescription("Choose an item to sell")
        .setRequired(true)
        .addChoices(
          ...GCUBE_SHOP_ITEMS.map(item => ({
            name: item.name,
            value: item.id
          }))
        )
    )
);

async function handleGCubeSell(interaction) {
  const itemId = interaction.options.getString("item", true);
  const item = GCUBE_SHOP_ITEMS.find(entry => entry.id === itemId);

  if (!item) {
    return interaction.reply({
      content: "❌ This item is not available.",
      ephemeral: true
    });
  }

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  const itemIndex = user.collection.indexOf(itemId);

  if (itemIndex === -1) {
    return interaction.reply({
      content: "❌ You don't own this item.",
      ephemeral: true
    });
  }

  // Sell for 50% of the original shop price.
  const sellPrice = Math.floor(item.price / 2);

  user.collection.splice(itemIndex, 1);

  // Unequip the item automatically if it is equipped.
  if (user.equipped) {
    for (const slot of ["frame", "background", "nameplate"]) {
      if (user.equipped[slot] === itemId) {
        user.equipped[slot] = null;
      }
    }
  }

  addGC(data, user, sellPrice);

  data.gcubeParty.history.push({
    type: "item_sale",
    userId: interaction.user.id,
    itemId: item.id,
    amount: sellPrice,
    timestamp: new Date().toISOString()
  });

  if (data.gcubeParty.history.length > 2000) {
    data.gcubeParty.history = data.gcubeParty.history.slice(-2000);
  }

  saveGCubeData(data);

  return interaction.reply({
    content:
      `✅ **Item sold successfully!**\n\n` +
      `📦 Item: **${item.name}**\n` +
      `💰 Received: **${formatGC(sellPrice)} GC**\n` +
      `👛 New balance: **${formatGC(user.balance)} GC**`,
    ephemeral: true
  });
}

registerGCubeSubcommand("sell", handleGCubeSell);
// ==================================================
// GCUBE PARTY — PART 15
// INVITE TRACKING EXPORTS
// ==================================================

module.exports.cacheGuildInvites = cacheGuildInvites;
module.exports.handleGCubeMemberJoin = handleGCubeMemberJoin;

console.log("[GCube] Invite tracking exports registered.");
// ============================================
// GCUBE PARTY — PUBLIC SLASH COMMAND REPLIES
// ============================================

const originalGCubeRootHandler = module.exports.handleGCubeRoot;

function gcubeMakePublic(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return options;
  }

  const updated = { ...options };

  // Remove private reply setting
  delete updated.ephemeral;

  // Remove Discord's Ephemeral flag (64)
  if (typeof updated.flags === "number") {
    updated.flags = updated.flags & ~64;
  } else if (Array.isArray(updated.flags)) {
    updated.flags = updated.flags.filter(
      flag => flag !== "Ephemeral" && flag !== 64
    );
  }

  return updated;
}

function gcubePublicInteraction(interaction) {
  for (const method of ["reply", "deferReply", "followUp"]) {
    const original = interaction[method];

    if (typeof original !== "function") continue;

    interaction[method] = function (options, ...args) {
      return original.call(
        this,
        gcubeMakePublic(options),
        ...args
      );
    };
  }
}

if (typeof originalGCubeRootHandler === "function") {
  module.exports.handleGCubeRoot = async function (interaction) {
    gcubePublicInteraction(interaction);
    return originalGCubeRootHandler(interaction);
  };

  console.log("✅ GCube public reply patch loaded.");
        }

// ==================================================
// GCUBE PARTY — DAILY ACTIVITY REWARDS CONFIG
// Paste at the VERY END of games.js
// ==================================================

const GCUBE_ACTIVITY_REWARDS = {
  messages: [
    { count: 10, gc: 5 },
    { count: 100, gc: 25 },
    { count: 1000, gc: 100 }
  ],

  invites: [
    { count: 10, gc: 20 },
    { count: 25, gc: 50 },
    { count: 50, gc: 100 },
    { count: 100, gc: 250 },
    { count: 250, gc: 500 }
  ]
};

// India date helper
function gcubeActivityDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

// Message reward settings
const GCUBE_DAILY_MESSAGE_REWARDS = [
  { count: 10, gc: 5 },
  { count: 100, gc: 25 },
  { count: 1000, gc: 100 }
];

// Invite reward settings
const GCUBE_INVITE_MILESTONE_REWARDS = [
  { count: 10, gc: 20 },
  { count: 25, gc: 50 },
  { count: 50, gc: 100 },
  { count: 100, gc: 250 },
  { count: 250, gc: 500 }
];

module.exports.GCUBE_ACTIVITY_REWARDS = GCUBE_ACTIVITY_REWARDS;
module.exports.GCUBE_DAILY_MESSAGE_REWARDS =
  GCUBE_DAILY_MESSAGE_REWARDS;
module.exports.GCUBE_INVITE_MILESTONE_REWARDS =
  GCUBE_INVITE_MILESTONE_REWARDS;

console.log("✅ GCube activity reward settings loaded.");

// ============================================================
// GCUBE PARTY VISUAL UPGRADE — PART 1
// Collection artwork, wealth ranks, showcase and item catalog
// Paste at the VERY END of games.js
// ============================================================

const GCUBE_VISUAL_CATALOG = {
  crown: {
    name: "Golden Crown",
    rarity: "Legendary",
    price: 25000,
    image: "https://cdn-icons-png.flaticon.com/512/616/616490.png",
    description: "A royal crown for elite collectors."
  },

  diamond: {
    name: "Royal Diamond",
    rarity: "Epic",
    price: 12000,
    image: "https://cdn-icons-png.flaticon.com/512/616/616554.png",
    description: "A shining collectible diamond."
  },

  crystal: {
    name: "Mystic Crystal",
    rarity: "Mythic",
    price: 50000,
    image: "https://cdn-icons-png.flaticon.com/512/1046/1046784.png",
    description: "A mysterious crystal for collectors."
  },

  trophy: {
    name: "Champion Trophy",
    rarity: "Rare",
    price: 5000,
    image: "https://cdn-icons-png.flaticon.com/512/3112/3112946.png",
    description: "A trophy for dedicated players."
  },

  dragon: {
    name: "Golden Dragon",
    rarity: "Secret",
    price: 100000,
    image: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
    description: "An exclusive high-value collectible."
  }
};

const GCUBE_VISUAL_WEALTH_RANKS = [
  { min: 1, name: "GCube Emperor", logo: "👑", color: 0xFFD700 },
  { min: 2, name: "Diamond Elite", logo: "💎", color: 0x00BFFF },
  { min: 4, name: "GCube Royal", logo: "🏆", color: 0x9B59B6 },
  { min: 11, name: "Wealth Legend", logo: "✨", color: 0x2ECC71 },
  { min: 26, name: "GCube Member", logo: "💠", color: 0x3498DB }
];

function gcubeVisualGetWealthRank(position) {
  return GCUBE_VISUAL_WEALTH_RANKS.find(
    rank => position >= rank.min &&
      position < (
        GCUBE_VISUAL_WEALTH_RANKS[
          GCUBE_VISUAL_WEALTH_RANKS.indexOf(rank) + 1
        ]?.min ?? Infinity
      )
  ) || GCUBE_VISUAL_WEALTH_RANKS[
    GCUBE_VISUAL_WEALTH_RANKS.length - 1
  ];
}

function gcubeVisualBuildItemEmbed(itemKey, ownerName = "GCube Collector") {
  const item = GCUBE_VISUAL_CATALOG[itemKey];

  if (!item) return null;

  const { EmbedBuilder } = require("discord.js");

  return new EmbedBuilder()
    .setColor(0xD4AF37)
    .setTitle(`💎 ${item.name}`)
    .setDescription(
      `**Owner:** ${ownerName}\n` +
      `**Rarity:** ${item.rarity}\n` +
      `**Collection Value:** ${item.price.toLocaleString("en-IN")} GC\n\n` +
      item.description
    )
    .setThumbnail(item.image)
    .setFooter({ text: "GCube Party • Collect. Equip. Flex." });
}

function gcubeVisualBuildShowcase({
  username = "GCube Collector",
  wallet = 0,
  collectionValue = 0,
  legendaryCount = 0,
  rarestItem = "None",
  views = 0,
  position = 999
} = {}) {
  const { EmbedBuilder } = require("discord.js");
  const rank = gcubeVisualGetWealthRank(position);

  return new EmbedBuilder()
    .setColor(rank.color)
    .setTitle(`${rank.logo} ${username}'s GCube Showcase`)
    .setDescription(
      `**${rank.logo} Rank:** ${rank.name}\n\n` +
      `💰 **Wallet:** ${Number(wallet).toLocaleString("en-IN")} GC\n` +
      `💎 **Collection Value:** ${Number(collectionValue).toLocaleString("en-IN")} GC\n` +
      `✨ **Legendary Items:** ${Number(legendaryCount)}\n` +
      `👑 **Rarest Item:** ${rarestItem}\n` +
      `👁️ **Showcase Views:** ${Number(views)}\n\n` +
      `*Collect rare items and show off your collection!*`
    )
    .setFooter({ text: "GCube Party • Visual Collection System" })
    .setTimestamp();
}

// Export helpers for future integration with existing commands.
module.exports.GCUBE_VISUAL_CATALOG = GCUBE_VISUAL_CATALOG;
module.exports.GCUBE_VISUAL_WEALTH_RANKS = GCUBE_VISUAL_WEALTH_RANKS;
module.exports.gcubeVisualGetWealthRank = gcubeVisualGetWealthRank;
module.exports.gcubeVisualBuildItemEmbed = gcubeVisualBuildItemEmbed;
module.exports.gcubeVisualBuildShowcase = gcubeVisualBuildShowcase;

console.log("✅ GCube Visual Collection Part 1 loaded.");

// ============================================================
// GCUBE PARTY VISUAL UPGRADE — PART 2
// Inventory, equipped items, showcase views and clan data
// Paste AFTER Part 1 at the end of games.js
// ============================================================

const GCUBE_VISUAL_DATA_FILE = require("path").join(
  __dirname,
  "gcube_visual_data.json"
);



let gcubeVisualData = {
  users: {},
  clans: {},
  showcaseViews: {}
};

try {
  if (fs.existsSync(GCUBE_VISUAL_DATA_FILE)) {
    const saved = JSON.parse(
      fs.readFileSync(GCUBE_VISUAL_DATA_FILE, "utf8")
    );

    gcubeVisualData = {
      users: saved.users || {},
      clans: saved.clans || {},
      showcaseViews: saved.showcaseViews || {}
    };
  }
} catch (error) {
  console.error(
    "[GCube Visual] Could not load visual data:",
    error.message
  );
}

function gcubeVisualSaveData() {
  try {
    const temporaryFile = GCUBE_VISUAL_DATA_FILE + ".tmp";

    fs.writeFileSync(
      temporaryFile,
      JSON.stringify(gcubeVisualData, null, 2),
      "utf8"
    );

    fs.renameSync(temporaryFile, GCUBE_VISUAL_DATA_FILE);
    return true;
  } catch (error) {
    console.error(
      "[GCube Visual] Could not save visual data:",
      error.message
    );

    return false;
  }
}

function gcubeVisualGetUser(userId) {
  if (!gcubeVisualData.users[userId]) {
    gcubeVisualData.users[userId] = {
      inventory: {},
      equipped: null,
      title: "GCube Collector"
    };
  }

  const user = gcubeVisualData.users[userId];

  if (!user.inventory || typeof user.inventory !== "object") {
    user.inventory = {};
  }

  return user;
}

function gcubeVisualAddItem(userId, itemKey, amount = 1) {
  const item = GCUBE_VISUAL_CATALOG[itemKey];

  if (!item) {
    return { ok: false, message: "Unknown collectible." };
  }

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return { ok: false, message: "Invalid item amount." };
  }

  const user = gcubeVisualGetUser(userId);

  user.inventory[itemKey] =
    (Number(user.inventory[itemKey]) || 0) + amount;

  if (!gcubeVisualSaveData()) {
    user.inventory[itemKey] -= amount;

    if (user.inventory[itemKey] <= 0) {
      delete user.inventory[itemKey];
    }

    return {
      ok: false,
      message: "Could not save inventory. Please try again."
    };
  }

  return {
    ok: true,
    message: `Added ${amount}x ${item.name} to inventory.`
  };
}

function gcubeVisualEquipItem(userId, itemKey) {
  const item = GCUBE_VISUAL_CATALOG[itemKey];

  if (!item) {
    return { ok: false, message: "Unknown collectible." };
  }

  const user = gcubeVisualGetUser(userId);

  if ((Number(user.inventory[itemKey]) || 0) < 1) {
    return {
      ok: false,
      message: "You do not own this item yet."
    };
  }

  const previous = user.equipped;
  user.equipped = itemKey;

  if (!gcubeVisualSaveData()) {
    user.equipped = previous;

    return {
      ok: false,
      message: "Could not save equipped item."
    };
  }

  return {
    ok: true,
    message: `Equipped ${item.name}.`
  };
}

function gcubeVisualGetInventoryEmbed(userId, username = "Collector") {
  const { EmbedBuilder } = require("discord.js");
  const user = gcubeVisualGetUser(userId);

  const entries = Object.entries(user.inventory)
    .filter(([key, amount]) =>
      GCUBE_VISUAL_CATALOG[key] && Number(amount) > 0
    );

  const description = entries.length
    ? entries.map(([key, amount]) => {
        const item = GCUBE_VISUAL_CATALOG[key];

        return `**${item.name}** ×${amount}\n` +
          `Rarity: ${item.rarity} • Value: ${item.price.toLocaleString("en-IN")} GC`;
      }).join("\n\n")
    : "Your collection is empty. Visit the GCube shop to get started!";

  const embed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle(`💎 ${username}'s Collection`)
    .setDescription(description)
    .setFooter({ text: "GCube Party • Your collectibles" });

  if (user.equipped && GCUBE_VISUAL_CATALOG[user.equipped]) {
    const item = GCUBE_VISUAL_CATALOG[user.equipped];

    embed.addFields({
      name: "✨ Equipped Item",
      value: item.name,
      inline: true
    });

    embed.setThumbnail(item.image);
  }

  return embed;
}

function gcubeVisualRecordShowcaseView(ownerId, viewerId) {
  if (ownerId === viewerId) {
    return { ok: true, counted: false, views: 0 };
  }

  if (!gcubeVisualData.showcaseViews[ownerId]) {
    gcubeVisualData.showcaseViews[ownerId] = [];
  }

  const viewers = gcubeVisualData.showcaseViews[ownerId];

  // Count each viewer once to prevent repeated-click farming.
  if (viewers.includes(viewerId)) {
    return {
      ok: true,
      counted: false,
      views: viewers.length
    };
  }

  viewers.push(viewerId);

  if (!gcubeVisualSaveData()) {
    viewers.pop();

    return {
      ok: false,
      counted: false,
      views: viewers.length
    };
  }

  return {
    ok: true,
    counted: true,
    views: viewers.length
  };
}

function gcubeVisualCreateClan(clanId, name, ownerId, logoUrl = null) {
  if (gcubeVisualData.clans[clanId]) {
    return { ok: false, message: "That clan already exists." };
  }

  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 32
  ) {
    return {
      ok: false,
      message: "Clan name must be 2–32 characters."
    };
  }

  if (
    logoUrl &&
    (
      typeof logoUrl !== "string" ||
      !/^https:\/\/\S+$/i.test(logoUrl)
    )
  ) {
    return {
      ok: false,
      message: "Clan logo must be an HTTPS image URL."
    };
  }

  gcubeVisualData.clans[clanId] = {
    name: name.trim(),
    ownerId,
    logoUrl,
    members: [ownerId],
    points: 0,
    createdAt: new Date().toISOString()
  };

  if (!gcubeVisualSaveData()) {
    delete gcubeVisualData.clans[clanId];

    return {
      ok: false,
      message: "Could not save clan data."
    };
  }

  return {
    ok: true,
    message: `Clan "${name.trim()}" created.`
  };
}

// Export helpers for integration with existing slash commands.
module.exports.gcubeVisualSaveData = gcubeVisualSaveData;
module.exports.gcubeVisualGetUser = gcubeVisualGetUser;
module.exports.gcubeVisualAddItem = gcubeVisualAddItem;
module.exports.gcubeVisualEquipItem = gcubeVisualEquipItem;
module.exports.gcubeVisualGetInventoryEmbed = gcubeVisualGetInventoryEmbed;
module.exports.gcubeVisualRecordShowcaseView = gcubeVisualRecordShowcaseView;
module.exports.gcubeVisualCreateClan = gcubeVisualCreateClan;

console.log("✅ GCube Visual Collection Part 2 loaded.");

// ============================================================
// ELYX TRADING — GCUBE PARTY
// PART 3: VISUAL SHOP + BUY + EQUIP + COLLECTION
// Paste at the VERY END of games.js
// ============================================================

const GCUBE_V3_ITEMS = [
  "crown",
  "diamond",
  "crystal",
  "trophy",
  "dragon"
];

// ------------------------------------------------------------
// SAFETY CHECK
// ------------------------------------------------------------

if (
  typeof gcubeCommand === "undefined" ||
  typeof gcubeSubcommandHandlers === "undefined"
) {
  throw new Error(
    "[GCube V3] Existing GCube system was not found."
  );
}

if (
  typeof GCUBE_VISUAL_CATALOG === "undefined" ||
  typeof gcubeVisualAddItem !== "function" ||
  typeof gcubeVisualEquipItem !== "function" ||
  typeof gcubeVisualGetInventoryEmbed !== "function"
) {
  throw new Error(
    "[GCube V3] Paste Visual Upgrade Parts 1 and 2 first."
  );
}

// ------------------------------------------------------------
// ADD NEW SLASH COMMANDS
// Existing /gcube shop and /gcube collection are reused.
// ------------------------------------------------------------





// ------------------------------------------------------------
// VISUAL SHOP
// Each item gets its own image embed.
// ------------------------------------------------------------

async function gcubeV3Shop(interaction) {
  const { EmbedBuilder } = require("discord.js");

  const embeds = [];

  for (const key of GCUBE_V3_ITEMS) {
    const item = GCUBE_VISUAL_CATALOG[key];

    if (!item) continue;

    const embed = new EmbedBuilder()
      .setColor(0xD4AF37)
      .setTitle(`💎 ${item.name}`)
      .setDescription(
        `${item.description || "Exclusive GCube collectible."}\n\n` +
        `**Rarity:** ${item.rarity}\n` +
        `**Price:** ${Number(item.price).toLocaleString("en-IN")} GC\n\n` +
        `Purchase with \`/gcube buy item:${key}\``
      )
      .setFooter({
        text: "ELYX TRADING • GCUBE PARTY SHOP"
      });

    if (item.image) {
      embed.setImage(item.image);
    }

    embeds.push(embed);
  }

  if (!embeds.length) {
    return interaction.reply({
      content: "❌ Shop items are not configured.",
      ephemeral: true
    });
  }

  return interaction.reply({
    content: "✨ **GCUBE PREMIUM COLLECTIBLE SHOP**",
    embeds: embeds.slice(0, 10),
    ephemeral: true
  });
}

// ------------------------------------------------------------
// BUY ITEM
// Deducts GC and adds the item to visual inventory.
// ------------------------------------------------------------

async function gcubeV3Buy(interaction) {
  const key = interaction.options.getString("item");
  const item = GCUBE_VISUAL_CATALOG[key];

  if (!item || !GCUBE_V3_ITEMS.includes(key)) {
    return interaction.reply({
      content: "❌ Ye item shop mein available nahi hai.",
      ephemeral: true
    });
  }

  const price = Number(item.price);

  if (!Number.isSafeInteger(price) || price <= 0) {
    return interaction.reply({
      content: "❌ Is item ki price configuration galat hai.",
      ephemeral: true
    });
  }

  const data = loadGCubeData();
  const user = getGCubeUser(data, interaction.user.id);

  if (Number(user.balance) < price) {
    return interaction.reply({
      content:
        `❌ Not enough GC!\n` +
        `💰 Your balance: **${formatGC(user.balance)} GC**\n` +
        `🏷️ Item price: **${formatGC(price)} GC**`,
      ephemeral: true
    });
  }

  try {
    // Deduct the purchase price.
    const success = spendGC(data, user, price);

    if (!success) {
      return interaction.reply({
        content: "❌ Purchase failed. Check your GC balance.",
        ephemeral: true
      });
    }

    // Save economy before granting the collectible.
    saveGCubeData(data);

    // Grant the collectible through the existing visual system.
    gcubeVisualAddItem(interaction.user.id, key, 1);

    const { EmbedBuilder } = require("discord.js");

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("🎉 COLLECTIBLE PURCHASED!")
      .setDescription(
        `You purchased **${item.name}**!\n\n` +
        `**Rarity:** ${item.rarity}\n` +
        `**Price paid:** ${formatGC(price)} GC\n` +
        `**Remaining balance:** ${formatGC(user.balance)} GC\n\n` +
        `Equip it with \`/gcube equip item:${key}\``
      )
      .setThumbnail(item.image || interaction.user.displayAvatarURL())
      .setFooter({
        text: "ELYX TRADING • GCUBE PARTY"
      })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    console.error("[GCube V3] Purchase error:", error);

    return interaction.reply({
      content:
        "❌ Purchase mein error aaya. Admin ko logs check karne bolo.",
      ephemeral: true
    }).catch(() => {});
  }
}

// ------------------------------------------------------------
// EQUIP ITEM
// ------------------------------------------------------------

async function gcubeV3Equip(interaction) {
  const key = interaction.options.getString("item");
  const item = GCUBE_VISUAL_CATALOG[key];

  if (!item || !GCUBE_V3_ITEMS.includes(key)) {
    return interaction.reply({
      content: "❌ Invalid collectible.",
      ephemeral: true
    });
  }

  try {
    const result = gcubeVisualEquipItem(
      interaction.user.id,
      key
    );

    if (result === false) {
      return interaction.reply({
        content:
          "❌ Ye item tumhare inventory mein nahi hai. " +
          "Pehle `/gcube buy` se purchase karo.",
        ephemeral: true
      });
    }

    const { EmbedBuilder } = require("discord.js");

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("✨ ITEM EQUIPPED")
      .setDescription(
        `**${item.name}** has been equipped!\n\n` +
        `Rarity: **${item.rarity}**`
      )
      .setThumbnail(item.image || interaction.user.displayAvatarURL())
      .setFooter({
        text: "ELYX TRADING • GCUBE PARTY"
      });

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    console.error("[GCube V3] Equip error:", error);

    return interaction.reply({
      content: "❌ Item equip nahi ho saka.",
      ephemeral: true
    }).catch(() => {});
  }
}

// ------------------------------------------------------------
// VISUAL COLLECTION
// ------------------------------------------------------------

async function gcubeV3Collection(interaction) {
  try {
    const embed = gcubeVisualGetInventoryEmbed(
      interaction.user.id,
      interaction.user.username
    );

    if (!embed) {
      return interaction.reply({
        content: "🎒 Your collection is empty.",
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    console.error("[GCube V3] Collection error:", error);

    return interaction.reply({
      content: "❌ Collection load nahi ho saki.",
      ephemeral: true
    }).catch(() => {});
  }
}

// ------------------------------------------------------------
// CONNECT HANDLERS TO EXISTING /gcube SYSTEM
// .set replaces old handlers without duplicate-handler errors.
// ------------------------------------------------------------

gcubeSubcommandHandlers.set("shop", gcubeV3Shop);
gcubeSubcommandHandlers.set("buy", gcubeV3Buy);
gcubeSubcommandHandlers.set("equip", gcubeV3Equip);
gcubeSubcommandHandlers.set("collection", gcubeV3Collection);

console.log(
  "✅ GCube Visual Upgrade Part 3 loaded."
);
