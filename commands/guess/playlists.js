module.exports = {
    name: "View Playlists",
    usage: "playlists",
    commands: ["playlists", "pl", "list", "playlist"],
    run: async function (message, args, bot) {
        const playlists = await bot.database.getGuessPlaylists(message.guild.id);
        const chunkedPlaylists = playlists.chunk(10);
        let spaceLength = 0;
        for(let i = 0; i < playlists.length; i++){
            if(playlists[i].id.length > spaceLength)spaceLength = playlists[i].id.length+1;
        }
        const header = `Select a playlist using **${args[0]}** followed a spotify playlist URL, or one of the following:\n\`\`\`\n`
        return bot.util.standardPagination(message.channel, chunkedPlaylists, async function (page, index) {
            let output = "";
            output += header;
            for (let i = 0; i < page.length; i++) {
                const name = page[i].id;
                output += `${name}${((i+1)/4) % 1 ? " ".repeat(spaceLength-name.length) : "\n"}`;
            }
            output += "\n```";
            return output;
        });
    }
}