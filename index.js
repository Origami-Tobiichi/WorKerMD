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
const { exec } = require('child_process');
const { parsePhoneNumber } = require('awesome-phonenumber');

// ==============================
// 🚀 IMPORTS & INITIALIZATION - FIXED
// ==============================

let makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, proto, jidNormalizedUser;

try {
    const Baileys = require('@whiskeysockets/baileys');
    
    // Handle different versions of Baileys
    makeWASocket = Baileys.default?.makeWASocket || Baileys.makeWASocket;
    useMultiFileAuthState = Baileys.useMultiFileAuthState;
    Browsers = Baileys.Browsers || { 
        ubuntu: () => ['Ubuntu', 'Chrome', '1.0'],
        macos: () => ['macOS', 'Chrome', '1.0'] 
    };
    DisconnectReason = Baileys.DisconnectReason;
    makeInMemoryStore = Baileys.makeInMemoryStore;
    makeCacheableSignalKeyStore = Baileys.makeCacheableSignalKeyStore;
    fetchLatestBaileysVersion = Baileys.fetchLatestBaileysVersion;
    proto = Baileys.proto;
    jidNormalizedUser = Baileys.jidNormalizedUser;
    
    console.log(chalk.green('✅ Baileys loaded successfully'));
} catch (error) {
    console.error('❌ Failed to load Baileys:', error.message);
    process.exit(1);
}

// Web server dengan error handling
try {
    const { startServer, setConnectionStatus, setBotInfo, setPairingCode, setPhoneNumber, setQrCode } = require('./server');
    global.setConnectionStatus = setConnectionStatus;
    global.setBotInfo = setBotInfo;
    global.setPairingCode = setPairingCode;
    global.setPhoneNumber = setPhoneNumber;
    global.setQrCode = setQrCode;
    
    startServer().then(port => {
        console.log(chalk.green(`🌐 Web Dashboard running on port ${port}`));
    }).catch(error => {
        console.log(chalk.yellow('⚠️ Web dashboard disabled:'), error.message);
    });
} catch (error) {
    console.log(chalk.yellow('⚠️ Web server not available, running in console mode'));
}

// ==============================
// ⚙️ CONFIGURATION
// ==============================

const pairingCode = !process.argv.includes('--qr');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

let pairingStarted = false;
let phoneNumber = null;
let nazeInstance = null;

// Global variables
global.botStatus = 'Initializing...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;
global.qrCode = null;
global.naze = null;

// Initialize store
const store = makeInMemoryStore ? makeInMemoryStore({ logger: pino().child({ level: 'silent' }) }) : {
    messages: {}, contacts: {}, presences: {}, groupMetadata: {},
    loadMessage: () => null,
    bind: () => console.log('📦 Simple store bound')
};

const msgRetryCounterCache = new NodeCache();

// ==============================
// 🔧 UTILITY FUNCTIONS
// ==============================

function getStatusMessage(connection) {
    const statusMap = {
        'connecting': 'Menghubungkan ke WhatsApp...',
        'open': 'Terhubung ke WhatsApp',
        'close': 'Koneksi terputus',
        'offline': 'Offline',
        'pairing': 'Pairing code tersedia - masukkan di WhatsApp',
        'waiting_pairing': 'Menunggu pembuatan pairing code'
    };
    return statusMap[connection] || connection;
}

