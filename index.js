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
// 🚀 IMPORTS & INITIALIZATION
// ==============================

// Import Baileys dengan error handling
let WAConnection, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, proto, jidNormalizedUser, getAggregateVotesInPollMessage;

try {
    const Baileys = require('@whiskeysockets/baileys');
    WAConnection = Baileys.default || Baileys.WAConnection;
    useMultiFileAuthState = Baileys.useMultiFileAuthState;
    Browsers = Baileys.Browsers;
    DisconnectReason = Baileys.DisconnectReason;
    makeInMemoryStore = Baileys.makeInMemoryStore;
    makeCacheableSignalKeyStore = Baileys.makeCacheableSignalKeyStore;
    fetchLatestBaileysVersion = Baileys.fetchLatestBaileysVersion;
    proto = Baileys.proto;
    jidNormalizedUser = Baileys.jidNormalizedUser;
    getAggregateVotesInPollMessage = Baileys.getAggregateVotesInPollMessage;
} catch (error) {
    console.error('❌ Failed to load Baileys:', error.message);
    process.exit(1);
}

// Import web server
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
    console.log(chalk.yellow('⚠️ Web server module not available'));
}

// ==============================
// ⚙️ CONFIGURATION & UTILITIES
// ==============================

const print = (label, value) => console.log(`${chalk.green.bold('║')} ${chalk.cyan.bold(label.padEnd(16))}${chalk.yellow.bold(':')} ${value}`);
// Pastikan pairing code aktif secara default
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

// Initialize stores
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent' }) });
const msgRetryCounterCache = new NodeCache();

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
print('Baileys', `v${require('./package.json').dependencies['@whiskeysockets/baileys']}`);
print('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false }));
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));

// ==============================
// 🤖 WHATSAPP BOT IMPLEMENTATION
// ==============================

