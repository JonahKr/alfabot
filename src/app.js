const Discord = require('discord.js');
const client = new Discord.Client();
const cron = require('node-cron');
const Table = require("./utils/table");
const secret = require("../secret.json");

const sqlite3 = require('sqlite3').verbose();
const { open } = require("sqlite");

var db;
(async () => {
    db = await open({
        filename: './info.db',
        driver: sqlite3.Database
    })

    db.run("CREATE TABLE IF NOT EXISTS timetables (owner TEXT, id TEXT, name TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS subjects (timetable TEXT, name TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS links (client TEXT, link TEXT, timetable TEXT, subject TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS timeentry (hour TEXT, day TEXT, subject TEXT, timetable TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS activeTable (client TEXT, timetable TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS clients (discordId TEXT)");
    //db.run("CREATE TABLE IF NOT EXISTS imported (client TEXT, timetable TEXT)");

    global.db = db;
})()



const times = require("./times.json");

const UseTable = require('./commands/useTable');
const Asign = require('./commands/asign');
const CreateTimeTable = require('./commands/createTimetable');
const AddSubject = require('./commands/addSubject');
const Feedback = require('./commands/feedback');
const ImportCmd = require('./commands/import');
const RenameCmd = require("./commands/rename");
const SetLink = require('./commands/setLink');
const ExportCmd = require('./commands/export');


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity("ur schools stuff", { type: "WATCHING" })
    //doCronJob(1);
    global.client = client;
});

const currentCommands = {};

async function checkFirstMessage(discordId) {

    const row = await db.get("SELECT * FROM clients WHERE discordId=?", [discordId]);
    if (!row) {
        db.run("INSERT INTO clients VALUES (?)", [discordId]);
        return true;
    }

    return false;
}

