/**
 *   ╔════   Copyright 2019 Peter Maguire
 *  ║ ════╗  Created 18/01/2019
 * ╚════ ║   (ocelotbotv5) botlists
 *  ════╝
 */
const axios = require('axios');
const os = require('os');

function setDeep(obj, path, value, setRecursively = false) {
    path.reduce((a, b, level) => {
        if (setRecursively && typeof a[b] === "undefined" && level !== path.length - 1) {
            a[b] = {};
            return a[b];
        }

        if (level === path.length - 1) {
            a[b] = value;
            return value;
        }
        return a[b];
    }, obj);
}

function conditionallyAssign(body, botList, fieldName, value) {
    if (botList[fieldName])
        body = setDeep(body, botList[fieldName].split("."), value, true);
    return body;
}

module.exports = {
    name: "Bot List Management",
    enabled: true,
    init: function init(bot) {
        bot.client.on("guildCreate", async function (guild) {
            if (bot.client.user.id !== "146293573422284800") return;
            if (!guild.available) return;
            return module.exports.updateBotLists(bot)
        });

        bot.bus.on("commandLoadFinished", async function () {
            return axios.post("https://api.discordservices.net/bot/146293573422284800/commands", Object.keys(bot.commandObjects).map((key) => {
                const cmd = bot.commandObjects[key]
                return {
                    command: "!" + cmd.commands[0],
                    desc: cmd.name,
                    category: cmd.categories[0],
                }
            }), {headers: {authorization: (await bot.database.getBotlist("services"))[0].statsKey}})
        })
    },
    updateBotLists: async function updateBotLists(bot) {
        let botLists = await bot.database.getBotlistsWithStats();
        const voiceConnections = bot.lavaqueue && bot.lavaqueue.manager && bot.lavaqueue.manager.nodes.has("0") ? bot.lavaqueue.manager.nodes.get("0").stats.players : 0;
        const serverCount = (await bot.rabbit.fetchClientValues("guilds.cache.size")).reduce((prev, val) => prev + val, 0);
        for (let i = 0; i < botLists.length; i++) {
            const botList = botLists[i];
            let body = {};
            conditionallyAssign(body, botList, "shardCountField", parseInt(process.env.SHARD_COUNT));
            conditionallyAssign(body, botList, "serverCountField", bot.client.guilds.cache.size);
            conditionallyAssign(body, botList, "shardIdField", bot.util.shard);
            conditionallyAssign(body, botList, "totalServerCountField", serverCount);
            conditionallyAssign(body, botList, "usersCountField", bot.client.users.cache.size);
            conditionallyAssign(body, botList, "voiceConnectionsCountField", voiceConnections);
            conditionallyAssign(body, botList, "tokenField", botList.statsKey);
            axios[botList.statsMethod](botList.statsUrl, body, {
                headers: {
                    "Authorization": botList.statsKey,
                    "User-Agent": `OcelotBOT https://ocelotbot.xyz ${bot.version} ${os.hostname()}`
                }
            }).then(() => {
                bot.logger.log(`Posted stats to ${botList.id}`)
            }).catch((e) => {
                bot.logger.warn(`Failed to post stats to ${botList.id}: ${e.message}`);
                if (e.response && e.response.data)
                    console.log(JSON.stringify(e.response.data).substring(0, 500));
            })
        }
    }
};

