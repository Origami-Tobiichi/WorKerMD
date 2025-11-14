require('./settings');
const fs = require('fs');
const os = require('os');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const { exec, spawn } = require('child_process');

// Koyeb-specific configuration
const IS_KOYEB = process.env.KOYEB_APP || process.env.NODE_ENV === 'production';
const KOYEB_PORT = process.env.PORT || 3000;
const KOYEB_HOST = '0.0.0.0';

// Enhanced chalk implementation dengan fallback untuk Koyeb
let chalk;
try {
    chalk = require('chalk');
} catch (error) {
    chalk = new Proxy({}, {
        get: (target, prop) => (text) => String(text)
    });
}

// Import Baileys dengan enhanced error handling untuk Koyeb
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

// Enhanced module imports dengan fallback yang lebih baik untuk Koyeb
let dataBase, GroupParticipantsUpdate, MessagesUpsert, Solving;
let isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, assertInstalled, sleep;

// Enhanced database module untuk Koyeb (menggunakan memory fallback)
try {
    dataBase = require('./src/database').dataBase;
} catch (error) {
    console.error('❌ Failed to load database module, using memory fallback:', error.message);
    dataBase = (path) => {
        const memoryStore = new Map();
        return {
            read: () => {
                try {
                    if (fs.existsSync(path)) {
                        const data = fs.readFileSync(path, 'utf8');
                        return Promise.resolve(JSON.parse(data));
                    }
                } catch (e) {
                    console.log('File read failed, using memory store');
                }
                return Promise.resolve(Object.fromEntries(memoryStore));
            },
            write: (data) => {
                try {
                    // Try to write to file system first
                    fs.writeFileSync(path, JSON.stringify(data, null, 2));
                } catch (e) {
                    // Fallback to memory store
                    memoryStore.clear();
                    Object.keys(data).forEach(key => memoryStore.set(key, data[key]));
                    console.log('Using memory store for data persistence');
                }
                return Promise.resolve();
            }
        };
    };
}

// Enhanced message module untuk Koyeb
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

// Enhanced function module untuk Koyeb
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

// Enhanced Web Dashboard untuk Koyeb
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
    startServer = async () => KOYEB_PORT;
    setPairingCode = (code) => console.log('Pairing Code:', code);
    setConnectionStatus = (status, msg) => console.log('Status:', status, msg);
    setBotInfo = (info) => console.log('Bot Info:', info);
    setSessionIssues = (issues) => console.log('Session Issues:', issues);
    clearSessionFiles = () => Promise.resolve();
    getRateLimitInfo = () => ({ attempts: 0, maxAttempts: 3 });
}

// Koyeb Header Rotation System
class KoyebHeaderRotation {
    constructor() {
        this.userAgents = [
            // Cloud-optimized User Agents
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        this.browserVersions = [
            ['Chrome', '120.0.0.0'],
            ['Chrome', '119.0.0.0'],
            ['Firefox', '121.0'],
            ['Safari', '17.1']
        ];
        
        this.currentIndex = 0;
        this.rotationInterval = setInterval(() => {
            this.currentIndex = (this.currentIndex + 1) % this.userAgents.length;
        }, 300000); // Rotate every 5 minutes
    }

    getRandomUserAgent() {
        return this.userAgents[this.currentIndex];
    }

    getRandomBrowser() {
        return this.browserVersions[Math.floor(Math.random() * this.browserVersions.length)];
    }

    getHeaders() {
        const userAgent = this.getRandomUserAgent();
        return {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        };
    }

    destroy() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }
    }
}

// Koyeb Security Features
class KoyebSecurityManager {
    constructor() {
        this.failedAttempts = new Map();
        this.maxFailedAttempts = 5;
        this.lockoutTime = 15 * 60 * 1000;
        this.rateLimitWindow = 60000;
        this.rateLimitMax = 100;
        this.requestCounts = new Map();
    }

