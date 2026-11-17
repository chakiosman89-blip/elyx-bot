const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    UserSelectMenuBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    ChannelType,
    PermissionsBitField
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const CONFIG = {
    TOKEN: process.env.TOKEN || 'YOUR_BOT_TOKEN_HERE',
    INVESTMENT_PLANS_CHANNEL_ID: '1572142960647082046',
    LIVE_MARKET_CHANNEL_ID: '1572143060874305699',
    FUND_MANAGER_ROLE_NAME: 'Fund Manager',
    SESSION_DURATION_MS: 1 * 60 * 60 * 1000,
    PRICE_TICK_MS: 30 * 1000,
    STARTING_CASH: 100000,
    GIFS: {
        LIVE_MARKET: 'https://giphy.com',
        WINNER_TROPHY: 'https://giphy.com'
    }
};

const pendingTickets = new Map();
let activeMarketSession = null;

function createMarketState() {
    return {
        assets: {
            TECH: {
                name: 'TechCorp Equity',
                type: 'Equity',
                price: 1200,
                prevPrice: 1200,
                minStep: -0.075,
                maxStep: 0.08
            },
            NOVA: {
                name: 'Nova Motors Ltd',
                type: 'Equity',
                price: 850,
                prevPrice: 850,
                minStep: -0.09,
                maxStep: 0.095
            },
            APEX: {
                name: 'Apex Energy',
                type: 'Equity',
                price: 600,
                prevPrice: 600,
                minStep: -0.065,
                maxStep: 0.07
            },
            NIFTY: {
                name: 'Nifty 50 Index Fund',
                type: 'Mutual Fund',
                price: 2500,
                prevPrice: 2500,
                minStep: -0.025,
                maxStep: 0.03
            },
            BLUE: {
                name: 'Elyx Bluechip Fund',
                type: 'Mutual Fund',
                price: 1800,
                prevPrice: 1800,
                minStep: -0.02,
                maxStep: 0.028
            }
        },
        lastNews: 'Market session initialized. Liquidity active across all equities and mutual funds.'
    };
}

const MARKET_NEWS_POOL = [
    {
        text: '📈 FLASH WIRE: TechCorp secures global cloud contract! Heavy institutional buying.',
        target: 'TECH',
        impact: 0.09
    },
    {
        text: '📉 FLASH WIRE: Nova Motors issues recall notice; sharp sell-off triggered.',
        target: 'NOVA',
        impact: -0.085
    },
    {
        text: '📈 FLASH WIRE: Apex Energy discovers new offshore reserves!',
        target: 'APEX',
        impact: 0.08
    },
    {
        text: '🏦 MACRO UPDATE: Steady inflation boosts inflows into Nifty 50 Index Fund.',
        target: 'NIFTY',
        impact: 0.035
    },
    {
        text: '📉 FLASH WIRE: Profit booking hits TechCorp after strong rally.',
        target: 'TECH',
        impact: -0.075
    },
    {
        text: '📈 FLASH WIRE: Record quarterly deliveries announced by Nova Motors!',
        target: 'NOVA',
        impact: 0.095
    },
    {
        text: '📉 FLASH WIRE: Global tariff revision weighs on Apex Energy.',
        target: 'APEX',
        impact: -0.07
    }
];

function tickMarketPrices(market) {
    for (const key of Object.keys(market.assets)) {
        const asset = market.assets[key];

        asset.prevPrice = asset.price;

        const randomPct =
            asset.minStep +
            Math.random() * (asset.maxStep - asset.minStep);

        asset.price = Math.max(
            50,
            Math.round(asset.price * (1 + randomPct))
        );
    }

    if (Math.random() < 0.20) {
        const news =
            MARKET_NEWS_POOL[
                Math.floor(Math.random() * MARKET_NEWS_POOL.length)
            ];

        market.lastNews = news.text;

        const targetAsset = market.assets[news.target];

        targetAsset.price = Math.max(
            50,
            Math.round(targetAsset.price * (1 + news.impact))
        );
    } 
}

