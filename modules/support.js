/**
 *   ╔════   Copyright 2019 Peter Maguire
 *  ║ ════╗  Created 14/04/2019
 * ╚════ ║   (ocelotbotv5) support
 *  ════╝
 */
const Sentry = require('@sentry/node');
const columnify = require('columnify');
const config = require('config');
const {axios} = require('../util/Http')
const {NotificationContext} = require("../util/CommandContext");
const Embeds = require("../util/Embeds");

const changePrefix = /.*(change|custom).*prefix.*/gi;
const domainRegex = /.*(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9].*/i
module.exports = {
    name: "Support Server Specific Functions",
    init: function (bot) {
        bot.client.on("messageCreate", async function onMessage(message) {
            if(bot.drain)return;
            if(message.guild && !message.author.bot && message.guild.getBool("antiphish")){
                if(domainRegex.exec(message.content)){
                    try {
                        bot.logger.log(`Checking domain in ${message.guild.id}`);
                        let result = await axios.post("https://anti-fish.bitflow.dev/check", {message: message.content}).catch(()=>null);
                        if (result?.data?.match) {
                            const isAdmin = message.member.permissions.has("ADMINISTRATOR");
                            if(!isAdmin)message.delete();
                            if (message.guild.getSetting("antiphish.channel")) {
                                const reportChannel = await message.guild.channels.fetch(message.guild.getSetting("antiphish.channel"));
                                const context = new NotificationContext(bot, reportChannel, message.author, message.member);
                                const embed = new Embeds.LangEmbed(context);
                                embed.setTitleLang("PHISHING_DETECTION_TITLE");
                                embed.setDescriptionLang("PHISHING_DETECTION_DESC", message);
                                embed.setThumbnail(message.author.avatarURL({size: 128}));
                                embed.setColor("#ff0000");
                                if(isAdmin)
                                    embed.addFieldLang("PHISHING_DETECTION_ADMIN_NAME", "PHISHING_DETECTION_ADMIN_VALUE");
                                for (let i = 0; i < result.data.matches.length; i++) {
                                    const match = result.data.matches[i];
                                    embed.addFieldLang("PHISHING_DETECTION_MATCH_NAME", "PHISHING_DETECTION_MATCH_VALUE", true, {match, index: i+1});
                                }
                                embed.setTimestamp(new Date());
                                reportChannel.send({embeds: [embed]});
                                bot.logger.log(`Deleting possible free nitro message ${message.content}`);
                            }
                        }
                    }catch(e){
                        bot.logger.error(e);
                        Sentry.captureException(e);
                    }
                }
            }
            if (message.guild && message.guild.id === "322032568558026753" && !message.author.bot && bot.client.user.id == "635846996418363402") {
                if (message.content.indexOf("discord.gg") > -1)
                    return message.delete();

                if (changePrefix.exec(message.content))
                    return bot.util.replyTo(message, "To change the prefix, type !settings set prefix %\nWhere % is the prefix you want.");
            }
        });

        function verify(member){
            return async (interaction, context)=>{
                if(!["145193838829371393", "139871249567318017", "112386674155122688", "145200249005277184"].includes(interaction.member.user.id))
                    return context.send({content: "Wait and a member of staff will be along to verify you shortly.", ephemeral: true});
                if(member.deleted) return context.send({content: "User has left.", ephemeral: true});
                await member.roles.remove("856657988629692486", "Verified by "+interaction.member.user.id);
                return context.send({content: `<@${member.id}> has been verified by <@${interaction.member.user.id}>`});
            }
        }

        function viewUserInfo(member){
            return async (interaction, context)=>{
                if(!["145193838829371393", "139871249567318017", "112386674155122688", "145200249005277184"].includes(interaction.member.user.id))
                    return context.send({content: "Wait and a member of staff will be along to verify you shortly.", ephemeral: true})
                if(member.deleted)
                    return context.send({content: "User has left.", ephemeral: true});

                let content = `**Details for ${member.user.tag}:**\nAccount Age: `;
                try {
                    const [guildData, drep, ddu, azrael] = await Promise.all([
                        bot.rabbit.broadcastEval(`this.guilds.cache.filter((guild)=>guild.members.cache.has('${member.id}') && guild.id !== '${member.guild.id}').map((guild)=>\`\${guild.name} (\${guild.id})\`);`),
                        axios.get(`https://discordrep.com/api/v3/rep/${member.id}`, {
                            headers: {
                                Authorization: config.get("API.discordrep.key")
                            }
                        }).catch(() => null),
                        axios.get(`https://discord.riverside.rocks/check.json.php?id=${member.id}`).catch(() => null),
                        axios.get(`https://azreal.gg/api/v3/checks/${member.id}`, {
                            headers: {
                                Authorization: config.get("API.azrael.key")
                            }
                        }).catch(() => null),
                    ]);

                    const now = new Date();
                    const accountAge = now - member.user.createdAt;
                    if (accountAge < 3.6e+6) content += "⚠️" // 1 Hour
                    if (accountAge < 8.64e+7) content += "‼️" // 1 Day
                    else if (accountAge < 6.048e+8) content += "❗" // 1 Week
                    else if (accountAge < 2.628e+9) content += "❕" // 1 Month
                    content += `**${bot.util.prettySeconds(accountAge / 1000, member.guild.id, member.user)}**\n`;
                    let guildCollection = guildData.reduce((a, b) => a.concat(b), []);
                    content += `Seen: ${guildCollection.length > 0 ? guildCollection.join(", ") : "Nowhere."}\n`;

                    if (drep.data) {
                        if (drep.data.downvotes > 0) content += "⚠️"
                        content += `DiscordRep: ${drep.data.upvotes} UP | ${drep.data.downvotes} DOWN | ${drep.data.xp} XP\n`;
                    }

                    if (ddu.data) {
                        if (drep.data.score > 0) content += "⚠️"
                        content += `DDU: Score: ${drep.data.score} (${drep.data.reports}/${drep.data.total_reports})\n`;
                    }

                    if(azrael.data){
                        content += `Azrael: ${azrael.data.banned ? "⚠️Banned" : "✅ Not Banned"}\n`;
                    }

                }catch(e){
                    bot.logger.log(e);
                    content += "\n"+e;
                }
                return context.send({content, ephemeral: true});
            }
        }

        bot.client.on("guildMemberAdd", async (member)=>{
            if(member.guild.id !== "322032568558026753" || bot.client.user.id !== "146293573422284800")return;
            try {
                const commandCount = (await bot.database.getUserStats(member.id))[0].count;
                if (commandCount > 0) return;
                bot.logger.log("Found suspicious account " + member.id);
                await member.edit({
                    roles: ["856657988629692486"]
                });

                let channel = await bot.client.channels.fetch("856658218948624444");
                member.verifyMessage = await channel.send({
                    content: `Welcome to the server, <@${member.id}>!\nWe require certain accounts to be screened before joining the server to avoid trolls/spammers. Please wait here and a <@&325967792128131084> or <@&439485569425211392> will be around shortly to let you in.`,
                    components: [bot.util.actionRow(
                        bot.interactions.addAction("Verify", 1, verify(member), -1, "✅"),
                        bot.interactions.addAction("View Details", 2, viewUserInfo(member), -1, "❓")
                    )]
                });
            }catch(e){
                bot.logger.error(e);
                bot.raven.captureException(e);
            }
        });

        bot.client.on("guildMemberRemove", async (member)=>{
            if(member.guild.id !== "322032568558026753" || bot.client.user.id !== "146293573422284800" || !member.verifyMessage)return;
            member.verifyMessage.delete();
        })

        async function updateLeaderboards() {
            if (bot.config.getBool("global", "leaderboard.enable")) {
                await updateLeaderboard("guess.records", "guess/records", "total");
                await updateLeaderboard("guess", "guess/global", "total");
                await updateLeaderboard("trivia", "trivia/global", "score");
            }
        }

        async function updateLeaderboard(key, route, field) {
            const channel = bot.config.get("global", `leaderboard.${key}.channel`);
            const allMessageId = bot.config.get("global", `leaderboard.${key}.all`);
            const monthlyMessageId = bot.config.get("global", `leaderboard.${key}.monthly`);
            console.log(key, route, field, channel, allMessageId, monthlyMessageId)
            let [allMessage, monthlyMessage] = await Promise.all([
                await bot.client.channels.cache.get(channel).messages.fetch(allMessageId),
                await bot.client.channels.cache.get(channel).messages.fetch(monthlyMessageId),
            ]);

            console.log("editing ", allMessageId)
            await allMessage.edit(await makeLeaderboard(route, field, "all"));
            console.log("editing ", monthlyMessageId)
            await monthlyMessage.edit(await makeLeaderboard(route, field, "month"));
        }

        async function makeLeaderboard(type, totalField, time) {
            const leaderboard = await bot.util.getJson(`https://api.ocelotbot.xyz/leaderboard/${type}/${time}?items=20`);
            let outputData = [];
            for (let i = 0; i < leaderboard.data.length; i++) {
                const entry = leaderboard.data[i]
                let row = {
                    "#": i + 1,
                    "user": await bot.util.getUserTag(entry.user),
                };
                if (entry.points)
                    row["Correct"] = entry.points.toLocaleString();

                row[totalField] = entry[totalField].toLocaleString();

                outputData.push(row);
            }
            return (time === "month" ? "Monthly Scores:" : "All Time Scores:") + "\n```yaml\n" + columnify(outputData) + "\n```\nLast Updated:" + new Date().toLocaleString();
        }


        bot.client.on("ready", async function () {
            if (bot.client.guilds.cache.has("322032568558026753")) {
                setTimeout(updateLeaderboards, 5000)
                setInterval(updateLeaderboards, 8.64e+7)
            }
        })


    }
};