const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers, initAuthCreds, BufferJSON, proto } = require("@whiskeysockets/baileys");
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
const PALAVRAS_BANIDAS = ['puta', 'caralho', 'krlh', 'crlh', 'porra', 'prr', 'desgraça', 'pt', 'misera', 'urubu'];
const regexPalavrao = new RegExp(`\\b(${PALAVRAS_BANIDAS.join('|')})\\b`, 'i');
const avisos = {}; 
let codigoJaSolicitado = false;

// --- FUNÇÃO DE SESSÃO MONGO ---
async function useMongoDBAuthState(collection) {
    const writeData = async (data, id) => {
        await collection.replaceOne(
            { _id: id },
            { _id: id, data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)) },
            { upsert: true }
        );
    };

    const readData = async (id) => {
        try {
            const res = await collection.findOne({ _id: id });
            if (!res) return null;
            return JSON.parse(JSON.stringify(res.data), BufferJSON.reviver);
        } catch { return null; }
    };

    const removeData = async (id) => {
        try { await collection.deleteOne({ _id: id }); } catch {}
    };

    let creds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, 'creds');
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
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
        saveCreds: async () => {
            await writeData(creds, 'creds');
        }
    };
}

// --- CONEXÃO PRINCIPAL ---
async function connectToWhatsApp() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.log("❌ ERRO: A variável MONGODB_URI não foi configurada no Render!");
        return;
    }
    
    const mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    const db = mongoClient.db('ellena_bot');
    const collection = db.collection('session');

    const { state, saveCreds } = await useMongoDBAuthState(collection);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: Browsers.macOS('Desktop'),
        printQRInTerminal: false 
    });

    if (!sock.authState.creds.registered && !codigoJaSolicitado) {
        codigoJaSolicitado = true;
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(MEU_NUMERO);
                console.log(`\n\n====================================\n👉 CÓDIGO: ${code}\n====================================\n\n`);
            } catch (err) { codigoJaSolicitado = false; }
        }, 7000);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr) qrCodeTexto = qr;
        if (connection === "open") {
            console.log("✅ ELLENA CONECTADA E SALVA NA NUVEM!");
            qrCodeTexto = null;
        }
        if (connection === "close") {
            if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWhatsApp();
            }
        }
    });

    // --- MÓDULO DE BOAS-VINDAS ---
    sock.ev.on("group-participants.update", async (anu) => {
        if (anu.action === 'add') {
            const metadata = await sock.groupMetadata(anu.id);
            const nomeGrupo = metadata.subject; 
            
            for (const num of anu.participants) {
                const saudacao = `🍷Sejam muito bem-vindos(a) @${num.split('@')[0]} ao grupo *${nomeGrupo}*\n\npara mantermos o grupo organizado e agradável para todos, por favor, fique atento às nossas diretrizes.\n\n⚠️*ATENÇÃO*:SIGA AS REGRAS\n\n🪻 sᴇᴍ ᴄᴏɴᴛᴇᴜ́ᴅᴏ +18\n🍷 sᴇᴍ ʟɪɴᴋs sᴇ ɴᴀ̃ᴏ ᴛɪᴠᴇʀ ᴘᴀʀᴄᴇʀɪᴀ\n🪻 sᴇᴍ ʟɪɴᴋs ᴅᴇ ᴊᴏɢᴏs ᴅᴇ ᴀᴘᴏsᴛᴀs 💀\n🍷 ɴᴀ̃ᴏ ᴘᴏᴅᴇ ɪɴᴠᴀᴅɪʀ ᴘᴠ sᴇᴍ ᴘᴇʀᴍɪssᴀ̃ᴏ ᴇ ɴᴀᴅᴀ ǫᴜᴇ ᴇɴᴠᴏʟᴠᴀ ᴠᴇɴᴅᴀ\n 🍷 sᴇᴍ ᴘᴀʟᴀᴠʀᴏ̃ᴇs\n\nADMs\n\n🍷https://www.instagram.com/_.evelyn.sx?igsh=MTJrMWc0dzZkc2xsbg==\n\n 🍷https://www.instagram.com/eofelipeaqui/`;
                await sock.sendMessage(anu.id, { text: saudacao, mentions: [num] });
            }
        }
    });

    // --- ESCUTA DE MENSAGENS ---
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();

        // --- SISTEMA INTELIGENTE DE FILTRAGEM DE LINKS ---
        const linksEncontrados = texto.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi);
        
        if (from.endsWith('@g.us') && linksEncontrados && !AUTORIZADOS.includes(sender)) {
            let deveApagar = false;
            const temParceria = texto.includes("parceria");

            for (let link of linksEncontrados) {
                const isInstagram = link.includes("instagram.com");
                const isTikTok = link.includes("tiktok.com");
                const isKwai = link.includes("kwai"); 
                const isWhatsApp = link.includes("wa.me") || link.includes("whatsapp.com") || link.includes("chat.whatsapp");

                if (isWhatsApp) {
                    if (!temParceria) { deveApagar = true; break; }
                } else if (!isInstagram && !isTikTok && !isKwai) {
                    deveApagar = true;
                    break;
                }
            }

            if (deveApagar) {
                try {
                    await sock.sendMessage(from, { delete: msg.key }); 
                    const admsMencionados = AUTORIZADOS.map(id => `@${id.split('@')[0]}`).join(' ');
                    await sock.sendMessage(from, { 
                        text: `🚫𝑳𝒊𝒏𝒌 𝒏𝒂̃𝒐 𝒂𝒖𝒕𝒐𝒓𝒊𝒛𝒂𝒅𝒐\n𝘾𝙤𝙣𝙩𝙧𝙖𝙩𝙚 𝙖𝙡𝙜𝙪𝙢 𝙖𝙙𝙢 𝙥𝙧𝙖 𝙥𝙖𝙧𝙘𝙚𝙧𝙞𝙖🫵🏽\n\n${admsMencionados}`, 
                        mentions: AUTORIZADOS 
                    });
                } catch (e) { console.log("Erro ao deletar link: " + e); }
                return;
            }
        }

        // --- SISTEMA DE STRIKES (PALAVRÕES) ---
        if (from.endsWith('@g.us') && regexPalavrao.test(texto)) {
            await sock.sendMessage(from, { delete: msg.key });
            avisos[from] = avisos[from] || {};
            avisos[from][sender] = (avisos[from][sender] || 0) + 1;
            if (avisos[from][sender] >= 3) {
                await sock.groupParticipantsUpdate(from, [sender], "remove");
                delete avisos[from][sender];
            } else {
                await sock.sendMessage(from, { text: `⚠️ Strike [${avisos[from][sender]}/3]: @${sender.split('@')[0]}`, mentions: [sender] });
            }
            return;
        }

        // --- COMANDO DE MENU INTERATIVO ---
        if (texto === '.oi' || texto === '.menu') {
            // Se o comando for enviado no PRIVADO e por um ADM AUTORIZADO
            if (!from.endsWith('@g.us') && AUTORIZADOS.includes(sender)) {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    const groupList = Object.values(groups).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
                    
                    if (groupList.length === 0) {
                        await sock.sendMessage(from, { text: "🌸 *ELLENA BOT*\n\nVocê ainda não adicionou o bot em nenhum grupo." });
                        return;
                    }

                    let resposta = "🌸 *ELLENA BOT - PAINEL DE CONTROLE* 🌸\n\n";
                    resposta += "Escolha o grupo que deseja gerenciar remotamente:\n\n";
                    
                    groupList.forEach((group, index) => {
                        resposta += `${index + 1}️⃣ *${group.subject}*\n`;
                        resposta += `  ↳ Abrir: \`.abrir ${index + 1}\`\n`;
                        resposta += `  ↳ Fechar: \`.fechar ${index + 1}\`\n\n`;
                    });

                    resposta += "💡 _Dica: Basta copiar e enviar o comando correspondente ao grupo desejado._";
                    await sock.sendMessage(from, { text: resposta });
                } catch (e) {
                    await sock.sendMessage(from, { text: "❌ Erro ao ler a lista de grupos." });
                }
            } else {
                // Menu padrão caso seja enviado dentro de um grupo ou por alguém comum
                await sock.sendMessage(from, { text: "🌸 *ELLENA BOT*\n\n.adms | .menu\n\n*ADM:*\n.abrir | .fechar | .ban" });
            }
            return;
        }

        // --- EXECUÇÃO DE COMANDOS DO PAINEL REMOTO (NO PRIVADO) ---
        if (AUTORIZADOS.includes(sender)) {
            if (from.endsWith('@g.us')) {
                // Comandos tradicionais executados de dentro do grupo
                if (texto === '.abrir') await sock.groupSettingUpdate(from, 'not_announcement');
                if (texto === '.fechar') await sock.groupSettingUpdate(from, 'announcement');
            } else {
                // Comandos remotos via Privado (.abrir X ou .fechar X)
                if (texto.startsWith('.abrir ')) {
                    const idx = parseInt(texto.replace('.abrir ', '').trim()) - 1;
                    const groups = await sock.groupFetchAllParticipating();
                    const groupList = Object.values(groups).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
                    
                    if (groupList[idx]) {
                        await sock.groupSettingUpdate(groupList[idx].id, 'not_announcement');
                        await sock.sendMessage(from, { text: `✅ O grupo *${groupList[idx].subject}* foi ABERTO com sucesso remotamente!` });
                    } else {
                        await sock.sendMessage(from, { text: "❌ Número do grupo inválido. Verifique o `.menu`" });
                    }
                }

                if (texto.startsWith('.fechar ')) {
                    const idx = parseInt(texto.replace('.fechar ', '').trim()) - 1;
                    const groups = await sock.groupFetchAllParticipating();
                    const groupList = Object.values(groups).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
                    
                    if (groupList[idx]) {
                        await sock.groupSettingUpdate(groupList[idx].id, 'announcement');
                        await sock.sendMessage(from, { text: `🔒 O grupo *${groupList[idx].subject}* foi FECHADO com sucesso remotamente!` });
                    } else {
                        await sock.sendMessage(from, { text: "❌ Número do grupo inválido. Verifique o `.menu`" });
                    }
                }
            }
        }
    });

    // --- ROTINAS AUTOMATIZADAS (CRON JOBS) ---
    cron.schedule('0 22 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) { 
            await sock.groupSettingUpdate(id, 'announcement'); 
            await sock.sendMessage(id, { text: "𝗚𝗿𝘂𝗽𝗼 𝗳𝗲𝗰𝗵𝗮𝗱𝗼!!\n\n𝘁𝗲𝗻𝗵𝗮𝗺 𝘂𝗺𝗮 𝗼́𝘁𝗶𝗺𝗮 𝗻𝗼𝗶𝘁𝗲🍷" });
        }
    }, { timezone: "America/Sao_Paulo" });

    cron.schedule('0 6 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) { 
            await sock.groupSettingUpdate(id, 'not_announcement'); 
            await sock.sendMessage(id, { text: "𝘉𝘰𝘮𝘮 𝘥𝘪𝘢ａａ\n𝗚𝗿𝘂𝗽𝗼 𝗮𝗯𝗲𝗿𝘁𝗼!!\n\n𝗷𝗮́ 𝗽𝗼𝗱em 𝗲𝗻𝘃𝗶𝗮𝗿 𝘀𝗲𝘂𝘀 𝗹𝗶𝗻𝗸𝘀🍷" });
        }
    }, { timezone: "America/Sao_Paulo" });

    cron.schedule('30 11 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) { 
            await sock.sendMessage(id, { text: "𝑶 𝒈𝒓𝒖𝒑𝒐 𝒔𝒆𝒓𝒂́ 𝒇𝒆𝒄𝒉𝒂𝒅𝒐 𝒆𝒎 30 𝒎𝒊𝒏𝒖𝒕𝒐𝒔🍷", mentions: Object.keys(groups[id].participants) }); 
        }
    }, { timezone: "America/Sao_Paulo" });

    cron.schedule('0 12 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) { 
            await sock.groupSettingUpdate(id, 'announcement');
            await sock.sendMessage(id, { text: "𝑮𝒓𝒖𝒑𝒐 𝒇𝒆𝒄𝒉𝒂𝒅𝒐!🪻\n𝙫𝙤𝙡𝙩𝙖𝙢𝙤𝙨 𝙖́𝙨 13:00", mentions: Object.keys(groups[id].participants) }); 
        }
    }, { timezone: "America/Sao_Paulo" });

    cron.schedule('0 13 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) { 
            await sock.groupSettingUpdate(id, 'not_announcement');
            await sock.sendMessage(id, { text: "𝑮𝒓𝒖𝒑𝒐 𝒂𝒃𝒆𝒓𝒕𝒐!🍷\n𝙅𝙖́ 𝙥οдем 𝙚𝙣𝙫𝙞𝙖𝙧 𝙨𝙚𝙪𝙨 𝙡𝙞𝙣𝙠𝙨🌷" }); 
        }
    }, { timezone: "America/Sao_Paulo" });
}

connectToWhatsApp();