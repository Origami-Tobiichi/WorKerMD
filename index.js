require('./settings');
const fs = require('fs');
const os = require('os');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const { toBuffer, toDataURL } = require('qrcode');
const { exec, spawn, execSync } = require('child_process');
const { parsePhoneNumber } = require('awesome-phonenumber');

// ==============================
// 🚀 IMPORTS & INITIALIZATION - DIPERBAIKI
// ==============================

// Import Baileys dengan kompatibilitas versi
let makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, proto, jidNormalizedUser, getAggregateVotesInPollMessage;

try {
    const {
        default: _makeWASocket,
        useMultiFileAuthState: _useMultiFileAuthState,
        makeInMemoryStore: _makeInMemoryStore,
        makeCacheableSignalKeyStore: _makeCacheableSignalKeyStore,
        fetchLatestBaileysVersion: _fetchLatestBaileysVersion,
        DisconnectReason: _DisconnectReason,
        Browsers: _Browsers,
        proto: _proto,
        jidNormalizedUser: _jidNormalizedUser,
        getAggregateVotesInPollMessage: _getAggregateVotesInPollMessage
    } = require('@whiskeysockets/baileys');

    makeWASocket = _makeWASocket;
    useMultiFileAuthState = _useMultiFileAuthState;
    makeInMemoryStore = _makeInMemoryStore;
    makeCacheableSignalKeyStore = _makeCacheableSignalKeyStore;
    fetchLatestBaileysVersion = _fetchLatestBaileysVersion;
    DisconnectReason = _DisconnectReason;
    Browsers = _Browsers;
    proto = _proto;
    jidNormalizedUser = _jidNormalizedUser;
    getAggregateVotesInPollMessage = _getAggregateVotesInPollMessage;

} catch (error) {
    console.error('❌ Failed to load Baileys:', error.message);
    // Fallback untuk versi lama
    try {
        const Baileys = require('@whiskeysockets/baileys');
        makeWASocket = Baileys.default || Baileys.makeWASocket || Baileys.WAConnection;
        useMultiFileAuthState = Baileys.useMultiFileAuthState;
        makeInMemoryStore = Baileys.makeInMemoryStore;
        makeCacheableSignalKeyStore = Baileys.makeCacheableSignalKeyStore;
        fetchLatestBaileysVersion = Baileys.fetchLatestBaileysVersion;
        DisconnectReason = Baileys.DisconnectReason;
        Browsers = Baileys.Browsers;
        proto = Baileys.proto;
        jidNormalizedUser = Baileys.jidNormalizedUser;
        getAggregateVotesInPollMessage = Baileys.getAggregateVotesInPollMessage;
    } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError.message);
        process.exit(1);
    }
}

// Import web server dengan error handling
let webServer;
try {
    const { startServer, setConnectionStatus, setBotInfo, setPairingCode, setPhoneNumber, setQrCode } = require('./server');
    global.setConnectionStatus = setConnectionStatus;
    global.setBotInfo = setBotInfo;
    global.setPairingCode = setPairingCode;
    global.setPhoneNumber = setPhoneNumber;
    global.setQrCode = setQrCode;
    
    // Start web server
    startServer().then(port => {
        console.log(chalk.green(`🌐 Web Dashboard running on port ${port}`));
    }).catch(error => {
        console.log(chalk.yellow('⚠️ Web dashboard disabled:'), error.message);
    });
} catch (error) {
    console.log(chalk.yellow('⚠️ Web server module not available, running in console mode only'));
}

// ==============================
// ⚙️ CONFIGURATION & UTILITIES
// ==============================

