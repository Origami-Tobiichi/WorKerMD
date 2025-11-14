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

// Security Managers
let SecurityManager, BehaviorManager, RequestManager, SecureDatabase;
try {
    SecurityManager = require('./src/security').SecurityManager;
    BehaviorManager = require('./src/behavior-manager').BehaviorManager;
    RequestManager = require('./src/request-manager').RequestManager;
    SecureDatabase = require('./src/database').SecureDatabase;
    console.log('✅ All security modules loaded');
} catch (error) {
    console.log('⚠️ Security modules not available:', error.message);
    // Fallback classes
    SecurityManager = class {
        generateHeaders() { return {}; }
        async humanDelay() { return; }
        validateInput() { return true; }
        async loadProxyList() { return; }
        createSecureAxiosInstance() { return axios; }
    };
    BehaviorManager = class {
        startHumanBehavior() {}
        stopHumanBehavior() {}
        validateInput() { return true; }
    };
    RequestManager = class {
        async makeSecureRequest(url, options) { 
            return axios({ url, ...options }); 
        }
    };
    SecureDatabase = class {
        async initialize() { return {}; }
        async save() { return true; }
    };
}

const securityManager = new SecurityManager();
const behaviorManager = new BehaviorManager();
const requestManager = new RequestManager();

// Safe chalk implementation
let chalk;
try {
    chalk = require('chalk');
} catch (error) {
    chalk = {
        red: (t) => t, yellow: (t) => t, green: (t) => t, blue: (t) => t,
        bold: (t) => t, cyan: (t) => t, gray: (t) => t, greenBright: (t) => t,
        magenta: (t) => t
    };
}

// Import Baileys dengan error handling
let makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, proto;
try {
    const Baileys = require('@whiskeysockets/baileys');
    makeWASocket = Baileys.default || Baileys.makeWASocket;
    useMultiFileAuthState = Baileys.useMultiFileAuthState;
    DisconnectReason = Baileys.DisconnectReason;
    makeCacheableSignalKeyStore = Baileys.makeCacheableSignalKeyStore;
    fetchLatestBaileysVersion = Baileys.fetchLatestBaileysVersion;
    proto = Baileys.proto;
} catch (error) {
    console.error('❌ Failed to load Baileys:', error.message);
    process.exit(1);
}

// Import modules dengan error handling
let dataBase, GroupParticipantsUpdate, MessagesUpsert, Solving;
let isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, assertInstalled, sleep;

try {
    dataBase = require('./src/database').dataBase;
} catch (error) {
    console.error('❌ Failed to load database module:', error.message);
    dataBase = (path) => ({
        read: () => Promise.resolve({}),
        write: () => Promise.resolve()
    });
}

try {
    const messageModule = require('./src/message');
    GroupParticipantsUpdate = messageModule.GroupParticipantsUpdate;
    MessagesUpsert = messageModule.MessagesUpsert;
    Solving = messageModule.Solving;
} catch (error) {
    console.error('❌ Failed to load message module:', error.message);
    GroupParticipantsUpdate = () => {};
    MessagesUpsert = () => {};
    Solving = () => {};
}

try {
    const functionModule = require('./lib/function');
    isUrl = functionModule.isUrl;
    generateMessageTag = functionModule.generateMessageTag;
    getBuffer = functionModule.getBuffer;
    getSizeMedia = functionModule.getSizeMedia;
    fetchJson = functionModule.fetchJson;
    assertInstalled = functionModule.assertInstalled;
    sleep = functionModule.sleep;
} catch (error) {
    console.error('❌ Failed to load function module:', error.message);
    isUrl = () => false;
    generateMessageTag = () => Date.now().toString();
    getBuffer = () => Promise.resolve(Buffer.from(''));
    getSizeMedia = () => 0;
    fetchJson = () => Promise.resolve({});
    assertInstalled = () => {};
    sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
}