    checkRateLimit(identifier) {
        const now = Date.now();
        const windowStart = now - this.rateLimitWindow;
        
        if (!this.requestCounts.has(identifier)) {
            this.requestCounts.set(identifier, []);
        }
        
        const requests = this.requestCounts.get(identifier).filter(time => time > windowStart);
        this.requestCounts.set(identifier, requests);
        
        if (requests.length >= this.rateLimitMax) {
            return false;
        }
        
        requests.push(now);
        return true;
    }

    recordFailedAttempt(identifier) {
        if (!this.failedAttempts.has(identifier)) {
            this.failedAttempts.set(identifier, { count: 0, firstAttempt: Date.now() });
        }
        
        const attempt = this.failedAttempts.get(identifier);
        attempt.count++;
        
        if (attempt.count >= this.maxFailedAttempts) {
            attempt.lockoutUntil = Date.now() + this.lockoutTime;
            return false;
        }
        
        return true;
    }

    isLockedOut(identifier) {
        const attempt = this.failedAttempts.get(identifier);
        if (!attempt) return false;
        
        if (attempt.lockoutUntil && Date.now() < attempt.lockoutUntil) {
            return true;
        }
        
        if (attempt.lockoutUntil && Date.now() >= attempt.lockoutUntil) {
            this.failedAttempts.delete(identifier);
        }
        
        return false;
    }

    resetAttempts(identifier) {
        this.failedAttempts.delete(identifier);
    }
}

// Initialize Koyeb-optimized systems
const koyebSecurityManager = new KoyebSecurityManager();
const koyebHeaderRotation = new KoyebHeaderRotation();

