/**
 * Created by Peter on 02/07/2017.
 */
module.exports = {
    name: "Spongebob",
    usage: "spongebob :text?+",
    detailedHelp: "The SpOnGeBob mEmE",
    usageExample: "spongebob shut up",
    requiredPermissions: ["EMBED_LINKS", "READ_MESSAGE_HISTORY", "VIEW_CHANNEL"],
    commands: ["spongebob"],
    categories: ["text", "memes"],
    contextMenu: {
        type: "text",
        value: "text",
    },
    run: async function run(context, bot) {
        let doSponge = function doSponge(input){
            let output = "";
            for(let i in input){
                if(input.hasOwnProperty(i))
                    if(Math.random() > 0.5)output+= input[i].toLowerCase();
                    else output+= input[i].toUpperCase();
            }
            context.send({content: output, embeds:[{
                image: {
                    url: context.getSetting("spongebob.url")
                }
            }]});
        };

        if(!context.options.text){
            const messages = (await context.channel.messages.fetch({limit: 2}));
            if(messages.size > 1 && messages.last().content.length > 0){
                const message = messages.last();
                doSponge(message.content);
            }else{
                context.sendLang("SPONGEBOB_NO_TEXT")
            }
        }else{
            doSponge(context.options.text);
        }

    }
};