client.once('ready', async () => {
    console.log(`✅ Elyx Mutual Funds Bot Online: ${client.user.tag}`);

    const plansChannel = await client.channels.fetch(CONFIG.INVESTMENT_PLANS_CHANNEL_ID).catch(() => null);
    if (!plansChannel) return console.log('⚠️ INVESTMENT_PLANS_CHANNEL_ID not found.');

    const oldMsgs = await plansChannel.messages.fetch({ limit: 10 });
    const botMsgs = oldMsgs.filter(m => m.author.id === client.user.id);
    if (botMsgs.size > 0) await plansChannel.bulkDelete(botMsgs).catch(() => {});

    const panelEmbed = new EmbedBuilder()
        .setTitle('🏦 ELYX MUTUAL FUNDS | 1v1 INVESTMENT TERMINAL')
        .setDescription(
            'Review the investment terms above before initiating a 1v1 contract.\n\n' +
            '```yaml\n' +
            'STANDARD PLAN   :  50M Deposit  ➔  100M Return\n' +
            'EXECUTIVE PLAN  : 100M Deposit  ➔  200M Return\n' +
            'MARKET WINDOW   : 1 Hour Live Equity & Mutual Funds\n' +
            '```\n' +
            'Click **Initiate 1v1 Contract** below to mention your counterparty and open a private verification desk.'
        )
        .setThumbnail(CONFIG.GIFS.LIVE_MARKET)
        .setColor('#0F172A')
        .setFooter({ text: 'Elyx Wealth Management • Automated Escrow & Trading System' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('hub_invite_btn')
            .setLabel('Initiate 1v1 Contract')
            .setEmoji('📩')
            .setStyle(ButtonStyle.Success)
    );

    await plansChannel.send({ embeds: [panelEmbed], components: [row] });
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton() && interaction.customId === 'hub_invite_btn') {
            if (activeMarketSession) {
                return interaction.reply({
                    content: `⚠️ A live market session is currently active in <#${CONFIG.LIVE_MARKET_CHANNEL_ID}>. Please wait until it concludes.`,
                    ephemeral: true
                });
            }

            const userMenu = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('hub_select_opponent')
                    .setPlaceholder('Select the member you want to challenge...')
                    .setMinValues(1)
                    .setMaxValues(1)
            );

            return interaction.reply({
                content: '👤 **Select Counterparty:** Choose a member to open a private ticket:',
                components: [userMenu],
                ephemeral: true
            });
        }

        if (interaction.isUserSelectMenu() && interaction.customId === 'hub_select_opponent') {
            const opponent = interaction.users.first();

            if (opponent.id === interaction.user.id || opponent.bot) {
                return interaction.update({ content: '❌ Please select a valid member.', components: [] });
            }

            await interaction.update({
                content: `✅ Opening private ticket with **${opponent.username}**...`,
                components: []
            });

            await openPrivateTicket(interaction.guild, interaction.user, opponent);
        }

        if (interaction.isButton() && (interaction.customId === 'ticket_accept' || interaction.customId === 'ticket_decline')) {
            const ticket = pendingTickets.get(interaction.channel.id);
            if (!ticket) return;

            if (interaction.user.id !== ticket.p2.id) {
                return interaction.reply({
                    content: '❌ Only the invited counterparty can accept or decline.',
                    ephemeral: true
                });
            }

            if (interaction.customId === 'ticket_decline') {
                await interaction.update({
                    content: `❌ **${ticket.p2.username}** declined the contract. Closing private room in 3 seconds...`,
                    embeds: [],
                    components: []
                });

                pendingTickets.delete(interaction.channel.id);
                return setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            }

            const tierEmbed = new EmbedBuilder()
                .setTitle('💼 SELECT INVESTMENT PLAN')
                .setDescription(`**${ticket.p2.username}** accepted the contract!\nSelect the **BMGO Skyblock Coin** plan for this session:`)
                .setColor('#2563EB');

            const tierRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_tier_50M')
                    .setLabel('50M Plan (100M Return)')
                    .setEmoji('💼')
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId('ticket_tier_100M')
                    .setLabel('100M Plan (200M Return)')
                    .setEmoji('💎')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ embeds: [tierEmbed], components: [tierRow] });
        }

        if (interaction.isButton() && (interaction.customId === 'ticket_tier_50M' || interaction.customId === 'ticket_tier_100M')) {
            const ticket = pendingTickets.get(interaction.channel.id);
            if (!ticket) return;

            if (interaction.user.id !== ticket.p1.id && interaction.user.id !== ticket.p2.id) {
                return interaction.reply({
                    content: '❌ Only session participants can select a plan.',
                    ephemeral: true
                });
            }

            ticket.tier = interaction.customId === 'ticket_tier_50M' ? '50M' : '100M';
            ticket.payout = ticket.tier === '50M' ? '100M' : '200M';

            const fmRole = interaction.guild.roles.cache.find(r => r.name.includes(CONFIG.FUND_MANAGER_ROLE_NAME));

            const escrowEmbed = new EmbedBuilder()
                .setTitle(`🔒 FUND MANAGER ESCROW VERIFICATION | ${ticket.tier} PLAN`)
                .setDescription(
                    `**Investor 1:** ${ticket.p1}\n` +
                    `**Investor 2:** ${ticket.p2}\n` +
                    `**Required Deposit:** \`${ticket.tier} BMGO Coins each\`\n` +
                    `**Winner Return:** \`${ticket.payout} BMGO Coins\`\n\n` +
                    `📌 Both investors must transfer **${ticket.tier} BMGO Coins** in-game to the **Fund Manager**.\n` +
                    `Once verified below, click **Start Market**. This private ticket will disappear automatically and live trading will open in <#${CONFIG.LIVE_MARKET_CHANNEL_ID}>.`
                )
                .setColor('#F59E0B');

            await interaction.update({
                content: `${fmRole ? fmRole : ''}`,
                embeds: [escrowEmbed],
                components: [buildEscrowControls(ticket)]
            });
        }

            if (interaction.isButton() && interaction.customId.startsWith('fm_')) {
            const ticket = pendingTickets.get(interaction.channel.id);
            if (!ticket) return;

            const isFM = interaction.member.roles.cache.some(r =>
                r.name.includes(CONFIG.FUND_MANAGER_ROLE_NAME)
            );

            if (!isFM) {
                return interaction.reply({
                    content: `❌ Only the **Fund Manager** can verify deposits and start the market.`,
                    ephemeral: true
                });
            }

            if (interaction.customId === 'fm_verify_p1') ticket.p1Verified = true;
            if (interaction.customId === 'fm_verify_p2') ticket.p2Verified = true;

            if (interaction.customId === 'fm_start_market') {
                if (!ticket.p1Verified || !ticket.p2Verified) {
                    return interaction.reply({
                        content: '❌ Verify both investors before starting the market.',
                        ephemeral: true
                    });
                }

                if (activeMarketSession) {
                    return interaction.reply({
                        content: '⚠️ Another session is currently live in the market channel.',
                        ephemeral: true
                    });
                }

                await interaction.update({
                    content: `🔔 **OPENING BELL RUNG!** Live market started in <#${CONFIG.LIVE_MARKET_CHANNEL_ID}>. Closing this ticket in 3 seconds...`,
                    embeds: [],
                    components: []
                });

                pendingTickets.delete(interaction.channel.id);
                await launchLiveMarketChannel(interaction.guild, ticket);

                return setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            }

            await interaction.update({
                components: [buildEscrowControls(ticket)]
            });
        }

        if (interaction.isButton() && interaction.customId.startsWith('mkt_')) {
            if (!activeMarketSession || !activeMarketSession.isLive) {
                return interaction.reply({
                    content: '⚠️ No active market session right now.',
                    ephemeral: true
                });
            }

            const trader = activeMarketSession.traders[interaction.user.id];

            if (!trader) {
                return interaction.reply({
                    content: '👀 Spectator Mode: Only the 2 verified investors can buy or sell in this session.',
                    ephemeral: true
                });
            }

            if (interaction.customId === 'mkt_portfolio') {
                const netWorth = calculateNetWorth(trader, activeMarketSession.market);
                const pnl = netWorth - CONFIG.STARTING_CASH;
                const pnlPct = ((pnl / CONFIG.STARTING_CASH) * 100).toFixed(2);

                let holdingsText = '';

                for (const [sym, qty] of Object.entries(trader.holdings)) {
                    if (qty > 0) {
                        const val = qty * activeMarketSession.market.assets[sym].price;

                        holdingsText += `• **${activeMarketSession.market.assets[sym].name} (${sym}):** \`${qty} units\` (\`₹${val.toLocaleString()}\`)\n`;
                    }
                }

                if (!holdingsText) holdingsText = '_No active holdings. 100% Cash._';

                const portEmbed = new EmbedBuilder()
                    .setTitle(`📁 DEMAT PORTFOLIO | ${interaction.user.username.toUpperCase()}`)
                    .setDescription(
                        `💵 **Available Cash:** \`₹${trader.cash.toLocaleString()}\`\n` +
                        `📊 **Total Net Worth:** \`₹${netWorth.toLocaleString()}\`\n` +
                        `${pnl >= 0 ? '🟢' : '🔴'} **Session P&L:** \`${pnl >= 0 ? '+' : ''}₹${pnl.toLocaleString()} (${pnlPct}%)\`\n\n` +
                        `**Holdings:**\n${holdingsText}`
                    )
                    .setColor(pnl >= 0 ? '#16A34A' : '#DC2626');

                return interaction.reply({
                    embeds: [portEmbed],
                    ephemeral: true
                });
            }

            if (interaction.customId === 'mkt_buy') {
                const options = Object.entries(activeMarketSession.market.assets).map(([sym, data]) => ({
                    label: `${data.name} (${sym}) — ₹${data.price.toLocaleString()}`,
                    description: `${data.type} | Cash: ₹${trader.cash.toLocaleString()}`,
                    value: sym
                }));

                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('order_buy_select')
                        .setPlaceholder('Select Share or Mutual Fund to Buy...')
                        .addOptions(options)
                );

                return interaction.reply({
                    content: '🟢 **BUY ORDER:** Choose an instrument:',
                    components: [menu],
                    ephemeral: true
                });
            }

            if (interaction.customId === 'mkt_sell') {
                const owned = Object.entries(trader.holdings).filter(([, qty]) => qty > 0);

                if (owned.length === 0) {
                    return interaction.reply({
                        content: 'You have no holdings to sell.',
                        ephemeral: true
                    });
                }

                const options = owned.map(([sym, qty]) => {
                    const data = activeMarketSession.market.assets[sym];

                    return {
                        label: `${data.name} (${sym}) — ₹${data.price.toLocaleString()}`,
                        description: `Owned: ${qty} units (Value: ${(qty * data.price).toLocaleString()})`,
                        value: sym
                    };
                });

                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('order_sell_select')
                        .setPlaceholder('Select holding to Sell / Redeem...')
                        .addOptions(options)
                );

                return interaction.reply({
                    content: '🔴 **SELL ORDER:** Choose a holding to liquidate:',
                    components: [menu],
                    ephemeral: true
                });
            }
        }

        if (interaction.isStringSelectMenu() && (interaction.customId === 'order_buy_select' || interaction.customId === 'order_sell_select')) {
            if (!activeMarketSession || !activeMarketSession.isLive) return;

            const isBuy = interaction.customId === 'order_buy_select';
            const sym = interaction.values[0];
            const asset = activeMarketSession.market.assets[sym];
            const trader = activeMarketSession.traders[interaction.user.id];

            if (!trader) return;

            const maxUnits = isBuy
                ? Math.floor(trader.cash / asset.price)
                : (trader.holdings[sym] || 0);

            const modal = new ModalBuilder()
                .setCustomId(`exec_${isBuy ? 'buy' : 'sell'}_${sym}`)
                .setTitle(`${isBuy ? 'BUY' : 'SELL'} ${sym} @ ₹${asset.price}`);

            const qtyInput = new TextInputBuilder()
                .setCustomId('qty_input')
                .setLabel(`Quantity (Max available: ${maxUnits})`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(`1 to ${maxUnits}`)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(qtyInput)
            );

            return interaction.showModal(modal);
    }

            if (interaction.isModalSubmit() && interaction.customId.startsWith('exec_')) {
            if (!activeMarketSession || !activeMarketSession.isLive) return;

            const [, side, sym] = interaction.customId.split('_');
            const qty = parseInt(interaction.fields.getTextInputValue('qty_input'), 10);
            const asset = activeMarketSession.market.assets[sym];
            const trader = activeMarketSession.traders[interaction.user.id];

            if (!trader) return;

            if (isNaN(qty) || qty <= 0) {
                return interaction.reply({
                    content: '❌ Enter a valid positive number.',
                    ephemeral: true
                });
            }

            if (side === 'buy') {
                const cost = qty * asset.price;

                if (cost > trader.cash) {
                    return interaction.reply({
                        content: `❌ Insufficient cash! Needed: \`₹${cost.toLocaleString()}\`.`,
                        ephemeral: true
                    });
                }

                trader.cash -= cost;
                trader.holdings[sym] = (trader.holdings[sym] || 0) + qty;

                return interaction.reply({
                    content: `🟢 **BOUGHT:** \`${qty}x ${asset.name}\` @ \`₹${asset.price.toLocaleString()}\` (Total: \`₹${cost.toLocaleString()}\`).`,
                    ephemeral: true
                });
            } else {
                const held = trader.holdings[sym] || 0;

                if (qty > held) {
                    return interaction.reply({
                        content: `❌ You only hold \`${held} units\` of ${sym}.`,
                        ephemeral: true
                    });
                }

                const proceeds = qty * asset.price;
                trader.holdings[sym] -= qty;
                trader.cash += proceeds;

                return interaction.reply({
                    content: `🔴 **SOLD:** \`${qty}x ${asset.name}\` @ \`₹${asset.price.toLocaleString()}\` (Received: \`₹${proceeds.toLocaleString()}\`).`,
                    ephemeral: true
                });
            }
        }
    } catch (err) {
        console.error(err);
    }
});

