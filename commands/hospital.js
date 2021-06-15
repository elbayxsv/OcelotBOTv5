module.exports = {
    name: "Patient Says",
    usage: "patient <text>",
    rateLimit: 10,
    requiredPermissions: ["ATTACH_FILES"],
    commands: ["hospital", "hospitalguysays", "hospitalguy", "patient", "patientsays"],
    categories: ["memes"],
    slashOptions: [{type: "STRING", name: "input", description: "What the hospital man is saying", required: true}],
    run:  function(message, args, bot){
        if(!args[1])
            return message.replyLang("IMAGE_NO_TEXT");
        return bot.util.imageProcessor(message, getTemplate(message.cleanContent.substring(args[0].length)), "hospital")
    },
    runSlash: function(interaction, bot){
        return bot.util.slashImageProcessor(interaction, getTemplate(interaction.options.get("input").value), "hospital")
    }
};


function getTemplate(content){
    return {
        "components": [
            {
                "url": "hospital.png",
                "local": true
            },
            {
                "pos": {x: 242, y: 16, w: 124, h: 99},
                "rot": 0.03473205,
                "background": "#ffffff",
                "filter": [{
                    name: "text",
                    args: {
                        font: "arial.ttf",
                        fontSize: 25,
                        colour: "#000000",
                        content,
                        x: 64,
                        y: 50,
                        ax: 0.5,
                        ay: 0.5,
                        w: 50,
                        spacing: 1.1,
                        align: 1,
                    }
                }]
            },
        ]
    }
}