const print = (label, value) => console.log(`${chalk.green.bold('║')} ${chalk.cyan.bold(label.padEnd(16))}${chalk.yellow.bold(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : true;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

let pairingStarted = false;
let phoneNumber;
let nazeInstance = null;

// Global variables
global.botStatus = 'Initializing...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;
global.qrCode = null;
global.naze = null;

const userInfoSyt = () => {
    try {
        return os.userInfo().username;
    } catch (e) {
        return process.env.USER || process.env.USERNAME || 'unknown';
    }
};

global.fetchApi = async (path = '/', query = {}, options) => {
    const urlnya = (options?.name || options ? ((options?.name || options) in global.APIs ? global.APIs[(options?.name || options)] : (options?.name || options)) : global.APIs['hitori'] ? global.APIs['hitori'] : (options?.name || options)) + path + (query ? '?' + decodeURIComponent(new URLSearchParams(Object.entries({ ...query }))) : '');
    const { data } = await axios.get(urlnya, { ...((options?.name || options) ? {} : { headers: { 'accept': 'application/json', 'x-api-key': global.APIKeys[global.APIs['hitori']] }}) });
    return data;
};

// Initialize stores dengan error handling
let store;
let msgRetryCounterCache;

try {
    if (makeInMemoryStore && typeof makeInMemoryStore === 'function') {
        store = makeInMemoryStore({ logger: pino().child({ level: 'silent' }) });
        console.log(chalk.green('✅ makeInMemoryStore initialized successfully'));
    } else {
        console.log(chalk.yellow('⚠️ makeInMemoryStore not available, using simple store'));
        // Fallback store sederhana
        store = {
            messages: {},
            contacts: {},
            presences: {},
            groupMetadata: {},
            loadMessage: function (remoteJid, id) {
                const messages = this.messages?.[remoteJid]?.array;
                if (!messages) return null;
                return messages.find(msg => msg?.key?.id === id) || null;
            },
            bind: function() { console.log('📦 Simple store bound'); }
        };
    }
    msgRetryCounterCache = new NodeCache();
} catch (storeError) {
    console.error(chalk.red('❌ Store initialization failed:'), storeError.message);
    // Fallback store minimal
    store = {
        messages: {}, contacts: {}, presences: {}, groupMetadata: {},
        loadMessage: () => null,
        bind: () => {}
    };
    msgRetryCounterCache = new NodeCache();
}

// ==============================
// 🖥️ SYSTEM INFO & STARTUP
// ==============================

console.log(chalk.greenBright('✅ All external dependencies are satisfied'));
console.log(chalk.green.bold(`╔═════[${`${chalk.cyan(userInfoSyt())}@${chalk.cyan(os.hostname())}`}]═════`));
print('OS', `${os.platform()} ${os.release()} ${os.arch()}`);
print('Uptime', `${Math.floor(os.uptime() / 3600)} h ${Math.floor((os.uptime() % 3600) / 60)} m`);
print('Shell', process.env.SHELL || process.env.COMSPEC || 'unknown');
print('CPU', os.cpus()[0]?.model.trim() || 'unknown');
print('Memory', `${(os.freemem()/1024/1024).toFixed(0)} MiB / ${(os.totalmem()/1024/1024).toFixed(0)} MiB`);
print('Script version', `v${require('./package.json').version}`);
print('Node.js', process.version);
try {
    print('Baileys', `v${require('./package.json').dependencies['@whiskeysockets/baileys']}`);
} catch (e) {
    print('Baileys', 'unknown');
}
print('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false }));
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));

// ==============================
// 🤖 WHATSAPP BOT IMPLEMENTATION
// ==============================

async function startNazeBot() {
    console.log(chalk.blue('🚀 Starting WhatsApp Bot...'));
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('nazedev');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        const level = pino({ level: 'silent' });
        
        // Initialize database jika ada
        try {
            if (global.dataBase) {
                const loadData = await global.dataBase.read();
                const storeLoadData = await global.storeDB.read();
                
                if (!loadData || Object.keys(loadData).length === 0) {
                    global.db = {
                        hit: {}, set: {}, cmd: {}, store: {}, users: {}, game: {}, groups: {}, database: {}, premium: [], sewa: [], ...(loadData || {})
                    };
                    await global.dataBase.write(global.db);
                } else {
                    global.db = loadData;
                }
                
                if (!storeLoadData || Object.keys(storeLoadData).length === 0) {
                    global.store = { contacts: {}, presences: {}, messages: {}, groupMetadata: {}, ...(storeLoadData || {}) };
                    await global.storeDB.write(global.store);
                } else {
                    global.store = storeLoadData;
                }
                
                setInterval(async () => {
                    if (global.db) await global.dataBase.write(global.db);
                    if (global.store) await global.storeDB.write(global.store);
                }, 30 * 1000);
            }
        } catch (e) {
            console.log(chalk.yellow('⚠️ Database initialization skipped:', e.message));
        }
        
        // Store configuration
        if (store && typeof store.loadMessage !== 'function') {
            store.loadMessage = function (remoteJid, id) {
                const messages = store.messages?.[remoteJid]?.array;
                if (!messages) return null;
                return messages.find(msg => msg?.key?.id === id) || null;
            };
        }
        
        const getMessage = async (key) => {
            if (store && typeof store.loadMessage === 'function') {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || '';
            }
            return { conversation: 'Halo Saya Naze Bot' };
        };
        
        // Socket configuration
        const socketConfig = {
            logger: level,
            printQRInTerminal: !pairingCode,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, level) : state.keys,
            },
        };

        // Tambahkan config opsional hanya jika fungsi tersedia
        if (getMessage) socketConfig.getMessage = getMessage;
        if (msgRetryCounterCache) {
            socketConfig.msgRetryCounterCache = msgRetryCounterCache;
            socketConfig.maxMsgRetryCount = 15;
        }

        const naze = makeWASocket(socketConfig);

        // Simpan instance bot secara global
        nazeInstance = naze;
        global.naze = naze;
        
        // Phone number handling untuk pairing code
        if (pairingCode && !naze.authState.creds.registered) {
            if (global.phoneNumber && !phoneNumber) {
                phoneNumber = global.phoneNumber;
                console.log(chalk.green('📱 Using phone number from dashboard:'), phoneNumber);
            }
            
            if (!phoneNumber && !global.phoneNumber) {
                async function getPhoneNumber() {
                    phoneNumber = global.number_bot ? global.number_bot : process.env.BOT_NUMBER || await question('Please type your WhatsApp number : ');
                    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
                    
                    if (!parsePhoneNumber('+' + phoneNumber).valid && phoneNumber.length < 6) {
                        console.log(chalk.bgBlack(chalk.redBright('Start with your Country WhatsApp code') + chalk.whiteBright(',') + chalk.greenBright(' Example : 62xxx')));
                        await getPhoneNumber();
                    }
                }
                
                await getPhoneNumber();
                global.phoneNumber = phoneNumber;
                
                if (global.setPhoneNumber) {
                    global.setPhoneNumber(phoneNumber);
                }
            }
            
            console.log('📱 Phone number ready for pairing:', global.phoneNumber);
            if (global.setConnectionStatus) {
                global.setConnectionStatus('waiting_pairing', 'Phone number accepted - waiting for pairing code');
            }
        }
        
        // ==============================
        // 🔌 EVENT HANDLERS
        // ==============================
        
        naze.ev.on('creds.update', saveCreds);
        
        naze.ev.on('connection.update', async (update) => {
            const { qr, connection, lastDisconnect, isNewLogin, receivedPendingNotifications } = update;
            
            console.log(chalk.cyan('🔗 Connection Update:'), connection);
            
            // Update web dashboard
            if (global.setConnectionStatus) {
                global.setConnectionStatus(connection, getStatusMessage(connection));
            }

            // PAIRING CODE HANDLING
            if (connection === 'connecting' && pairingCode && !naze.authState.creds.registered) {
                if (global.phoneNumber && !pairingStarted) {
                    pairingStarted = true;
                    console.log(chalk.blue('📱 Initiating pairing for:'), global.phoneNumber);
                    
                    setTimeout(async () => {
                        try {
                            console.log(chalk.yellow('🔄 Requesting pairing code...'));
                            let code = await naze.requestPairingCode(global.phoneNumber);
                            
                            console.log(chalk.green('🔐 YOUR PAIRING CODE:'), chalk.bgGreen.white.bold(` ${code} `));
                            console.log(chalk.yellow('⏰ Expires in 15 seconds'));
                            
                            // Update web dashboard dengan pairing code
                            global.pairingCode = code;
                            if (global.setPairingCode) {
                                global.setPairingCode(code);
                            }
                            if (global.setConnectionStatus) {
                                global.setConnectionStatus('pairing', 'Pairing code generated - enter in WhatsApp');
                            }
                            
                            // Auto-clear pairing code setelah 15 detik
                            setTimeout(() => {
                                if (global.pairingCode === code) {
                                    global.pairingCode = null;
                                    if (global.setPairingCode) {
                                        global.setPairingCode(null);
                                    }
                                    console.log(chalk.red('🗑️ Pairing code expired'));
                                }
                            }, 15000);
                            
                        } catch (error) {
                            console.error('❌ Failed to get pairing code:', error);
                            pairingStarted = false;
                            if (global.setConnectionStatus) {
                                global.setConnectionStatus('error', 'Failed to generate pairing code: ' + error.message);
                            }
                        }
                    }, 2000);
                }
            }
            
            // QR CODE HANDLING - untuk fallback
            if (qr && !pairingCode) {
                console.log('📲 QR Code generated');
                qrcode.generate(qr, { small: true });
                
                global.qrCode = qr;
                if (global.setQrCode) {
                    global.setQrCode(qr);
                }
            }
            
            // CONNECTION CLOSE HANDLING
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                console.log(chalk.red('🔌 Connection closed, reason:'), reason);
                pairingStarted = false;
                handleDisconnect(reason, naze);
            }
            
            // CONNECTION OPEN HANDLING
            if (connection === 'open') {
                console.log(chalk.green('✅ SUCCESSFULLY CONNECTED TO WHATSAPP'));
                pairingStarted = false;
                
                // Update bot info
                global.botInfo = {
                    id: naze.user?.id,
                    name: naze.user?.name || naze.user?.verifiedName || 'NazeBot',
                    phone: naze.user?.id?.split(':')[0] || global.phoneNumber
                };
                
                global.connectionStatus = 'online';
                global.botStatus = 'Connected to WhatsApp';
                
                if (global.setConnectionStatus) {
                    global.setConnectionStatus('online', 'Connected to WhatsApp');
                }
                if (global.setBotInfo) {
                    global.setBotInfo(global.botInfo);
                }
                if (global.setPairingCode) {
                    global.setPairingCode(null);
                }
                if (global.setQrCode) {
                    global.setQrCode(null);
                }
            }
            
            if (isNewLogin) {
                console.log(chalk.green('🆕 New device login detected...'));
            }
            
            if (receivedPendingNotifications == 'true') {
                console.log('⏳ Please wait About 1 Minute...');
                naze.ev.flush();
            }
        });
        
        // Bind store jika tersedia
        if (store && store.bind) {
            store.bind(naze.ev);
        }
        
        console.log(chalk.green('🔗 Initiated connection to WhatsApp'));
        return naze;
        
    } catch (error) {
        console.error(chalk.red('❌ Bot initialization failed:'), error);
        throw error;
    }
}

// ==============================
// 🔧 UTILITY FUNCTIONS
// ==============================

function generatePairingCode() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return code;
}

function getStatusMessage(connection) {
    const messages = {
        'connecting': 'Connecting to WhatsApp...',
        'open': 'Connected to WhatsApp',
        'close': 'Connection closed',
        'offline': 'Offline',
        'pairing': 'Ready for pairing',
        'waiting_pairing': 'Waiting for pairing code',
        'error': 'Error occurred'
    };
    return messages[connection] || connection;
}

function handleDisconnect(reason, naze) {
    console.log(chalk.yellow('🔄 Handling disconnect, reason:'), reason);
    
    const handlers = {
        [DisconnectReason.connectionLost]: () => {
            console.log('🔌 Connection to Server Lost, Attempting to Reconnect...');
            setTimeout(startNazeBot, 5000);
        },
        [DisconnectReason.connectionClosed]: () => {
            console.log('🔌 Connection closed, Attempting to Reconnect...');
            setTimeout(startNazeBot, 5000);
        },
        [DisconnectReason.restartRequired]: () => {
            console.log('🔄 Restart Required...');
            setTimeout(startNazeBot, 5000);
        },
        [DisconnectReason.timedOut]: () => {
            console.log('⏰ Connection Timed Out, Attempting to Reconnect...');
            setTimeout(startNazeBot, 5000);
        },
        [DisconnectReason.loggedOut]: () => {
            console.log('🚪 Logged Out, Deleting session and restarting...');
            exec('rm -rf ./nazedev/*', () => {
                setTimeout(startNazeBot, 3000);
            });
        },
    };
    
    if (reason && handlers[reason]) {
        handlers[reason]();
    } else {
        console.log(chalk.red(`❌ Unknown DisconnectReason: ${reason}, attempting reconnect...`));
        setTimeout(startNazeBot, 5000);
    }
}

// Web Dashboard Functions
global.handlePairingRequest = async function(phoneNumber) {
    console.log(chalk.blue('📱 Pairing request received for:'), phoneNumber);
    
    try {
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        } else if (!formattedNumber.startsWith('62')) {
            formattedNumber = '62' + formattedNumber;
        }
        
        if (!parsePhoneNumber('+' + formattedNumber).valid) {
            return { 
                success: false, 
                message: 'Invalid phone number format' 
            };
        }
        
        global.phoneNumber = formattedNumber;
        global.connectionStatus = 'waiting_pairing';
        global.botStatus = 'Waiting for pairing code generation';
        pairingStarted = false;

        if (global.setPhoneNumber) {
            global.setPhoneNumber(formattedNumber);
        }
        if (global.setConnectionStatus) {
            global.setConnectionStatus('waiting_pairing', 'Phone number accepted - generating pairing code');
        }
        
        console.log(chalk.green('✅ Phone number formatted and saved:'), formattedNumber);
        
        return {
            success: true,
            phone: formattedNumber,
            message: 'Pairing process initiated. Pairing code will be generated shortly.'
        };
        
    } catch (error) {
        console.error(chalk.red('❌ Pairing request error:'), error);
        return {
            success: false,
            message: 'Error processing pairing request: ' + error.message
        };
    }
};

global.handleRestartRequest = function() {
    console.log(chalk.yellow('🔄 Restarting WhatsApp bot...'));
    try {
        if (global.naze) {
            global.naze.ws.close();
        }
        setTimeout(() => {
            startNazeBot();
        }, 3000);
        return { success: true, message: 'Bot restart initiated' };
    } catch (error) {
        return { success: false, message: 'Restart failed: ' + error.message };
    }
};

global.handleClearSession = function() {
    console.log(chalk.yellow('🗑️ Clearing session data...'));
    
    try {
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.qrCode = null;
        global.connectionStatus = 'initializing';
        global.botStatus = 'Session cleared - Ready for new connection';
        pairingStarted = false;
        
        if (global.naze) {
            global.naze.ws.close();
        }
        
        exec('rm -rf ./nazedev/*', (error) => {
            if (error) {
                console.log(chalk.yellow('⚠️ Could not clear session files:'), error.message);
            } else {
                console.log(chalk.green('✅ Session files cleared'));
            }
        });
        
        if (global.setConnectionStatus) {
            global.setConnectionStatus('initializing', 'Session cleared - ready for new connection');
        }
        if (global.setBotInfo) {
            global.setBotInfo(null);
        }
        if (global.setPairingCode) {
            global.setPairingCode(null);
        }
        if (global.setPhoneNumber) {
            global.setPhoneNumber(null);
        }
        if (global.setQrCode) {
            global.setQrCode(null);
        }
        
        setTimeout(() => {
            startNazeBot();
        }, 3000);
        
        return { success: true, message: 'Session cleared successfully' };
        
    } catch (error) {
        console.error(chalk.red('❌ Clear session error:'), error);
        return { success: false, message: 'Error clearing session: ' + error.message };
    }
};

// ==============================
// 🎯 MAIN EXECUTION
// ==============================

async function main() {
    console.log(chalk.magenta(`
╔═══════════════════════════════════════╗
║           NAZE BOT v2.0               ║
║        Koyeb Deployment               ║
║     COMPATIBILITY FIXED               ║
╚═══════════════════════════════════════╝
    `));
    
    console.log(chalk.blue('🔧 Configuration:'));
    console.log('   - Pairing Code:', pairingCode ? 'ENABLED' : 'DISABLED');
    console.log('   - Web Dashboard:', global.setConnectionStatus ? 'AVAILABLE' : 'DISABLED');
    
    try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await startNazeBot();
        
        console.log(chalk.green(`
✅ System Status:
├── WhatsApp Bot: STARTED
├── Pairing System: ACTIVE
├── Web Dashboard: ${global.setConnectionStatus ? 'RUNNING' : 'DISABLED'}
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

const cleanup = async (signal) => {
    console.log(chalk.yellow(`\n📦 Received ${signal}. Saving database...`));
    try {
        if (global.dataBase && global.db) await global.dataBase.write(global.db);
        if (global.storeDB && global.store) await global.storeDB.write(global.store);
        console.log(chalk.green('💾 Database saved successfully'));
    } catch (error) {
        console.log(chalk.red('❌ Error saving database:'), error.message);
    }
    process.exit(0);
};

process.on('SIGINT', () => cleanup('SIGINT'));
process.on('SIGTERM', () => cleanup('SIGTERM'));
process.on('exit', () => cleanup('exit'));

process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
});

// Start the application
main().catch(error => {
    console.error(chalk.red('❌ Critical failure:'), error);
    process.exit(1);
});