async function openPrivateTicket(guild, p1, p2) {
    const fmRole = guild.roles.cache.find(r =>
        r.name.includes(CONFIG.FUND_MANAGER_ROLE_NAME)
    );

    const plansChannel = await guild.channels.fetch(
        CONFIG.INVESTMENT_PLANS_CHANNEL_ID
    ).catch(() => null);

    const perms = [
        {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
            id: p1.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages
            ]
        },
        {
            id: p2.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages
            ]
        }
    ];

    if (fmRole) {
        perms.push({
            id: fmRole.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages
            ]
        });
    }

    const ticketChannel = await guild.channels.create({
        name: `verify-${p1.username}-vs-${p2.username}`,
        type: ChannelType.GuildText,
        parent: plansChannel ? plansChannel.parentId : null,
        permissionOverwrites: perms
    });

    pendingTickets.set(ticketChannel.id, {
        p1,
        p2,
        tier: null,
        payout: null,
        p1Verified: false,
        p2Verified: false
    });

    const inviteEmbed = new EmbedBuilder()
        .setTitle('📑 PRIVATE INVESTMENT CONTRACT')
        .setDescription(
            `**Initiator:** ${p1}\n` +
            `**Counterparty:** ${p2}\n\n` +
            `${p2}, click **Accept** to proceed, or **Decline** (this room will automatically delete if declined).`
        )
        .setColor('#2563EB');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_accept')
            .setLabel('Accept')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('ticket_decline')
            .setLabel('Decline')
            .setEmoji('✖️')
            .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
        content: `${p1} ${p2} ${fmRole ? fmRole : ''}`,
        embeds: [inviteEmbed],
        components: [row]
    });
}

