const later = require('later');
const Util = require("../../util/Util");
const regex = new RegExp(".*?( .* )[\“\”\"\‘\’\'\‚«»‹›「」『』﹃﹁﹄﹂《》〈〉](.*)[\“\”\"\‘\’\'\‚«»‹›「」『』﹃﹁﹄﹂《》〈〉]");
// fuck this shit;
let deletedReminders = [];
module.exports = {
    name: "Set Recurring Reminder",
    usage: "every :timeandmessage+", // TODO: specifics for slash commands
    commands: ["every", "everyday"],
    userPermissions: ['MANAGE_CHANNELS'],
    init: async function init(bot, reminderData) {
        bot.client.once("ready", async () => {
            let servers = [...bot.client.guilds.cache.keys()];
            let reminders = await bot.database.getRecurringRemindersForShard(bot.client.user.id, servers);
            if (bot.util.shard == 0)
                reminders.push(...(await bot.database.getRecurringRemindersForDMs(bot.client.user.id)));
            bot.logger.log(`Got ${reminders.length} recurring reminders.`);
            for (let i = 0; i < reminders.length; i++) {
                let reminder = reminders[i];
                let scheduledReminder;
                scheduledReminder = later.setInterval(module.exports.runScheduledReminder(bot, reminder, reminderData), JSON.parse(reminder.recurrence));
                reminderData.recurringReminders[reminder.id] = scheduledReminder;
            }

        })

    },
    runScheduledReminder(bot, reminder, reminderData){
        return async ()=> {
            if (bot.drain) return;
            if (!bot.config.getBool(reminder.server || "global", "remind.recurring")) return bot.logger.log("Recurring reminders disabled by setting");
            if(deletedReminders.includes(reminder.id)) {
                bot.logger.log(`Not running reminder ${reminder.id} as it is deleted`);
                return;
            }
            try {
                let channel = await bot.client.channels.fetch(reminder.channel).catch(() => null);
                if (channel?.permissionsFor?.(bot.client.user.id).has("SEND_MESSAGES", true)) {
                    console.log("Bot has send message permissions");
                    await channel.send(reminder.message);
                } else {
                    const failureCount = await bot.database.logFailure("recurring", reminder.id, "Missing Send Message permissions", reminder.server, reminder.user, reminder.channel);
                    if(failureCount > 5){
                        module.exports.removeScheduledReminder(bot, reminder);
                    }
                }
            } catch (e) {
                console.log(e);
                bot.raven.captureException(e);
                const failureCount = await bot.database.logFailure("recurring", reminder.id, e.message, reminder.server, reminder.user, reminder.channel);
                if(failureCount > 5){
                    module.exports.removeScheduledReminder(bot, reminder);
                }
            }
        }
    },
    async removeScheduledReminder(bot, reminder){
        bot.logger.warn("Deleting reminder " + reminder.id + " because the channel is no longer accessible.");
        deletedReminders.push(reminder.id);
        //reminderData.recurringReminders[reminder.id].clear();
        await bot.database.removeReminderByUser(reminder.id, reminder.user);
        const userDM = await bot.client.users.fetch(reminder.user).then(d=>d.createDM());
        userDM.send(`:warning: Your recurring reminder '**${reminder.message}**' in <#${reminder.channel}> was deleted due to too many failures.\nIf you believe this to be a bug, please contact support.`);

    },
    run: async function (context, bot) {
        const currentTotal = await bot.database.getRecurringReminderCountForChannel(bot.client.user.id, context.channel.id);
        if(currentTotal > 10)return context.send({
            content: "There are too many recurring reminders set in this channel already. Delete some before adding more.",
            ephemeral: true,
            components: [bot.util.actionRow(bot.interactions.suggestedCommand(context, "list"))]
        })
        const input = `${context.options.command} ${context.options.timeandmessage}`;
        let parse = later.parse.text(input);
        const rargs = regex.exec(input);
        let reminder;
        if (!rargs || rargs.length < 3) {
            if (parse.error === -1)
                return context.sendLang({content: "REMIND_INVALID_MESSAGE", ephemeral: true});
            reminder = input.substring(parse.error);
        } else {
            if (input.indexOf(rargs[2]) - 1 !== parse.error) {
                console.log(input.indexOf(rargs[2]), parse.error);
                if (parse.error === 0)
                    return context.send(`Invalid time period. Try 'every 5 minutes' or 'every 1 day at 10:15pm'.`);
                else
                    return context.send(`Could only understand up to \`${input.substring(0, parse.error)}\`.`);

            }
            reminder = rargs[2];
        }

        if (reminder.length > 1000)
            return context.send({content: "Your reminder message cannot be longer than 1000 characters. Yours is " + reminder.length + " characters.", ephemeral: true});

        if (parse.schedules.length === 0) {
            return context.send({content: "Unable to parse time: Try something like 'every 5 minutes' or 'every 1 day at 10:15pm'", ephemeral: true});
        }

        console.log("parsed time: ", parse.schedules);
        console.log("Exclusion", parse.exceptions);


        let occurrences = later.schedule(parse).next(10);
        let tooShort = 0;

        if (occurrences.length > 1) {
            for (let i = 0; i < occurrences.length - 1; i++) {
                let first = occurrences[i];
                let second = occurrences[i + 1];

                if (!second || second - first < 30000) {
                    tooShort++;
                }
            }
        }

        if (tooShort > occurrences.length / 2)
            return context.send({content: ":warning: Your message is too frequent. You must have at least 30 seconds between messages.", ephemeral: true});

        let result = await bot.database.addRecurringReminder(bot.client.user.id, context.user.id, context.guild?.id || null, context.channel.id, reminder, {
            schedules: parse.schedules,
            exceptions: parse.exceptions
        });


        let scheduledReminder;
        scheduledReminder = later.setInterval(module.exports.runScheduledReminder(bot, {
            server: context.guild?.id,
            channel: context.channel?.id,
            message: reminder,
            user: context.user.id,
            id: result[0],
        }, scheduledReminder), parse);

        context.commandData.recurringReminders[result[0]] = scheduledReminder;

        return context.send(`:white_check_mark: Successfully set recurring reminder.\nThe message:\n> ${reminder}\nWill be sent ${bot.util.parseSchedule(parse)}\nTo remove the reminder, type **${context.getSetting("prefix")}${context.command} remove ${result[0]}**`)
    }
}


function toFixed(time) {
    if (time >= 10)
        return time;
    return "0" + time;
}