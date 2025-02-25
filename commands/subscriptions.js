const fs = require('fs');
const Sentry = require('@sentry/node');

let checkTimer;

module.exports = {
    name: "Subscriptions",
    usage: "subscriptions",
    rateLimit: 10,
    categories: ["tools"],
    requiredPermissions: ["ATTACH_FILES"],
    commands: ["subscriptions", "subscription", "subscribe", "sub", "subs"],
    hidden: true,
    guildOnly: true,
    subs: {},
    removedSubs: [],
    nestedDir: "subscriptions",
    init: async function(bot){
        bot.logger.log("Loading subscriptions...");
        bot.subscriptions = {};
        fs.readdir(__dirname+"/../subscriptions", function readDir(err, files){
           if(err){
               bot.raven.captureException(err);
               bot.logger.warn("Couldn't load subscriptions dir");
               console.error(err);
           }else{
               for(let i = 0; i < files.length; i++){
                   const file = `${__dirname}/../subscriptions/${files[i]}`;
                   try{
                       const sub = require(file);
                       if(sub.name){
                           bot.logger.log(`Loading ${sub.name}`);
                           if(sub.init)
                               sub.init(bot);
                           bot.subscriptions[sub.id] = sub;
                       }else{
                           bot.logger.warn(`Subscription ${file} is not valid`);
                       }
                   }catch(e){
                       bot.logger.warn(`Couldn't load subscription ${file} - ${e}`);
                   }
               }
           }
        });
        bot.client.once("ready", async function discordReady(){
            bot.logger.log("Loading active subscriptions...");
            const rawSubs = await bot.database.getSubscriptionsForShard([...bot.client.guilds.cache.keys()], bot.client.user.id);
            bot.logger.log(`Loaded ${rawSubs.length} subs`);
            for(let i = 0; i < rawSubs.length; i++){
                const sub = rawSubs[i];
                if(module.exports.subs[sub.data])
                    module.exports.subs[sub.data].push(sub);
                else
                    module.exports.subs[sub.data] = [sub];

                if(bot.subscriptions[sub.type] && bot.subscriptions[sub.type].added)
                    bot.subscriptions[sub.type].added(sub, bot);

            }
            if(checkTimer)
                clearInterval(checkTimer);
            checkTimer = setInterval(module.exports.check, 120000, bot);
        });

        bot.client.on("channelDelete", async function channelDeleted(channel){
            if(!channel.guild)return;
            await bot.database.removeSubscriptionsForChannel(channel.guild.id, channel.id, bot.client.user.id);
            for(let subType in bot.subscriptions){
                if(bot.subscriptions.hasOwnProperty(subType)) {
                    for (let i = 0; i < bot.subscriptions[subType].length; i++) {
                        if(bot.subscriptions[subType][i].channel === channel.id){
                            bot.subscriptions[subType].splice(i,1);
                            bot.logger.log(`Deleted ${subType} sub #${i} from deleted channel ${channel.id}`);
                        }
                    }
                }
            }
        })
    },
    handleFailures: function handleFailures(bot, sub, failures){
        if(failures < 3)return;
        // Timeout by 0.5 hours, 1.5 hours, 2.5 hours...
        const timeoutHours = failures-2.5
        bot.logger.warn(`Temporarily not checking ID ${sub.id} for ${timeoutHours} hours`);
        sub.timedOut = true;
        if(failures > 10){
            bot.logger.warn(`Just forgetting the sub entirely until the bot is restarted`);
            // TODO: remove completely
            return;
        }
        setTimeout(()=>{
            bot.logger.warn(`Resuming checks for ${sub.id}`);
            sub.timedOut = false;
        }, 3.6e+6*timeoutHours);
    },
    checkSubType: async function checkSubType(bot, subList){
        const sub = subList[0];
        if(subList.length === 1 && sub.timedOut || module.exports.removedSubs.includes(sub.id))return;
        let results = await bot.subscriptions[sub.type].check(sub.data, sub.lastcheck);
        if(!results || results.length === 0)return;
        for (let i = 0; i < subList.length; i++) {
            const subChannel = subList[i];
            if(subChannel.timedOut || module.exports.removedSubs.includes(subChannel.id))continue;
            try {
                let chan = bot.client.channels.cache.get(subChannel.channel);
                await bot.database.updateLastCheck(subChannel.id);
                subChannel.lastcheck = new Date();
                if (chan && !chan.deleted && chan.permissionsFor(bot.client.user.id)?.has("SEND_MESSAGES")) {
                    let output = {embeds: results.slice(0, 10)};
                    if (results.length > 10)
                        output.content = `:warning: ${results.length - 10} results omitted.`;
                    await chan.send(output);
                } else {
                    let failures = await bot.database.logFailure("subscription", subChannel.id, "Channel not accessible", subChannel.server, subChannel.channel, subChannel.user)
                    module.exports.handleFailures(bot, subChannel, failures);
                    bot.logger.warn(`${subChannel.channel} does not exist for sub ${subChannel.id}`);
                }
            }catch(e){
                Sentry.captureException(e);
                let failures = await bot.database.logFailure("subscription", subChannel.id, e.message, subChannel.server, subChannel.channel, subChannel.user)
                module.exports.handleFailures(bot, subChannel, failures);
            }
        }
    },
    check: async function check(bot){
        if(bot.drain)return;
        for(let data in module.exports.subs)
           if(module.exports.subs.hasOwnProperty(data)){
               const subList = module.exports.subs[data];
               const sub = subList[0];
               if(bot.subscriptions[sub.type]){
                   if(!bot.subscriptions[sub.type].check)continue;
                   await module.exports.checkSubType(bot, subList);
               }else{
                   bot.logger.warn(`Invalid subscription type ${sub.type}`);
               }
           }
    },
};
