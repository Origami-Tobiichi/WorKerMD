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
    console.log(chalk.yellow('⚠️ Web Dashboard not available'));
    // Fallback functions
    startServer = async () => 3000;
    setPairingCode = (code) => console.log('Pairing Code:', code);
    setConnectionStatus = (status, msg) => console.log('Status:', status, msg);
    setBotInfo = (info) => console.log('Bot Info:', info);
    setSessionIssues = (issues) => console.log('Session Issues:', issues);
    clearSessionFiles = () => Promise.resolve();
    getRateLimitInfo = () => ({ attempts: 0, maxAttempts: 3 });
}

const print = (label, value) => console.log(`${chalk.green('║')} ${chalk.cyan(label.padEnd(16))}${chalk.yellow(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || global.pairing_code;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// ⭐ ANTI-SPAM: Konfigurasi yang lebih aman untuk WhatsApp
const DELAY_BEFORE_PAIRING = 3000;     // 3 detik untuk memastikan readiness
const DELAY_AFTER_PAIRING_CODE = 1000; // 1 detik delay setelah mendapatkan code
const PAIRING_CODE_TIMEOUT = 30;       // 30 detik (sesuai WhatsApp)

let pairingStarted = false;
let pairingCodeGenerated = false;
let currentPairingTimeout = null;
let sessionErrorCount = 0;
const MAX_SESSION_ERRORS = 3;

// Initialize global variables
global.botStatus = 'Initializing...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;

// Quick restart function untuk diakses dari server
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

// ⭐ FUNGSI BARU: Validasi nomor WhatsApp yang lebih fleksibel
function isValidWhatsAppNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    // Hanya angka, minimal 8 digit, maksimal 15 digit
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log(chalk.yellow(`⚠️ Phone number length invalid: ${cleanNumber.length} digits`));
        return false;
    }
    
    // Country code yang umum untuk WhatsApp (diperluas)
    const validCountryCodes = [
        '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', 
        '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', 
        '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', 
        '93', '94', '95', '98', '211', '212', '213', '216', '218', '220', '221', '222', '223', 
        '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', 
        '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', 
        '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', 
        '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', 
        '298', '299', '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', 
        '370', '371', '372', '373', '374', '375', '376', '377', '378', '379', '380', '381', 
        '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', 
        '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', 
        '595', '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', 
        '678', '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', 
        '691', '692', '850', '852', '853', '855', '856', '880', '886', '960', '961', '962', 
        '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', 
        '976', '977', '992', '993', '994', '995', '996', '998'
    ];
    
    // Cek country code (1-3 digit pertama)
    for (let i = 3; i >= 1; i--) {
        const countryCode = cleanNumber.substring(0, i);
        if (validCountryCodes.includes(countryCode)) {
            console.log(chalk.green(`✅ Valid country code detected: ${countryCode}`));
            return true;
        }
    }
    
    console.log(chalk.yellow(`⚠️ No valid country code found for: ${cleanNumber}`));
    return false;
}

// ⭐ FUNGSI BARU: Format nomor telepon yang lebih baik
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Jika nomor diawali dengan 0, ganti dengan 62 (Indonesia)
    if (cleanNumber.startsWith('0')) {
        const formatted = '62' + cleanNumber.substring(1);
        console.log(chalk.blue(`🔧 Formatted phone: ${phoneNumber} -> ${formatted}`));
        return formatted;
    }
    
    // Jika nomor sudah memiliki country code yang valid, return as-is
    if (isValidWhatsAppNumber(cleanNumber)) {
        console.log(chalk.blue(`🔧 Phone already valid: ${cleanNumber}`));
        return cleanNumber;
    }
    
    // Default: tambahkan 62 untuk Indonesia
    const formatted = '62' + cleanNumber;
    console.log(chalk.blue(`🔧 Default formatting: ${phoneNumber} -> ${formatted}`));
    return formatted;
}

// ⭐ PERBAIKAN: Phone number functions dengan validasi yang lebih baik
async function waitForPhoneFromWebDashboard(timeoutMs = 120000) {
    console.log(chalk.blue('📱 Waiting for phone number from web dashboard...'));
    console.log(chalk.gray('   Open the web dashboard to enter your WhatsApp number'));
    
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = timeoutMs / 1000;
        let webUrlDisplayed = false;

        const checkPhone = () => {
            attempts++;
            
            if (!webUrlDisplayed && global.currentPort) {
                console.log(chalk.green(`🌐 Web Dashboard: http://localhost:${global.currentPort}`));
                console.log(chalk.blue('💡 If running on Koyeb, use the provided URL instead of localhost'));
                webUrlDisplayed = true;
            }
            
            const rateLimitInfo = getRateLimitInfo();
            const now = Date.now();
            
            if (rateLimitInfo.blockUntil && now < rateLimitInfo.blockUntil) {
                const waitTime = Math.ceil((rateLimitInfo.blockUntil - now) / 1000);
                console.log(chalk.yellow(`⏳ Rate limited: Please wait ${waitTime}s before next attempt`));
                setConnectionStatus('ratelimited', `Rate limited - Wait ${waitTime}s`);
                
                if (attempts >= maxAttempts) {
                    reject(new Error('Rate limited - too many attempts'));
                    return;
                }
                setTimeout(checkPhone, 1000);
                return;
            }
            
            if (global.phoneNumber && global.connectionStatus === 'waiting_phone') {
                console.log(chalk.green('✅ Phone number received from web dashboard:'), global.phoneNumber);
                resolve(global.phoneNumber);
            } else if (attempts >= maxAttempts) {
                console.log(chalk.yellow('⏰ Timeout waiting for phone number from web dashboard'));
                reject(new Error('Timeout waiting for phone number from web'));
            } else {
                if (attempts % 30 === 0) {
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

// ⭐ PERBAIKAN: Fungsi getPhoneFromConsole yang lebih user-friendly
async function getPhoneFromConsole() {
    return new Promise((resolve) => {
        rl.question(chalk.yellow('📱 Please enter your WhatsApp number (e.g., 6281234567890 or 081234567890): '), (answer) => {
            let phoneNumber = answer.trim();
            
            if (!phoneNumber) {
                console.log(chalk.red('❌ Phone number cannot be empty.'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            // Format nomor telepon
            const formattedNumber = formatPhoneNumber(phoneNumber);
            
            if (!formattedNumber) {
                console.log(chalk.red('❌ Invalid phone number format.'));
                console.log(chalk.yellow('💡 Examples:'));
                console.log(chalk.yellow('   • Indonesia: 6281234567890 or 081234567890'));
                console.log(chalk.yellow('   • US: 1234567890'));
                console.log(chalk.yellow('   • UK: 441234567890'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            if (!isValidWhatsAppNumber(formattedNumber)) {
                console.log(chalk.red('❌ Invalid WhatsApp number.'));
                console.log(chalk.yellow('💡 Please check:'));
                console.log(chalk.yellow('   • Number should be 8-15 digits'));
                console.log(chalk.yellow('   • Include correct country code'));
                console.log(chalk.yellow('   • No special characters or spaces'));
                resolve(getPhoneFromConsole());
                return;
            }
            
            global.phoneNumber = formattedNumber;
            console.log(chalk.green('✅ Phone number accepted:'), `+${formattedNumber}`);
            resolve(formattedNumber);
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
        
        setTimeout(() => {
            sessionErrorCount = 0;
        }, 60000);
    }
}

// ⭐ PERBAIKAN: Quick restart function dengan protection yang lebih baik
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
    
    console.log(chalk.blue('⏳ Waiting 5s before quick restart...'));
    setTimeout(startNazeBot, 5000);
}

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
        retryRequestDelayMs: 2000,
        maxRetries: 5,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        defaultQueryTimeoutMs: 120000,
        syncFullHistory: false,
        transactionOpts: { maxCommitRetries: 3, delayBetweenTriesMs: 3000 },
        fireInitQueries: true,
        authTimeoutMs: 60000
    });
    
    store.bind(naze.ev);
    
    // ⭐ PERBAIKAN BESAR: Enhanced pairing code handling dengan protection yang lebih kuat
    if (pairingCode && !naze.authState.creds.registered && !pairingCodeGenerated) {
        let phoneNumberToUse = null;
        
        try {
            const rateLimitInfo = getRateLimitInfo();
            const now = Date.now();
            
            if (rateLimitInfo.blockUntil && now < rateLimitInfo.blockUntil) {
                const waitTime = Math.ceil((rateLimitInfo.blockUntil - now) / 1000);
                console.log(chalk.yellow(`⏳ Rate limited: Please wait ${waitTime}s before next pairing attempt`));
                setConnectionStatus('ratelimited', `Rate limited - Wait ${waitTime}s`);
                
                setTimeout(() => {
                    console.log(chalk.blue('🔄 Restarting after rate limit reset...'));
                    startNazeBot();
                }, waitTime * 1000 + 2000);
                return;
            }
            
            if (rateLimitInfo.attempts >= rateLimitInfo.maxAttempts) {
                const waitTime = 300;
                console.log(chalk.yellow(`⏳ Maximum attempts reached: Please wait ${waitTime}s before next pairing attempt`));
                setConnectionStatus('ratelimited', `Max attempts - Wait ${waitTime}s`);
                
                setTimeout(() => {
                    console.log(chalk.blue('🔄 Restarting after cooldown...'));
                    startNazeBot();
                }, waitTime * 1000);
                return;
            }
            
            console.log(chalk.blue('🔍 Checking for phone number from web dashboard...'));
            try {
                phoneNumberToUse = await waitForPhoneFromWebDashboard(90000);
            } catch (error) {
                if (error.message.includes('Rate limited') || error.message.includes('too many attempts')) {
                    console.log(chalk.yellow('⏳ Rate limited, waiting before fallback...'));
                    await sleep(30000);
                }
                
                console.log(chalk.yellow('🔄 Fallback to console input...'));
                phoneNumberToUse = await getPhoneFromConsole();
            }
            
        } catch (error) {
            console.log(chalk.red('❌ Error getting phone number:'), error);
            setConnectionStatus('error', 'Failed to get phone number: ' + error.message);
            
            setTimeout(() => {
                console.log(chalk.yellow('🔄 Retrying after error...'));
                startNazeBot();
            }, 10000);
            return;
        }
        
        if (phoneNumberToUse && isValidWhatsAppNumber(phoneNumberToUse)) {
            global.phoneNumber = phoneNumberToUse;
            
            pairingCodeGenerated = true;
            
            console.log(chalk.blue(`⏳ Waiting ${DELAY_BEFORE_PAIRING/1000}s before starting pairing process...`));
            await sleep(DELAY_BEFORE_PAIRING);
            
            try {
                pairingStarted = true;
                setConnectionStatus('connecting', 'Requesting pairing code from WhatsApp...');
                
                console.log(chalk.blue('🔄 Requesting pairing code for:'), chalk.green(phoneNumberToUse));
                
                const code = await naze.requestPairingCode(phoneNumberToUse);
                
                console.log(chalk.green('✅ Pairing code received:'), chalk.bold(code));
                console.log(chalk.yellow(`⏰ This code expires in ${PAIRING_CODE_TIMEOUT} seconds`));
                console.log(chalk.blue('💡 Go to WhatsApp → Linked Devices → Link a Device → Enter this code'));
                
                if (DELAY_AFTER_PAIRING_CODE > 0) {
                    console.log(chalk.blue(`⏳ Waiting ${DELAY_AFTER_PAIRING_CODE/1000}s before displaying pairing code...`));
                    await sleep(DELAY_AFTER_PAIRING_CODE);
                }
                
                setPairingCode(code);
                console.log(chalk.blue('📊 Pairing code displayed on web dashboard'));
                
                currentPairingTimeout = setTimeout(() => {
                    if (global.connectionStatus !== 'online') {
                        console.log(chalk.yellow('🔄 Pairing code expired, cleaning up...'));
                        global.pairingCode = null;
                        pairingCodeGenerated = false;
                        pairingStarted = false;
                        currentPairingTimeout = null;
                        setConnectionStatus('waiting_phone', 'Pairing code expired');
                        
                        console.log(chalk.blue('⏳ Waiting 15s before allowing new pairing attempt...'));
                        setTimeout(() => {
                            console.log(chalk.blue('🔄 Restarting pairing process after timeout...'));
                            startNazeBot();
                        }, 15000);
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
                console.log(chalk.red('❌ Error requesting pairing code:'), error);
                pairingStarted = false;
                pairingCodeGenerated = false;
                
                if (currentPairingTimeout) {
                    clearTimeout(currentPairingTimeout);
                    currentPairingTimeout = null;
                }
                
                setConnectionStatus('error', 'Failed to get pairing code: ' + error.message);
                
                if (error.message.includes('rate') || error.message.includes('too many')) {
                    console.log(chalk.yellow('⚠️ WhatsApp rate limit detected. Waiting longer...'));
                    setConnectionStatus('ratelimited', 'WhatsApp rate limit - Wait 5 minutes');
                    
                    setTimeout(() => {
                        console.log(chalk.blue('🔄 Restarting after rate limit...'));
                        startNazeBot();
                    }, 300000);
                } else {
                    const retryDelay = 15000;
                    console.log(chalk.yellow(`⏳ Waiting ${retryDelay/1000}s before retry after error...`));
                    
                    global.phoneNumber = null;
                    setTimeout(() => {
                        console.log(chalk.yellow('🔄 Restarting pairing process after error...'));
                        startNazeBot();
                    }, retryDelay);
                }
                return;
            }
        } else {
            console.log(chalk.red('❌ Invalid phone number. Please provide a valid WhatsApp number.'));
            setConnectionStatus('error', 'Invalid phone number format');
            
            global.phoneNumber = null;
            setTimeout(() => {
                console.log(chalk.yellow('🔄 Retrying with new phone number...'));
                startNazeBot();
            }, 10000);
        }
    }
    
    try {
        await Solving(naze, store);
    } catch (error) {
        console.log(chalk.red('❌ Error in Solving function:'), error);
    }
    
    naze.ev.on('creds.update', saveCreds);
    
    naze.ev.on('connection.update', async (update) => {
        const { qr, connection, lastDisconnect } = update;
        
        console.log('🔌 Connection status:', connection);
        
        if (connection === 'connecting') {
            setConnectionStatus('connecting', 'Connecting to WhatsApp servers...');
            sessionErrorCount = 0;
            setSessionIssues(false);
        }
        
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log('🔴 Connection closed with reason:', reason);
            
            setConnectionStatus('offline', 'Connection closed');
            
            if (reason === 515) {
                console.log('🔗 Connection closed (515) - restarting with delay...');
                setConnectionStatus('connecting', 'Reconnecting after connection closed...');
                setTimeout(startNazeBot, 10000);
            } else if ([DisconnectReason.connectionLost, DisconnectReason.connectionClosed, 
                 DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
                console.log('🔄 Reconnecting...');
                setConnectionStatus('connecting', 'Reconnecting...');
                setTimeout(startNazeBot, 10000);
            } else if ([DisconnectReason.loggedOut, DisconnectReason.forbidden, 
                       DisconnectReason.badSession].includes(reason)) {
                console.log('🗑️ Session invalid, clearing and restarting...');
                setConnectionStatus('error', 'Session invalid, clearing...');
                setSessionIssues(true);
                
                try {
                    await clearSessionFiles();
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Error clearing session files:'), error.message);
                }
                
                global.phoneNumber = null;
                global.pairingCode = null;
                pairingCodeGenerated = false;
                pairingStarted = false;
                if (currentPairingTimeout) {
                    clearTimeout(currentPairingTimeout);
                    currentPairingTimeout = null;
                }
                setConnectionStatus('initializing', 'Session cleared, ready for new pairing');
                setTimeout(startNazeBot, 5000);
            } else {
                console.log('❓ Unknown disconnect reason, reconnecting...');
                setConnectionStatus('error', 'Unknown error, reconnecting...');
                setTimeout(startNazeBot, 10000);
            }
        }
        
        if (connection === 'open') {
            console.log(chalk.green('✅ Successfully connected to WhatsApp!'));
            console.log('👤 User:', naze.user?.name || naze.user?.id);
            console.log('📱 Phone:', global.phoneNumber);
            
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
                platform: naze.user?.platform || 'unknown'
            };
            
            setBotInfo(botInfo);
            setConnectionStatus('online', 'Connected to WhatsApp');
            global.pairingCode = null;
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
    
    naze.ev.on('messages.update', (updates) => {
        for (const update of updates) {
            if (update.update?.messageStubType === 7) {
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

async function main() {
    try {
        console.log(chalk.blue('🚀 Starting Web Dashboard...'));
        const port = await startServer();
        global.currentPort = port;
        
        console.log(chalk.green(`🌐 Web Dashboard running on http://localhost:${port}`));
        console.log(chalk.blue('💡 If deployed on Koyeb, use the provided public URL'));
        console.log(chalk.yellow('🛡️  Anti-Spam Protection: Active (2 attempts max, 60s cooldown)'));
        console.log(chalk.blue('🤖 Starting WhatsApp Bot...'));
        
        await sleep(3000);
        
        await startNazeBot();
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start:'), error);
        
        console.log(chalk.yellow('🔄 Restarting in 15 seconds...'));
        setTimeout(main, 15000);
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
    
    if (currentPairingTimeout) {
        clearTimeout(currentPairingTimeout);
    }
    
    console.log('🔴 Shutting down...');
    process.exit(0);
}

process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());

process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
    handleSessionError(error, 'uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
    handleSessionError(new Error('Unhandled Rejection'), 'unhandledRejection');
});

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