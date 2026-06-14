const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason, Browsers, initAuthCreds, BufferJSON, proto } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const cron = require('node-cron');
const { MongoClient } = require('mongodb');

const app = express();
let qrCodeTexto = null;

// --- SERVIDOR WEB ---
app.get('/', (req, res) => {
    if (qrCodeTexto) {
        res.send(`
            <div style="text-align: center; font-family: Arial, sans-serif; margin-top: 50px;">
                <h2>🌸 Conectar Ellena Bot</h2>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeTexto)}"/>
            </div>
        `);
    } else {
        res.send('Ellena Online! 🚀');
    }
});
app.listen(process.env.PORT || 10000);

// --- CONFIGURAÇÕES ---
const MEU_NUMERO = "5598981086106"; 
const AUTORIZADOS = ['5598981086106@s.whatsapp.net', '559885508477@s.whatsapp.net', '559881776969@s.whatsapp.net'];

const PALAVRAS_BANIDAS = [
    'puta', 'caralho', 'krlh', 'crlh', 'porra', 'prr', 'desgraça', 'pt', 'misera', 'urubu',
    'putinho', 'putinha', 'vagabunda', 'vagabundo', 'pau no cu', 'pnc', 'lula', 'viado', 
    'viadinho', 'gay', 'filho da puta', 'fdp', 'satanás', 'satanas', 'msr', 'mzr', 'mizera', 
    'porraa', 'krl', 'putao', 'putão', 'cu', 'rola', 'roludo', 'pika', 'pica', 'pepeka', 
    'ppk', 'xereca', 'xrc', 'xrk', 'miseravel', 'mizeravel'
];
const regexPalavrao = new RegExp(`\\b(${PALAVRAS_BANIDAS.join('|')})\\b`, 'i');
const avisos = {}; 
let codigoJaSolicitado = false;

// --- FUNÇÃO DE SESSÃO MONGO ---
async function useMongoDBAuthState(collection) {
    const writeData = async (data, id) => {
        await collection.replaceOne({ _id: id }, { _id: id, data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)) }, { upsert: true });
    };
    const readData = async (id) => {
        try { const res = await collection.findOne({ _id: id }); if (!res) return null; return JSON.parse(JSON.stringify(res.data), BufferJSON.reviver); } catch { return null; }
    };
    const removeData = async (id) => { try { await collection.deleteOne({ _id: id }); } catch {} };

    let creds = await readData('creds');
    if (!creds) { creds = initAuthCreds(); await writeData(creds, 'creds'); }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) await writeData(value, key);
                            else await removeData(key);
                        }
                    }
                }
            }
        },
        saveCreds: async () => { await writeData(creds, 'creds'); }
    };
}