// Import Web Dashboard dengan error handling
let startServer, setPairingCode, setConnectionStatus, setBotInfo, setSessionIssues, clearSessionFiles, getRateLimitInfo;
try {
    const serverModule = require('./server');
    startServer = serverModule.startServer;
    setPairingCode = serverModule.setPairingCode;
    setConnectionStatus = serverModule.setConnectionStatus;
    setBotInfo = serverModule.setBotInfo;
    setSessionIssues = serverModule.setSessionIssues;
    clearSessionFiles = serverModule.clearSessionFiles;
    getRateLimitInfo = serverModule.getRateLimitInfo;
    console.log(chalk.green('✅ Web Dashboard integrated'));
} catch (error) {
    console.log(chalk.yellow('⚠️ Web Dashboard not available:', error.message));
    startServer = async () => 3000;
    setPairingCode = (code) => console.log('Pairing Code:', code);
    setConnectionStatus = (status, msg) => console.log('Status:', status, msg);
    setBotInfo = (info) => console.log('Bot Info:', info);
    setSessionIssues = (issues) => console.log('Session Issues:', issues);
    clearSessionFiles = () => Promise.resolve();
    getRateLimitInfo = () => ({ attempts: 0, maxAttempts: 3 });
}

const print = (label, value) => console.log(`${chalk.green('║')} ${chalk.cyan(label.padEnd(16))}${chalk.yellow(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || (global.pairing_code !== undefined ? global.pairing_code : true);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Konfigurasi
const DELAY_BEFORE_PAIRING = 2000;
const DELAY_AFTER_PAIRING_CODE = 500;
const PAIRING_CODE_TIMEOUT = 60;

let pairingStarted = false;
let pairingCodeGenerated = false;
let currentPairingTimeout = null;
let sessionErrorCount = 0;
const MAX_SESSION_ERRORS = 3;

// Initialize global variables
global.botStatus = 'Initializing Security System...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;

// Quick restart function
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
    try {
        return await requestManager.makeSecureRequest(path, {
            params: query,
            ...options
        });
    } catch (error) {
        console.error('❌ Secure API fetch error:', error.message);
        return {};
    }
}

// Initialize database dengan error handling
let storeDB, database, secureDB;
try {
    storeDB = dataBase(global.tempatStore || 'baileys_store.json');
    database = dataBase(global.tempatDB || 'database.json');
    secureDB = new SecureDatabase('secure_database.json');
    console.log(chalk.green('✅ Secure database initialized'));
} catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    const fallbackDB = (path) => ({
        read: () => Promise.resolve({}),
        write: () => Promise.resolve()
    });
    storeDB = fallbackDB('baileys_store.json');
    database = fallbackDB('database.json');
    secureDB = { initialize: () => Promise.resolve({}), save: () => Promise.resolve(true) };
}

const msgRetryCounterCache = new NodeCache();

try {
    assertInstalled(process.platform === 'win32' ? 'where ffmpeg' : 'command -v ffmpeg', 'FFmpeg', 0);
    console.log(chalk.greenBright('✅ All external dependencies are satisfied'));
} catch (error) {
    console.log(chalk.yellow('⚠️ FFmpeg not found, some features may not work'));
}

// System Information Display
console.log(chalk.green.bold(`╔═════[${`${chalk.cyan(userInfoSyt())}@${chalk.cyan(os.hostname())}`}]═════`));
print('OS', `${os.platform()} ${os.release()} ${os.arch()}`);
print('Uptime', `${Math.floor(os.uptime() / 3600)} h ${Math.floor((os.uptime() % 3600) / 60)} m`);
print('Shell', process.env.SHELL || process.env.COMSPEC || 'unknown');
print('CPU', os.cpus()[0]?.model.trim() || 'unknown');
print('Memory', `${(os.freemem()/1024/1024).toFixed(0)} MiB / ${(os.totalmem()/1024/1024).toFixed(0)} MiB`);

try {
    const packageJson = require('./package.json');
    print('Script version', `v${packageJson.version}`);
    print('Node.js', process.version);
    print('Baileys', `v${packageJson.dependencies['@whiskeysockets/baileys']}`);
} catch (error) {
    print('Script version', 'Unknown');
    print('Node.js', process.version);
    print('Baileys', 'Unknown');
}

print('Security Level', 'HIGH - Anti Detection');
print('Proxy Rotation', global.security?.proxyRotation ? 'Enabled' : 'Disabled');
print('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false }));
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));

// Load settings dari secure database
async function loadSecureSettings() {
    try {
        await secureDB.initialize();
        const dbData = await database.read();
        
        if (dbData.settings) {
            console.log(chalk.blue('⚙️ Loading settings from secure database...'));
            
            if (dbData.settings.owner) {
                global.owner = dbData.settings.owner;
                console.log(chalk.green('👑 Owners loaded from database:'), global.owner);
            }
            
            if (dbData.settings.botname) {
                global.botname = dbData.settings.botname;
                console.log(chalk.green('🤖 Bot name loaded from database:'), global.botname);
            }
            
            if (dbData.settings.packname) {
                global.packname = dbData.settings.packname;
                console.log(chalk.green('📦 Pack name loaded from database:'), global.packname);
            }
            
            if (dbData.settings.author) {
                global.author = dbData.settings.author;
                console.log(chalk.green('👤 Author loaded from database:'), global.author);
            }
        }
        
        // Load multi-bot data dari database
        if (dbData.multiBot) {
            global.multiBot.bots = dbData.multiBot.bots || [];
            console.log(chalk.green('🤖 Multi-bot data loaded from database:'), global.multiBot.bots.length, 'bots');
        }
        
    } catch (error) {
        console.log(chalk.yellow('⚠️ Error loading secure settings:'), error.message);
    }
}

// Initialize multi-bot jika belum ada
if (!global.multiBot) {
    global.multiBot = {
        enabled: true,
        bots: [],
        maxBots: 5,
        activeBot: null
    };
    console.log(chalk.blue('🤖 Multi-bot system initialized'));
}

// Initialize web settings jika belum ada
if (!global.webSettings) {
    global.webSettings = {
        allowOwnerChange: true,
        allowPremiumManagement: true,
        allowBotSettings: true,
        allowMultiBot: true,
        adminPassword: 'takamiya@botwa#77'
    };
    console.log(chalk.blue('🌐 Web settings initialized'));
}

// Fungsi validasi nomor dengan security manager
function isValidWhatsAppNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log(chalk.yellow(`⚠️ Phone number length invalid: ${cleanNumber.length} digits`));
        return false;
    }
    
    // Gunakan security manager untuk validasi tambahan
    if (!securityManager.validateInput(cleanNumber, 'phone')) {
        console.log(chalk.yellow(`⚠️ Phone number failed security validation`));
        return false;
    }
    
    console.log(chalk.green(`✅ Valid phone number: ${cleanNumber} (${cleanNumber.length} digits)`));
    return true;
}

function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.startsWith('0')) {
        return '62' + cleanNumber.substring(1);
    }
    
    return cleanNumber;
}

// Wait for phone dari web dashboard dengan security
async function waitForPhoneFromWebDashboard(timeoutMs = 60000) {
    console.log(chalk.blue('📱 Waiting for secure phone number from web dashboard...'));
    
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = timeoutMs / 1000;

        const checkPhone = () => {
            attempts++;
            
            if (global.phoneNumber && global.connectionStatus === 'waiting_phone') {
                console.log(chalk.green('✅ Secure phone number received from web dashboard:'), 
                    global.phoneNumber.replace(/\d(?=\d{4})/g, '*'));
                resolve(global.phoneNumber);
            } else if (attempts >= maxAttempts) {
                console.log(chalk.yellow('⏰ Timeout waiting for phone number from web dashboard'));
                reject(new Error('Timeout waiting for phone number from web'));
            } else {
                if (attempts % 10 === 0) {
                    console.log(chalk.blue(`⏳ Still waiting for secure phone number... (${Math.floor((maxAttempts - attempts) / 60)} min ${(maxAttempts - attempts) % 60} sec remaining)`));
                }
                setTimeout(checkPhone, 1000);
            }
        };
        checkPhone();
    });
}

// Get phone dari console dengan security validation
async function getPhoneFromConsole() {
    return new Promise((resolve) => {
        rl.question(chalk.yellow('📱 Enter your WhatsApp number (e.g., 6281234567890 or 081234567890): '), async (answer) => {
            let phoneNumber = answer.trim();
            
            if (!phoneNumber) {
                console.log(chalk.red('❌ Phone number cannot be empty.'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            // Security validation
            if (!securityManager.validateInput(phoneNumber, 'phone')) {
                console.log(chalk.red('❌ Phone number failed security validation. Please use a valid number.'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            const formattedNumber = formatPhoneNumber(phoneNumber);
            
            if (!formattedNumber || !isValidWhatsAppNumber(formattedNumber)) {
                console.log(chalk.red('❌ Invalid phone number. Please use format like: 6281234567890 or 081234567890'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            global.phoneNumber = formattedNumber;
            console.log(chalk.green('✅ Secure phone number accepted:'), `+${formattedNumber.replace(/\d(?=\d{4})/g, '*')}`);
            resolve(formattedNumber);
        });
    });
}

// Handle session errors dengan security logging
function handleSessionError(error, context = '') {
    sessionErrorCount++;
    console.log(chalk.red(`❌ Secure Session Error (${context}):`), error.message);
    
    if (sessionErrorCount >= MAX_SESSION_ERRORS) {
        console.log(chalk.yellow('⚠️ Multiple session errors detected, marking session as problematic'));
        setSessionIssues(true);
        
        setTimeout(() => {
            sessionErrorCount = 0;
        }, 60000);
    }
}

// Quick restart function dengan security cleanup
async function quickRestart() {
    console.log(chalk.yellow('🔄 Secure quick restart initiated...'));
    
    // Stop behavior simulation
    behaviorManager.stopHumanBehavior();
    
    if (currentPairingTimeout) {
        clearTimeout(currentPairingTimeout);
        currentPairingTimeout = null;
    }
    
    // Security cleanup
    requestManager.cleanup();
    
    global.phoneNumber = null;
    global.pairingCode = null;
    global.botInfo = null;
    global.connectionStatus = 'initializing';
    global.botStatus = 'Secure quick restarting...';
    pairingCodeGenerated = false;
    pairingStarted = false;
    
    // Delay untuk menghindari pattern detection
    await securityManager.humanDelay(2000, 5000);
    
    startNazeBot();
}

global.quickRestart = quickRestart;

// Start NazeBot function dengan security enhancements
async function startNazeBot() {
    console.log(chalk.blue('🤖 Starting Secure WhatsApp Bot...'));
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('nazedev');
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'silent' });
        
        try {
            const loadData = await database.read();
            const storeLoadData = await storeDB.read();
            
            global.db = {
                hit: {}, set: {}, cmd: {}, store: {}, users: {}, game: {}, groups: {}, 
                database: {}, premium: [], sewa: [],
                ...loadData
            };
            
            global.store = {
                contacts: {}, presences: {}, messages: {}, groupMetadata: {},
                ...storeLoadData
            };
            
            // Load secure settings
            await loadSecureSettings();
            
            await database.write(global.db);
            await storeDB.write(global.store);
            
            // Auto-save interval dengan security
            setInterval(async () => {
                if (global.db) {
                    global.db.settings = {
                        owner: global.owner,
                        botname: global.botname,
                        packname: global.packname,
                        author: global.author
                    };
                    
                    global.db.multiBot = {
                        bots: global.multiBot.bots
                    };
                    
                    await database.write(global.db);
                }
                if (global.store) await storeDB.write(global.store);
                
                // Secure backup setiap 5 menit
                if (Math.random() < 0.1) { // 10% chance setiap interval
                    secureDB.backup().catch(() => {});
                }
            }, 30 * 1000);
        } catch (e) {
            console.log('Database error:', e);
            global.db = {
                hit: {}, set: {}, cmd: {}, store: {}, users: {}, game: {}, groups: {}, 
                database: {}, premium: [], sewa: []
            };
            global.store = {
                contacts: {}, presences: {}, messages: {}, groupMetadata: {}
            };
        }
        
        const getMessage = async (key) => {
            try {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || proto.Message.fromObject({
                        conversation: 'Hello from Secure WhatsApp Bot'
                    });
                }
            } catch (error) {
                handleSessionError(error, 'getMessage');
            }
            return proto.Message.fromObject({
                conversation: 'Hello from Secure WhatsApp Bot'
            });
        }
        
        // Enhanced socket configuration dengan security features
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
            retryRequestDelayMs: 1500,
            maxRetries: 2,
            connectTimeoutMs: 25000,
            keepAliveIntervalMs: 20000,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 30000,
            syncFullHistory: false,
            fireInitQueries: true,
            authTimeoutMs: 20000,
            logger: pino({ level: 'silent' }),
            browser: [
                'Ubuntu', 
                'Chrome', 
                `${Math.floor(Math.random() * 50) + 80}.0.0.${Math.floor(Math.random() * 100)}`
            ],
            transactionOpts: {
                maxRetries: 1,
                delayInMs: 800
            },
            patchMessageBeforeSending: (message) => {
                if (message?.messageContextInfo) {
                    delete message.messageContextInfo.deviceListMetadata;
                    delete message.messageContextInfo.messageSecret;
                    delete message.messageContextInfo.participant;
                }
                return message;
            },
            generateHighQualityLinkPreview: false,
            shouldIgnoreJid: (jid) => {
                return jid.endsWith('@broadcast') || jid.includes('status');
            },
            // Additional security options
            appStateMacVerification: {
                patch: false,
                snapshot: false
            }
        });
        
        store.bind(naze.ev);
        
        // Enhanced pairing process dengan security checks
        if (pairingCode && !naze.authState.creds.registered && !pairingCodeGenerated) {
            console.log(chalk.blue('🔧 Secure pairing mode activated'));
            
            let phoneNumberToUse = null;
            
            try {
                const rateLimitInfo = getRateLimitInfo();
                const now = Date.now();
                
                if (rateLimitInfo.blockUntil && now < rateLimitInfo.blockUntil) {
                    const waitTime = Math.ceil((rateLimitInfo.blockUntil - now) / 1000);
                    console.log(chalk.yellow(`⏳ Rate limited: Please wait ${waitTime}s`));
                    setConnectionStatus('ratelimited', `Rate limited - Wait ${waitTime}s`);
                    
                    setTimeout(() => {
                        startNazeBot();
                    }, waitTime * 1000);
                    return;
                }
                
                console.log(chalk.blue('🔍 Getting secure phone number...'));
                
                try {
                    phoneNumberToUse = await waitForPhoneFromWebDashboard(45000);
                } catch (error) {
                    console.log(chalk.yellow('🔄 Fallback to secure console input...'));
                    phoneNumberToUse = await getPhoneFromConsole();
                }
                
            } catch (error) {
                console.log(chalk.red('❌ Error getting secure phone number:'), error);
                setConnectionStatus('error', 'Failed to get secure phone number');
                
                setTimeout(() => {
                    startNazeBot();
                }, 5000);
                return;
            }
            
            if (phoneNumberToUse) {
                global.phoneNumber = phoneNumberToUse;
                pairingCodeGenerated = true;
                
                console.log(chalk.blue(`⏳ Starting secure pairing process for: ${phoneNumberToUse.replace(/\d(?=\d{4})/g, '*')}`));
                await securityManager.humanDelay(DELAY_BEFORE_PAIRING, DELAY_BEFORE_PAIRING + 1000);
                
                try {
                    pairingStarted = true;
                    setConnectionStatus('connecting', 'Requesting secure pairing code...');
                    
                    console.log(chalk.blue('🔄 Requesting secure pairing code from WhatsApp...'));
                    
                    let code;
                    try {
                        code = await Promise.race([
                            naze.requestPairingCode(phoneNumberToUse),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Secure pairing code request timeout')), 30000)
                            )
                        ]);
                    } catch (pairingError) {
                        console.log(chalk.red('❌ Failed to get secure pairing code:'), pairingError.message);
                        
                        if (pairingError.message.includes('rate') || pairingError.message.includes('too many')) {
                            console.log(chalk.yellow('⚠️ WhatsApp rate limit detected'));
                            setConnectionStatus('ratelimited', 'WhatsApp rate limit - Wait 2 minutes');
                            setTimeout(() => startNazeBot(), 120000);
                        } else if (pairingError.message.includes('invalid') || pairingError.message.includes('number')) {
                            console.log(chalk.red('❌ Invalid phone number format'));
                            setConnectionStatus('error', 'Invalid phone number');
                            global.phoneNumber = null;
                            setTimeout(() => startNazeBot(), 5000);
                        } else {
                            setConnectionStatus('error', 'Failed to get secure pairing code');
                            setTimeout(() => startNazeBot(), 10000);
                        }
                        return;
                    }
                    
                    if (!code) {
                        console.log(chalk.red('❌ Secure pairing code is empty or undefined'));
                        setConnectionStatus('error', 'No secure pairing code received');
                        setTimeout(() => startNazeBot(), 5000);
                        return;
                    }
                    
                    console.log(chalk.green('✅ Secure pairing code received:'), chalk.bold(code));
                    console.log(chalk.yellow(`⏰ Code expires in ${PAIRING_CODE_TIMEOUT} seconds`));
                    console.log(chalk.blue('💡 IMPORTANT: Go to WhatsApp → Linked Devices → Link a Device → Enter this code NOW!'));
                    
                    await securityManager.humanDelay(DELAY_AFTER_PAIRING_CODE, DELAY_AFTER_PAIRING_CODE + 500);
                    
                    setPairingCode(code);
                    console.log(chalk.blue('📊 Secure pairing code sent to web dashboard'));
                    
                    currentPairingTimeout = setTimeout(() => {
                        if (global.connectionStatus !== 'online') {
                            console.log(chalk.yellow('🔄 Secure pairing code expired - user did not enter code in time'));
                            global.pairingCode = null;
                            pairingCodeGenerated = false;
                            pairingStarted = false;
                            currentPairingTimeout = null;
                            setConnectionStatus('waiting_phone', 'Secure pairing code expired');
                            
                            setTimeout(() => {
                                startNazeBot();
                            }, 3000);
                        }
                    }, PAIRING_CODE_TIMEOUT * 1000);
                    
                    const cleanupOnConnect = (update) => {
                        if (update.connection === 'open') {
                            if (currentPairingTimeout) {
                                clearTimeout(currentPairingTimeout);
                                currentPairingTimeout = null;
                            }
                            naze.ev.off('connection.update', cleanupOnConnect);
                        }
                    };
                    naze.ev.on('connection.update', cleanupOnConnect);
                    
                } catch (error) {
                    console.log(chalk.red('❌ Error in secure pairing process:'), error);
                    pairingStarted = false;
                    pairingCodeGenerated = false;
                    
                    if (currentPairingTimeout) {
                        clearTimeout(currentPairingTimeout);
                        currentPairingTimeout = null;
                    }
                    
                    setConnectionStatus('error', 'Secure pairing process failed');
                    setTimeout(() => startNazeBot(), 10000);
                }
            }
        }
        
        // Handle Solving function dengan security
        try {
            if (typeof Solving === 'function') {
                await securityManager.humanDelay(1000, 3000);
                await Solving(naze, store);
            } else {
                console.log(chalk.yellow('⚠️ Solving function not available, skipping...'));
            }
        } catch (error) {
            console.log(chalk.red('❌ Error in secure Solving function:'), error.message);
        }
        
        naze.ev.on('creds.update', saveCreds);
        
        // Enhanced connection update handler dengan security features
        naze.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log('🔌 Secure connection update:', connection);
            
            if (connection === 'connecting') {
                setConnectionStatus('connecting', 'Secure connecting to WhatsApp...');
                sessionErrorCount = 0;
                setSessionIssues(false);
            }
            
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log('🔴 Secure connection closed, reason:', reason);
                
                setConnectionStatus('offline', 'Secure connection closed');
                
                if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.forbidden) {
                    console.log('🗑️ Secure session invalid, clearing...');
                    setSessionIssues(true);
                    
                    try {
                        await clearSessionFiles();
                    } catch (error) {
                        console.log(chalk.yellow('⚠️ Error clearing secure session:'), error.message);
                    }
                    
                    global.phoneNumber = null;
                    global.pairingCode = null;
                    global.botInfo = null;
                    pairingCodeGenerated = false;
                    if (currentPairingTimeout) {
                        clearTimeout(currentPairingTimeout);
                        currentPairingTimeout = null;
                    }
                    
                    setTimeout(() => {
                        startNazeBot();
                    }, 5000);
                } else if (reason === 440) {
                    console.log('🔄 Secure connection error 440 - reconnecting with delay...');
                    setTimeout(() => {
                        startNazeBot();
                    }, 8000);
                } else {
                    console.log('🔄 Secure reconnecting...');
                    setTimeout(() => {
                        startNazeBot();
                    }, 5000);
                }
            }
            
            if (connection === 'open') {
                console.log(chalk.green('✅ Securely connected to WhatsApp!'));
                
                pairingCodeGenerated = false;
                pairingStarted = false;
                if (currentPairingTimeout) {
                    clearTimeout(currentPairingTimeout);
                    currentPairingTimeout = null;
                }
                
                const botInfo = {
                    id: naze.user?.id,
                    name: naze.user?.name || naze.user?.verifiedName || 'Secure Bot',
                    phone: global.phoneNumber ? global.phoneNumber.replace(/\d(?=\d{4})/g, '*') : 'Unknown'
                };
                
                setBotInfo(botInfo);
                setConnectionStatus('online', 'Securely connected to WhatsApp');
                global.pairingCode = null;
                sessionErrorCount = 0;
                setSessionIssues(false);
                
                // Start human behavior simulation
                if (global.security?.humanBehavior) {
                    behaviorManager.startHumanBehavior(naze);
                }
                
                // Security health check
                try {
                    const health = await requestManager.healthCheck();
                    if (health) {
                        console.log(chalk.green('✅ Security health check passed'));
                    } else {
                        console.log(chalk.yellow('⚠️ Security health check partially failed'));
                    }
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Security health check failed:', error.message));
                }
                
                console.log(chalk.blue('🤖 Secure bot info:'), botInfo);
            }
            
            if (qr && !pairingCode) {
                console.log(chalk.yellow('📱 Secure QR Code generated'));
                qrcode.generate(qr, { small: true });
                global.qrCode = qr;
                setConnectionStatus('waiting_qr', 'Scan Secure QR Code');
            }
        });
        
        // Enhanced messages handler dengan security validation
        naze.ev.on('messages.upsert', async (message) => {
            try {
                if (message.messages && message.messages.length > 0) {
                    const firstMessage = message.messages[0];
                    
                    // Advanced security validation
                    if (firstMessage.message?.conversation && 
                        !behaviorManager.validateInput(firstMessage.message.conversation, 'message')) {
                        console.log('🚨 Blocked potential spam message');
                        return;
                    }

                    // Human-like delay dengan security
                    await securityManager.humanDelay(500, 2000);
                }

                if (typeof MessagesUpsert === 'function') {
                    await MessagesUpsert(naze, message, store);
                }
            } catch (error) {
                console.log(chalk.red('❌ Error in secure messages.upsert:'), error.message);
            }
        });
        
        naze.ev.on('group-participants.update', async (update) => {
            try {
                if (typeof GroupParticipantsUpdate === 'function') {
                    await securityManager.humanDelay(1000, 3000);
                    await GroupParticipantsUpdate(naze, update, store);
                }
            } catch (error) {
                console.log(chalk.red('❌ Error in secure group-participants.update:'), error.message);
            }
        });
        
        // Secure presence update dengan variasi
        setInterval(async () => {
            if (naze?.user?.id) {
                try {
                    await securityManager.humanDelay(500, 2000);
                    await naze.sendPresenceUpdate('available').catch(() => {});
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Error in secure presence update:'), error.message);
                }
            }
        }, 45000 + Math.random() * 30000); // Random interval 45-75 detik

        return naze;
    } catch (error) {
        console.error(chalk.red('❌ Failed to start secure WhatsApp bot:'), error);
        setTimeout(() => {
            startNazeBot();
        }, 10000);
    }
}

// Main function dengan security initialization
async function main() {
    try {
        console.log(chalk.blue('🛡️  Initializing Advanced Security System...'));
        
        // Load proxy list untuk security
        await securityManager.loadProxyList().catch(() => {
            console.log(chalk.yellow('⚠️ Proxy loading failed, continuing without proxy'));
        });
        
        // Health check security system
        const health = await requestManager.healthCheck();
        if (!health) {
            console.log(chalk.yellow('⚠️ Security health check failed, but continuing...'));
        }
        
        console.log(chalk.blue('🚀 Starting Secure Web Dashboard...'));
        const port = await startServer();
        global.currentPort = port;
        
        console.log(chalk.green(`🌐 Secure Web Dashboard: http://localhost:${port}`));
        console.log(chalk.blue('🤖 Starting Secure WhatsApp Bot...'));
        
        await securityManager.humanDelay(2000, 4000);
        await startNazeBot();
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start secure system:'), error);
        console.log(chalk.yellow('🔄 Restarting secure system in 10 seconds...'));
        setTimeout(main, 10000);
    }
}

