const Discord = require('discord.js');
const Util = require("../util/Util");
const Embeds = require("../util/Embeds");
const shardNames = [
    "Remo.tv",
    "Alexis",
    "Sexy Trap Wife",
    "Wankish",
    "Wiking",
    "Thatgirlpossessed",
    "Anex TTT",
    "Zucc",
    "King Viking",
    "S1othy",
    "Marco",
    "sunny",
    "smirkstudios",
    "Gnome Fire",
    "Litchfield",
    "orchid",
    "Prince Ali, Fabulous He",
    "Seegee",
    "Scotty",
    "Fay",
    "crybaby",
    "nicole",
    "Massive Effect",
    "Maxmarval",
    "Cables",
];
module.exports = {
    name: "Stats",
    usage: "stats",
    requiredPermissions: ["EMBED_LINKS"],
    commands: ["stats", "statistics", "info", "about"],
    categories: ["meta"],
    run: async function run(context, bot) {
        if(context.args && context.args[1] && context.args[1] === "watson"){
            return context.send(`${context.args[2]}|${JSON.stringify({
                version: bot.version,
                podUptime: process.uptime(),
                shard: bot.util.shard,
            })}`);
        }
        let serverCount = 0;
        let userCount = 0;
        let channelCount = 0;
        try {
            serverCount = await Util.GetServerCount(bot);
            userCount = await Util.GetUserCount(bot);
            channelCount = (await bot.rabbit.fetchClientValues("channels.cache.size")).reduce((prev, val) => prev + val, 0);
        } catch (e) {
            bot.raven.captureException(e);
            if (e.message && e.message.includes("Channel closed")) {
                process.exit(1)
            }
        }

        let uptimeValue = bot.util.prettySeconds(process.uptime(), context.guild && context.guild.id, context.user.id);
        let embed = new Embeds.LangEmbed(context)
        embed.setColor(0x189F06);
        embed.setAuthorLang("STATS_VERSION", {version: bot.version}, bot.client.user.displayAvatarURL({dynamic: true, format: "png"}))
        embed.setDescriptionLang("STATS_MESSAGE", {
            name: shardNames[bot.util.shard] || context.getLang("STATS_SHARD_UNNAMED"),
            id: bot.util.shard + 1,
            total: process.env.SHARD_COUNT,
            instance: `${bot.util.shard + 1}/${process.env.SHARD_COUNT}` // Backwards compatibility with other languages
        });
        embed.addFieldLang("STATS_SPONSOR_TITLE", "STATS_SPONSOR_VALUE");
        embed.addFieldLang("STATS_UPTIME", "STATS_UPTIME_VALUE", false, {uptime: uptimeValue});
        embed.addFieldLang("STATS_TOTAL_USERS", "STATS_TOTAL_USERS_VALUE", true, {users: userCount});
        embed.addFieldLang("STATS_TOTAL_SERVERS", "STATS_TOTAL_SERVERS_VALUE", true,{servers: serverCount});
        embed.addFieldLang("STATS_TOTAL_CHANNELS", "STATS_TOTAL_CHANNELS_VALUE", true,{channels: channelCount});
        return context.send({embeds: [embed]});
    }
};