// --- CONEXÃO PRINCIPAL ---
async function connectToWhatsApp() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) return;
    
    let collection;
    try {
        const mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        collection = mongoClient.db('ellena_bot').collection('session');
    } catch (e) { setTimeout(connectToWhatsApp, 10000); return; }

    const { state, saveCreds } = await useMongoDBAuthState(collection);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({ version, logger: pino({ level: "silent" }), auth: state, browser: Browsers.macOS('Desktop'), printQRInTerminal: false });

    if (!sock.authState.creds.registered && !codigoJaSolicitado) {
        codigoJaSolicitado = true;
        setTimeout(async () => { try { const code = await sock.requestPairingCode(MEU_NUMERO); console.log(`👉 CÓDIGO: ${code}`); } catch (err) { codigoJaSolicitado = false; } }, 7000);
    }

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr) qrCodeTexto = qr;
        if (connection === "open") qrCodeTexto = null;
        if (connection === "close" && lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) connectToWhatsApp();
    });

    // --- MÓDULO DE BOAS-VINDAS ---
    sock.ev.on("group-participants.update", async (anu) => {
        if (anu.action === 'add') {
            const metadata = await sock.groupMetadata(anu.id);
            const nomeGrupo = metadata.subject; 
            for (const num of anu.participants) {
                const saudacao = `🍷Sejam muito bem-vindos(a) @${num.split('@')[0]} ao grupo *${nomeGrupo}*\n\n⚠️*ATENÇÃO*:SIGA AS REGRAS\n\n🪻 sᴇᴍ ᴄᴏɴᴛᴇᴜ́ᴅᴏ +18\n🍷 sᴇᴍ ʟɪɴᴋs sᴇ ɴᴀ̃ᴏ ᴛɪᴠᴇʀ ᴘᴀʀᴄᴇʀɪᴀ\n🪻 sᴇᴍ ʟɪɴᴋs ᴅᴇ ᴊᴏɢᴏs ᴅᴇ ᴀᴘᴏsᴛᴀs 💀\n🍷 ɴᴀ̃ᴏ ᴘᴏᴅᴇ ɪɴᴠᴀᴅɪʀ ᴘᴠ sᴇᴍ ᴘᴇʀᴍɪssᴀ̃ᴏ ᴇ ɴᴀᴅᴀ ǫᴜе ᴇɴᴠᴏʟᴠᴀ ᴠᴇɴᴅᴀ\n 🍷 sᴇᴍ ᴘᴀʟᴀᴠʀᴏ̃ᴇs\n\nADMs\n\n🍷https://www.instagram.com/_.evelyn.sx?igsh=MTJrMWc0dzZkc2xsbg==\n\n 🍷https://www.instagram.com/eofelipeaqui/`;
                await sock.sendMessage(anu.id, { text: saudacao, mentions: [num] });
            }
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const from = msg.key.remoteJid;
            let senderRaw = msg.key.participant || msg.key.remoteJid;
            const sender = senderRaw.replace(/:\d+/, ""); 
            const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();

            // --- FILTRO DE LINKS ---
            const linksEncontrados = texto.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi);
            if (from.endsWith('@g.us') && linksEncontrados && !AUTORIZADOS.includes(sender)) {
                let deveApagar = false;
                const temParceria = texto.includes("parceria");
                for (let link of linksEncontrados) {
                    const isInstagram = link.includes("instagram.com"), isTikTok = link.includes("tiktok.com"), isKwai = link.includes("kwai"), isWhatsApp = link.includes("wa.me") || link.includes("whatsapp.com") || link.includes("chat.whatsapp");
                    if (isWhatsApp ? !temParceria : (!isInstagram && !isTikTok && !isKwai)) { deveApagar = true; break; }
                }
                if (deveApagar) {
                    await sock.sendMessage(from, { delete: msg.key }); 
                    await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]}, 𝑳𝒊𝒏𝒌 𝒏𝒂̃𝒐 𝒂𝒖𝒕𝒐𝒓𝒊𝒛𝒂𝒅𝒐\n𝘾𝙤𝙣𝙩𝙧𝙖𝙩𝙚 𝙖𝙡𝙜𝙪𝙢 𝙖𝙙𝙢 𝙥𝙧𝙖 𝙥𝙖𝙧𝙘𝙚𝙧𝙞𝙖🫵🏽`, mentions: [sender] });
                    continue; 
                }
            }

            // --- MENU INTERATIVO ---
            if (texto === '.oi' || texto === '.menu') {
                if (!from.endsWith('@g.us') && AUTORIZADOS.includes(sender)) {
                    const groups = Object.values(await sock.groupFetchAllParticipating()).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
                    let resposta = "🌸 *PAINEL DE CONTROLE - GRUPOS* 🌸\n\n";
                    groups.forEach(g => { resposta += `📍 *${g.subject}*\n   ✅ \`.abrir ${g.subject}\`\n   🔒 \`.fechar ${g.subject}\`\n\n`; });
                    await sock.sendMessage(from, { text: resposta });
                } else {
                    await sock.sendMessage(from, { text: "🌸 *ELLENA BOT*\n\n.adms | .menu\n\n*ADM:*\n.abrir | .fechar | .ban" });
                }
                continue;
            }

            // --- COMANDOS REMOTOS ---
            if (AUTORIZADOS.includes(sender)) {
                if (from.endsWith('@g.us')) {
                    if (texto === '.abrir') await sock.groupSettingUpdate(from, 'not_announcement');
                    if (texto === '.fechar') await sock.groupSettingUpdate(from, 'announcement');
                } else {
                    const groups = Object.values(await sock.groupFetchAllParticipating());
                    if (texto.startsWith('.abrir ') || texto.startsWith('.fechar ')) {
                        const isAbrir = texto.startsWith('.abrir ');
                        const nomeGrupo = texto.replace(isAbrir ? '.abrir ' : '.fechar ', '').trim();
                        const target = groups.find(g => g.subject.toLowerCase() === nomeGrupo.toLowerCase());
                        if (target) {
                            await sock.groupSettingUpdate(target.id, isAbrir ? 'not_announcement' : 'announcement');
                            await sock.sendMessage(from, { text: `✅ Grupo *${target.subject}* ${isAbrir ? 'ABERTO' : 'FECHADO'} com sucesso!` });
                        } else {
                            await sock.sendMessage(from, { text: "❌ Grupo não encontrado." });
                        }
                    }
                }
            }
        } 
    });
}
connectToWhatsApp();