async function startNazeBot() {
    console.log(chalk.blue('🚀 Starting WhatsApp Bot...'));
    
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
    store.loadMessage = function (remoteJid, id) {
        const messages = store.messages?.[remoteJid]?.array;
        if (!messages) return null;
        return messages.find(msg => msg?.key?.id === id) || null;
    };
    
    const getMessage = async (key) => {
        if (store) {
            const msg = await store.loadMessage(key.remoteJid, key.id);
            return msg?.message || '';
        }
        return { conversation: 'Halo Saya Naze Bot' };
    };
    
    const naze = WAConnection({
        logger: level,
        getMessage,
        syncFullHistory: true,
        maxMsgRetryCount: 15,
        msgRetryCounterCache,
        retryRequestDelayMs: 10,
        defaultQueryTimeoutMs: 0,
        connectTimeoutMs: 60000,
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
        shouldSyncHistoryMessage: msg => {
            console.log(`\x1b[32mMemuat Chat [${msg.progress || 0}%]\x1b[39m`);
            return !!msg.syncType;
        },
        transactionOpts: {
            maxCommitRetries: 10,
            delayBetweenTriesMs: 10,
        },
        appStateMacVerification: {
            patch: true,
            snapshot: true,
        },
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, level),
        },
    });

    // Simpan instance bot secara global
    nazeInstance = naze;
    global.naze = naze;
    
    // Phone number handling untuk pairing code - DIPERBAIKI
    if (pairingCode && !naze.authState.creds.registered) {
        // Jika phone number sudah diset melalui web dashboard
        if (global.phoneNumber && !phoneNumber) {
            phoneNumber = global.phoneNumber;
            console.log(chalk.green('📱 Using phone number from dashboard:'), phoneNumber);
        }
        
        // Jika masih belum ada phone number, minta via console
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
            
            // Update web dashboard
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
    // 🔌 EVENT HANDLERS - DIPERBAIKI
    // ==============================
    
    naze.ev.on('creds.update', saveCreds);
    
    naze.ev.on('connection.update', async (update) => {
        const { qr, connection, lastDisconnect, isNewLogin, receivedPendingNotifications } = update;
        
        console.log(chalk.cyan('🔗 Connection Update:'), connection);
        
        // Update web dashboard
        if (global.setConnectionStatus) {
            global.setConnectionStatus(connection, getStatusMessage(connection));
        }

        // PAIRING CODE HANDLING - LOGIC YANG DIPERBAIKI
        if (connection === 'connecting' && pairingCode && !naze.authState.creds.registered) {
            console.log(chalk.yellow('🔄 Checking pairing conditions...'));
            console.log('   - Phone Number:', global.phoneNumber);
            console.log('   - Pairing Started:', pairingStarted);
            console.log('   - Creds Registered:', naze.authState.creds.registered);
            
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
                        pairingStarted = false; // Reset untuk mencoba lagi
                        if (global.setConnectionStatus) {
                            global.setConnectionStatus('error', 'Failed to generate pairing code: ' + error.message);
                        }
                    }
                }, 2000);
            } else if (!global.phoneNumber) {
                console.log(chalk.red('❌ No phone number available for pairing'));
                if (global.setConnectionStatus) {
                    global.setConnectionStatus('error', 'No phone number set for pairing');
                }
            }
        }
        
        // QR CODE HANDLING - untuk fallback
        if (qr && !pairingCode) {
            console.log('📲 QR Code generated');
            qrcode.generate(qr, { small: true });
            
            // Update web dashboard dengan QR code
            global.qrCode = qr;
            if (global.setQrCode) {
                global.setQrCode(qr);
            }
            
            // Generate random pairing code untuk display di web (hanya visual)
            if (!global.pairingCode) {
                const visualCode = generatePairingCode();
                global.pairingCode = visualCode;
                if (global.setPairingCode) {
                    global.setPairingCode(visualCode);
                }
            }
        }
        
        // CONNECTION CLOSE HANDLING
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.log(chalk.red('🔌 Connection closed, reason:'), reason);
            pairingStarted = false; // Reset pairing status
            handleDisconnect(reason, naze);
        }
        
        // CONNECTION OPEN HANDLING
        if (connection === 'open') {
            console.log(chalk.green('✅ SUCCESSFULLY CONNECTED TO WHATSAPP'));
            console.log('User:', JSON.stringify(naze.user, null, 2));
            
            pairingStarted = false; // Reset untuk koneksi berikutnya
            
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
                global.setPairingCode(null); // Clear pairing code setelah connect
            }
            if (global.setQrCode) {
                global.setQrCode(null); // Clear QR code setelah connect
            }
            
            // Handle group joins jika ada
            if (global.db?.set[global.botInfo.id] && !global.db?.set[global.botInfo.id]?.join) {
                console.log(chalk.blue('👥 Setting up group auto-join...'));
            }
        }
        
        // NEW LOGIN DETECTION
        if (isNewLogin) {
            console.log(chalk.green('🆕 New device login detected...'));
        }
        
        // PENDING NOTIFICATIONS
        if (receivedPendingNotifications == 'true') {
            console.log('⏳ Please wait About 1 Minute...');
            naze.ev.flush();
        }
    });
    
    // CONTACTS UPDATE
    naze.ev.on('contacts.update', (update) => {
        for (let contact of update) {
            let trueJid;
            if (!trueJid) continue;
            if (contact.id.endsWith('@lid')) {
                trueJid = naze.findJidByLid(contact.id, store);
            } else {
                trueJid = jidNormalizedUser(contact.id);
            }
            store.contacts[trueJid] = {
                ...store.contacts[trueJid],
                id: trueJid,
                name: contact.notify
            };
            if (contact.id.endsWith('@lid')) {
                store.contacts[trueJid].lid = jidNormalizedUser(contact.id);
            }
        }
    });
    
    // CALL HANDLING
    naze.ev.on('call', async (call) => {
        let botNumber = await naze.decodeJid(naze.user.id);
        if (global.db?.set[botNumber]?.anticall) {
            for (let id of call) {
                if (id.status === 'offer') {
                    let msg = await naze.sendMessage(id.from, { 
                        text: `Saat Ini, Kami Tidak Dapat Menerima Panggilan ${id.isVideo ? 'Video' : 'Suara'}.\nJika @${id.from.split('@')[0]} Memerlukan Bantuan, Silakan Hubungi Owner :)`, 
                        mentions: [id.from]
                    });
                    await naze.sendContact(id.from, global.owner, msg);
                    await naze.rejectCall(id.id, id.from);
                }
            }
        }
    });
    
    // MESSAGES HANDLING - menggunakan handler eksternal jika ada
    naze.ev.on('messages.upsert', async (message) => {
        if (typeof global.MessagesUpsert === 'function') {
            await global.MessagesUpsert(naze, message, store);
        } else {
            // Basic message handler
            await handleBasicMessage(naze, message, store);
        }
    });
    
    // GROUP PARTICIPANTS UPDATE
    naze.ev.on('group-participants.update', async (update) => {
        if (typeof global.GroupParticipantsUpdate === 'function') {
            await global.GroupParticipantsUpdate(naze, update, store);
        }
    });
    
    // GROUPS UPDATE
    naze.ev.on('groups.update', (update) => {
        for (const n of update) {
            if (store.groupMetadata[n.id]) {
                Object.assign(store.groupMetadata[n.id], n);
            } else {
                store.groupMetadata[n.id] = n;
            }
        }
    });
    
    // PRESENCE UPDATE
    naze.ev.on('presence.update', ({ id, presences: update }) => {
        store.presences[id] = store.presences?.[id] || {};
        Object.assign(store.presences[id], update);
    });
    
    // KEEP ALIVE
    setInterval(async () => {
        if (naze?.user?.id) {
            await naze.sendPresenceUpdate('available', naze.decodeJid(naze.user.id)).catch(e => {});
        }
    }, 10 * 60 * 1000);
    
    // BIND STORE
    store.bind(naze.ev);
    
    // CONNECT TO WHATSAPP
    try {
        await naze.connect();
        console.log(chalk.green('🔗 Initiated connection to WhatsApp'));
    } catch (error) {
        console.error(chalk.red('❌ Connection failed:'), error);
        pairingStarted = false;
    }
    
    return naze;
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
        [DisconnectReason.badSession]: () => {
            console.log('🗑️ Bad Session, Deleting and Scanning again...');
            exec('rm -rf ./nazedev/*', () => {
                setTimeout(startNazeBot, 3000);
            });
        },
        [DisconnectReason.connectionReplaced]: () => {
            console.log('🔄 Connection Replaced, Closing current session...');
            naze.ws.close();
        },
        [DisconnectReason.loggedOut]: () => {
            console.log('🚪 Logged Out, Deleting session and restarting...');
            exec('rm -rf ./nazedev/*', () => {
                setTimeout(startNazeBot, 3000);
            });
        },
        [DisconnectReason.forbidden]: () => {
            console.log('🚫 Connection Forbidden, Deleting session and restarting...');
            exec('rm -rf ./nazedev/*', () => {
                setTimeout(startNazeBot, 3000);
            });
        },
        [DisconnectReason.multideviceMismatch]: () => {
            console.log('📱 Multi-device Mismatch, Deleting session and restarting...');
            exec('rm -rf ./nazedev/*', () => {
                setTimeout(startNazeBot, 3000);
            });
        }
    };
    
    if (handlers[reason]) {
        handlers[reason]();
    } else {
        console.log(chalk.red(`❌ Unknown DisconnectReason: ${reason}, attempting reconnect...`));
        setTimeout(startNazeBot, 5000);
    }
}

