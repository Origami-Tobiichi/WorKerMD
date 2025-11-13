require('./settings');
const fs = require('fs');
const pino = require('pino');
const axios = require('axios');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const dns = require('dns');

// ==============================
// 🔧 BASIC CONFIGURATION
// ==============================

// Simple chalk implementation
const chalk = {
    red: (t) => `❌ ${t}`, yellow: (t) => `⚠️ ${t}`, green: (t) => `✅ ${t}`, 
    blue: (t) => `🔵 ${t}`, cyan: (t) => `🔷 ${t}`, magenta: (t) => `🟣 ${t}`,
    bold: (t) => t, gray: (t) => t
};

// Global variables
global.botStatus = 'Initializing...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;
global.dnsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Import web server functions
try {
    const { startServer, setConnectionStatus, setBotInfo, setPairingCode, setPhoneNumber } = require('./server');
    global.setConnectionStatus = setConnectionStatus;
    global.setBotInfo = setBotInfo;
    global.setPairingCode = setPairingCode;
    global.setPhoneNumber = setPhoneNumber;
    
    // Start web server
    startServer().then(port => {
        console.log(chalk.green(`🌐 Web Dashboard running on port ${port}`));
    }).catch(error => {
        console.log(chalk.yellow('⚠️ Web dashboard disabled:', error.message));
    });
} catch (error) {
    console.log(chalk.yellow('⚠️ Web server module not available'));
}

// ==============================
// 🚀 WHATSAPP BOT SETUP
// ==============================

// Import Baileys
let makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion;
try {
    const Baileys = require('@whiskeysockets/baileys');
    makeWASocket = Baileys.default || Baileys.makeWASocket;
    useMultiFileAuthState = Baileys.useMultiFileAuthState;
    DisconnectReason = Baileys.DisconnectReason;
    makeCacheableSignalKeyStore = Baileys.makeCacheableSignalKeyStore;
    fetchLatestBaileysVersion = Baileys.fetchLatestBaileysVersion;
} catch (error) {
    console.error(chalk.red('Failed to load Baileys:'), error.message);
    process.exit(1);
}

// Store implementation
const store = {
    messages: {}, contacts: {}, presences: {}, groupMetadata: {},
    
    loadMessage: function (remoteJid, id) {
        try {
            const messages = this.messages[remoteJid];
            return messages?.find(msg => msg?.key?.id === id) || null;
        } catch (error) {
            return null;
        }
    },
    
    bind: function (ev) {
        ev.on('messages.upsert', ({ messages }) => {
            for (const message of messages) {
                try {
                    const jid = message.key.remoteJid;
                    if (!this.messages[jid]) this.messages[jid] = [];
                    const existingIndex = this.messages[jid].findIndex(m => m.key.id === message.key.id);
                    if (existingIndex > -1) {
                        this.messages[jid][existingIndex] = message;
                    } else {
                        this.messages[jid].push(message);
                    }
                } catch (error) {
                    // Silent error
                }
            }
        });
    }
};

// Simple message handler
async function handleMessageUpsert(naze, message) {
    try {
        const msg = message.messages[0];
        if (!msg?.message) return;

        let text = '';
        if (msg.message.conversation) {
            text = msg.message.conversation.toLowerCase();
        } else if (msg.message.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.toLowerCase();
        }

        // Handle basic commands
        if (text.startsWith('!ping') || text.startsWith('/ping')) {
            await naze.sendMessage(msg.key.remoteJid, { 
                text: `🏓 Pong!\n🤖 Bot is running on Koyeb\n🕒 ${new Date().toLocaleString()}` 
            }, { quoted: msg });
        }
        else if (text.startsWith('!status') || text.startsWith('/status')) {
            const statusInfo = `🤖 BOT STATUS\n├ Status: ${global.connectionStatus}\n├ Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB\n├ Uptime: ${Math.floor(process.uptime())}s\n└ Platform: Koyeb`;
            await naze.sendMessage(msg.key.remoteJid, { text: statusInfo }, { quoted: msg });
        }
        else if (text.startsWith('!help') || text.startsWith('/help')) {
            const helpText = `🛡️ BOT COMMANDS\n\n!ping - Test bot response\n!status - Bot status\n!help - Show this help`;
            await naze.sendMessage(msg.key.remoteJid, { text: helpText }, { quoted: msg });
        }

    } catch (error) {
        console.log(chalk.yellow('Message handler error:'), error.message);
    }
}

