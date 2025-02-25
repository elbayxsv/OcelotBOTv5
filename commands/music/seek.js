const {axios} = require("../../util/Http");
const Sentry = require("@sentry/node");
/**
 *   ╔════   Copyright 2019 Peter Maguire
 *  ║ ════╗  Created 05/09/2019
 * ╚════ ║   (ocelotbotv5) seek
 *  ════╝
 */
module.exports = {
    name: "Seek Song",
    usage: "seek :seconds",
    commands: ["seek"],
    run: async function (context, bot) {
        let {data} = await axios.post(`${bot.util.getPatchworkHost(context.guild.id)}/seek`, {
            guildId: context.guild.id,
            position: context.options.seconds,
        });

        if(data?.err === "nothing playing")
            return context.sendLang("MUSIC_NOTHING_PLAYING");

        if(data?.err === "not permitted")
            return context.send(`:bangbang: You can only use this command if you're the only one listening or it is your track playing.`);

        if(!data || data.err){
            Sentry.captureMessage("Invalid response from patchwork on seek");
            return context.sendLang({content: "GENERIC_ERROR"});
        }

        return context.send(`Seeked to **${bot.util.shortSeconds(data.position)}**`);
    }
};