/**
 *   ╔════   Copyright 2018 Peter Maguire
 *  ║ ════╗  Created 16/12/2018
 * ╚════ ║   (ocelotbotv5) vote
 *  ════╝
 */
const Icon = require("../util/Icon");
const Strings = require("../util/String");
const {NotificationContext} = require("../util/CommandContext");
module.exports = {
    name: "Vote For OcelotBOT",
    usage: "vote",
    rateLimit: 10,
    categories: ["meta"],
    requiredPermissions: [],
    commands: ["vote"],
    init: function (bot) {
        bot.waitingVoteChannels = [];


        async function logVote(user, voteServer, channel, source, multiplier) {
            bot.logger.log(`Vote Source: ${source}`);

            const botList = await bot.database.getBotlist(source, bot.client.user.id);
            if(botList?.pointsReward) {
                await bot.database.addPoints(user, botList.pointsReward*multiplier, `vote (${source})`);
            }

            let lastVote = await bot.database.getLastVote(user);
            if (lastVote[0])
                lastVote = lastVote[0]['MAX(timestamp)'];
            let difference = new Date() - lastVote;
            if (difference < bot.util.voteTimeout * 2)
                await bot.database.incrementStreak(user, source);
            else
                await bot.database.resetStreak(user, source);

            await bot.database.addVote(user, voteServer, source);
            bot.logger.log("Logging vote from " + user);
            let count = (await bot.database.getVoteCount(user))[0]['COUNT(*)'];
            bot.badges.updateBadge({id: user}, 'votes', count, channel);
        }

        bot.bus.on("registerVote", async (message) => {
            let {user, source, multiplier} = message.payload;
            let voteServer = null;
            let channel = null;
            const streak = await bot.database.getStreak(user, source);
            if(bot.client.channels.cache.has("756854640204709899")) {
                try {
                    const botList = await bot.database.getBotlist(source, bot.client.user.id);

                    let message = `+${Icon.points}${(botList.pointsReward*multiplier).toLocaleString()} **${await bot.util.getUserTag(user)}** just voted at ${await bot.database.getBotlistUrl(source, bot.client.user.id)}`;
                    if(multiplier > 1)message += ` (${multiplier.toLocaleString()}x multiplier)`
                    if(streak > 100)message +=` **(⭐${streak.toLocaleString()} streak!)**`;
                    if(streak > 1)message += ` (${Strings.NCharacters(Math.floor(streak/10)+1, "🔥")}${streak.toLocaleString()} streak)`;

                    bot.client.channels.cache.get("756854640204709899").send(message)
                } catch (e) {
                    // fart
                    //console.log(e);
                }
            }

            for (let i = 0; i < bot.waitingVoteChannels.length; i++) {
                if (bot.waitingVoteChannels[i]?.members?.has?.(user)) {
                    channel = bot.waitingVoteChannels[i];
                    bot.logger.log("Matched waiting vote channel for " + user);
                    const member = channel.members.get(user);
                    const context = new NotificationContext(bot, channel, member, member.user);
                    context.sendLang(streak > 1 ? "VOTE_MESSAGE_STREAK" : "VOTE_MESSAGE", {user, streak});
                    bot.waitingVoteChannels.splice(i, 1);
                    voteServer = channel.guild.id;
                    break;
                }
            }
            if (bot.util.shard == 0) {
                logVote(user, voteServer, channel, source, multiplier).then(()=>{
                    bot.logger.log("emitting vote event");
                    bot.rabbit.emit("vote", {
                        user, source, multiplier
                    });
                });
            }
        })
    },
    run: async function (context, bot) {
        if (context.args && context.args[1]) return;
        let lastVote = await bot.database.getLastVoteBySource(context.user.id, "topgg");
        let difference = new Date() - lastVote;

        if (difference < bot.util.voteTimeout) {
            context.sendLang("VOTE_TIMEOUT", {time: bot.util.prettySeconds((bot.util.voteTimeout - difference) / 1000, context.guild && context.guild.id, context.user.id)});
        } else {
            context.sendLang("VOTE");
        }
        bot.waitingVoteChannels.unshift(context.channel);
    }
};