function handleDisconnect(reason, naze) {
    console.log(chalk.yellow('🔄 Handling disconnect...'));
    
    const reasonHandlers = {
        [DisconnectReason.connectionLost]: () => {
            console.log('🔌 Koneksi terputus, mencoba kembali...');
            setTimeout(startNazeBot, 5000);
        },
        [DisconnectReason.connectionClosed]: () => {
            console.log('🔌 Koneksi ditutup, mencoba kembali...');
            setTimeout(startNazeBot, 5000);
        },
        [DisconnectReason.restartRequired]: () => {
            console.log('🔄 Restart diperlukan...');
            setTimeout(startNazeBot, 5000);
        },
        [DisconnectReason.timedOut]: () => {
            console.log('⏰ Timeout, mencoba kembali...');
            setTimeout(startNazeBot, 5000);
        },
        [DisconnectReason.loggedOut]: () => {
            console.log('🚪 Logged out, menghapus session...');
            exec('rm -rf ./nazedev/*', () => {
                setTimeout(startNazeBot, 3000);
            });
        },
        [DisconnectReason.badSession]: () => {
            console.log('🗑️ Session rusak, menghapus dan restart...');
            exec('rm -rf ./nazedev/*', () => {
                setTimeout(startNazeBot, 3000);
            });
        },
        [DisconnectReason.connectionReplaced]: () => {
            console.log('🔄 Koneksi digantikan, menutup session...');
            process.exit(0);
        },
        [DisconnectReason.forbidden]: () => {
            console.log('🚫 Akses ditolak, session diblokir...');
            exec('rm -rf ./nazedev/*', () => {
                process.exit(1);
            });
        },
        [DisconnectReason.multideviceMismatch]: () => {
            console.log('📱 Multi-device mismatch, menghapus session...');
            exec('rm -rf ./nazedev/*', () => {
                process.exit(0);
            });
        }
    };

    if (reason && reasonHandlers[reason]) {
        reasonHandlers[reason]();
    } else {
        console.log(chalk.red(`❌ Unknown disconnect reason: ${reason}`));
        setTimeout(startNazeBot, 5000);
    }
}

// ==============================
// 📞 PHONE NUMBER HANDLING
// ==============================

async function getPhoneNumberForPairing() {
    return new Promise(async (resolve) => {
        // Coba dapatkan dari environment variable atau global setting
        phoneNumber = global.number_bot || process.env.BOT_NUMBER || global.phoneNumber;
        
        if (!phoneNumber) {
            console.log(chalk.yellow('📱 Masukkan nomor WhatsApp untuk pairing:'));
            console.log(chalk.cyan('   Format: 62xxx (tanpa +)'));
            console.log(chalk.cyan('   Contoh: 6281234567890'));
            
            phoneNumber = await question(chalk.green('➡️  Nomor WhatsApp: '));
        }

        // Format nomor telepon
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        // Auto-correct format
        if (phoneNumber.startsWith('0')) {
            phoneNumber = '62' + phoneNumber.substring(1);
        } else if (!phoneNumber.startsWith('62')) {
            phoneNumber = '62' + phoneNumber;
        }

        // Validasi nomor
        const pn = parsePhoneNumber('+' + phoneNumber);
        if (!pn.isValid()) {
            console.log(chalk.red('❌ Format nomor tidak valid!'));
            console.log(chalk.yellow('💡 Contoh format yang benar: 6281234567890'));
            return getPhoneNumberForPairing();
        }

        global.phoneNumber = phoneNumber;
        console.log(chalk.green('✅ Nomor WhatsApp diterima:'), phoneNumber);
        
        if (global.setPhoneNumber) {
            global.setPhoneNumber(phoneNumber);
        }
        if (global.setConnectionStatus) {
            global.setConnectionStatus('waiting_pairing', 'Phone number verified - generating pairing code');
        }

        resolve(phoneNumber);
    });
}

// ==============================
// 🤖 WHATSAPP BOT IMPLEMENTATION - FIXED PAIRING
// ==============================