function buildEscrowControls(ticket) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fm_verify_p1')
            .setLabel(`Verify ${ticket.p1.username} (${ticket.tier})`)
            .setEmoji(ticket.p1Verified ? '✅' : '⏳')
            .setStyle(ticket.p1Verified ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(ticket.p1Verified),

        new ButtonBuilder()
            .setCustomId('fm_verify_p2')
            .setLabel(`Verify ${ticket.p2.username} (${ticket.tier})`)
            .setEmoji(ticket.p2Verified ? '✅' : '⏳')
            .setStyle(ticket.p2Verified ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(ticket.p2Verified),

        new ButtonBuilder()
            .setCustomId('fm_start_market')
            .setLabel('Start Market')
            .setEmoji('🔔')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!(ticket.p1Verified && ticket.p2Verified))
    );
}

async function launchLiveMarketChannel(guild, ticket) {
    const marketChannel = await guild.channels.fetch(
        CONFIG.LIVE_MARKET_CHANNEL_ID
    ).catch(() => null);

    if (!marketChannel) {
        return console.log('⚠️ LIVE_MARKET_CHANNEL_ID not found.');
    }

    activeMarketSession = {
        p1: ticket.p1,
        p2: ticket.p2,
        tier: ticket.tier,
        payout: ticket.payout,
        isLive: true,
        endTime: Date.now() + CONFIG.SESSION_DURATION_MS,
        market: createMarketState(),
        traders: {
            [ticket.p1.id]: {
                cash: CONFIG.STARTING_CASH,
                holdings: {}
            },
            [ticket.p2.id]: {
                cash: CONFIG.STARTING_CASH,
                holdings: {}
            }
        }
    };

    const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('mkt_buy')
            .setLabel('Buy Share / Fund')
            .setEmoji('🟢')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('mkt_sell')
            .setLabel('Sell / Redeem')
            .setEmoji('🔴')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId('mkt_portfolio')
            .setLabel('My Portfolio')
            .setEmoji('💼')
            .setStyle(ButtonStyle.Secondary)
    );

    const boardMsg = await marketChannel.send({
        content: `🔔 **MARKET OPEN:** ${ticket.p1} vs ${ticket.p2} | **${ticket.payout} BMGO Return**`,
        embeds: [buildMarketEmbed(activeMarketSession)],
        components: [controls]
    });

    const interval = setInterval(async () => {
        if (!activeMarketSession) {
            return clearInterval(interval);
        }

        if (Date.now() >= activeMarketSession.endTime) {
            clearInterval(interval);
            activeMarketSession.isLive = false;

            return finishSessionAndAnnounce(
                guild,
                marketChannel,
                boardMsg,
                activeMarketSession
            );
        }

        tickMarketPrices(activeMarketSession.market);

        await boardMsg.edit({
            embeds: [buildMarketEmbed(activeMarketSession)]
        }).catch(() => {});

    }, CONFIG.PRICE_TICK_MS);
}

