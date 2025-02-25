/**
 *   ╔════   Copyright 2018 Peter Maguire
 *  ║ ════╗  Created 05/12/2018
 * ╚════ ║   (ocelotbotv5) songguess
 *  ════╝
 */

const {axios} = require('../util/Http');
const config = require('config');
const Sentry = require('@sentry/node');
const cheerio = require('cheerio');
const Embeds = require("../util/Embeds");
// Start a random position in the playlist on startup, mostly for my sanity during testing
let counter = Math.round(Math.random()*1000);

const llErrors = {
    "WebSocketClosedEvent": ":thinking: Looks like I was disconnected from the Voice Channel for some reason. Try again in a minute or so.",
    "TrackExceptionEvent": ":warning: Something happened when I tried to play that song. There could be an issue with Spotify, or with that song in particular. Wait a few minutes and try a different playlist. If the issue persists, use the feedback command to let me know."
}

const spotifyPlaylist = /.*open\.spotify\.com\/playlist\/(.+?)([\/?#>]|$)/i


module.exports = {
    name: "Guess The Song",
    usage: "guess :command? :playlist?",
    rateLimit: 25,
    categories: ["games", "voice"],
    //requiredPermissions: ["CONNECT", "SPEAK"],
    commands: ["guess", "guesssong", "songguess", "namethattune", "quess", "gues"],
    detailedHelp: "Guess the name of a song",
    usageExample: "guess",
    guildOnly: true,
    nestedDir: "guess",
    runningGames: {},
    argDescriptions: {
        "base": {name: "play", description: "Start a guess game"},
    },
    run:  async function run(context, bot) {
        if(context.options.command === "play")context.options.command = null; // No
        let playlist;

        let {playlists, isCustom} = await getPlaylistId(bot, context);

        console.log(playlists, isCustom);

        if(!playlists)
            return context.sendLang({content: "SONGGUESS_UNKNOWN_INPUT"});

        playlist = bot.util.arrayRand(playlists.split(","));
        bot.logger.log(`Using spotify playlist: ${playlist}`);

        if (bot.util.checkVoiceChannel(context.message || context.interaction)) return;
        if (context.guild.voiceConnection && !bot.voiceLeaveTimeouts[context.member.voice.channel.id] && context.getSetting("songguess.disallowReguess"))
            return context.sendLang("SONGGUESS_OCCUPIED");

        let playlistData = await getPlaylistData(bot, playlist);
        if(!playlistData)
            return context.sendLang({content: "SONGGUESS_TRACK_FAILED"}); // Bad
        if(playlistData.error)
            return context.sendLang({content: "SONGGUESS_SPOTIFY_ERROR"}, playlistData.error);

        if (module.exports.runningGames[context.guild.id]) {
            if(playlist != module.exports.runningGames[context.guild.id].playlistId){
                module.exports.runningGames[context.guild.id].playlistId = playlist;
                return context.sendLang("SONGGUESS_SWITCHED_PLAYLIST", {playlistName: playlistData.name})
            }
            return context.replyLang("SONGGUESS_ALREADY_RUNNING", {channel: module.exports.runningGames[context.guild.id].voiceChannel.name})
        }

        return startGame(bot, context, playlist, isCustom);
    }

};

async function getPlaylistId(bot, context){
    const playlist = context.options.command || context.options.playlist;
    if(!playlist){
        const playlistId = context.getSetting("songguess.default");
        bot.logger.log(`Using default playlist ID: ${playlistId}`);
        return {
            custom: false,
            playlists: await bot.database.getGuessPlaylist(context.guild.id, playlistId)
        };
    }

    let regexResult = spotifyPlaylist.exec(playlist);
    if(regexResult?.[1]){
        return {
            custom: true,
            playlists: regexResult[1]
        };
    }

    return {
        custom: false,
        playlists: await bot.database.getGuessPlaylist(context.guild.id, playlist.toLowerCase())
    }
}

async function endGame(bot, id){
    bot.logger.log("Ending game ", id)
    const game = module.exports.runningGames[id];
    if(!game)return;
    await bot.lavaqueue.manager.leave(game.voiceChannel.guild.id);
    if(game.ending) return;
    game.ending = true;
    if(game.timeout){
        clearTimeout(game.timeout);
    }
    if(game.player) {
        // Player listeners are removed first to stop the next song from playing
        game.player.removeAllListeners();
    }
    if(game.collector) {
        // The collector is stopped to trigger the end of round message
        game.collector.stop();
        // The collectors listeners are removed then the song is stopped
        game.collector.removeAllListeners();
    }
    if(game.player) {
        await game.player.stop();
    }

    delete module.exports.runningGames[id];
}

async function startGame(bot, context, playlistId, custom){
    context.defer();
    if(!context.member.voice.channel) {
        Sentry.captureMessage("Member has no voice channel when starting guess game");
        return context.send("Couldn't start game, try again (voice channel does not exist)");
    }
    const vcId = context.member.voice.channel.id;
    if(bot.lavaqueue.manager.idealNodes.length === 0){
        return context.send("Audio functions are currently unavailable. Try again later.");
    }
    const player = await bot.lavaqueue.manager.join({
        guild: context.guild.id,
        channel: vcId,
        node: bot.util.arrayRand(bot.lavaqueue.manager.idealNodes).id,
    }, {selfdeaf: true})

    if(context.member.voice.channel.type === "stage"){
        context.sendLang("VOICE_STAGE_SPEAKER");
    }

    module.exports.runningGames[context.guild.id] = {
        voiceChannel: context.member.voice.channel,
        textChannel: context.channel,
        debug: context.getBool("songguess.debug"),
        context,
        playlistId,
        player,
        custom,
        failures: 0,
        end: ()=>endGame(bot, context.guild.id),
    }
    player.on("error", (e)=>{
        console.error(e);

        if(llErrors[e.type])
            context.send(llErrors[e.type])
        else{
            Sentry.captureException(e)
            context.send("An unknown error happened. If you see Big P, tell him this: "+e.type);
        }
        endGame(bot, context.guild.id);
    });
    await newGuess(bot, context.member.voice.channel);
}

async function newGuess(bot, voiceChannel, retrying = false){
    const game = module.exports.runningGames[voiceChannel.guild.id];
    if(!game)return; // Game has disappeared somehow
    const playlistLength = await getPlaylistLength(bot, game.playlistId);
    const index = counter++ % playlistLength;
    const chunk = Math.floor(index/100)*100;
    Sentry.addBreadcrumb({
        message: "Starting guess",
        data: {
            counter,
            index,
            chunk,
            playlistLength,
            playlistId: game.playlistId
        }
    })
    const playlist = await getPlaylist(bot, game.playlistId, chunk);
    let realIndex = (index-chunk) % playlist.length; // For some reason spotify sends unusual things
    Sentry.addBreadcrumb({
       message: "Calculate realIndex",
       data: {
           realIndex,
           playlistId: game.playlistId
       }
    });
    if(realIndex < 0 || realIndex > playlist.length){
        bot.logger.warn("realIndex was incorrect "+realIndex);
        if(game.debug) game.context.send(`:bug: RealIndex miscalculation: 0 < ${realIndex} < ${playlist.length}`);
        realIndex = bot.util.intBetween(0, playlist.length); // Last ditch
        counter = bot.util.intBetween(0, playlistLength); // Reset the counter
        Sentry.addBreadcrumb({
            message: "Forcibly Reset reallIndex",
            data: {
                realIndex,
                counter,
            }
        })
        Sentry.captureMessage("RealIndex is calculated incorrectly");
    }
    bot.logger.log(`Counter: ${counter} | Index: ${index} | Chunk: ${chunk} | List length: ${playlistLength} | Array Length: ${playlist.length} | Real Index: ${realIndex}`);

    if(!playlist || playlist.length === 0) {
        endGame(bot,  voiceChannel.guild.id);
        return game.context.sendLang("SONGGUESS_PLAYLIST_EMPTY");
    }
    let song = playlist[realIndex];
    if(!song) {
        bot.logger.warn("Song is null");
        bot.logger.log(playlist);
        if(game.debug) game.context.send(`:bug: Null \`song\` at realIndex ${realIndex} | Perceived Length: ${playlistLength} | Actual Length: ${playlist.length} | Counter: ${counter} | Retrying: ${retrying}`);
        if (!retrying) {
            counter = bot.util.intBetween(0, playlistLength);
            return newGuess(bot, voiceChannel, true);
        } else if(counter === 0){
            Sentry.captureMessage("Failed to load song")
            counter = 0;
            endGame(bot, voiceChannel.guild.id);
            return game.context.sendLang("SONGGUESS_TRACK_FAILED")
        }else{
            counter = 0;
            song = playlist[0];
        }
    }

    if(!song.track.preview_url){
        Sentry.addBreadcrumb({
            message: "Fetched alternative preview",
            data: song.track
        });
        if(game.debug) game.context.send(`:warning: Fetching alternative preview URL`);
        bot.logger.warn("Fetching alternative preview for "+song.track.id);
        song.track.preview_url = await fetchAlternativePreview(song.track.id);
        if(!song.track.preview_url){
            if(game.debug) game.context.send(`:bug: Alternative preview URL was null`);
            Sentry.captureMessage("Alternative preview URL was null");
        }
    }

    game.currentTrack = song;
    const songData = await bot.lavaqueue.getSong(song.track.preview_url, game.player);
    if(!songData){
        bot.logger.warn("songData is null")
        if(game.debug) game.context.send(`:bug: Null \`songData\` at realIndex ${realIndex} | Perceived Length: ${playlistLength} | Actual Length: ${playlist.length} | Counter: ${counter} | Retrying: ${retrying}`);
        if(!retrying) {
            console.log("retrying...");
            return newGuess(bot, voiceChannel, true);
        }else{
            counter = 10;
            endGame(bot, voiceChannel.guild.id);
            return game.context.sendLang("SONGGUESS_LOAD_FAILED");
        }
    }
    game.player.once("start", ()=>{
        if(game.debug)
            game.context.send(`Counter: ${counter} | Index: ${index} | Chunk: ${chunk} | List length: ${playlistLength} | Array Length: ${playlist.length} | Real Index: ${realIndex}\nSong Name: ${song.track.name}`);
        else
            game.context.sendLang("SONGGUESS");
        doGuess(bot, game.player, game.textChannel, song, game.voiceChannel);
    });
    return game.player.play(songData.track);
}



async function doGuess(bot, player, textChannel, song, voiceChannel){
    console.log("Guess is starting")
    const game = module.exports.runningGames[voiceChannel.guild.id];
    const guessStarted = new Date();
    let trackName = song.track.name.split("-")[0];
    const loggedTrackName = `${song.track.artists[0].name} - ${trackName}`;
    const normalisedName = normalise(trackName);
    console.log(`Title is ${loggedTrackName}`);
    const artistNames = song.track.artists.map((a)=>normalise(a.name));
    let artistsVisited = [];
    bot.logger.log(`Track is ${artistNames} - ${normalisedName}`);
    const collector = textChannel.createMessageCollector({
        max: 1,
        time: 30000,
        filter: (m)=>{
            if(m.author.bot)return false;
            game.lastGuessTime = new Date();
            bot.logger.log(bot.util.serialiseMessage(m));
            let elapsed = new Date()-guessStarted;
            const normalisedContent = normalise(m.cleanContent);
            const partialLength = normalisedName.indexOf(normalisedContent) > -1 ? normalisedContent.length : 0;
            // If the message contains the entire title, or the message is more than 30% of the title
            if(normalisedContent.indexOf(normalisedName) > -1 || partialLength >= normalisedName.length/3){
                bot.modules.statistics.incrementStat(m.guild.id, m.author.id, "guess_wins");
                bot.database.addSongGuess(m.author.id, m.channel.id, m.guild.id, normalisedContent, loggedTrackName, 1, elapsed, game.custom);
                return true;
            }

            // If the message has 40% of the title give them a little reaction
            if(partialLength >= normalisedName.length/4)
                m.react("👀")

            // If they mention one of the artists, send them a message the first time
            for(let i = 0; i < artistNames.length; i++){
                if(normalisedContent.indexOf(artistNames[i]) > -1 && !artistsVisited[i]){
                    bot.util.replyTo(m, `${song.track.artists[i].name} is ${artistNames.length > 1 ? "one of the artists" : "the artist"}, but what's the song title?`);
                    artistsVisited[i] = true;
                    break
                }
            }
            bot.modules.statistics.incrementStat(m.guild.id, m.author.id, "guess_attempts");
            bot.database.addSongGuess(m.author.id, m.channel.id, m.guild.id, "", loggedTrackName, 0, elapsed, game.custom);
            return false;
        }
    })

    game.collector = collector;

    player.once("end", ()=>{
        if(!collector.ended)
            collector.stop();
    })

    collector.on("end", async (collected)=>{
        player.stop();
        const winner = collected.first();
        if(winner) {
            const winEmbed = new Embeds.LangEmbed(game.context);
            if(song.primary_color)
                winEmbed.setColor(song.primary_color);
            else
                winEmbed.setColor("#00ff00");
            winEmbed.setTitleLang("SONGGUESS_WIN_TITLE", {username: winner.author.username})
            if(song.track.external_urls && song.track.external_urls.spotify)
                winEmbed.setDescriptionLang("SONGGUESS_WIN_DESCRIPTION_LINKED", {name: loggedTrackName, url: song.track.external_urls.spotify});
            else
                winEmbed.setDescriptionLang("SONGGUESS_WIN_DESCRIPTION", {name: loggedTrackName})
            if(song.track.images && song.track.images[0])
                winEmbed.setThumbnail(song.track.images[0].url);
            else if(song.track.album && song.track.album.images && song.track.album.images[0])
                winEmbed.setThumbnail(song.track.album.images[0].url);
            let points = 10;
            await bot.database.addPoints(winner.author.id, 10, `guess win`);
            let elapsed = winner.createdAt-guessStarted;
            winEmbed.addFieldLang("SONGGUESS_WIN_TIME_TAKEN_TITLE", "SONGGUESS_WIN_TIME_TAKEN_VALUE", false, {elapsed: bot.util.prettySeconds(elapsed / 1000, winner.guild.id, winner.author.id)})
            if(!game.custom && !game.debug) {
                const fastestGuess = await bot.database.getFastestSongGuess(loggedTrackName);
                if (fastestGuess[0]) {
                    winEmbed.addFieldLang("SONGGUESS_WIN_FASTEST_TIME_TITLE", "SONGGUESS_WIN_FASTEST_TIME_VALUE", false,{
                        time: bot.util.prettySeconds(fastestGuess[0].time / 1000, winner.guild.id, winner.author.id),
                        user: await bot.util.getUserTag(fastestGuess[0].user)
                    })
                }

                if (!fastestGuess[0] || fastestGuess[0].time > elapsed) {
                    bot.database.updateSongRecord(loggedTrackName, winner.author.id, elapsed)
                    if (fastestGuess[0]) {
                        await bot.database.addPoints(winner.author.id, 15, `guess record`);
                        points += 15;
                        game.context.sendLang("SONGGUESS_RECORD");
                    }
                }
            }
            if(game.textChannel.guild.getBool("points.enabled") && !game.debug){
                winEmbed.addFieldLang("SONGGUESS_WIN_POINTS_TITLE", "SONGGUESS_WIN_POINTS_VALUE", false, {amount: points})
            }
            winEmbed.setFooterLang("SONGGUESS_WIN_FOOTER")
            bot.bus.emit("onGuessWin", {winner, game})
            bot.util.replyTo(winner, {embeds: [winEmbed]});
            game.failures = 0;
            bot.bus.emit("guessWin", winner.author, {
                winner,
                voiceChannel,
                game,
                elapsed,
            }, game.context);
        }else {
            game.failures++;
            let message = game.context.getLang("SONGGUESS_OVER", {artists: song.track.artists.map((a) => a.name).join(", "), song: song.track.name});
            if( game.failures > 2){
                message += "\n";
                message += game.context.getLang("SONGGUESS_OVER_STUCK");
            }

            textChannel.send(message);
        }
        if(game.ending)return;
        if(voiceChannel.members.filter((m)=>!m.user.bot).size < 1){
            endGame(bot,  voiceChannel.guild.id);
            return game.context.sendLang("SONGGUESS_END_ALONE");
        }
        if((new Date()).getTime()-game.lastGuessTime > 70000){
            endGame(bot,  voiceChannel.guild.id);
            return game.context.sendLang("SONGGUESS_END_IDLE");
        }
        if(bot.drain){
            endGame(bot,  voiceChannel.guild.id);
            return game.context.sendLang("SONGGUESS_END_DRAIN");
        }
        if(new Date().getTime()-guessStarted < 1000 && !winner) {
            endGame(bot,  voiceChannel.guild.id);
            return bot.logger.log("Track took less than a second to play, something bad happened");
        }
        game.context.sendLang("SONGGUESS_NEXT_TRACK");
        return game.timeout = setTimeout(()=>{
            newGuess(bot, voiceChannel)
        }, game.debug ? 500 : 3000);
    })
}

function normalise(text){
    return text.toLowerCase().replace(/[ \-_'@"&“”‘’‚,:]|[(\[].*[)\]]|remastered/g,"");
}

async function getToken(bot){
    const key = Buffer.from(`${config.get("API.spotify.client_id")}:${config.get("API.spotify.client_secret")}`).toString("base64");

    let tokenData = await bot.redis.cache("songguess/token", async () => (await axios.post("https://accounts.spotify.com/api/token", "grant_type=client_credentials", {
        headers: {
            Authorization: `Basic ${key}`,
            "Content-Type": "application/x-www-form-urlencoded"
        }
    })).data, 3600);

    return tokenData.access_token;
}

async function getPlaylist(bot, playlistId, chunk){
    return await bot.redis.cache(`songguess/playlist/${playlistId}/${chunk}`, async () =>{
        let result = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?offset=${chunk}&limit=100&market=GB`, {
            headers: {
                authorization: `Bearer ${await getToken(bot)}`
            }
        })

        if(!result.data.items){
            return console.log("Invalid response", result.data);
        }
        let songList = result.data.items.filter((item)=>item.track);
        bot.util.shuffle(songList);
        return songList
    }, 120);
}

async function getPlaylistLength(bot, playlistId){
    return await bot.redis.cache(`songguess/playlist/${playlistId}/length`, async () =>{
        let result = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?market=GB&fields=total`, {
            headers: {
                authorization: `Bearer ${await getToken(bot)}`
            }
        })
        return result.data.total;
    }, 120);
}

async function getPlaylistData(bot, playlistId){
    let result = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
            authorization: `Bearer ${await getToken(bot)}`
        },
        validateStatus: ()=>true,
    })
    return result.data
}


async function fetchAlternativePreview(id) {
    const { data } = await axios.get(`https://open.spotify.com/embed/track/${id}`);
    const $ = cheerio.load(data);
    if($('script[id="initial-state"]').length > 0) {
        return JSON.parse(Buffer.from($('script[id="initial-state"]')[0].children[0].data, 'base64').toString())?.data?.entity?.audioPreview?.url;
    }
    return JSON.parse(decodeURIComponent($('script[id="resource"]')[0].children[0].data)).preview_url;
}