async function startNazeBot() {
    console.log(chalk.blue('🚀 Starting WhatsApp Bot with Enhanced Pairing...'));
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('nazedev');
        const { version } = await fetchLatestBaileysVersion();
        
        // Reset pairing state
        pairingStarted = false;
        
        const socketConfig = {
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent' })) : state.keys,
            },
            browser: Browsers.ubuntu('Chrome'),
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            maxMsgRetryCount: 15,
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 0,
            connectTimeoutMs: 60000,
            transactionOpts: {
                maxCommitRetries: 10,
                delayBetweenTriesMs: 10,
            },
            appStateMacVerification: {
                patch: true,
                snapshot: true,
            },
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || null;
                }
                return null;
            },
            shouldSyncHistoryMessage: (msg) => {
                console.log(chalk.green(`Memuat Chat [${msg.progress || 0}%]`));
                return !!msg.syncType;
            }
        };

        const naze = makeWASocket(socketConfig);
        nazeInstance = naze;
        global.naze = naze;

        // ==============================
        // 📱 PAIRING SYSTEM - ENHANCED
        // ==============================

        naze.ev.on('creds.update', saveCreds);

        naze.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update;

            console.log(chalk.cyan('🔗 Connection Update:'), connection, qr ? 'QR Received' : '');

            // Update dashboard
            if (global.setConnectionStatus) {
                global.setConnectionStatus(connection, getStatusMessage(connection));
            }

            // 🔑 ENHANCED PAIRING CODE SYSTEM
            if (pairingCode && connection === 'connecting' && !naze.authState.creds.registered) {
                console.log(chalk.yellow('🔄 Pairing System: Checking conditions...'));
                
                // Dapatkan nomor telepon jika belum ada
                if (!global.phoneNumber) {
                    await getPhoneNumberForPairing();
                }

                if (global.phoneNumber && !pairingStarted) {
                    pairingStarted = true;
                    console.log(chalk.blue('📱 Starting pairing process for:'), global.phoneNumber);
                    
                    // Delay sedikit untuk memastikan koneksi siap
                    setTimeout(async () => {
                        try {
                            console.log(chalk.yellow('🔄 Requesting pairing code from WhatsApp...'));
                            
                            // Request pairing code dari WhatsApp
                            const code = await naze.requestPairingCode(global.phoneNumber);
                            
                            if (code) {
                                console.log(chalk.green('🔐 PAIRING CODE BERHASIL DIBUAT!'));
                                console.log(chalk.white.bgRed.bold(` KODE PAIRING: ${code} `));
                                console.log(chalk.yellow('⏰ Kode berlaku selama 20 detik'));
                                console.log(chalk.cyan('📱 Cara menggunakan:'));
                                console.log(chalk.cyan('   1. Buka WhatsApp di HP'));
                                console.log(chalk.cyan('   2. Pergi ke Settings → Linked Devices → Link a Device'));
                                console.log(chalk.cyan('   3. Masukkan kode pairing di atas'));
                                
                                // Update dashboard
                                global.pairingCode = code;
                                if (global.setPairingCode) {
                                    global.setPairingCode(code);
                                }
                                if (global.setConnectionStatus) {
                                    global.setConnectionStatus('pairing', 'Pairing code generated - enter in WhatsApp');
                                }

                                // Auto expire setelah 20 detik
                                setTimeout(() => {
                                    if (global.pairingCode === code) {
                                        global.pairingCode = 'EXPIRED - Request new code';
                                        if (global.setPairingCode) {
                                            global.setPairingCode('EXPIRED - Request new code');
                                        }
                                        console.log(chalk.red('❌ Pairing code expired'));
                                        pairingStarted = false; // Reset untuk meminta code baru
                                    }
                                }, 20000);
                            }
                        } catch (error) {
                            console.error(chalk.red('❌ Gagal meminta pairing code:'), error.message);
                            pairingStarted = false;
                            
                            if (error.message.includes('rate limit')) {
                                console.log(chalk.yellow('⚠️ Terlalu banyak percobaan, coba lagi dalam 30 detik'));
                                setTimeout(() => { pairingStarted = false; }, 30000);
                            }
                        }
                    }, 3000);
                }
            }

            // QR Code fallback
            if (qr && !pairingCode) {
                console.log(chalk.yellow('📲 QR Code received'));
                qrcode.generate(qr, { small: true });
                global.qrCode = qr;
                if (global.setQrCode) {
                    global.setQrCode(qr);
                }
            }

            // Handle connection close
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(chalk.red('🔌 Connection closed:'), reason);
                pairingStarted = false;
                handleDisconnect(reason, naze);
            }

            // Handle connection open
            if (connection === 'open') {
                console.log(chalk.green('✅ BERHASIL TERHUBUNG KE WHATSAPP!'));
                pairingStarted = false;
                
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
                    global.setPairingCode('CONNECTED');
                }

                console.log(chalk.green(`🤖 Bot connected as: ${global.botInfo.name}`));
                
                // Handle newsletter follow jika ada
                if (global.db?.set[global.botInfo.id] && !global.db?.set[global.botInfo.id]?.join) {
                    if (global.my?.ch && global.my.ch.length > 0 && global.my.ch.includes('@newsletter')) {
                        try {
                            await naze.newsletterMsg(global.my.ch, { type: 'follow' });
                            global.db.set[global.botInfo.id].join = true;
                        } catch (e) {
                            console.log(chalk.yellow('⚠️ Newsletter follow failed:'), e.message);
                        }
                    }
                }
            }

            if (isNewLogin) {
                console.log(chalk.green('🆕 New login detected'));
            }

            if (receivedPendingNotifications) {
                console.log(chalk.yellow('⏳ Flushing pending notifications...'));
                naze.ev.flush();
            }
        });

        // ==============================
        // 📨 MESSAGE & EVENT HANDLERS
        // ==============================

        // Bind store jika ada
        if (store.bind) {
            store.bind(naze.ev);
        }

        // Contacts update handler
        naze.ev.on('contacts.update', (update) => {
            for (let contact of update) {
                let trueJid;
                if (!contact.id) continue;
                
                if (contact.id.endsWith('@lid')) {
                    trueJid = naze.findJidByLid ? naze.findJidByLid(contact.id, store) : contact.id;
                } else {
                    trueJid = jidNormalizedUser(contact.id);
                }
                
                if (store.contacts) {
                    store.contacts[trueJid] = {
                        ...store.contacts[trueJid],
                        id: trueJid,
                        name: contact.notify
                    };
                    
                    if (contact.id.endsWith('@lid')) {
                        store.contacts[trueJid].lid = jidNormalizedUser(contact.id);
                    }
                }
            }
        });

        // Call handler
        naze.ev.on('call', async (call) => {
            const botNumber = global.botInfo?.id;
            if (global.db?.set[botNumber]?.anticall) {
                for (let id of call) {
                    if (id.status === 'offer') {
                        try {
                            const msg = await naze.sendMessage(id.from, { 
                                text: `Saat Ini, Kami Tidak Dapat Menerima Panggilan ${id.isVideo ? 'Video' : 'Suara'}.\nJika @${id.from.split('@')[0]} Memerlukan Bantuan, Silakan Hubungi Owner :)`, 
                                mentions: [id.from]
                            });
                            
                            if (global.owner) {
                                await naze.sendContact(id.from, global.owner, msg);
                            }
                            
                            await naze.rejectCall(id.id, id.from);
                        } catch (error) {
                            console.log(chalk.red('❌ Call rejection failed:'), error.message);
                        }
                    }
                }
            }
        });

        // Messages upsert handler
        naze.ev.on('messages.upsert', async (message) => {
            // Import dan panggil handler messages
            try {
                const { MessagesUpsert } = require('./handler/messages');
                await MessagesUpsert(naze, message, store);
            } catch (error) {
                console.log(chalk.yellow('⚠️ Messages handler not available'));
            }
        });

        // Group participants update handler
        naze.ev.on('group-participants.update', async (update) => {
            try {
                const { GroupParticipantsUpdate } = require('./handler/group');
                await GroupParticipantsUpdate(naze, update, store);
            } catch (error) {
                console.log(chalk.yellow('⚠️ Group handler not available'));
            }
        });

        // Groups update handler
        naze.ev.on('groups.update', (update) => {
            for (const n of update) {
                if (store.groupMetadata && store.groupMetadata[n.id]) {
                    Object.assign(store.groupMetadata[n.id], n);
                } else if (store.groupMetadata) {
                    store.groupMetadata[n.id] = n;
                }
            }
        });

        // Presence update handler
        naze.ev.on('presence.update', ({ id, presences: update }) => {
            if (store.presences) {
                store.presences[id] = store.presences?.[id] || {};
                Object.assign(store.presences[id], update);
            }
        });

        // Keep alive
        setInterval(async () => {
            if (naze?.user?.id) {
                await naze.sendPresenceUpdate('available');
            }
        }, 60000);

        return naze;

    } catch (error) {
        console.error(chalk.red('❌ Bot initialization failed:'), error);
        throw error;
    }
}