async function handleBasicMessage(naze, message, store) {
    try {
        const msg = message.messages[0];
        if (!msg?.message || msg.key.fromMe) return;

        let text = '';
        if (msg.message.conversation) {
            text = msg.message.conversation.toLowerCase();
        } else if (msg.message.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.toLowerCase();
        }

        const from = msg.key.remoteJid;

        // Handle basic commands
        if (text.startsWith('!ping') || text.startsWith('/ping')) {
            await naze.sendMessage(from, { 
                text: `🏓 Pong!\n🤖 Naze Bot - Koyeb Deployment\n🕒 ${new Date().toLocaleString()}` 
            }, { quoted: msg });
        }
        else if (text.startsWith('!status') || text.startsWith('/status')) {
            const statusInfo = `🤖 BOT STATUS\n├ Connection: ${global.connectionStatus}\n├ Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB\n├ Uptime: ${Math.floor(process.uptime())}s\n└ Platform: Koyeb`;
            await naze.sendMessage(from, { text: statusInfo }, { quoted: msg });
        }
        else if (text.startsWith('!help') || text.startsWith('/help')) {
            const helpText = `🛡️ BOT COMMANDS\n\n!ping - Test bot response\n!status - Bot status\n!help - Show this help\n\n📱 Connected via Koyeb Web Dashboard`;
            await naze.sendMessage(from, { text: helpText }, { quoted: msg });
        }

    } catch (error) {
        console.log(chalk.yellow('Message handler error:'), error.message);
    }
}

// ==============================
// 🌐 WEB DASHBOARD INTEGRATION
// ==============================

