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

// Enhanced chalk implementation dengan fallback
let chalk;
try {
    chalk = require('chalk');
} catch (error) {
    chalk = new Proxy({}, {
        get: (target, prop) => (text) => String(text)
    });
}

// Import Baileys dengan enhanced error handling
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

// Enhanced module imports dengan fallback yang lebih baik
let dataBase, GroupParticipantsUpdate, MessagesUpsert, Solving;
let isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, assertInstalled, sleep;

// Enhanced database module
try {
    dataBase = require('./src/database').dataBase;
} catch (error) {
    console.error('❌ Failed to load database module:', error.message);
    dataBase = (path) => ({
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
}

// Enhanced message module
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

// Enhanced function module
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

// Enhanced Web Dashboard
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

// Enhanced Header Rotation System
class HeaderRotation {
    constructor() {
        this.userAgents = [
            // Windows User Agents
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36',
            
            // macOS User Agents
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            
            // Linux User Agents
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
            
            // Mobile User Agents
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36'
        ];
        
        this.browserVersions = [
            ['Chrome', '120.0.0.0'],
            ['Chrome', '119.0.0.0'],
            ['Firefox', '121.0'],
            ['Safari', '17.1'],
            ['Edge', '120.0.0.0']
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
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        };
    }

    destroy() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }
    }
}

// Enhanced Security Features
class SecurityManager {
    constructor() {
        this.failedAttempts = new Map();
        this.maxFailedAttempts = 5;
        this.lockoutTime = 15 * 60 * 1000; // 15 minutes
        this.rateLimitWindow = 60000; // 1 minute
        this.rateLimitMax = 100; // Max requests per minute
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
        
        // Reset if lockout time has passed
        if (attempt.lockoutUntil && Date.now() >= attempt.lockoutUntil) {
            this.failedAttempts.delete(identifier);
        }
        
        return false;
    }

    resetAttempts(identifier) {
        this.failedAttempts.delete(identifier);
    }
}

// Initialize security manager
const securityManager = new SecurityManager();
const headerRotation = new HeaderRotation();