// ==============================
// 🌐 WEB DASHBOARD FUNCTIONS
// ==============================

global.handlePairingRequest = async function(phoneNumber) {
    console.log(chalk.blue('📱 Pairing request from dashboard:'), phoneNumber);
    
    try {
        // Format phone number
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        } else if (!formattedNumber.startsWith('62')) {
            formattedNumber = '62' + formattedNumber;
        }

        // Validasi
        if (!parsePhoneNumber('+' + formattedNumber).isValid()) {
            return { success: false, message: 'Format nomor tidak valid' };
        }

        global.phoneNumber = formattedNumber;
        pairingStarted = false; // Reset untuk memulai pairing baru

        if (global.setPhoneNumber) {
            global.setPhoneNumber(formattedNumber);
        }
        if (global.setConnectionStatus) {
            global.setConnectionStatus('waiting_pairing', 'Phone number set - starting pairing');
        }

        // Restart connection untuk trigger pairing
        if (global.naze) {
            console.log(chalk.yellow('🔄 Restarting connection for pairing...'));
            global.naze.ws.close();
            setTimeout(startNazeBot, 2000);
        }

        return {
            success: true,
            phone: formattedNumber,
            message: 'Pairing process started'
        };

    } catch (error) {
        console.error(chalk.red('❌ Pairing request error:'), error);
        return { success: false, message: error.message };
    }
};

