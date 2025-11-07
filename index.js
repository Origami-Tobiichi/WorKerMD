require('./settings');
const fs = require('fs');
const os = require('os');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const { exec } = require('child_process');

// ⭐ DETEKSI ENVIRONMENT KOYEB
const isKoyeb = process.argv.includes('--koyeb') || process.env.KOYEB === 'true' || process.env.NODE_ENV === 'production';

// Safe chalk implementation
let chalk;
try {
    chalk = require('chalk');
} catch (error) {
    chalk = {
        red: (t) => t, yellow: (t) => t, green: (t) => t, blue: (t) => t,
        bold: (t) => t, cyan: (t) => t, gray: (t) => t, greenBright: (t) => t
    };
}

// Import Baileys
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    proto
} = require('@whiskeysockets/baileys');

const { dataBase } = require('./src/database');
const { GroupParticipantsUpdate, MessagesUpsert, Solving } = require('./src/message');
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, assertInstalled, sleep } = require('./lib/function');

// Import Web Dashboard
let startServer, setPairingCode, setConnectionStatus, setBotInfo, setSessionIssues;
try {
    const serverModule = require('./server');
    startServer = serverModule.startServer;
    setPairingCode = serverModule.setPairingCode;
    setConnectionStatus = serverModule.setConnectionStatus;
    setBotInfo = serverModule.setBotInfo;
    setSessionIssues = serverModule.setSessionIssues;
    console.log(chalk.green('✅ Web Dashboard integrated'));
} catch (error) {
    console.log(chalk.yellow('⚠️ Web Dashboard not available'));
    // Fallback functions
    startServer = async () => process.env.PORT || 3000;
    setPairingCode = (code) => console.log('Pairing Code:', code);
    setConnectionStatus = (status, msg) => console.log('Status:', status, msg);
    setBotInfo = (info) => console.log('Bot Info:', info);
    setSessionIssues = (issues) => console.log('Session Issues:', issues);
}

