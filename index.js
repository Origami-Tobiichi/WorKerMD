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
const { exec, spawn } = require('child_process');

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
let startServer, setPairingCode, setConnectionStatus, setBotInfo, setSessionIssues, clearSessionFiles;
try {
    const serverModule = require('./server');
    startServer = serverModule.startServer;
    setPairingCode = serverModule.setPairingCode;
    setConnectionStatus = serverModule.setConnectionStatus;
    setBotInfo = serverModule.setBotInfo;
    setSessionIssues = serverModule.setSessionIssues;
    clearSessionFiles = serverModule.clearSessionFiles;
    console.log(chalk.green('✅ Web Dashboard integrated'));
} catch (error) {
    console.log(chalk.yellow('⚠️ Web Dashboard not available'));
    // Fallback functions
    startServer = async () => 3000;
    setPairingCode = (code) => console.log('Pairing Code:', code);
    setConnectionStatus = (status, msg) => console.log('Status:', status, msg);
    setBotInfo = (info) => console.log('Bot Info:', info);
    setSessionIssues = (issues) => console.log('Session Issues:', issues);
    clearSessionFiles = () => Promise.resolve();
}

const print = (label, value) => console.log(`${chalk.green('║')} ${chalk.cyan(label.padEnd(16))}${chalk.yellow(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || global.pairing_code;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// PERBAIKAN CRITICAL: Konfigurasi delay yang lebih optimal
const DELAY_BEFORE_PAIRING = 1000;     // Dikurangi dari 3 detik menjadi 1 detik
const DELAY_AFTER_PAIRING_CODE = 0;    // Tetap 0 detik

let pairingStarted = false;
let pairingCodeGenerated = false; // BARU: Flag untuk mencegah multiple pairing code
let sessionErrorCount = 0;
const MAX_SESSION_ERRORS = 5;

// Initialize global variables
global.botStatus = 'Initializing...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;

// BARU: Quick restart function untuk diakses dari server
global.quickRestart = null;

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
console.log(chalk.green.bold(`╔═════[${`${chalk.cyan(userInfoSyt())}@${chalk.cyan(os.hostname())}`}]═════`));
print('OS', `${os.platform()} ${os.release()} ${os.arch()}`);
print('Uptime', `${Math.floor(os.uptime() / 3600)} h ${Math.floor((os.uptime() % 3600) / 60)} m`);
print('Shell', process.env.SHELL || process.env.COMSPEC || 'unknown');
print('CPU', os.cpus()[0]?.model.trim() || 'unknown');
print('Memory', `${(os.freemem()/1024/1024).toFixed(0)} MiB / ${(os.totalmem()/1024/1024).toFixed(0)} MiB`);
print('Script version', `v${require('./package.json').version}`);
print('Node.js', process.version);
print('Baileys', `v${require('./package.json').dependencies['@whiskeysockets/baileys']}`);
print('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false }));
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));

// PERBAIKAN CRITICAL: Phone number functions yang lebih responsif
async function waitForPhoneFromWebDashboard(timeoutMs = 120000) { // Dikurangi dari 3 menit menjadi 2 menit
    console.log(chalk.blue('📱 Waiting for phone number from web dashboard...'));
    console.log(chalk.gray('   Open the web dashboard to enter your WhatsApp number'));
    
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = timeoutMs / 1000;
        let webUrlDisplayed = false;

        const checkPhone = () => {
            attempts++;
            
            // Tampilkan URL web dashboard sekali saja
            if (!webUrlDisplayed && global.currentPort) {
                console.log(chalk.green(`🌐 Web Dashboard: http://localhost:${global.currentPort}`));
                console.log(chalk.blue('💡 If running on Koyeb, use the provided URL instead of localhost'));
                webUrlDisplayed = true;
            }
            
            if (global.phoneNumber && global.connectionStatus === 'waiting_phone') {
                console.log(chalk.green('✅ Phone number received from web dashboard:'), global.phoneNumber);
                resolve(global.phoneNumber);
            } else if (attempts >= maxAttempts) {
                console.log(chalk.yellow('⏰ Timeout waiting for phone number from web dashboard'));
                reject(new Error('Timeout waiting for phone number from web'));
            } else {
                // Tampilkan status setiap 20 detik (dikurangi dari 30 detik)
                if (attempts % 20 === 0) {
                    const remaining = Math.floor((maxAttempts - attempts) / 60);
                    console.log(chalk.blue(`⏳ Still waiting for phone number... (${remaining} minutes remaining)`));
                    if (global.currentPort && !webUrlDisplayed) {
                        console.log(chalk.green(`🌐 Web Dashboard: http://localhost:${global.currentPort}`));
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

// PERBAIKAN CRITICAL: Quick restart function
async function quickRestart() {
    console.log(chalk.yellow('🔄 Quick restart initiated...'));
    
    // Reset global state
    global.phoneNumber = null;
    global.pairingCode = null;
    global.botInfo = null;
    global.connectionStatus = 'initializing';
    global.botStatus = 'Quick restarting...';
    pairingCodeGenerated = false;
    pairingStarted = false;
    
    // Tunggu sebentar lalu start ulang
    setTimeout(startNazeBot, 1000);
}

// Set quick restart function untuk diakses dari server
global.quickRestart = quickRestart;

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
        printQRInTerminal: !pairingCode,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage,
        // Additional options for better stability
        retryRequestDelayMs: 1000,
        maxRetries: 5,
        connectTimeoutMs: 30000,
        keepAliveIntervalMs: 15000,
    });
    
    store.bind(naze.ev);
    
    // PERBAIKAN CRITICAL BESAR: Handle pairing code dengan protection multiple requests
    if (pairingCode && !naze.authState.creds.registered && !pairingCodeGenerated) {
        let phoneNumberToUse = null;
        
        try {
            // Coba dapatkan nomor dari web dashboard dulu
            console.log(chalk.blue('🔍 Checking for phone number from web dashboard...'));
            phoneNumberToUse = await waitForPhoneFromWebDashboard(120000); // 2 menit timeout untuk web
            
        } catch (error) {
            // Fallback ke input console jika web timeout
            console.log(chalk.yellow('🔄 Fallback to console input...'));
            phoneNumberToUse = await getPhoneFromConsole();
        }
        
        // Pastikan kita punya nomor sebelum melanjutkan
        if (phoneNumberToUse) {
            global.phoneNumber = phoneNumberToUse;
            
            // PERBAIKAN: Set flag untuk mencegah multiple pairing code requests
            pairingCodeGenerated = true;
            
            // DELAY: Tunggu sebentar untuk memastikan web dashboard siap
            console.log(chalk.blue(`⏳ Waiting ${DELAY_BEFORE_PAIRING/1000}s before starting pairing process...`));
            await sleep(DELAY_BEFORE_PAIRING);
            
            // Mulai proses pairing
            try {
                pairingStarted = true;
                setConnectionStatus('connecting', 'Requesting pairing code from WhatsApp...');
                
                console.log(chalk.blue('🔄 Requesting pairing code for:'), chalk.green(phoneNumberToUse));
                const code = await naze.requestPairingCode(phoneNumberToUse);
                
                console.log(chalk.green('✅ Pairing code received:'), chalk.bold(code));
                console.log(chalk.yellow('⏰ This code expires in 20 seconds'));
                
                // DELAY: Tunggu sebentar sebelum menampilkan ke web (opsional)
                if (DELAY_AFTER_PAIRING_CODE > 0) {
                    console.log(chalk.blue(`⏳ Waiting ${DELAY_AFTER_PAIRING_CODE/1000}s before displaying pairing code...`));
                    await sleep(DELAY_AFTER_PAIRING_CODE);
                }
                
                // Update global pairing code untuk ditampilkan di web
                setPairingCode(code);
                console.log(chalk.blue('📊 Pairing code displayed on web dashboard'));
                
                // PERBAIKAN: Set timeout untuk reset pairing code setelah 40 detik (lebih lama)
                const pairingTimeout = setTimeout(() => {
                    if (global.connectionStatus !== 'online') {
                        console.log(chalk.yellow('🔄 Pairing code expired, resetting...'));
                        global.pairingCode = null;
                        pairingCodeGenerated = false;
                        setConnectionStatus('waiting_phone', 'Pairing code expired, please try again');
                        
                        // Restart pairing process
                        setTimeout(() => {
                            console.log(chalk.blue('🔄 Restarting pairing process after timeout...'));
                            startNazeBot();
                        }, 2000);
                    }
                }, 40000); // 40 detik (lebih lama dari masa aktif WhatsApp)
                
                // Clean up timeout jika berhasil connect
                naze.ev.on('connection.update', (update) => {
                    if (update.connection === 'open') {
                        clearTimeout(pairingTimeout);
                    }
                });
                
            } catch (error) {
                console.log(chalk.red('❌ Error requesting pairing code:'), error);
                pairingStarted = false;
                pairingCodeGenerated = false; // Reset flag agar bisa dicoba ulang
                setConnectionStatus('error', 'Failed to get pairing code: ' + error.message);
                
                // Reset untuk mencoba ulang setelah delay yang lebih pendek
                global.phoneNumber = null;
                setTimeout(() => {
                    console.log(chalk.yellow('🔄 Restarting pairing process...'));
                    startNazeBot();
                }, 3000); // Dikurangi dari 5 detik menjadi 3 detik
                return;
            }
        } else {
            console.log(chalk.red('❌ No phone number available. Exiting...'));
            process.exit(1);
        }
    }
    
    // PERBAIKAN CRITICAL: Handle Solving function dengan error handling
    try {
        await Solving(naze, store);
    } catch (error) {
        console.log(chalk.red('❌ Error in Solving function:'), error);
        // Continue without Solving jika error
    }
    
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
            
            // PERBAIKAN CRITICAL: Handle reason 515 (Connection Closed)
            if (reason === 515) {
                console.log('🔗 Connection closed (515) - restarting...');
                setConnectionStatus('connecting', 'Reconnecting after connection closed...');
                setTimeout(startNazeBot, 2000);
            } else if ([DisconnectReason.connectionLost, DisconnectReason.connectionClosed, 
                 DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
                console.log('🔄 Reconnecting...');
                setConnectionStatus('connecting', 'Reconnecting...');
                setTimeout(startNazeBot, 3000); // Dikurangi dari 5 detik
            } else if ([DisconnectReason.loggedOut, DisconnectReason.forbidden, 
                       DisconnectReason.badSession].includes(reason)) {
                console.log('🗑️ Session invalid, clearing and restarting...');
                setConnectionStatus('error', 'Session invalid, clearing...');
                setSessionIssues(true);
                
                // PERBAIKAN: Gunakan fungsi clearSessionFiles yang baru
                try {
                    await clearSessionFiles();
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Error clearing session files:'), error.message);
                }
                
                // Reset global variables untuk pairing ulang
                global.phoneNumber = null;
                global.pairingCode = null;
                pairingCodeGenerated = false;
                setConnectionStatus('initializing', 'Session cleared, ready for new pairing');
                setTimeout(startNazeBot, 2000); // Dikurangi dari 3 detik
            } else {
                console.log('❓ Unknown disconnect reason, reconnecting...');
                setConnectionStatus('error', 'Unknown error, reconnecting...');
                setTimeout(startNazeBot, 3000); // Dikurangi dari 5 detik
            }
        }
        
        // PERBAIKAN: Pastikan status online diupdate dengan data yang lengkap
        if (connection === 'open') {
            console.log(chalk.green('✅ Successfully connected to WhatsApp!'));
            console.log('👤 User:', naze.user?.name || naze.user?.id);
            
            // Reset pairing flags
            pairingCodeGenerated = false;
            pairingStarted = false;
            
            // PASTIKAN bot info diupdate SEBELUM status online dikirim ke client
            const botInfo = {
                id: naze.user?.id,
                name: naze.user?.name || naze.user?.verifiedName || 'Unknown',
                phone: global.phoneNumber
            };
            
            // Update bot info terlebih dahulu
            setBotInfo(botInfo);
            
            // Kemudian update status online
            setConnectionStatus('online', 'Connected to WhatsApp');
            global.pairingCode = null; // Clear pairing code setelah terhubung
            sessionErrorCount = 0;
            setSessionIssues(false);
            
            console.log(chalk.blue('📊 Updated web dashboard with bot info:'), botInfo);
        }
        
        if (qr && !pairingCode) {
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

// Fungsi utama untuk memulai semua service - Diperbaiki untuk Koyeb
async function main() {
    try {
        // Start web dashboard server terlebih dahulu
        console.log(chalk.blue('🚀 Starting Web Dashboard...'));
        const port = await startServer();
        global.currentPort = port;
        
        console.log(chalk.green(`🌐 Web Dashboard running on http://localhost:${port}`));
        console.log(chalk.blue('💡 If deployed on Koyeb, use the provided public URL'));
        console.log(chalk.blue('🤖 Starting WhatsApp Bot...'));
        
        // Tunggu lebih lama untuk memastikan server web benar-benar siap
        await sleep(2000); // Dikurangi dari 3 detik
        
        // Start WhatsApp bot
        await startNazeBot();
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start:'), error);
        
        // Coba restart setelah delay yang lebih pendek
        console.log(chalk.yellow('🔄 Restarting in 5 seconds...'));
        setTimeout(main, 5000); // Dikurangi dari 10 detik
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

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
    handleSessionError(error, 'uncaughtException');
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