global.handlePairingRequest = async function(phoneNumber) {
    console.log(chalk.blue('📱 Pairing request received for:'), phoneNumber);
    
    try {
        // Format phone number
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        } else if (!formattedNumber.startsWith('62')) {
            formattedNumber = '62' + formattedNumber;
        }
        
        // Validasi nomor telepon
        if (!parsePhoneNumber('+' + formattedNumber).valid) {
            return { 
                success: false, 
                message: 'Invalid phone number format' 
            };
        }
        
        global.phoneNumber = formattedNumber;
        global.connectionStatus = 'waiting_pairing';
        global.botStatus = 'Waiting for pairing code generation';
        pairingStarted = false; // Reset status pairing

        // Update web dashboard
        if (global.setPhoneNumber) {
            global.setPhoneNumber(formattedNumber);
        }
        if (global.setConnectionStatus) {
            global.setConnectionStatus('waiting_pairing', 'Phone number accepted - generating pairing code');
        }
        
        console.log(chalk.green('✅ Phone number formatted and saved:'), formattedNumber);
        
        // Jika bot sudah ada instance-nya, trigger pairing segera
        if (global.naze && !global.naze.authState.creds.registered) {
            console.log(chalk.yellow('🔄 Triggering immediate pairing...'));
            // Force reconnection untuk trigger pairing
            try {
                await global.naze.ws.close();
                // Tunggu sebentar sebelum reconnect
                setTimeout(() => {
                    startNazeBot();
                }, 2000);
            } catch (error) {
                console.log(chalk.yellow('⚠️ Manual trigger failed, waiting for auto-trigger...'));
            }
        }
        
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
        // Reset global variables
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.qrCode = null;
        global.connectionStatus = 'initializing';
        global.botStatus = 'Session cleared - Ready for new connection';
        pairingStarted = false;
        
        // Close existing connection
        if (global.naze) {
            global.naze.ws.close();
        }
        
        // Clear session files
        exec('rm -rf ./nazedev/*', (error) => {
            if (error) {
                console.log(chalk.yellow('⚠️ Could not clear session files:'), error.message);
            } else {
                console.log(chalk.green('✅ Session files cleared'));
            }
        });
        
        // Update web dashboard
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
        
        // Restart bot setelah clear session
        setTimeout(() => {
            startNazeBot();
        }, 3000);
        
        return { success: true, message: 'Session cleared successfully' };
        
    } catch (error) {
        console.error(chalk.red('❌ Clear session error:'), error);
        return { success: false, message: 'Error clearing session: ' + error.message };
    }
};

// Fungsi untuk memaksa generate pairing code
global.forceGeneratePairingCode = async function() {
    if (!global.phoneNumber) {
        return { success: false, message: 'Phone number not set' };
    }
    
    if (global.naze && !global.naze.authState.creds.registered) {
        try {
            console.log(chalk.yellow('🔄 Manually generating pairing code...'));
            const code = await global.naze.requestPairingCode(global.phoneNumber);
            global.pairingCode = code;
            
            if (global.setPairingCode) {
                global.setPairingCode(code);
            }
            if (global.setConnectionStatus) {
                global.setConnectionStatus('pairing', 'Pairing code generated');
            }
            
            console.log(chalk.green('🔐 Manual pairing code:'), code);
            
            return { 
                success: true, 
                code: code, 
                message: 'Pairing code generated successfully' 
            };
        } catch (error) {
            console.error(chalk.red('❌ Manual pairing code failed:'), error);
            return { 
                success: false, 
                message: 'Failed to generate pairing code: ' + error.message 
            };
        }
    }
    
    return { 
        success: false, 
        message: 'Bot not ready for pairing' 
    };
};

// ==============================
// 🎯 MAIN EXECUTION
// ==============================

async function main() {
    console.log(chalk.magenta(`
╔═══════════════════════════════════════╗
║           NAZE BOT v2.0               ║
║        Koyeb Deployment               ║
║     Complete Web Dashboard            ║
║         Pairing System FIXED          ║
╚═══════════════════════════════════════╝
    `));
    
    console.log(chalk.blue('🔧 Configuration:'));
    console.log('   - Pairing Code:', pairingCode ? 'ENABLED' : 'DISABLED');
    console.log('   - QR Code:', !pairingCode ? 'ENABLED' : 'DISABLED');
    console.log('   - Web Dashboard: AVAILABLE');
    
    try {
        // Tunggu web server mulai
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Start WhatsApp bot
        await startNazeBot();
        
        console.log(chalk.green(`
✅ System Status:
├── WhatsApp Bot: STARTING
├── Web Dashboard: AVAILABLE
├── Pairing System: ACTIVE
├── QR Code System: READY
└── Platform: Koyeb Ready
        `));
        
        // Auto-clear pairing code setiap 30 detik jika belum digunakan
        setInterval(() => {
            if (global.pairingCode && global.connectionStatus !== 'pairing') {
                global.pairingCode = null;
                if (global.setPairingCode) {
                    global.setPairingCode(null);
                }
            }
        }, 30000);
        
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

// File watcher for development
let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(chalk.redBright(`Update ${__filename}`));
    delete require.cache[file];
    require(file);
});
