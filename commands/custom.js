const later = require('later');
const Sentry = require('@sentry/node')
const {SyntheticCommandContext, CustomCommandContext} = require("../util/CommandContext");
let cronIntervals = [];
module.exports = {
    name: "Custom Functions",
    usage: "custom",
    rateLimit: 10,
    detailedHelp: "Add custom commands or autoresponders. View the full documentation at <https://docs.ocelotbot.xyz>",
    usageExample: `custom add command test return "hello world"`,
    categories: ["meta"],
    commands: ["custom", "customcommands"],
    noSynthetic: true,
    nestedDir: "custom",
    userPermissions: ["MANAGE_GUILD"],
    init: async function init(bot) {
        bot.customFunctions = {
            "COMMAND": {},
            "AUTORESPOND": {},
            "SCHEDULED": {},
        };
        bot.client.on("ready", ()=>{
            this.loadScheduled(bot);
        })
    },
    async loadScheduled(bot){
        cronIntervals.forEach((c)=>c.clear());
        // I've got crons disease ha ha
        const crons = await bot.database.getCustomFunctionsForShard("SCHEDULED", [...bot.client.guilds.cache.keys()]);
        bot.logger.log(`Loading ${crons.length} cron functions`);
        for(let i = 0; i < crons.length; i++){
            try {
                const cron = crons[i];
                const triggerSplit = cron.trigger.split("/")
                const trigger = later.parse.text(triggerSplit[1]);
                const channel = await bot.client.channels.fetch(triggerSplit[0]);
                const interval = later.setInterval(async () => {
                    if(bot.drain)return;
                    if(!bot.config.getBool(channel.guild?.id || "global", "custom.scheduled"))return bot.logger.log("Scheduled custom commands disabled by setting");
                    try {
                        Sentry.addBreadcrumb({
                            message: "Running custom cron",
                            data: cron,
                        })
                        if (!channel.lastMessageId) {
                            return bot.logger.warn(`No last message was sent in ${channel.id}`);
                        }
                        const message = (await channel.messages.fetch({limit: 1})).first();
                        let context = new CustomCommandContext(bot, message, {input: message.content});
                        bot.logger.log(`Running custom function #${cron.id}`);
                        const success = bot.util.runCustomFunction(cron.function, context, true, true);
                        if (!success) {
                            Sentry.captureMessage("Cron job failed to run");
                            bot.logger.warn(`Cron ${cron.id} failed to run`);
                            interval.clear();
                        }
                    }catch(e){
                        const errorId =  Sentry.captureException(e);
                        const message = bot.lang.getTranslation(channel.guild.id, "CUSTOM_SCHEDULE_INTERNAL_ERROR", {
                            id: cron.id,
                            code: errorId,
                        })
                        channel.send(message).catch((e)=>{
                            bot.logger.log(e);
                            interval.clear()
                        });
                        bot.logger.log(e);
                    }
                }, trigger);
                cronIntervals.push(interval);
            }catch(e){
                bot.logger.error("Couldn't set up custom function");
                bot.logger.error(e);
            }
        }
    },
    getCodeBlock(context){
        let start = context.options.code.indexOf("```")
        let end = context.options.code.length - 4;
        if (start === -1) {
            start = 0;
            end = context.options.code.length;
        }else{
            start += 3
        }
        let code = context.options.code.substring(start, end);

        if(code.startsWith("lua"))code = code.substring(3); // Remove lua from the start of the codeblock
        console.log("Codeblock:" ,code);
        return code;
    },
    async getNameOrId(context, bot){
        let func;
        if(context.options.id){
            func = (await bot.database.getCustomFunction(context.guild.id, context.options.id))[0];
        }
        if(!func){
            const funcs = await bot.database.getCustomFunctionByTrigger(context.guild.id, context.options.id || context.options.name);
            if(funcs.length > 1){
                context.sendLang({content: "CUSTOM_SEARCH_AMBIGUOUS", ephemeral: true}, {command: context.command, subCommand: context.options.command});
                return null;
            }
            func = funcs[0];
        }

        if(!func){
            context.sendLang({content: "CUSTOM_SEARCH_NOT_FOUND", ephemeral: true}, {command: context.command, subCommand: context.options.command});
            return null;
        }
        return func;
    }
};