const print = (label, value) => console.log(`${chalk.green('║')} ${chalk.cyan(label.padEnd(16))}${chalk.yellow(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || global.pairing_code;
const rl = isKoyeb ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
const question = isKoyeb ? () => Promise.reject(new Error('Console input disabled in Koyeb')) : (text) => new Promise((resolve) => rl.question(text, resolve));

// ⭐ KONFIGURASI UNTUK KOYEB
const KOYEB_CONFIG = {
    DELAY_BEFORE_PAIRING: 3000,           // 3 detik sebelum mulai pairing
    DELAY_AFTER_PAIRING_CODE: 0,          // 0 detik - tampil langsung
    WEB_DASHBOARD_TIMEOUT: 180000,        // 3 menit timeout untuk web dashboard
    MAX_RETRIES: 3,                       // Maksimal retry
    SESSION_CLEANUP_INTERVAL: 3600000     // Cleanup session setiap 1 jam
};

let pairingStarted = false;
let sessionErrorCount = 0;
const MAX_SESSION_ERRORS = 5;

// Initialize global variables
global.botStatus = 'Initializing...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;

const userInfoSyt = () => {
    try {
        return os.userInfo().username;
    } catch (e) {
        return process.env.USER || 'unknown';
    }
}

// Store dengan error handling
const store = {
    messages: {}, contacts: {}, presences: {}, groupMetadata: {},
    
    loadMessage: function (remoteJid, id) {
        try {
            const messages = this.messages[remoteJid];
            return messages?.find(msg => msg?.key?.id === id) || null;
        } catch (error) {
            console.log(chalk.yellow('⚠️ Error loading message from store:'), error.message);
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
                    console.log(chalk.yellow('⚠️ Error processing message:'), error.message);
                }
            }
        });
        
        ev.on('contacts.update', (contacts) => {
            for (const contact of contacts) {
                if (contact.id) {
                    this.contacts[contact.id] = { ...this.contacts[contact.id], ...contact };
                }
            }
        });
        
        ev.on('groups.update', (updates) => {
            for (const update of updates) {
                if (update.id) {
                    this.groupMetadata[update.id] = { ...this.groupMetadata[update.id], ...update };
                }
            }
        });
    }
};

global.fetchApi = async (path = '/', query = {}, options) => {
    const urlnya = (options?.name || options ? ((options?.name || options) in global.APIs ? global.APIs[(options?.name || options)] : (options?.name || options)) : global.APIs['hitori'] ? global.APIs['hitori'] : (options?.name || options)) + path + (query ? '?' + decodeURIComponent(new URLSearchParams(Object.entries({ ...query }))) : '');
    const { data } = await axios.get(urlnya, { ...((options?.name || options) ? {} : { headers: { 'accept': 'application/json', 'x-api-key': global.APIKeys[global.APIs['hitori']]}})});
    return data;
}

const storeDB = dataBase(global.tempatStore);
const database = dataBase(global.tempatDB);
const msgRetryCounterCache = new NodeCache();

assertInstalled(process.platform === 'win32' ? 'where ffmpeg' : 'command -v ffmpeg', 'FFmpeg', 0);
console.log(chalk.greenBright('✅ All external dependencies are satisfied'));

// ⭐ TAMPILAN INFO UNTUK KOYEB
console.log(chalk.green.bold(`╔═════[${`${chalk.cyan(userInfoSyt())}@${chalk.cyan(os.hostname())}`}]═════`));
print('OS', `${os.platform()} ${os.release()} ${os.arch()}`);
print('Uptime', `${Math.floor(os.uptime() / 3600)} h ${Math.floor((os.uptime() % 3600) / 60)} m`);
print('Shell', process.env.SHELL || process.env.COMSPEC || 'unknown');
print('CPU', os.cpus()[0]?.model.trim() || 'unknown');
print('Memory', `${(os.freemem()/1024/1024).toFixed(0)} MiB / ${(os.totalmem()/1024/1024).toFixed(0)} MiB`);
print('Script version', `v${require('./package.json').version}`);
print('Node.js', process.version);
print('Baileys', `v${require('./package.json').dependencies['@whiskeysockets/baileys']}`);
print('Environment', isKoyeb ? 'Koyeb Production' : 'Development');
print('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false }));
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));

// Phone number functions dengan optimasi Koyeb
async function waitForPhoneFromWebDashboard(timeoutMs = KOYEB_CONFIG.WEB_DASHBOARD_TIMEOUT) {
    console.log(chalk.blue('📱 Waiting for phone number from web dashboard...'));
    
    if (isKoyeb) {
        console.log(chalk.green('🌐 Koyeb Dashboard: Please use the web interface to enter your phone number'));
        console.log(chalk.yellow('⏰ Timeout:', Math.floor(timeoutMs / 60000), 'minutes'));
    } else {
        console.log(chalk.gray('   Open the web dashboard to enter your WhatsApp number'));
    }
    
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = timeoutMs / 1000;
        let webUrlDisplayed = false;

        const checkPhone = () => {
            attempts++;
            
            // Tampilkan URL web dashboard sekali saja
            if (!webUrlDisplayed && global.currentPort) {
                if (isKoyeb) {
                    console.log(chalk.green(`🌐 Web Dashboard is ready on your Koyeb app URL`));
                } else {
                    console.log(chalk.green(`🌐 Web Dashboard: http://localhost:${global.currentPort}`));
                }
                webUrlDisplayed = true;
            }
            
            if (global.phoneNumber && global.connectionStatus === 'waiting_phone') {
                console.log(chalk.green('✅ Phone number received from web dashboard:'), global.phoneNumber);
                resolve(global.phoneNumber);
            } else if (attempts >= maxAttempts) {
                if (isKoyeb) {
                    console.log(chalk.red('⏰ Timeout waiting for phone number from web dashboard on Koyeb'));
                    console.log(chalk.yellow('🔁 Please refresh the web page and try again'));
                } else {
                    console.log(chalk.yellow('⏰ Timeout waiting for phone number from web dashboard'));
                }
                reject(new Error('Timeout waiting for phone number from web'));
            } else {
                // Tampilkan status setiap 30 detik untuk Koyeb
                if (attempts % 30 === 0) {
                    const remaining = Math.floor((maxAttempts - attempts) / 60);
                    console.log(chalk.blue(`⏳ Still waiting for phone number... (${remaining} minutes remaining)`));
                    if (global.currentPort && !webUrlDisplayed) {
                        if (isKoyeb) {
                            console.log(chalk.green(`🌐 Check your Koyeb app URL for the web dashboard`));
                        } else {
                            console.log(chalk.green(`🌐 Web Dashboard: http://localhost:${global.currentPort}`));
                        }
                        webUrlDisplayed = true;
                    }
                }
                setTimeout(checkPhone, 1000);
            }
        };
        checkPhone();
    });
}