global.forceGeneratePairingCode = async function() {
    if (!global.phoneNumber) {
        return { success: false, message: 'Phone number not set' };
    }

    if (global.naze && !global.naze.authState.creds.registered) {
        try {
            pairingStarted = false; // Reset flag
            const code = await global.naze.requestPairingCode(global.phoneNumber);
            
            global.pairingCode = code;
            if (global.setPairingCode) {
                global.setPairingCode(code);
            }

            console.log(chalk.green('🔐 Manual pairing code generated:'), code);
            return { success: true, code: code };

        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    return { success: false, message: 'Bot not ready for pairing' };
};

global.handleRestartRequest = function() {
    console.log(chalk.yellow('🔄 Restarting bot...'));
    if (global.naze) {
        global.naze.ws.close();
    }
    setTimeout(startNazeBot, 3000);
    return { success: true, message: 'Bot restarting' };
};

global.handleClearSession = function() {
    console.log(chalk.yellow('🗑️ Clearing session...'));
    
    global.phoneNumber = null;
    global.pairingCode = null;
    global.botInfo = null;
    global.connectionStatus = 'initializing';
    pairingStarted = false;

    if (global.naze) {
        global.naze.ws.close();
    }

    exec('rm -rf ./nazedev/*', (error) => {
        if (error) {
            console.log(chalk.yellow('⚠️ Could not clear session files:'), error.message);
        } else {
            console.log(chalk.green('✅ Session cleared'));
        }
    });

    if (global.setConnectionStatus) {
        global.setConnectionStatus('initializing', 'Session cleared');
    }
    if (global.setPairingCode) {
        global.setPairingCode(null);
    }
    if (global.setPhoneNumber) {
        global.setPhoneNumber(null);
    }

    setTimeout(startNazeBot, 3000);
    return { success: true, message: 'Session cleared' };
};

// ==============================
// 🎯 MAIN APPLICATION
// ==============================

async function main() {
    console.log(chalk.magenta(`
╔═══════════════════════════════════════╗
║           NAZE BOT v2.0               ║
║        ENHANCED PAIRING SYSTEM        ║
║         FIXED WHATSAPP LINKING        ║
╚═══════════════════════════════════════╝
    `));

    console.log(chalk.blue('🔧 Starting System...'));
    console.log('   - Pairing Mode:', pairingCode ? 'ENABLED' : 'QR CODE');
    console.log('   - Web Dashboard:', global.setConnectionStatus ? 'ENABLED' : 'DISABLED');
    
    try {
        await startNazeBot();
        
        console.log(chalk.green(`
✅ System Ready:
├── WhatsApp Connection: ACTIVE
├── Pairing System: READY
├── Web Interface: ${global.setConnectionStatus ? 'RUNNING' : 'DISABLED'}
└── Status: Waiting for authentication
        `));

    } catch (error) {
        console.error(chalk.red('❌ Startup failed:'), error.message);
        console.log(chalk.yellow('🔄 Restarting in 5 seconds...'));
        setTimeout(main, 5000);
    }
}

// ==============================
// 🛡️ PROCESS MANAGEMENT
// ==============================

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Shutting down gracefully...'));
    if (global.naze) {
        global.naze.ws.close();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down...'));
    if (global.naze) {
        global.naze.ws.close();
    }
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
});

// Start the application
main().catch(error => {
    console.error(chalk.red('❌ Critical error:'), error);
    process.exit(1);
});