// Enhanced cleanup function dengan security
const cleanup = async () => {
    console.log(`\n📦 Saving secure database and shutting down...`);
    try {
        // Stop behavior simulation
        behaviorManager.stopHumanBehavior();
        
        // Cleanup request manager
        requestManager.cleanup();
        
        if (global.db) {
            global.db.settings = {
                owner: global.owner,
                botname: global.botname,
                packname: global.packname,
                author: global.author
            };
            
            global.db.multiBot = {
                bots: global.multiBot.bots
            };
            
            await database.write(global.db);
        }
        if (global.store) await storeDB.write(global.store);
        
        // Secure backup sebelum shutdown
        await secureDB.backup();
        
        console.log('💾 Secure database saved');
    } catch (error) {
        console.log('❌ Error saving secure database:', error);
    }
    
    if (currentPairingTimeout) {
        clearTimeout(currentPairingTimeout);
    }
    
    console.log('🔴 Secure system shutting down...');
    process.exit(0);
}

process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());

process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Secure Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Secure Unhandled Rejection at:'), promise, 'reason:', reason);
});

// Start secure application
console.log(chalk.magenta.bold('\n🎯 NazeBot Secure - Advanced Anti Detection System'));
console.log(chalk.magenta('✨ Features: Header Rotation, Proxy Support, Human Behavior, Encryption\n'));

main().catch(error => {
    console.error(chalk.red('❌ Failed to start secure application:'), error);
    process.exit(1);
});