function buildMarketEmbed(session) {
    const remMs = Math.max(0, session.endTime - Date.now());
    const mins = Math.floor(remMs / 60000);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;

    let table = 'SYMBOL | INSTRUMENT          | PRICE    | CHANGE\n------------------------------------------------\n';

    for (const [sym, data] of Object.entries(session.market.assets)) {
        const diff = data.price - data.prevPrice;
        const pct = ((diff / data.prevPrice) * 100).toFixed(2);
        const arrow = diff >= 0 ? '▲' : '▼';
        const sign = diff >= 0 ? '+' : '';

        table += `${sym.padEnd(6)} | ${data.name.padEnd(19)} | ₹${String(data.price).padEnd(7)} | ${arrow} ${sign}${pct}%\n`;
    }

    const p1Net = calculateNetWorth(
        session.traders[session.p1.id],
        session.market
    );

    const p2Net = calculateNetWorth(
        session.traders[session.p2.id],
        session.market
    );

    return new EmbedBuilder()
        .setTitle(`📊 ELYX LIVE MARKET | RETURN: ${session.payout} BMGO`)
        .setDescription(
            `⏳ **Closing Bell In:** \`${hrs}h ${remMins}m\` | **Capital:** \`₹1,00,000\`\n\n` +
            '```prolog\n' + table + '```\n' +
            `📰 **Market Wire:** _${session.market.lastNews}_\n\n` +
            `**Active Investors & Live Net Worth:**\n` +
            `• **${session.p1.username}:** \`₹${p1Net.toLocaleString()}\`\n` +
            `• **${session.p2.username}:** \`₹${p2Net.toLocaleString()}\``
        )
        .setThumbnail(CONFIG.GIFS.LIVE_MARKET)
        .setColor('#10B981')
        .setFooter({
            text: 'Rates fluctuate randomly every 30s • Only active investors may execute orders'
        });
}

