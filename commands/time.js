const regionTimezones = {
    "eu-west": "GMT",
    "eu-central": "GMT+2",
    "brazil": "GMT-3",
    "sydney": "GMT+10",
    "singapore": "GMT+8",
    "us-central": "CST",
    "us-west": "PST",
    "us-east": "EST",
    "us-south": "CST"
};
//Fuck you joel, theres no easier way to do this.
const timezones = {ACDT: "10.5",
    ACST: "09.5",
    ACT: "-05",
    ACWST: "08.75",
    ADT: "-03",
    AEDT: "11",
    AEST: "10",
    AFT: "04.5",
    AKDT: "-08",
    AKST: "-09",
    AMST: "-03",
    AMT: "-04",
    ART: "-03",
    AST: "03",
    AWST: "08",
    AZOST: "0",
    AZOT: "-01",
    AZT: "04",
    BDT: "08",
    BIOT: "06",
    BIT: "-12",
    BOT: "-04",
    BRST: "-02",
    BRT: "-03",
    BST: "06",
    BTT: "06",
    CAT: "02",
    CCT: "06.5",
    CDT: "-05",
    CEST: "02",
    CET: "01",
    CHADT: "13.75",
    CHAST: "12.75",
    CHOT: "08",
    CHOST: "09",
    CHST: "10",
    CHUT: "10",
    CIST: "-08",
    CIT: "08",
    CKT: "-10",
    CLST: "-03",
    CLT: "-04",
    COST: "-04",
    COT: "-05",
    CST: "-06",
    CT: "08",
    CVT: "-01",
    CWST: "08.75",
    CXT: "07",
    DAVT: "07",
    DDUT: "10",
    DFT: "01",
    EASST: "-05",
    EAST: "-06",
    EAT: "03",
    ECT: "-04",
    EDT: "-04",
    EEST: "03",
    EET: "02",
    EGST: "0",
    EGT: "-01",
    EIT: "09",
    EST: "-05",
    FET: "03",
    FJT: "12",
    FKST: "-03",
    FKT: "-04",
    FNT: "-02",
    GALT: "-06",
    GAMT: "-09",
    GET: "04",
    GFT: "-03",
    GILT: "12",
    GIT: "-09",
    GMT: "00",
    GST: "-02",
    GYT: "-04",
    HDT: "-09",
    HAEC: "02",
    HST: "-10",
    HKT: "08",
    HMT: "05",
    HOVST: "08",
    HOVT: "07",
    ICT: "07",
    IDLW: "-12",
    IDT: "03",
    IOT: "03",
    IRDT: "04.5",
    IRKT: "08",
    IRST: "03.5",
    IST: "05.5",
    JST: "09",
    KGT: "06",
    KOST: "11",
    KRAT: "07",
    KST: "09",
    LHST: "10.5",
    LINT: "14",
    MAGT: "12",
    MART: "-09.5",
    MAWT: "05",
    MDT: "-06",
    MET: "01",
    MEST: "02",
    MHT: "12",
    MIST: "11",
    MIT: "-09.5",
    MMT: "06.5",
    MSK: "03",
    MST: "08",
    MUT: "04",
    MVT: "05",
    MYT: "08",
    NCT: "11",
    NDT: "-02.5",
    NFT: "11",
    NPT: "05.75",
    NST: "-03.5",
    NT: "-03.5",
    NUT: "-11",
    NZDT: "13",
    NZST: "12",
    OMST: "06",
    ORAT: "05",
    PDT: "-07",
    PET: "-05",
    PETT: "12",
    PGT: "10",
    PHOT: "13",
    PHT: "08",
    PKT: "05",
    PMDT: "-02",
    PMST: "-03",
    PONT: "11",
    PST: "-08",
    PYST: "-03",
    PYT: "-04",
    RET: "04",
    ROTT: "-03",
    SAKT: "11",
    SAMT: "04",
    SAST: "02",
    SBT: "11",
    SCT: "04",
    SDT: "-10",
    SGT: "08",
    SLST: "05.5",
    SRET: "11",
    SRT: "-03",
    SST: "-11",
    SYOT: "03",
    TAHT: "-10",
    THA: "07",
    TFT: "05",
    TJT: "05",
    TKT: "13",
    TLT: "09",
    TMT: "05",
    TRT: "03",
    TOT: "13",
    TVT: "12",
    ULAST: "09",
    ULAT: "08",
    USZ1: "02",
    UYST: "-02",
    UYT: "-03",
    UZT: "05",
    VET: "-04",
    VLAT: "10",
    VOLT: "04",
    VOST: "06",
    VUT: "11",
    WAKT: "12",
    WAST: "02",
    WAT: "01",
    WEST: "01",
    WIT: "07",
    WST: "08",
    YAKT: "09",
    YEKT: "05"};

const timeRegex = /(UTC|GMT)([+\-][0-9]+)/i;

module.exports = {
    name: "Time",
    usage: "time [timezone]",
    accessLevel: 0,
    commands: ["time", "thetime"],
    categories: ["tools"],
    run: function run(message, args){
        let targetTimezone = (args[1] && args[1].toUpperCase()) || message.getSetting("time.zone") || (message.guild && regionTimezones[message.guild.region]) || "GMT";
        const time = new Date();
        if(timezones[targetTimezone]){
            time.setHours(time.getHours()+parseInt(timezones[targetTimezone]));
        }else{
            const regexMatch = timeRegex.exec(targetTimezone);
            if(regexMatch){
                try {
                    time.setHours(time.getHours() + parseInt(regexMatch[2]));
                }catch(e){
                    console.log(e);
                    message.replyLang("TIME_INVALID_TIMEZONE");
                    return;
                }
            }else{
                console.log(targetTimezone);
                message.replyLang("TIME_INVALID_TIMEZONE");
                return;
            }
        }



        const timeMessage = time.toString();

        if(timeMessage === "Invalid Date"){
            message.channel.send("https://i.imgur.com/eAhW2Sy.png");
        }else {

            let twelveHourTime = time.getHours() < 12 ? time.getHours() : time.getHours() - 12;

            let emoji = `:clock${twelveHourTime}${(time.getMinutes() >= 30) ? "30" : ""}:`;

            if (twelveHourTime === 4 && time.getMinutes() === 20) emoji = "<:weed:478962396296380422>";
            if (twelveHourTime === 9 && time.getMinutes() === 11) emoji = ":airplane: :office: :office:";

            message.replyLang("TIME_MESSAGE", {
                time: timeMessage.substring(0, timeMessage.indexOf("GMT")),
                emoji: emoji
            });
        }
    }
};