async function getPhoneFromConsole() {
    if (isKoyeb) {
        console.log(chalk.red('❌ Console input is disabled in Koyeb environment'));
        console.log(chalk.yellow('💡 Please use the web dashboard to enter your phone number'));
        return Promise.reject(new Error('Console input disabled in Koyeb'));
    }

    return new Promise((resolve) => {
        rl.question(chalk.yellow('Please type your WhatsApp number (e.g., 6281234567890): '), (answer) => {
            let phoneNumber = answer.replace(/[^0-9]/g, '');
            
            // Validasi sederhana
            if (!phoneNumber || phoneNumber.length < 10) {
                console.log(chalk.red('Invalid phone number. Minimum 10 digits with country code, e.g., 6281234567890'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            // Format nomor: pastikan ada country code
            if (phoneNumber.startsWith('0')) {
                phoneNumber = '62' + phoneNumber.substring(1);
            } else if (!phoneNumber.startsWith('62')) {
                phoneNumber = '62' + phoneNumber;
            }
            
            global.phoneNumber = phoneNumber;
            console.log(chalk.green('✅ Phone number captured from CLI:'), phoneNumber);
            resolve(phoneNumber);
        });
    });
}

// Function to handle session errors
function handleSessionError(error, context = '') {
    sessionErrorCount++;
    console.log(chalk.red(`❌ Session Error (${context}):`), error.message);
    
    if (sessionErrorCount >= MAX_SESSION_ERRORS) {
        console.log(chalk.yellow('⚠️ Multiple session errors detected, marking session as problematic'));
        setSessionIssues(true);
        
        // Reset counter after some time
        setTimeout(() => {
            sessionErrorCount = 0;
        }, 60000);
    }
}

// ⭐ FUNGSI CLEANUP SESSION UNTUK KOYEB
function setupKoyebSessionCleanup() {
    if (!isKoyeb) return;
    
    setInterval(() => {
        console.log(chalk.blue('🧹 Running scheduled session cleanup for Koyeb...'));
        exec('find ./nazedev -name "*.json" -mtime +1 -delete', (error) => {
            if (error) {
                console.log(chalk.yellow('⚠️ Session cleanup error:'), error.message);
            } else {
                console.log(chalk.green('✅ Session cleanup completed'));
            }
        });
    }, KOYEB_CONFIG.SESSION_CLEANUP_INTERVAL);
}

async function startNazeBot() {
    const { state, saveCreds } = await useMultiFileAuthState('nazedev');
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });
    
    try {
        const loadData = await database.read();
        const storeLoadData = await storeDB.read();
        
        global.db = loadData || {
            hit: {}, set: {}, cmd: {}, store: {}, users: {}, game: {}, groups: {}, 
            database: {}, premium: [], sewa: []
        };
        global.store = storeLoadData || {
            contacts: {}, presences: {}, messages: {}, groupMetadata: {}
        };
        
        await database.write(global.db);
        await storeDB.write(global.store);
        
        setInterval(async () => {
            if (global.db) await database.write(global.db);
            if (global.store) await storeDB.write(global.store);
        }, 30 * 1000);
    } catch (e) {
        console.log('Database error:', e);
        process.exit(1);
    }
    
    const getMessage = async (key) => {
        try {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || proto.Message.fromObject({
                    conversation: 'Hello from WhatsApp Bot'
                });
            }
        } catch (error) {
            handleSessionError(error, 'getMessage');
        }
        return proto.Message.fromObject({
            conversation: 'Hello from WhatsApp Bot'
        });
    }
    
    const naze = makeWASocket({
        version,
        logger,
        printQRInTerminal: !pairingCode && !isKoyeb, // Nonaktifkan QR di terminal untuk Koyeb
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage,
        // Additional options untuk Koyeb
        retryRequestDelayMs: 2000,
        maxRetries: KOYEB_CONFIG.MAX_RETRIES,
        connectTimeoutMs: 45000,
        keepAliveIntervalMs: 20000,
    });
    
    store.bind(naze.ev);
    
    // ⭐ MODIFIKASI UNTUK KOYEB: Handle pairing code
    if (pairingCode && !naze.authState.creds.registered) {
        let phoneNumberToUse = null;
        let retryCount = 0;
        
        const attemptPairing = async () => {
            try {
                // Untuk Koyeb, hanya gunakan web dashboard
                if (isKoyeb) {
                    console.log(chalk.blue('🔍 Waiting for phone number from Koyeb web dashboard...'));
                    phoneNumberToUse = await waitForPhoneFromWebDashboard(KOYEB_CONFIG.WEB_DASHBOARD_TIMEOUT);
                } else {
                    // Untuk local development, gunakan fallback
                    try {
                        phoneNumberToUse = await waitForPhoneFromWebDashboard(120000);
                    } catch (error) {
                        console.log(chalk.yellow('🔄 Fallback to console input...'));
                        phoneNumberToUse = await getPhoneFromConsole();
                    }
                }
                
                // Pastikan kita punya nomor sebelum melanjutkan
                if (phoneNumberToUse) {
                    global.phoneNumber = phoneNumberToUse;
                    
                    // Delay untuk Koyeb
                    console.log(chalk.blue(`⏳ Waiting ${KOYEB_CONFIG.DELAY_BEFORE_PAIRING/1000}s before starting pairing process...`));
                    await sleep(KOYEB_CONFIG.DELAY_BEFORE_PAIRING);
                    
                    // Mulai proses pairing
                    pairingStarted = true;
                    setConnectionStatus('connecting', 'Requesting pairing code from WhatsApp...');
                    
                    console.log(chalk.blue('🔄 Requesting pairing code for:'), chalk.green(phoneNumberToUse));
                    const code = await naze.requestPairingCode(phoneNumberToUse);
                    
                    console.log(chalk.green('✅ Pairing code received:'), chalk.bold(code));
                    console.log(chalk.yellow('⏰ This code expires in 20 seconds'));
                    
                    // Delay setelah mendapatkan pairing code
                    if (KOYEB_CONFIG.DELAY_AFTER_PAIRING_CODE > 0) {
                        console.log(chalk.blue(`⏳ Waiting ${KOYEB_CONFIG.DELAY_AFTER_PAIRING_CODE/1000}s before displaying pairing code...`));
                        await sleep(KOYEB_CONFIG.DELAY_AFTER_PAIRING_CODE);
                    }
                    
                    // Update global pairing code untuk ditampilkan di web
                    setPairingCode(code);
                    console.log(chalk.blue('📊 Pairing code displayed on web dashboard'));
                    
                } else {
                    throw new Error('No phone number available');
                }
                
            } catch (error) {
                retryCount++;
                console.log(chalk.red('❌ Error in pairing process:'), error.message);
                
                if (retryCount < KOYEB_CONFIG.MAX_RETRIES) {
                    console.log(chalk.yellow(`🔄 Retrying pairing... (Attempt ${retryCount + 1}/${KOYEB_CONFIG.MAX_RETRIES})`));
                    setConnectionStatus('error', `Retrying pairing... Attempt ${retryCount + 1}`);
                    await sleep(5000);
                    return attemptPairing();
                } else {
                    console.log(chalk.red('❌ Max retries exceeded for pairing'));
                    pairingStarted = false;
                    setConnectionStatus('error', 'Failed to get pairing code after multiple attempts');
                    
                    // Reset untuk mencoba ulang
                    global.phoneNumber = null;
                    setTimeout(() => {
                        console.log(chalk.yellow('🔄 Restarting pairing process...'));
                        startNazeBot();
                    }, 10000);
                    return;
                }
            }
        };
        
        await attemptPairing();
    }
    
    await Solving(naze, store);
    
    naze.ev.on('creds.update', saveCreds);
    
    naze.ev.on('connection.update', async (update) => {
        const { qr, connection, lastDisconnect } = update;
        
        console.log('🔌 Connection status:', connection);
        
        // Handle connection updates untuk web dashboard
        if (connection === 'connecting') {
            setConnectionStatus('connecting', 'Connecting to WhatsApp servers...');
            sessionErrorCount = 0; // Reset error count on new connection
            setSessionIssues(false);
        }
        
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log('🔴 Connection closed with reason:', reason);
            
            setConnectionStatus('offline', 'Connection closed');
            
            if ([DisconnectReason.connectionLost, DisconnectReason.connectionClosed, 
                 DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
                console.log('🔄 Reconnecting...');
                setConnectionStatus('connecting', 'Reconnecting...');
                setTimeout(startNazeBot, 5000);
            } else if ([DisconnectReason.loggedOut, DisconnectReason.forbidden, 
                       DisconnectReason.badSession].includes(reason)) {
                console.log('🗑️ Session invalid, clearing and restarting...');
                setConnectionStatus('error', 'Session invalid, clearing...');
                setSessionIssues(true);
                
                exec('rm -rf ./nazedev/*', () => {
                    // Reset global variables untuk pairing ulang
                    global.phoneNumber = null;
                    global.pairingCode = null;
                    setConnectionStatus('initializing', 'Session cleared, ready for new pairing');
                    setTimeout(startNazeBot, 3000);
                });
            } else {
                console.log('❓ Unknown disconnect reason, reconnecting...');
                setConnectionStatus('error', 'Unknown error, reconnecting...');
                setTimeout(startNazeBot, 5000);
            }
        }
        
        // Handle connection open
        if (connection === 'open') {
            console.log(chalk.green('✅ Successfully connected to WhatsApp!'));
            console.log('👤 User:', naze.user?.name || naze.user?.id);
            
            // Update bot info sebelum status online
            const botInfo = {
                id: naze.user?.id,
                name: naze.user?.name || naze.user?.verifiedName || 'Unknown',
                phone: global.phoneNumber
            };
            
            setBotInfo(botInfo);
            setConnectionStatus('online', 'Connected to WhatsApp');
            global.pairingCode = null; // Clear pairing code setelah terhubung
            sessionErrorCount = 0;
            setSessionIssues(false);
            
            console.log(chalk.blue('📊 Updated web dashboard with bot info:'), botInfo);
        }
        
        if (qr && !pairingCode && !isKoyeb) {
            console.log(chalk.yellow('📱 Scan the QR code above to login'));
            qrcode.generate(qr, { small: true });
            global.qrCode = qr;
            setConnectionStatus('waiting_qr', 'QR Code generated - Scan to login');
        }
    });
    
    // Handle message decryption errors
    naze.ev.on('messages.update', (updates) => {
        for (const update of updates) {
            if (update.update?.messageStubType === 7) { // Message decryption failed
                console.log(chalk.yellow('⚠️ Message decryption failed for message:'), update.key?.id);
                handleSessionError(new Error('Message decryption failed'), 'messages.update');
            }
        }
    });
    
    naze.ev.on('messages.upsert', async (message) => {
        try {
            await MessagesUpsert(naze, message, store);
        } catch (error) {
            console.log(chalk.red('❌ Error in messages.upsert:'), error);
            handleSessionError(error, 'messages.upsert');
        }
    });
    
    naze.ev.on('group-participants.update', async (update) => {
        try {
            await GroupParticipantsUpdate(naze, update, store);
        } catch (error) {
            console.log(chalk.red('❌ Error in group-participants.update:'), error);
            handleSessionError(error, 'group-participants.update');
        }
    });
    
    naze.ev.on('groups.update', (updates) => {
        for (const update of updates) {
            if (update.id) {
                store.groupMetadata[update.id] = { ...store.groupMetadata[update.id], ...update };
            }
        }
    });
    
    naze.ev.on('contacts.update', (contacts) => {
        for (const contact of contacts) {
            if (contact.id) {
                store.contacts[contact.id] = { ...store.contacts[contact.id], ...contact };
            }
        }
    });
    
    // Update presence secara berkala
    setInterval(async () => {
        if (naze?.user?.id) {
            try {
                await naze.sendPresenceUpdate('available').catch(() => {});
            } catch (error) {
                handleSessionError(error, 'presence update');
            }
        }
    }, 10 * 60 * 1000);

    return naze;
}