function calculateNetWorth(trader, market) {
    let val = 0;

    for (const [sym, qty] of Object.entries(trader.holdings)) {
        val += qty * market.assets[sym].price;
    }

    return trader.cash + val;
}

async function finishSessionAndAnnounce(guild, marketChannel, boardMsg, session) {
    const p1Final = calculateNetWorth(
        session.traders[session.p1.id],
        session.market
    );

    const p2Final = calculateNetWorth(
        session.traders[session.p2.id],
        session.market
    );

    let result = '';

    if (p1Final > p2Final) {
        result = `🏆 **${session.p1}** wins the session and claims **${session.payout} BMGO Skyblock Coins**!`;
    } else if (p2Final > p1Final) {
        result = `🏆 **${session.p2}** wins the session and claims **${session.payout} BMGO Skyblock Coins**!`;
    } else {
        result = `🤝 **Exact Tie!** Both investors finished with identical Net Worth. Fund Manager may refund deposits.`;
    }

    const winEmbed = new EmbedBuilder()
        .setTitle('🔔 CLOSING BELL | OFFICIAL WINNER ANNOUNCEMENT')
        .setDescription(
            `The Live Market Session has concluded.\n\n` +
            `• **${session.p1.username}:** \`₹${p1Final.toLocaleString()}\`\n` +
            `• **${session.p2.username}:** \`₹${p2Final.toLocaleString()}\`\n\n` +
            `${result}\n\n` +
            `💼 **Fund Manager Action:** Transfer **${session.payout} BMGO Coins** in-game to the winner.`
        )
        .setThumbnail(CONFIG.GIFS.WINNER_TROPHY)
        .setColor('#FFD700');

    await boardMsg.edit({ components: [] }).catch(() => {});

    await marketChannel.send({
        content: `${session.p1} ${session.p2}`,
        embeds: [winEmbed]
    });

    const plansChannel = await guild.channels.fetch(
        CONFIG.INVESTMENT_PLANS_CHANNEL_ID
    ).catch(() => null);

    if (plansChannel) {
        await plansChannel.send({
            content: `${session.p1} ${session.p2}`,
            embeds: [winEmbed]
        });
    }

    activeMarketSession = null;
}

client.login(CONFIG.TOKEN);