client.on('message', async msg => {
    if (msg.channel.type == "dm" && !msg.author.bot) {
        if (await checkFirstMessage(msg.author.id)) {
            msg.channel.send(`<@${msg.author.id}> welcome to AlfaBot! Here is our help page to get you started:`, getHelpEmbed());
            return;
        }
        if (msg.content.trim() == "cancel") {
            currentCommands[msg.author.id] = undefined;
            msg.react("👍");
        } else if (currentCommands[msg.author.id] && currentCommands[msg.author.id].active) {
            currentCommands[msg.author.id].recieve(msg);
        } else {
            if (msg.content.trim().toLowerCase().startsWith("asign")) {
                currentCommands[msg.author.id] = new Asign(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.trim().toLowerCase().startsWith("create table")
                || msg.content.trim().toLowerCase().startsWith("add table")
                || msg.content.trim().toLowerCase().startsWith("create timetable")
                || msg.content.trim().toLowerCase().startsWith("add timetable")) {
                currentCommands[msg.author.id] = new CreateTimeTable(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.trim().toLowerCase().startsWith("use")
                || msg.content.trim().toLowerCase().startsWith("switch")) {
                currentCommands[msg.author.id] = new UseTable(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.trim().toLowerCase().startsWith("add subject")
                || msg.content.trim().toLowerCase().startsWith("create subject")) {
                currentCommands[msg.author.id] = new AddSubject(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.trim().toLowerCase().startsWith("feedback")
                || msg.content.trim().toLowerCase().startsWith("review")
                || msg.content.trim().toLowerCase().startsWith("support")) {
                currentCommands[msg.author.id] = new Feedback(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.trim().toLowerCase().startsWith("import")) {
                currentCommands[msg.author.id] = new ImportCmd(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.trim().toLowerCase().startsWith("rename")) {
                currentCommands[msg.author.id] = new RenameCmd(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.trim().toLowerCase().startsWith("export")) {
                currentCommands[msg.author.id] = new ExportCmd(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.trim().toLowerCase().startsWith("set link")) {
                currentCommands[msg.author.id] = new SetLink(db);
                currentCommands[msg.author.id].recieve(msg);
            } else if (msg.content.toLowerCase().startsWith("info")) {
                const embed = new Discord.MessageEmbed();


                const response = await db.get("SELECT timetable FROM activeTable WHERE client=?", [msg.author.id]);
                if (!response) {
                    msg.channel.send(new Discord.MessageEmbed().setColor("#ff2146").setDescription(":no_entry_sign:  **No timetable set. Use `CREATE TIMETABLE <name>` to create one.**"));
                    return;
                }
                const { timetable: activeTable } = response;
                if (activeTable) {
                    const tableId = activeTable;
                    const tableInfo = await db.get("SELECT * FROM timetables WHERE id=?", [tableId])
                    const tableName = tableInfo.name;

                    const subjects = await db.all("SELECT * FROM subjects WHERE timetable=?", [tableId]);
                    const links = await db.all("SELECT * FROM links WHERE timetable=? AND client=?", [tableId, msg.author.id]);

                    if (!subjects) subjects = [];
                    if (!links) links = [];


                    embed.setColor("#5cd1ff").setTitle(`Information about *${tableName}*`).setDescription(":notepad_spiral: **" + tableName + "** is currently selected. Use `SWITCH` to change tables.");

                    embed.addField("\u200b", "\u200b");

                    embed.addField("Export Code", `:globe_with_meridians: \`${tableId}\``, true);
                    embed.addField("Subjects", ":notebook_with_decorative_cover: " + subjects.length, true);
                    embed.addField("Links", ":link: " + links.length, true);

                    if (subjects.length > 0) {
                        embed.addField("\u200b", "\u200b");
                        var subjectsString = "";
                        subjects.forEach(subject => {

                            let link = undefined;

                            links.forEach(iLink => {
                                if (iLink.subject == subject.name) {
                                    link = iLink;
                                }
                            });

                            subjectsString += "`" + subject.name + "`";

                            if (link) {
                                subjectsString += " **-** " + link.link;
                            }

                            subjectsString += "\n";
                        });
                        embed.addField("List of all subjects", subjectsString);
                    }

                    embed.addField("\u200b", "\u200b");

                    const table = new Table();
                    table.addRow(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);

                    var rows = [];

                    for (let row = 1; row < 12; row++) {
                        const currentRow = [];
                        for (let day = 1; day < 6; day++) {
                            const entry = await db.get("SELECT subject FROM timeentry WHERE hour=? AND day=? AND timetable=?", [row, day, tableId]);
                            if (entry) {
                                currentRow.push(entry.subject);
                            } else {
                                currentRow.push("");
                            }

                        }
                        rows.push(currentRow);
                    }

                    var lastDay = 0;
                    var currDay = 0;
                    rows.forEach(row => {
                        currDay++;
                        let contains = false;
                        row.forEach(el => {
                            if (el && el != "") {
                                contains = true;
                            }
                        });
                        if (contains) {
                            lastDay = currDay;
                        }
                    });

                    if (lastDay < 6) lastDay = 6;

                    for (let row = 0; row < lastDay; row++) {
                        table.addRow(rows[row]);
                    }

                    const tableString = table.toString();

                    if (tableString.length > 1024) {
                        embed.addField("Timetable", "\u200b");
                        msg.channel.send(embed);
                        msg.channel.send(tableString);
                    } else {
                        embed.addField("Timetable", tableString);
                        msg.channel.send(embed);
                    }


                } else {
                    msg.channel.send(new Discord.MessageEmbed().setColor("#ff2146").setDescription(":no_entry_sign:  **No timetable set. Use `CREATE TIMETABLE <name>` to create one.**"));
                }
            } else if (msg.content.toLowerCase().includes("help")) {
                msg.channel.send(getHelpEmbed());
            } else {
                msg.channel.send(new Discord.MessageEmbed().setColor("#ff2146").setDescription(":no_entry_sign:  **Command not found. Use `HELP` for help.**"));

            }
        }
    }

});

function getHelpEmbed() {
    const embed = new Discord.MessageEmbed().setColor("#f5b042").setTimestamp().setTitle("AlfaBot's Help Page")
        .setThumbnail("https://i.imgur.com/ni1gwxv.png");

    embed.setAuthor("Information", "https://i.imgur.com/ni1gwxv.png");
    embed.setFooter("AlfaBot");

    //embed.addField("\u200b", "\u200b");

    embed.addField("Get Started", "Use `IMPORT` to import a table from someone else or `CREATE TABLE` to create your own.");

    embed.addField("General Information",
        `AlfaBot helps you with joining the right conference room in time by sending you a reminder with the link 5 minutes prior to your class. ` +
        `You can also share your tables with other who share the same timetable as you. The table will be duplicated and your links will not be shared.`)

    embed.addField("\u200b", "\u200b");

    embed.addField("Command Usage", " - Commands are not case sensetive.\n - Send them directly to this bot. They don't work in servers.");

    embed.addField("\u200b", `
    \`General\`
    *HELP* - Displays this screen.
    *FEEDBACK* - Ask for support, give me feedback or report bugs.
    *STOP* - Stops reminding you of your classes.
    *START* - Reactivates reminders.
    \u200b
    \`Table Management\`
    *CREATE TABLE* - Create a new table.
    *SWITCH* - Switch between your currently active table
    *INFO* - Display all information about your current table.
    *RENAME* - Rename the current table.
    \u200b
    \`Table Configuration\`
    *CREATE SUBJECT* - Create a subject.
    *ASIGN* - Asign a subject to a school hour.
    *SET LINK* - Set a link for a subject.
    \u200b
    \`Publishing\`
    *IMPORT* - Import a table using an import code.
    *EXPORT* - Export and share your current table and recieve your export code.`);



    return (embed);
}


times.hours.forEach(async hour => {
    let hours = parseInt(hour.time.split(" ")[1]);
    let minutes = parseInt(hour.time.split(" ")[0]);
    minutes = minutes - 5;

    if (minutes < 0) {
        minutes = 60 + minutes;
        hours -= 1;
    }

    cron.schedule(`${minutes} ${hours} * * 1-5`, () => doCronJob(hour.hour));
});

async function doCronJob(hour) {
    const day = new Date().getDay();

    const allEntrys = await db.all("SELECT * FROM timeentry WHERE day=? AND hour=?", [day, hour]);

    allEntrys.forEach(async entry => {
        const timetable = entry.timetable;

        const allClients = await db.all("SELECT client FROM activeTable WHERE timetable=?", [timetable]);

        allClients.forEach(async client => {
            const discordId = client.client;

            const linkRaw = (await db.get("SELECT link FROM links WHERE timetable=? AND LOWER(subject) LIKE LOWER(?) AND client=?", [entry.timetable, entry.subject, discordId]));

            var link = "";
            if (linkRaw)
                link = linkRaw.link;

            notifyClient(discordId, entry.subject, link);
        })
    });
}

function notifyClient(clientId, subject, link) {
    client.users.fetch(clientId).then(user => {
        const embed = new Discord.MessageEmbed().setColor("#5cd1ff").setTitle("You have *" + subject + "* in 5 minutes!").setTimestamp()
            .setThumbnail("https://i.imgur.com/n5ZS0h3.png");

        if (link.trim() != "") {
            embed.addField("Link", link);
            embed.setURL(link);
        }

        user.send(`<@${user.id}>`, embed);
    });
}

client.login(secret.discord.secret);