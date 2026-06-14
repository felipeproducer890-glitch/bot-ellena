const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const cron = require('node-cron');

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

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('sessao_ellena_v20_hybrid');
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
            console.log("✅ ELLENA CONECTADA!");
            qrCodeTexto = null;
        }
        if (connection === "close") {
            if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) connectToWhatsApp();
        }
    });

    // --- MÓDULO DE BOAS-VINDAS ---
    sock.ev.on("group-participants.update", async (anu) => {
        if (anu.action === 'add') {
            const metadata = await sock.groupMetadata(anu.id);
            for (const num of anu.participants) {
                const saudacao = `Olá @${num.split('@')[0]}, bem-vindo ao ${metadata.subject}!\n\n*REGRAS:* Sem ofensas, sem links e sem palavrões.\n\nADMs: @eofelipeaqui e @_.evelyn.sx`;
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

        if (texto === '.oi' || texto === '.menu') {
            await sock.sendMessage(from, { text: "🌸 *ELLENA BOT*\n\n.adms | .menu\n\n*ADM:*\n.abrir | .fechar | .ban" });
        }

        if (AUTORIZADOS.includes(sender)) {
            if (texto === '.abrir') await sock.groupSettingUpdate(from, 'not_announcement');
            if (texto === '.fechar') await sock.groupSettingUpdate(from, 'announcement');
        }
    });

    // --- ROTINAS AUTOMATIZADAS (CRON JOBS) ---
    // Repouso Noturno
    cron.schedule('0 22 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) { await sock.groupSettingUpdate(id, 'announcement'); }
    }, { timezone: "America/Sao_Paulo" });

    cron.schedule('0 6 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) { await sock.groupSettingUpdate(id, 'not_announcement'); }
    }, { timezone: "America/Sao_Paulo" });

    // ROTINAS DE ENGAJAMENTO
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
            await sock.sendMessage(id, { text: "𝑮𝒓𝒖𝒑𝒐 𝒂𝒃𝒆𝒓𝒕𝒐!🍷\n𝙅𝙖́ 𝙥𝙤𝙙𝙚𝙢 𝙚𝙣𝙫𝙞𝙖𝙧 𝙨𝙚𝙪𝙨 𝙡𝙞𝙣𝙠𝙨🌷" }); 
        }
    }, { timezone: "America/Sao_Paulo" });
}

connectToWhatsApp();