// Koyeb-optimized utility functions
const print = (label, value) => console.log(`${chalk.green('║')} ${chalk.cyan(label.padEnd(16))}${chalk.yellow(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || (global.pairing_code !== undefined ? global.pairing_code : true);
const rl = IS_KOYEB ? { question: () => Promise.resolve('') } : readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Koyeb-optimized configuration
const DELAY_BEFORE_PAIRING = 2000;
const DELAY_AFTER_PAIRING_CODE = 500;
const PAIRING_CODE_TIMEOUT = 60;
const SECURITY_CHECK_INTERVAL = 30000;

let pairingStarted = false;
let pairingCodeGenerated = false;
let currentPairingTimeout = null;
let sessionErrorCount = 0;
const MAX_SESSION_ERRORS = 3;

// Koyeb-optimized global variables
global.botStatus = 'Initializing Koyeb Bot...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;
global.security = {
    lastSecurityCheck: Date.now(),
    failedAuthAttempts: 0,
    suspiciousActivity: false
};

// Koyeb quick restart function
global.quickRestart = null;

// Koyeb user info function
const userInfoSyt = () => {
    try {
        return os.userInfo().username;
    } catch (e) {
        return process.env.USER || process.env.USERNAME || 'koyeb-user';
    }
}

// Koyeb-optimized store
const store = {
    messages: {}, 
    contacts: {}, 
    presences: {}, 
    groupMetadata: {},
    security: {
        lastCleanup: Date.now(),
        maxMessagesPerChat: 500 // Reduced for Koyeb memory optimization
    },
    
    loadMessage: function (remoteJid, id) {
        try {
            const messages = this.messages[remoteJid];
            return messages?.find(msg => msg?.key?.id === id) || null;
        } catch (error) {
            console.log(chalk.yellow('⚠️ Error loading message from store:'), error.message);
            return null;
        }
    },
    
    cleanupOldMessages: function() {
        const now = Date.now();
        const thirtyMinutes = 30 * 60 * 1000; // More frequent cleanup for Koyeb
        
        if (now - this.security.lastCleanup < thirtyMinutes) return;
        
        Object.keys(this.messages).forEach(jid => {
            if (this.messages[jid].length > this.security.maxMessagesPerChat) {
                this.messages[jid] = this.messages[jid].slice(-this.security.maxMessagesPerChat);
            }
        });
        
        this.security.lastCleanup = now;
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
            this.cleanupOldMessages();
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

// Koyeb-optimized fetchApi
global.fetchApi = async (path = '/', query = {}, options) => {
    try {
        const urlnya = (options?.name || options ? ((options?.name || options) in global.APIs ? global.APIs[(options?.name || options)] : (options?.name || options)) : global.APIs['hitori'] ? global.APIs['hitori'] : (options?.name || options)) + path + (query ? '?' + decodeURIComponent(new URLSearchParams(Object.entries({ ...query }))) : '');
        
        const headers = koyebHeaderRotation.getHeaders();
        if (options?.headers) {
            Object.assign(headers, options.headers);
        }
        
        const { data } = await axios.get(urlnya, { 
            headers,
            timeout: 8000, // Reduced timeout for Koyeb
            ...((options?.name || options) ? {} : { headers: { 
                ...headers,
                'accept': 'application/json', 
                'x-api-key': global.APIKeys[global.APIs['hitori']]
            }})
        });
        return data;
    } catch (error) {
        console.error('❌ API fetch error:', error.message);
        return {};
    }
}

// Koyeb database initialization
let storeDB, database;
try {
    // Use /tmp for session storage in Koyeb for better persistence
    const sessionPath = IS_KOYEB ? '/tmp/nazedev_session' : 'nazedev';
    const dbPath = IS_KOYEB ? '/tmp/koyeb_db.json' : 'database.json';
    const storePath = IS_KOYEB ? '/tmp/koyeb_store.json' : 'baileys_store.json';
    
    storeDB = dataBase(storePath);
    database = dataBase(dbPath);
    
    console.log(chalk.blue(`📁 Using storage paths: ${sessionPath}, ${dbPath}`));
} catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    const fallbackDB = (path) => ({
        read: () => Promise.resolve({}),
        write: (data) => {
            try {
                fs.writeFileSync(path, JSON.stringify(data, null, 2));
                return Promise.resolve();
            } catch (e) {
                return Promise.resolve();
            }
        }
    });
    storeDB = fallbackDB('baileys_store.json');
    database = fallbackDB('database.json');
}

const msgRetryCounterCache = new NodeCache({ stdTTL: 600 }); // Reduced TTL for Koyeb

// Koyeb dependency check
try {
    if (!IS_KOYEB) {
        assertInstalled(process.platform === 'win32' ? 'where ffmpeg' : 'command -v ffmpeg', 'FFmpeg', 0);
    }
    console.log(chalk.greenBright('✅ All external dependencies are satisfied'));
} catch (error) {
    console.log(chalk.yellow('⚠️ FFmpeg not found, some features may not work'));
}

// Koyeb system info display
console.log(chalk.green.bold(`╔═════[${`${chalk.cyan(userInfoSyt())}@${chalk.cyan('koyeb')}`}]═════`));
print('Environment', IS_KOYEB ? 'Koyeb Cloud' : 'Local');
print('OS', `${os.platform()} ${os.release()} ${os.arch()}`);
print('Port', KOYEB_PORT);
print('Memory', `${(os.freemem()/1024/1024).toFixed(0)} MiB / ${(os.totalmem()/1024/1024).toFixed(0)} MiB`);

try {
    const packageJson = require('./package.json');
    print('Script version', `v${packageJson.version}`);
    print('Node.js', process.version);
} catch (error) {
    print('Script version', 'Unknown');
    print('Node.js', process.version);
}

print('Security', 'Koyeb Optimized ✓');
print('Date & Time', new Date().toISOString());
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));

// Koyeb settings loading
if (global.db && global.db.settings) {
    console.log(chalk.blue('⚙️ Loading settings from database...'));
    
    if (global.db.settings.owner) {
        global.owner = global.db.settings.owner;
        console.log(chalk.green('👑 Owners loaded from database:'), global.owner);
    }
    
    if (global.db.settings.botname) {
        global.botname = global.db.settings.botname;
        console.log(chalk.green('🤖 Bot name loaded from database:'), global.botname);
    }
}

// Koyeb multi-bot initialization
if (!global.multiBot) {
    global.multiBot = {
        enabled: false, // Disabled for Koyeb to save resources
        bots: [],
        maxBots: 1,
        activeBot: null
    };
    console.log(chalk.blue('🤖 Koyeb-optimized bot system initialized'));
}

// Koyeb web settings
if (!global.webSettings) {
    global.webSettings = {
        allowOwnerChange: true,
        allowPremiumManagement: false, // Disabled for Koyeb
        allowBotSettings: true,
        allowMultiBot: false, // Disabled for Koyeb
        adminPassword: crypto.createHash('sha256').update('koyeb@bot123').digest('hex'),
        maxLoginAttempts: 3, // Reduced for Koyeb
        sessionTimeout: 1800000, // 30 minutes for Koyeb
        corsOrigins: ['*'] // Allow all for Koyeb deployment
    };
    console.log(chalk.blue('🌐 Koyeb web settings initialized'));
}

// Koyeb phone number validation
function isValidWhatsAppNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log(chalk.yellow(`⚠️ Phone number length invalid: ${cleanNumber.length} digits`));
        return false;
    }
    
    if (/^0+$/.test(cleanNumber)) {
        console.log(chalk.yellow('⚠️ Phone number contains only zeros'));
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

// Koyeb wait for phone function
async function waitForPhoneFromWebDashboard(timeoutMs = 45000) {
    console.log(chalk.blue('📱 Waiting for phone number from web dashboard...'));
    
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = timeoutMs / 1000;

        const checkPhone = () => {
            attempts++;
            
            if (global.phoneNumber && global.connectionStatus === 'waiting_phone') {
                console.log(chalk.green('✅ Phone number received from web dashboard:'), global.phoneNumber);
                resolve(global.phoneNumber);
            } else if (attempts >= maxAttempts) {
                console.log(chalk.yellow('⏰ Timeout waiting for phone number from web dashboard'));
                reject(new Error('Timeout waiting for phone number from web'));
            } else {
                if (attempts % 10 === 0) {
                    console.log(chalk.blue(`⏳ Still waiting for phone number... (${Math.floor((maxAttempts - attempts) / 60)} min ${(maxAttempts - attempts) % 60} sec remaining)`));
                }
                setTimeout(checkPhone, 1000);
            }
        };
        checkPhone();
    });
}

// Koyeb get phone from console
async function getPhoneFromConsole() {
    if (IS_KOYEB) {
        console.log(chalk.yellow('⚠️ Console input not available on Koyeb. Use web dashboard.'));
        return new Promise(() => {}); // Never resolve
    }
    
    return new Promise((resolve) => {
        rl.question(chalk.yellow('📱 Enter your WhatsApp number (e.g., 6281234567890): '), (answer) => {
            let phoneNumber = answer.trim();
            
            if (!phoneNumber) {
                console.log(chalk.red('❌ Phone number cannot be empty.'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            const formattedNumber = formatPhoneNumber(phoneNumber);
            
            if (!formattedNumber || !isValidWhatsAppNumber(formattedNumber)) {
                console.log(chalk.red('❌ Invalid phone number. Please use format like: 6281234567890'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            global.phoneNumber = formattedNumber;
            console.log(chalk.green('✅ Phone number accepted:'), `+${formattedNumber}`);
            resolve(formattedNumber);
        });
    });
}

// Koyeb session error handling
function handleSessionError(error, context = '') {
    sessionErrorCount++;
    console.log(chalk.red(`❌ Session Error (${context}):`), error.message);
    
    if (sessionErrorCount >= MAX_SESSION_ERRORS) {
        console.log(chalk.yellow('⚠️ Multiple session errors detected, marking session as problematic'));
        setSessionIssues(true);
        
        setTimeout(() => {
            sessionErrorCount = 0;
        }, 60000);
    }
}

// Koyeb security check function
function performSecurityCheck() {
    const now = Date.now();
    const timeSinceLastCheck = now - global.security.lastSecurityCheck;
    
    if (timeSinceLastCheck > SECURITY_CHECK_INTERVAL) {
        if (global.security.failedAuthAttempts > 2) { // Reduced threshold for Koyeb
            global.security.suspiciousActivity = true;
            console.log(chalk.red('🚨 Suspicious activity detected!'));
        }
        
        if (timeSinceLastCheck > 300000) {
            global.security.failedAuthAttempts = Math.max(0, global.security.failedAuthAttempts - 1);
        }
        
        global.security.lastSecurityCheck = now;
    }
}

// Koyeb quick restart function
async function quickRestart() {
    console.log(chalk.yellow('🔄 Koyeb quick restart initiated...'));
    
    if (currentPairingTimeout) {
        clearTimeout(currentPairingTimeout);
        currentPairingTimeout = null;
    }
    
    global.phoneNumber = null;
    global.pairingCode = null;
    global.botInfo = null;
    global.connectionStatus = 'initializing';
    global.botStatus = 'Quick restarting...';
    pairingCodeGenerated = false;
    pairingStarted = false;
    
    setTimeout(startKoyebBot, 3000);
}

global.quickRestart = quickRestart;

// Koyeb-optimized bot starter
async function startKoyebBot() {
    console.log(chalk.blue('🤖 Starting Koyeb-optimized WhatsApp Bot...'));
    
    try {
        // Use /tmp for session storage in Koyeb
        const sessionPath = IS_KOYEB ? '/tmp/nazedev' : 'nazedev';
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'error' }); // Only errors for Koyeb
        
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
            
            // Koyeb settings loading
            if (global.db.settings) {
                console.log(chalk.blue('⚙️ Loading settings from database...'));
                
                if (global.db.settings.owner) {
                    global.owner = global.db.settings.owner;
                }
                
                if (global.db.settings.botname) {
                    global.botname = global.db.settings.botname;
                }
            }
            
            await database.write(global.db);
            await storeDB.write(global.store);
            
            // Koyeb-optimized auto-save interval
            setInterval(async () => {
                try {
                    if (global.db) {
                        global.db.settings = {
                            owner: global.owner,
                            botname: global.botname,
                            packname: global.packname,
                            author: global.author
                        };
                        
                        await database.write(global.db);
                    }
                    if (global.store) await storeDB.write(global.store);
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Error during auto-save:'), error.message);
                }
            }, 45 * 1000); // Increased interval for Koyeb
            
            // Koyeb security check interval
            setInterval(performSecurityCheck, SECURITY_CHECK_INTERVAL);
            
        } catch (e) {
            console.log('Koyeb database error:', e);
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
                        conversation: 'Hello from Koyeb Bot'
                    });
                }
            } catch (error) {
                handleSessionError(error, 'getMessage');
            }
            return proto.Message.fromObject({
                conversation: 'Hello from Koyeb Bot'
            });
        }
        
        // Koyeb-optimized socket configuration
        const [browserName, browserVersion] = koyebHeaderRotation.getRandomBrowser();
        
        const koyebBot = makeWASocket({
            version,
            logger,
            printQRInTerminal: !pairingCode && !IS_KOYEB, // Only show QR in terminal if not on Koyeb
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            getMessage,
            retryRequestDelayMs: 2000,
            maxRetries: 3, // Reduced for Koyeb
            connectTimeoutMs: 30000, // Reduced for Koyeb
            keepAliveIntervalMs: 25000, // Increased for Koyeb
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 45000, // Reduced for Koyeb
            syncFullHistory: false,
            fireInitQueries: true,
            authTimeoutMs: 25000, // Reduced for Koyeb
            logger: pino({ level: 'error' }), // Only errors for Koyeb
            browser: [browserName, browserVersion, '20.0.04'],
            patchMessageBeforeSending: (message) => {
                const requiresPatch = !!(
                    message.buttonsMessage ||
                    message.templateMessage ||
                    message.listMessage
                );
                if (requiresPatch) {
                    message = {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadata: {},
                                    deviceListMetadataVersion: 2
                                },
                                ...message
                            }
                        }
                    };
                }
                return message;
            }
        });
        
        store.bind(koyebBot.ev);
        
        // Koyeb pairing process
        if (pairingCode && !koyebBot.authState.creds.registered && !pairingCodeGenerated) {
            console.log(chalk.blue('🔧 Koyeb pairing mode activated'));
            
            let phoneNumberToUse = null;
            
            try {
                const rateLimitInfo = getRateLimitInfo();
                const now = Date.now();
                
                if (rateLimitInfo.blockUntil && now < rateLimitInfo.blockUntil) {
                    const waitTime = Math.ceil((rateLimitInfo.blockUntil - now) / 1000);
                    console.log(chalk.yellow(`⏳ Rate limited: Please wait ${waitTime}s`));
                    setConnectionStatus('ratelimited', `Rate limited - Wait ${waitTime}s`);
                    
                    setTimeout(() => {
                        startKoyebBot();
                    }, waitTime * 1000);
                    return;
                }
                
                console.log(chalk.blue('🔍 Getting phone number...'));
                
                try {
                    phoneNumberToUse = await waitForPhoneFromWebDashboard(30000); // Reduced timeout for Koyeb
                } catch (error) {
                    if (!IS_KOYEB) {
                        console.log(chalk.yellow('🔄 Fallback to console input...'));
                        phoneNumberToUse = await getPhoneFromConsole();
                    } else {
                        console.log(chalk.yellow('🔄 Waiting for web input on Koyeb...'));
                        // Don't proceed until we get a phone number on Koyeb
                        return;
                    }
                }
                
            } catch (error) {
                console.log(chalk.red('❌ Error getting phone number:'), error);
                setConnectionStatus('error', 'Failed to get phone number');
                
                setTimeout(() => {
                    startKoyebBot();
                }, 5000);
                return;
            }
            
            if (phoneNumberToUse) {
                global.phoneNumber = phoneNumberToUse;
                pairingCodeGenerated = true;
                
                console.log(chalk.blue(`⏳ Starting pairing process for: ${phoneNumberToUse}`));
                await sleep(DELAY_BEFORE_PAIRING);
                
                try {
                    pairingStarted = true;
                    setConnectionStatus('connecting', 'Requesting pairing code...');
                    
                    console.log(chalk.blue('🔄 Requesting pairing code from WhatsApp...'));
                    
                    let code;
                    try {
                        code = await Promise.race([
                            koyebBot.requestPairingCode(phoneNumberToUse),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Pairing code request timeout')), 25000) // Reduced for Koyeb
                            )
                        ]);
                    } catch (pairingError) {
                        console.log(chalk.red('❌ Failed to get pairing code:'), pairingError.message);
                        
                        if (pairingError.message.includes('rate') || pairingError.message.includes('too many')) {
                            console.log(chalk.yellow('⚠️ WhatsApp rate limit detected'));
                            setConnectionStatus('ratelimited', 'WhatsApp rate limit - Wait 2 minutes');
                            setTimeout(() => startKoyebBot(), 120000);
                        } else if (pairingError.message.includes('invalid') || pairingError.message.includes('number')) {
                            console.log(chalk.red('❌ Invalid phone number format'));
                            setConnectionStatus('error', 'Invalid phone number');
                            global.phoneNumber = null;
                            setTimeout(() => startKoyebBot(), 5000);
                        } else {
                            setConnectionStatus('error', 'Failed to get pairing code');
                            setTimeout(() => startKoyebBot(), 10000);
                        }
                        return;
                    }
                    
                    if (!code) {
                        console.log(chalk.red('❌ Pairing code is empty or undefined'));
                        setConnectionStatus('error', 'No pairing code received');
                        setTimeout(() => startKoyebBot(), 5000);
                        return;
                    }
                    
                    console.log(chalk.green('✅ Pairing code received:'), chalk.bold(code));
                    console.log(chalk.yellow(`⏰ Code expires in ${PAIRING_CODE_TIMEOUT} seconds`));
                    console.log(chalk.blue('💡 IMPORTANT: Go to WhatsApp → Linked Devices → Link a Device → Enter this code NOW!'));
                    
                    await sleep(DELAY_AFTER_PAIRING_CODE);
                    
                    setPairingCode(code);
                    console.log(chalk.blue('📊 Pairing code sent to web dashboard'));
                    
                    currentPairingTimeout = setTimeout(() => {
                        if (global.connectionStatus !== 'online') {
                            console.log(chalk.yellow('🔄 Pairing code expired'));
                            global.pairingCode = null;
                            pairingCodeGenerated = false;
                            pairingStarted = false;
                            currentPairingTimeout = null;
                            setConnectionStatus('waiting_phone', 'Pairing code expired');
                            
                            setTimeout(() => {
                                startKoyebBot();
                            }, 3000);
                        }
                    }, PAIRING_CODE_TIMEOUT * 1000);
                    
                    const cleanupOnConnect = (update) => {
                        if (update.connection === 'open') {
                            if (currentPairingTimeout) {
                                clearTimeout(currentPairingTimeout);
                                currentPairingTimeout = null;
                            }
                            koyebBot.ev.off('connection.update', cleanupOnConnect);
                        }
                    };
                    koyebBot.ev.on('connection.update', cleanupOnConnect);
                    
                } catch (error) {
                    console.log(chalk.red('❌ Error in pairing process:'), error);
                    pairingStarted = false;
                    pairingCodeGenerated = false;
                    
                    if (currentPairingTimeout) {
                        clearTimeout(currentPairingTimeout);
                        currentPairingTimeout = null;
                    }
                    
                    setConnectionStatus('error', 'Pairing process failed');
                    setTimeout(() => startKoyebBot(), 10000);
                }
            }
        }
        
        // Koyeb Solving function
        try {
            if (typeof Solving === 'function') {
                await Solving(koyebBot, store);
            }
        } catch (error) {
            console.log(chalk.red('❌ Error in Solving function:'), error.message);
        }
        
        koyebBot.ev.on('creds.update', saveCreds);
        
        // Koyeb connection update handler
        koyebBot.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log('🔌 Koyeb connection update:', connection);
            
            if (connection === 'connecting') {
                setConnectionStatus('connecting', 'Connecting to WhatsApp...');
                sessionErrorCount = 0;
                setSessionIssues(false);
            }
            
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log('🔴 Connection closed, reason:', reason);
                
                setConnectionStatus('offline', 'Connection closed');
                
                if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.forbidden) {
                    console.log('🗑️ Session invalid, clearing...');
                    setSessionIssues(true);
                    
                    try {
                        await clearSessionFiles();
                    } catch (error) {
                        console.log(chalk.yellow('⚠️ Error clearing session:'), error.message);
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
                        startKoyebBot();
                    }, 5000);
                } else {
                    console.log('🔄 Koyeb reconnecting...');
                    setTimeout(() => {
                        startKoyebBot();
                    }, 5000);
                }
            }
            
            if (connection === 'open') {
                console.log(chalk.green('✅ Connected to WhatsApp from Koyeb!'));
                
                pairingCodeGenerated = false;
                pairingStarted = false;
                if (currentPairingTimeout) {
                    clearTimeout(currentPairingTimeout);
                    currentPairingTimeout = null;
                }
                
                const botInfo = {
                    id: koyebBot.user?.id,
                    name: koyebBot.user?.name || koyebBot.user?.verifiedName || 'Koyeb Bot',
                    phone: global.phoneNumber,
                    platform: 'Koyeb Cloud',
                    security: 'Koyeb Optimized'
                };
                
                setBotInfo(botInfo);
                setConnectionStatus('online', 'Connected to WhatsApp');
                global.pairingCode = null;
                sessionErrorCount = 0;
                setSessionIssues(false);
                
                console.log(chalk.blue('🤖 Koyeb bot info:'), botInfo);
            }
            
            if (qr && !pairingCode) {
                console.log(chalk.yellow('📱 QR Code generated on Koyeb'));
                if (!IS_KOYEB) {
                    qrcode.generate(qr, { small: true });
                }
                global.qrCode = qr;
                setConnectionStatus('waiting_qr', 'Scan QR Code');
            }
        });
        
        // Koyeb event handlers
        koyebBot.ev.on('messages.upsert', async (message) => {
            try {
                if (typeof MessagesUpsert === 'function') {
                    await MessagesUpsert(koyebBot, message, store);
                }
            } catch (error) {
                console.log(chalk.red('❌ Error in messages.upsert:'), error.message);
            }
        });
        
        koyebBot.ev.on('group-participants.update', async (update) => {
            try {
                if (typeof GroupParticipantsUpdate === 'function') {
                    await GroupParticipantsUpdate(koyebBot, update, store);
                }
            } catch (error) {
                console.log(chalk.red('❌ Error in group-participants.update:'), error.message);
            }
        });
        
        // Koyeb presence update
        setInterval(async () => {
            if (koyebBot?.user?.id && global.connectionStatus === 'online') {
                try {
                    await koyebBot.sendPresenceUpdate('available').catch(() => {});
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Error in presence update:'), error.message);
                }
            }
        }, 90000); // Increased interval for Koyeb

        return koyebBot;
    } catch (error) {
        console.error(chalk.red('❌ Failed to start Koyeb WhatsApp bot:'), error);
        setTimeout(() => {
            startKoyebBot();
        }, 10000);
    }
}

// Koyeb main function
async function koyebMain() {
    try {
        console.log(chalk.blue('🚀 Starting Koyeb-optimized Web Dashboard...'));
        const port = await startServer();
        global.currentPort = port;
        
        console.log(chalk.green(`🌐 Koyeb Dashboard: http://0.0.0.0:${port}`));
        if (!IS_KOYEB) {
            console.log(chalk.green(`🌐 Local Access: http://localhost:${port}`));
        }
        console.log(chalk.cyan('🛡️  Koyeb Security: Header Rotation ✓ Cloud Optimized ✓'));
        
        await sleep(2000);
        await startKoyebBot();
        
    } catch (error) {
        console.error(chalk.red('❌ Koyeb failed to start:'), error);
        console.log(chalk.yellow('🔄 Restarting in 15 seconds...'));
        setTimeout(koyebMain, 15000);
    }
}

// Koyeb cleanup function
const koyebCleanup = async () => {
    console.log(`\n📦 Koyeb cleanup - Saving database...`);
    try {
        if (global.db) {
            await database.write(global.db);
        }
        if (global.store) await storeDB.write(global.store);
        console.log('💾 Koyeb database saved');
    } catch (error) {
        console.log('❌ Error saving Koyeb database:', error);
    }
    
    if (currentPairingTimeout) {
        clearTimeout(currentPairingTimeout);
    }
    
    // Cleanup Koyeb systems
    koyebHeaderRotation.destroy();
    
    console.log('🔴 Koyeb shutting down...');
    process.exit(0);
}

// Koyeb process handlers
process.on('SIGINT', () => koyebCleanup());
process.on('SIGTERM', () => koyebCleanup());

process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Koyeb Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Koyeb Unhandled Rejection at:'), promise, 'reason:', reason);
});

// Start Koyeb application
koyebMain().catch(error => {
    console.error(chalk.red('❌ Failed to start Koyeb application:'), error);
    process.exit(1);
});
