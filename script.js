const fs = require('fs');
const chokidar = require('chokidar');
const rcon = require('rcon');
const production = process.argv.findIndex(argItem => argItem === '--mode=production') >= 0;
require('dotenv').config();
const rconPassword = process.env.RCON_PWD;

const rconClient = new rcon("localhost", 30120, rconPassword, { tcp: false, challenge: false, });
const packageJson = require('./package.json');
const resourceName = packageJson.name;

function refreshResources() {
    rconClient.send(`refresh`)
}

function ensureResource() {
    rconClient.send(`ensure ${resourceName}`);
}

if (!production) {
    rconClient.on('auth', () => {
        console.log("Authed!");
    });
    rconClient.connect()
}

function validateJson(json) {
    try {
        JSON.parse(json);
    } catch (e) {
        return false;
    }
    return true;
}

async function build() {
    const jsonManifest = fs.readFileSync('./manifest.json', 'utf8');
    if (!validateJson(jsonManifest)) {
        console.log("Invalid manifest.json");
        return;
    }
    const manifest = JSON.parse(jsonManifest);

    const resourceName = packageJson.name;
    const fxVersion = manifest.fxVersion;
    const games = manifest.games;
    const sharedScripts = manifest.scripts.shared;
    const serverScripts = manifest.scripts.server;
    const clientScripts = manifest.scripts.client;


    const scripts = [
        {
            name: "shared",
            files: sharedScripts,
            content: ""
        },
        {
            name: "server",
            files: serverScripts,
            content: ""
        },
        {
            name: "client",
            files: clientScripts,
            content: ""
        }
    ]

    for (const script of scripts) {
        for (const file of script.files) {
            if (file.startsWith("@")) continue;
            const fileContent = fs.readFileSync(`./src/${file}`, 'utf8');
            script.content += fileContent + "\n";
        }
        fs.writeFileSync(`./dist/${script.name}.lua`, script.content);
    }

    for (const scripts of [sharedScripts, serverScripts, clientScripts]) {
        const newScripts = [];
        for (const script of scripts) {
            if (script.includes("@")){
                newScripts.push(script);
            }
        }
        scripts.length = 0;
        newScripts.forEach(script => scripts.push(script));
    }

    sharedScripts.push("dist/shared.lua");
    serverScripts.push("dist/server.lua");
    clientScripts.push("dist/client.lua");

    let fxManifest = `fx_version '${fxVersion}'\n`;
    fxManifest += `games {${games.map(game => ` "${game}" `).join(',')}}\n`;
    fxManifest += `lua54 "yes"\n`;
    fxManifest += `shared_scripts {\n${sharedScripts.map(script => `    "${script}"`).join(',\n')}\n}\n`;
    fxManifest += `server_scripts {\n${serverScripts.map(script => `    "${script}"`).join(',\n')}\n}\n`;
    fxManifest += `client_scripts {\n${clientScripts.map(script => `    "${script}"`).join(',\n')}\n}\n`;

    fs.writeFileSync('./fxmanifest.lua', fxManifest);
}

if (!production) {
    chokidar.watch('./src').on('all', async (event, path) => {
        await build()
        ensureResource()
    });

    chokidar.watch('./manifest.json').on('all', async (event, path) => {
        await build()
        refreshResources()
        ensureResource()
    });
}

build()