// Enhanced utility functions
const print = (label, value) => console.log(`${chalk.green('║')} ${chalk.cyan(label.padEnd(16))}${chalk.yellow(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || (global.pairing_code !== undefined ? global.pairing_code : true);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Enhanced configuration
const DELAY_BEFORE_PAIRING = 2000;
const DELAY_AFTER_PAIRING_CODE = 500;
const PAIRING_CODE_TIMEOUT = 60;
const SECURITY_CHECK_INTERVAL = 30000; // 30 seconds

let pairingStarted = false;
let pairingCodeGenerated = false;
let currentPairingTimeout = null;
let sessionErrorCount = 0;
const MAX_SESSION_ERRORS = 3;

// Enhanced global variables dengan security features
global.botStatus = 'Initializing...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;
global.security = {
    lastSecurityCheck: Date.now(),
    failedAuthAttempts: 0,
    suspiciousActivity: false
};

// Enhanced quick restart function
global.quickRestart = null;

// Enhanced user info function
const userInfoSyt = () => {
    try {
        return os.userInfo().username;
    } catch (e) {
        return process.env.USER || process.env.USERNAME || 'unknown';
    }
}

// Enhanced store dengan security features
const store = {
    messages: {}, 
    contacts: {}, 
    presences: {}, 
    groupMetadata: {},
    security: {
        lastCleanup: Date.now(),
        maxMessagesPerChat: 1000
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
        const oneHour = 60 * 60 * 1000;
        
        if (now - this.security.lastCleanup < oneHour) return;
        
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

// Enhanced fetchApi dengan header rotation
global.fetchApi = async (path = '/', query = {}, options) => {
    try {
        const urlnya = (options?.name || options ? ((options?.name || options) in global.APIs ? global.APIs[(options?.name || options)] : (options?.name || options)) : global.APIs['hitori'] ? global.APIs['hitori'] : (options?.name || options)) + path + (query ? '?' + decodeURIComponent(new URLSearchParams(Object.entries({ ...query }))) : '');
        
        const headers = headerRotation.getHeaders();
        if (options?.headers) {
            Object.assign(headers, options.headers);
        }
        
        const { data } = await axios.get(urlnya, { 
            headers,
            timeout: 10000,
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

// Enhanced database initialization
let storeDB, database;
try {
    storeDB = dataBase(global.tempatStore || 'baileys_store.json');
    database = dataBase(global.tempatDB || 'database.json');
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

const msgRetryCounterCache = new NodeCache();

// Enhanced dependency check
try {
    assertInstalled(process.platform === 'win32' ? 'where ffmpeg' : 'command -v ffmpeg', 'FFmpeg', 0);
    console.log(chalk.greenBright('✅ All external dependencies are satisfied'));
} catch (error) {
    console.log(chalk.yellow('⚠️ FFmpeg not found, some features may not work'));
}

// Enhanced system info display
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

print('Security', 'Header Rotation ✓ Rate Limiting ✓');
print('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false }));
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));

// Enhanced settings loading dengan security
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
    
    if (global.db.settings.packname) {
        global.packname = global.db.settings.packname;
        console.log(chalk.green('📦 Pack name loaded from database:'), global.packname);
    }
    
    if (global.db.settings.author) {
        global.author = global.db.settings.author;
        console.log(chalk.green('👤 Author loaded from database:'), global.author);
    }
}

// Enhanced multi-bot initialization
if (!global.multiBot) {
    global.multiBot = {
        enabled: true,
        bots: [],
        maxBots: 5,
        activeBot: null,
        security: {
            maxSessionsPerIP: 3,
            sessionTimeouts: new Map()
        }
    };
    console.log(chalk.blue('🤖 Multi-bot system initialized with security'));
}

// Enhanced web settings dengan security features
if (!global.webSettings) {
    global.webSettings = {
        allowOwnerChange: true,
        allowPremiumManagement: true,
        allowBotSettings: true,
        allowMultiBot: true,
        adminPassword: crypto.createHash('sha256').update('admin123').digest('hex'),
        maxLoginAttempts: 5,
        sessionTimeout: 3600000, // 1 hour
        corsOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000']
    };
    console.log(chalk.blue('🌐 Web settings initialized with security'));
}

// Enhanced multi-bot data loading
if (global.db && global.db.multiBot) {
    global.multiBot.bots = global.db.multiBot.bots || [];
    console.log(chalk.green('🤖 Multi-bot data loaded from database:'), global.multiBot.bots.length, 'bots');
}

// Enhanced phone number validation
function isValidWhatsAppNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log(chalk.yellow(`⚠️ Phone number length invalid: ${cleanNumber.length} digits`));
        return false;
    }
    
    // Additional validation for common patterns
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

// Enhanced wait for phone function dengan security
async function waitForPhoneFromWebDashboard(timeoutMs = 60000) {
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

// Enhanced get phone from console dengan security
async function getPhoneFromConsole() {
    return new Promise((resolve) => {
        rl.question(chalk.yellow('📱 Enter your WhatsApp number (e.g., 6281234567890 or 081234567890): '), (answer) => {
            let phoneNumber = answer.trim();
            
            if (!phoneNumber) {
                console.log(chalk.red('❌ Phone number cannot be empty.'));
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
            console.log(chalk.green('✅ Phone number accepted:'), `+${formattedNumber}`);
            resolve(formattedNumber);
        });
    });
}

// Enhanced session error handling
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

// Enhanced security check function
function performSecurityCheck() {
    const now = Date.now();
    const timeSinceLastCheck = now - global.security.lastSecurityCheck;
    
    if (timeSinceLastCheck > SECURITY_CHECK_INTERVAL) {
        // Check for suspicious activity
        if (global.security.failedAuthAttempts > 3) {
            global.security.suspiciousActivity = true;
            console.log(chalk.red('🚨 Suspicious activity detected! Multiple failed authentication attempts.'));
        }
        
        // Reset counter if no recent failures
        if (timeSinceLastCheck > 300000) { // 5 minutes
            global.security.failedAuthAttempts = Math.max(0, global.security.failedAuthAttempts - 1);
        }
        
        global.security.lastSecurityCheck = now;
    }
}

// Enhanced quick restart function
async function quickRestart() {
    console.log(chalk.yellow('🔄 Quick restart initiated...'));
    
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
    
    setTimeout(startNazeBot, 3000);
}

global.quickRestart = quickRestart;

// Enhanced startNazeBot function dengan header rotation
async function startNazeBot() {
    console.log(chalk.blue('🤖 Starting WhatsApp Bot with enhanced security...'));
    
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
            
            // Enhanced settings loading
            if (global.db.settings) {
                console.log(chalk.blue('⚙️ Loading settings from database...'));
                
                if (global.db.settings.owner) {
                    global.owner = global.db.settings.owner;
                    console.log(chalk.green('👑 Owners loaded from database:'), global.owner);
                }
                
                if (global.db.settings.botname) {
                    global.botname = global.db.settings.botname;
                    console.log(chalk.green('🤖 Bot name loaded from database:'), global.botname);
                }
                
                if (global.db.settings.packname) {
                    global.packname = global.db.settings.packname;
                    console.log(chalk.green('📦 Pack name loaded from database:'), global.packname);
                }
                
                if (global.db.settings.author) {
                    global.author = global.db.settings.author;
                    console.log(chalk.green('👤 Author loaded from database:'), global.author);
                }
            }
            
            // Enhanced multi-bot data loading
            if (global.db.multiBot) {
                global.multiBot.bots = global.db.multiBot.bots || [];
                console.log(chalk.green('🤖 Multi-bot data loaded from database:'), global.multiBot.bots.length, 'bots');
            }
            
            await database.write(global.db);
            await storeDB.write(global.store);
            
            // Enhanced auto-save interval dengan error handling
            setInterval(async () => {
                try {
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
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Error during auto-save:'), error.message);
                }
            }, 30 * 1000);
            
            // Security check interval
            setInterval(performSecurityCheck, SECURITY_CHECK_INTERVAL);
            
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
        
        // Enhanced socket configuration dengan header rotation
        const [browserName, browserVersion] = headerRotation.getRandomBrowser();
        
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
            retryRequestDelayMs: 2000,
            maxRetries: 5,
            connectTimeoutMs: 45000,
            keepAliveIntervalMs: 20000,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false,
            fireInitQueries: true,
            authTimeoutMs: 30000,
            logger: pino({ level: 'silent' }),
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
        
        store.bind(naze.ev);
        
        // Enhanced pairing process dengan security
        if (pairingCode && !naze.authState.creds.registered && !pairingCodeGenerated) {
            console.log(chalk.blue('🔧 Pairing mode activated with enhanced security'));
            
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
                
                console.log(chalk.blue('🔍 Getting phone number...'));
                
                try {
                    phoneNumberToUse = await waitForPhoneFromWebDashboard(45000);
                } catch (error) {
                    console.log(chalk.yellow('🔄 Fallback to console input...'));
                    phoneNumberToUse = await getPhoneFromConsole();
                }
                
            } catch (error) {
                console.log(chalk.red('❌ Error getting phone number:'), error);
                setConnectionStatus('error', 'Failed to get phone number');
                
                setTimeout(() => {
                    startNazeBot();
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
                            naze.requestPairingCode(phoneNumberToUse),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Pairing code request timeout')), 30000)
                            )
                        ]);
                    } catch (pairingError) {
                        console.log(chalk.red('❌ Failed to get pairing code:'), pairingError.message);
                        
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
                            setConnectionStatus('error', 'Failed to get pairing code');
                            setTimeout(() => startNazeBot(), 10000);
                        }
                        return;
                    }
                    
                    if (!code) {
                        console.log(chalk.red('❌ Pairing code is empty or undefined'));
                        setConnectionStatus('error', 'No pairing code received');
                        setTimeout(() => startNazeBot(), 5000);
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
                            console.log(chalk.yellow('🔄 Pairing code expired - user did not enter code in time'));
                            global.pairingCode = null;
                            pairingCodeGenerated = false;
                            pairingStarted = false;
                            currentPairingTimeout = null;
                            setConnectionStatus('waiting_phone', 'Pairing code expired');
                            
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
                    console.log(chalk.red('❌ Error in pairing process:'), error);
                    pairingStarted = false;
                    pairingCodeGenerated = false;
                    
                    if (currentPairingTimeout) {
                        clearTimeout(currentPairingTimeout);
                        currentPairingTimeout = null;
                    }
                    
                    setConnectionStatus('error', 'Pairing process failed');
                    setTimeout(() => startNazeBot(), 10000);
                }
            }
        }
        
        // Enhanced Solving function dengan error handling
        try {
            if (typeof Solving === 'function') {
                await Solving(naze, store);
            } else {
                console.log(chalk.yellow('⚠️ Solving function not available, skipping...'));
            }
        } catch (error) {
            console.log(chalk.red('❌ Error in Solving function:'), error.message);
        }
        
        naze.ev.on('creds.update', saveCreds);
        
        // Enhanced connection update handler
        naze.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log('🔌 Connection update:', connection);
            
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
                        startNazeBot();
                    }, 5000);
                } else if (reason === 440) {
                    console.log('🔄 Connection error 440 - reconnecting with delay...');
                    setTimeout(() => {
                        startNazeBot();
                    }, 8000);
                } else {
                    console.log('🔄 Reconnecting...');
                    setTimeout(() => {
                        startNazeBot();
                    }, 5000);
                }
            }
            
            if (connection === 'open') {
                console.log(chalk.green('✅ Connected to WhatsApp!'));
                
                pairingCodeGenerated = false;
                pairingStarted = false;
                if (currentPairingTimeout) {
                    clearTimeout(currentPairingTimeout);
                    currentPairingTimeout = null;
                }
                
                const botInfo = {
                    id: naze.user?.id,
                    name: naze.user?.name || naze.user?.verifiedName || 'Unknown',
                    phone: global.phoneNumber,
                    platform: os.platform(),
                    security: 'Enhanced Mode Active'
                };
                
                setBotInfo(botInfo);
                setConnectionStatus('online', 'Connected to WhatsApp');
                global.pairingCode = null;
                sessionErrorCount = 0;
                setSessionIssues(false);
                
                console.log(chalk.blue('🤖 Bot info:'), botInfo);
            }
            
            if (qr && !pairingCode) {
                console.log(chalk.yellow('📱 QR Code generated'));
                qrcode.generate(qr, { small: true });
                global.qrCode = qr;
                setConnectionStatus('waiting_qr', 'Scan QR Code');
            }
        });
        
        // Enhanced event handlers
        naze.ev.on('messages.upsert', async (message) => {
            try {
                if (typeof MessagesUpsert === 'function') {
                    await MessagesUpsert(naze, message, store);
                }
            } catch (error) {
                console.log(chalk.red('❌ Error in messages.upsert:'), error.message);
            }
        });
        
        naze.ev.on('group-participants.update', async (update) => {
            try {
                if (typeof GroupParticipantsUpdate === 'function') {
                    await GroupParticipantsUpdate(naze, update, store);
                }
            } catch (error) {
                console.log(chalk.red('❌ Error in group-participants.update:'), error.message);
            }
        });
        
        // Enhanced presence update dengan security
        setInterval(async () => {
            if (naze?.user?.id && global.connectionStatus === 'online') {
                try {
                    await naze.sendPresenceUpdate('available').catch(() => {});
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Error in presence update:'), error.message);
                }
            }
        }, 60000);

        return naze;
    } catch (error) {
        console.error(chalk.red('❌ Failed to start WhatsApp bot:'), error);
        setTimeout(() => {
            startNazeBot();
        }, 10000);
    }
}

// Enhanced main function
async function main() {
    try {
        console.log(chalk.blue('🚀 Starting Enhanced Web Dashboard...'));
        const port = await startServer();
        global.currentPort = port;
        
        console.log(chalk.green(`🌐 Web Dashboard: http://localhost:${port}`));
        console.log(chalk.blue('🤖 Starting WhatsApp Bot with enhanced security...'));
        console.log(chalk.cyan('🛡️  Security Features: Header Rotation ✓ Rate Limiting ✓ Anti-Detection ✓'));
        
        await sleep(2000);
        await startNazeBot();
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start:'), error);
        console.log(chalk.yellow('🔄 Restarting in 10 seconds...'));
        setTimeout(main, 10000);
    }
}

// Enhanced cleanup function
const cleanup = async () => {
    console.log(`\n📦 Saving database and shutting down...`);
    try {
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
        console.log('💾 Database saved');
    } catch (error) {
        console.log('❌ Error saving database:', error);
    }
    
    if (currentPairingTimeout) {
        clearTimeout(currentPairingTimeout);
    }
    
    // Cleanup security systems
    headerRotation.destroy();
    
    console.log('🔴 Shutting down...');
    process.exit(0);
}

// Enhanced process handlers
process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());

process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
});

// Start enhanced application
main().catch(error => {
    console.error(chalk.red('❌ Failed to start application:'), error);
    process.exit(1);
});