// ⭐ FUNGSI UTAMA YANG DIOPTIMASI UNTUK KOYEB
async function main() {
    try {
        // Setup session cleanup untuk Koyeb
        if (isKoyeb) {
            setupKoyebSessionCleanup();
        }
        
        // Start web dashboard server
        console.log(chalk.blue('🚀 Starting Web Dashboard for Koyeb...'));
        const port = await startServer();
        global.currentPort = port;
        
        if (isKoyeb) {
            console.log(chalk.green(`🌐 Koyeb Web Dashboard ready on port: ${port}`));
            console.log(chalk.blue('📱 Your app will be available at your Koyeb app URL'));
            console.log(chalk.yellow('💡 Please open your Koyeb app URL to enter WhatsApp number'));
        } else {
            console.log(chalk.green(`🌐 Web Dashboard running on http://localhost:${port}`));
        }
        
        console.log(chalk.blue('🤖 Starting WhatsApp Bot...'));
        
        // Start WhatsApp bot
        await startNazeBot();
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start:'), error);
        
        // Untuk Koyeb, exit dengan code error
        if (isKoyeb) {
            process.exit(1);
        }
    }
}

const cleanup = async () => {
    console.log(`\n📦 Saving database and shutting down...`);
    try {
        if (global.db) await database.write(global.db);
        if (global.store) await storeDB.write(global.store);
        console.log('💾 Database saved successfully');
    } catch (error) {
        console.log('❌ Error saving database:', error);
    }
    
    console.log('🔴 Shutting down...');
    process.exit(0);
}

process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());

// Handle uncaught errors dengan optimasi Koyeb
process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
    handleSessionError(error, 'uncaughtException');
    
    // Untuk Koyeb, jangan exit langsung, biarkan process manager yang handle
    if (!isKoyeb) {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
    handleSessionError(new Error('Unhandled Rejection'), 'unhandledRejection');
});

// Start aplikasi
main().catch(error => {
    console.error(chalk.red('❌ Failed to start application:'), error);
    process.exit(1);
});

let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(chalk.redBright(`🔄 Update ${__filename}`));
    delete require.cache[file];
    require(file);
});