// ==============================
// 🤖 BOT IMPLEMENTATION
// ==============================

async function startWhatsAppBot() {
    console.log(chalk.blue('🚀 Starting WhatsApp Bot...'));
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'error' });
        
        const naze = makeWASocket({
            version,
            logger,
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 15000,
            browser: ['Ubuntu', 'Chrome', '120.0.0.0']
        });
        
        // Connection handler
        naze.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log(chalk.blue('Connection update:'), connection);
            
            if (connection === 'connecting') {
                global.connectionStatus = 'connecting';
                if (global.setConnectionStatus) {
                    global.setConnectionStatus('connecting', 'Connecting to WhatsApp...');
                }
            }
            
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(chalk.yellow('Connection closed:'), reason);
                
                global.connectionStatus = 'offline';
                if (global.setConnectionStatus) {
                    global.setConnectionStatus('offline', 'Connection lost');
                }
                
                // Auto reconnect after 5 seconds
                setTimeout(() => {
                    startWhatsAppBot();
                }, 5000);
            }
            
            if (connection === 'open') {
                console.log(chalk.green('✅ Connected to WhatsApp!'));
                
                global.botInfo = {
                    id: naze.user?.id,
                    name: naze.user?.name || naze.user?.verifiedName || 'KoyebBot',
                    phone: naze.user?.id.split(':')[0]
                };
                
                global.connectionStatus = 'online';
                
                if (global.setConnectionStatus) {
                    global.setConnectionStatus('online', 'Connected to WhatsApp');
                }
                if (global.setBotInfo) {
                    global.setBotInfo(global.botInfo);
                }
                
                console.log(chalk.green('🤖 Bot Info:'));
                console.log(chalk.blue('   ├ Name:'), global.botInfo.name);
                console.log(chalk.blue('   ├ ID:'), global.botInfo.id);
                console.log(chalk.blue('   └ Platform: Koyeb'));
                
                // Send initial presence
                setTimeout(() => {
                    naze.sendPresenceUpdate('available').catch(() => {});
                }, 1000);
            }
            
            if (qr) {
                console.log(chalk.yellow('📱 QR Code generated - Scan with WhatsApp'));
                if (global.setConnectionStatus) {
                    global.setConnectionStatus('pairing', 'Scan QR code to connect');
                }
            }
        });

        // Message handler
        naze.ev.on('messages.upsert', async (message) => {
            await handleMessageUpsert(naze, message);
        });

        // Keep alive
        setInterval(async () => {
            if (naze?.user?.id) {
                try {
                    await naze.sendPresenceUpdate('available').catch(() => {});
                } catch (error) {
                    // Silent catch
                }
            }
        }, 30000);

        // Save credentials
        naze.ev.on('creds.update', saveCreds);

        // Store binding
        store.bind(naze.ev);

        return naze;
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start WhatsApp bot:'), error.message);
        
        // Retry after 10 seconds
        setTimeout(() => {
            startWhatsAppBot();
        }, 10000);
    }
}

// ==============================
// 🎯 MAIN APPLICATION
// ==============================

async function main() {
    console.log(chalk.magenta(`
╔══════════════════════════════╗
║      WHATSAPP BOT v2.0       ║
║      Koyeb Deployment        ║
╚══════════════════════════════╝
    `));
    
    console.log(chalk.blue('🔧 Initializing system...'));
    
    try {
        // Wait a bit for web server to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Start WhatsApp bot
        await startWhatsAppBot();
        
        console.log(chalk.green(`
✅ System Status:
├── WhatsApp Bot: STARTING
├── Web Dashboard: AVAILABLE  
└── Platform: Koyeb Ready
        `));
        
    } catch (error) {
        console.error(chalk.red('❌ Startup error:'), error.message);
        console.log(chalk.yellow('🔄 Restarting in 5 seconds...'));
        setTimeout(main, 5000);
    }
}

// ==============================
// 🛡️ PROCESS MANAGEMENT
// ==============================

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n📦 Shutting down...'));
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n📦 Received SIGTERM, shutting down...'));
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection:'), reason);
});

// Start the application
main().catch(error => {
    console.error(chalk.red('❌ Critical failure:'), error);
    process.exit(1);
});
