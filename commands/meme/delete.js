/**
 *   ╔════   Copyright 2019 Peter Maguire
 *  ║ ════╗  Created 27/04/2019
 * ╚════ ║   (ocelotbotv5) delete
 *  ════╝
 */
module.exports = {
    name: "Delete Meme",
    usage: "delete :name+",
    commands: ["delete", "remove"],
    run: async function (context, bot) {
        if (!context.guild)
            return context.sendLang("GENERIC_DM_CHANNEL");

        let meme = await bot.database.getMemeInfo(context.options.name.toLowerCase(), context.guild.id);

        if (!meme[0])
            return context.sendLang("MEME_NOT_FOUND");

        if (meme[0].addedby !== context.user.id && !context.channel.permissionsFor(context.member).has("MANAGE_MESSAGES"))
            return context.sendLang("MESSAGE_REMOVE_INVALID_MEME");

        try {
            await bot.database.removeMeme(context.options.name.toLowerCase(), context.guild.id);
            return context.sendLang("MEME_REMOVE_SUCCESS");
        } catch (e) {
            return context.sendLang("MESSAGE_REMOVE_ERROR");
        }
    }
};