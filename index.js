const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const cron = require('node-cron');
const qrcode = require('qrcode-terminal');

// --- SERVIDOR WEB (NECESSÁRIO PARA O RENDER/HOSPEDAGEM) ---
const app = express();
app.get('/', (req, res) => res.send('Ellena Online! 🚀'));
app.listen(process.env.PORT || 10000);

// --- CONFIGURAÇÕES DO SISTEMA ---
const AUTORIZADOS = [
    '5598981086106@s.whatsapp.net', // Seu número com o 9
    '559881086106@s.whatsapp.net',  // Seu número sem o 9 (Formato interno da Meta)
    '559885508477@s.whatsapp.net', 
    '559881776969@s.whatsapp.net'
];

const PALAVRAS_BANIDAS = ['puta', 'caralho', 'krlh', 'crlh', 'porra', 'prr', 'desgraça', 'pt', 'misera', 'urubu'];
const regexPalavrao = new RegExp(`\\b(${PALAVRAS_BANIDAS.join('|')})\\b`, 'i');

// Detecta APENAS links do próprio WhatsApp (Grupos ou Contatos)
const regexLinkWhatsApp = /(chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com)/i;

const avisos = {}; 

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('sessao_ellena_local');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: Browsers.macOS('Desktop')
    });

    sock.ev.on("creds.update", saveCreds);

    // --- MÓDULO DE CONEXÃO ---
    sock.ev.on("connection.update", (u) => {
        const { connection, lastDisconnect, qr } = u;
        
        if (qr) {
            console.log("\n📷 ESCANEIE O QR CODE ABAIXO PARA CONECTAR A ELLENA:\n");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === "open") {
            console.log("\n======================================");
            console.log("✅ ELLENA CONECTADA E OPERACIONAL LOCALMENTE!");
            console.log("======================================\n");
        }
        
        if (connection === "close") {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log("Conexão perdida. Tentando reconectar os sistemas...");
                connectToWhatsApp();
            }
        }
    });

    // --- 1. MÓDULO DE BOAS-VINDAS (ATUALIZADO COM O SEU TEXTO) ---
    sock.ev.on("group-participants.update", async (anu) => {
        if (anu.action === 'add') {
            const metadata = await sock.groupMetadata(anu.id);
            for (const num of anu.participants) {
                // Monta a mensagem personalizada usando o padrão solicitado
                const mensagemBoasVindas = `👋 Olá, @${num.split('@')[0]}! Seja muito bem-vindo(a) ao *${metadata.subject}*! ✨\nPara mantermos o grupo organizado e agradável para todos, por favor, fique atento às nossas diretrizes.\n\n⚠️ *ATENÇÃO: SIGA AS REGRAS* ⚠️\n\n🍷 sᴇᴍ ᴄᴏɴᴛᴇᴜ́ᴅᴏ +18\n🖤 sᴇᴍ ʟɪɴᴋs sᴇ ɴᴀ̃ᴏ ᴛɪᴠᴇʀ ᴘᴀʀᴄᴇʀɪᴀ\n🍷 sᴇᴍ ʟɪɴᴋs ᴅᴇ ᴊᴏɢᴏs ᴅᴇ ᴀᴘᴏsᴛᴀs 💀\n🖤 ɴᴀ̃ᴏ ᴘᴏᴅᴇ ɪɴᴠᴀᴅɪʀ ᴘᴠ sᴇᴍ ᴘᴇʀᴍɪssᴀ̃ᴏ ᴇ ɴᴀᴅᴀ ǫᴜᴇ ᴇɴᴠᴏʟᴠᴀ ᴠᴇɴᴅᴀ.\n🚫 sᴇᴍ ᴏғᴇɴsᴀs ᴇ sᴇᴍ ᴘᴀʟᴀᴠʀᴏ̃ᴇs (Sistema de 3 Strikes = Ban definitivo)\n\n👑 *Siga os ADMs no Instagram:*\n\n👉 https://www.instagram.com/eofelipeaqui/\n👉 https://www.instagram.com/_.evelyn.sx/\n\nAproveite o grupo com respeito! 🚀`;
                
                await sock.sendMessage(anu.id, { text: mensagemBoasVindas, mentions: [num] });
            }
        }
    });

    // --- 2. ESCUTA DE MENSAGENS E PROCESSAMENTO LÓGICO ---
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        
        const texto = (
            msg.message.conversation || 
            msg.message.extendedTextMessage?.text || 
            msg.message.imageMessage?.caption || 
            msg.message.videoMessage?.caption || ""
        ).toLowerCase().trim();

        console.log(`[LOG] Mensagem de: ${sender} | Grupo: ${from} | Texto: ${texto}`);

        // Apenas processa moderação se a mensagem vier de um grupo
        if (from.endsWith('@g.us')) {
            
            // --- 3. SISTEMA ANTILINK (FOCADO APENAS EM WHATSAPP) ---
            if (regexLinkWhatsApp.test(texto)) {
                const temParceria = texto.includes("tenho parceria");
                const ehAdmin = AUTORIZADOS.includes(sender);

                // Se for link do WhatsApp, não for admin e NÃO tiver a frase "tenho parceria", apaga!
                if (!ehAdmin && !temParceria) {
                    await sock.sendMessage(from, { delete: msg.key });

                    // Pega os dados do grupo e filtra quem são os ADMs ativos na hora
                    const metadata = await sock.groupMetadata(from);
                    const admsDoGrupo = metadata.participants
                        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                        .map(p => p.id);

                    // Monta a lista de marcações (Membro + ADMs)
                    const todasMentions = [sender, ...admsDoGrupo];

                    // Cria o texto mencionando os ADMs no formato "@número" no final
                    let textoAdms = admsDoGrupo.map(adm => `@${adm.split('@')[0]}`).join(' ');
                    
                    const avisoTexto = `⚠️ @${sender.split('@')[0]}, link não autorizado, por favor, feche parceria no PV.\n\n${textoAdms} fechar parceria`;

                    await sock.sendMessage(from, { 
                        text: avisoTexto, 
                        mentions: todasMentions 
                    });
                    return; 
                }
            }

            // --- 4. SISTEMA DE STRIKES (PALAVRÕES) ---
            if (regexPalavrao.test(texto)) {
                await sock.sendMessage(from, { delete: msg.key });
                
                if (!avisos[from]) avisos[from] = {};
                avisos[from][sender] = (avisos[from][sender] || 0) + 1;

                if (avisos[from][sender] >= 3) {
                    await sock.sendMessage(from, { text: `🚨 @${sender.split('@')[0]} foi removido pelo sistema por excesso de infrações estruturais.`, mentions: [sender] });
                    await sock.groupParticipantsUpdate(from, [sender], "remove");
                    delete avisos[from][sender];
                } else {
                    await sock.sendMessage(from, { text: `⚠️ Strike [${avisos[from][sender]}/3]: @${sender.split('@')[0]}, por favor, mantenha o respeito no grupo! Faltam ${(3 - avisos[from][sender])} avisos para a expulsão automática.`, mentions: [sender] });
                }
                return;
            }
        }

        // --- 5. COMANDOS GERAIS ---
        if (texto === '.oi' || texto === '.menu') {
            await sock.sendMessage(from, { text: "🌸 *ELLENA BOT*\n\n.adms - Redes Sociais\n.menu - Comandos\n\n*ADM:*\n.abrir | .fechar | .ban" });
        }

        if (texto === '.adms') {
            await sock.sendMessage(from, { text: "Instagram: @eofelipeaqui e @_.evelyn.sx" });
        }

        // --- 6. COMANDOS RESTRITOS AOS ADMINISTRADORES ---
        if (AUTORIZADOS.includes(sender)) {
            if (texto === '.abrir') {
                await sock.groupSettingUpdate(from, 'not_announcement');
                await sock.sendMessage(from, { text: "🔓 Diretrizes alteradas. O grupo está aberto para interações!" });
            }
            if (texto === '.fechar' || texto === '.fechado') {
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: "🔒 Atenção: O grupo foi fechado pelos administradores." });
            }
            if (texto.startsWith('.ban')) {
                const citada = msg.message.extendedTextMessage?.contextInfo?.participant;
                if (citada) {
                    await sock.groupParticipantsUpdate(from, [citada], "remove");
                    await sock.sendMessage(from, { text: "🚫 Protocolo executado. Usuário removido da base." });
                }
            }
        }
    });

    // --- 7. ROTINAS AUTOMATIZADAS (CRON JOBS) ---
    cron.schedule('0 22 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) {
            await sock.groupSettingUpdate(id, 'announcement');
            await sock.sendMessage(id, { text: "🌙 Sistemas entrando em repouso. Grupos fechados automaticamente. Bom descanso!" });
        }
    }, { timezone: "America/Sao_Paulo" });

    cron.schedule('0 6 * * *', async () => {
        const groups = await sock.groupFetchAllParticipating();
        for (let id in groups) {
            await sock.groupSettingUpdate(id, 'not_announcement');
            await sock.sendMessage(id, { text: "☀️ Bom dia! Protocolos reativados. Grupos abertos." });
        }
    }, { timezone: "America/Sao_Paulo" });
}

connectToWhatsApp();