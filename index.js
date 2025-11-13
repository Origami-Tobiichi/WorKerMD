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
const { exec, spawn } = require('child_process');
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
        macos: () => ['macOS', 'Chrome', '1.0'],
        windows: () => ['Windows', 'Chrome', '1.0']
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

// ==============================
// 🛠️ ENHANCED ERROR 405 HANDLER
// ==============================

class SessionManager {
    static async clearSessionFiles() {
        return new Promise((resolve) => {
            console.log(chalk.yellow('🗑️ Clearing session files...'));
            
            const sessionDirs = ['./nazedev', './sessions', './auth_info_baileys'];
            
            sessionDirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    try {
                        if (process.platform === 'win32') {
                            exec(`rmdir /s /q "${dir}"`, (error) => {
                                if (!error) console.log(chalk.green(`✅ Cleared ${dir}`));
                            });
                        } else {
                            exec(`rm -rf "${dir}"`, (error) => {
                                if (!error) console.log(chalk.green(`✅ Cleared ${dir}`));
                            });
                        }
                    } catch (e) {
                        console.log(chalk.yellow(`⚠️ Could not clear ${dir}:`), e.message);
                    }
                }
            });
            
            setTimeout(resolve, 2000);
        });
    }
    
    static async validatePhoneNumber(phoneNumber) {
        try {
            const formatted = phoneNumber.replace(/[^0-9]/g, '');
            let finalNumber = formatted;
            
            if (finalNumber.startsWith('0')) {
                finalNumber = '62' + finalNumber.substring(1);
            } else if (!finalNumber.startsWith('62')) {
                finalNumber = '62' + finalNumber;
            }
            
            const pn = parsePhoneNumber('+' + finalNumber);
            if (!pn.isValid()) {
                return { valid: false, message: 'Invalid phone number format' };
            }
            
            // Additional validation for WhatsApp
            if (finalNumber.length < 10 || finalNumber.length > 15) {
                return { valid: false, message: 'Phone number length invalid' };
            }
            
            return { valid: true, number: finalNumber };
        } catch (error) {
            return { valid: false, message: error.message };
        }
    }
}

// ==============================
// ⚙️ CONFIGURATION
// ==============================

const pairingCode = !process.argv.includes('--qr');
const useNewAuth = process.argv.includes('--new');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

let pairingStarted = false;
let phoneNumber = null;
let nazeInstance = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

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
// 🔧 ENHANCED UTILITY FUNCTIONS
// ==============================

function getStatusMessage(connection) {
    const statusMap = {
        'connecting': 'Menghubungkan ke WhatsApp...',
        'open': 'Terhubung ke WhatsApp',
        'close': 'Koneksi terputus',
        'offline': 'Offline',
        'pairing': 'Pairing code tersedia - masukkan di WhatsApp',
        'waiting_pairing': 'Menunggu pembuatan pairing code',
        'reconnecting': 'Menyambung ulang...',
        'error_405': 'Error 405 - Session bermasalah'
    };
    return statusMap[connection] || connection;
}

function handleDisconnect(reason, naze) {
    console.log(chalk.yellow('🔄 Handling disconnect...'));
    reconnectAttempts++;
    
    // Reset jika berhasil connect
    if (reason === 'open') {
        reconnectAttempts = 0;
    }
    
    // Jika terlalu banyak percobaan ulang, clear session
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log(chalk.red('🔄 Too many reconnection attempts, clearing session...'));
        SessionManager.clearSessionFiles().then(() => {
            setTimeout(startNazeBot, 5000);
        });
        return;
    }

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
            SessionManager.clearSessionFiles().then(() => {
                setTimeout(startNazeBot, 3000);
            });
        },
        [DisconnectReason.badSession]: () => {
            console.log('🗑️ Session rusak, menghapus dan restart...');
            SessionManager.clearSessionFiles().then(() => {
                setTimeout(startNazeBot, 3000);
            });
        },
        [DisconnectReason.connectionReplaced]: () => {
            console.log('🔄 Koneksi digantikan, menutup session...');
            process.exit(0);
        },
        [DisconnectReason.forbidden]: () => {
            console.log('🚫 Akses ditolak, session diblokir...');
            SessionManager.clearSessionFiles().then(() => {
                process.exit(1);
            });
        },
        [DisconnectReason.multideviceMismatch]: () => {
            console.log('📱 Multi-device mismatch, menghapus session...');
            SessionManager.clearSessionFiles().then(() => {
                process.exit(0);
            });
        }
    };

    // ✅ SPECIAL HANDLING FOR ERROR 405
    if (reason === 405) {
        console.log(chalk.red('❌ ERROR 405: Session authorization failed'));
        console.log(chalk.yellow('💡 Solution: Clearing session and using fresh authentication'));
        
        global.connectionStatus = 'error_405';
        if (global.setConnectionStatus) {
            global.setConnectionStatus('error_405', 'Session authorization failed - clearing session');
        }
        
        SessionManager.clearSessionFiles().then(() => {
            console.log(chalk.green('✅ Session cleared, restarting with fresh auth...'));
            setTimeout(startNazeBot, 3000);
        });
        return;
    }

    if (reason && reasonHandlers[reason]) {
        reasonHandlers[reason]();
    } else {
        console.log(chalk.red(`❌ Unknown disconnect reason: ${reason}`));
        setTimeout(startNazeBot, 5000);
    }
}

// ==============================
// 📞 ENHANCED PHONE NUMBER HANDLING
// ==============================

async function getPhoneNumberForPairing() {
    return new Promise(async (resolve) => {
        // Coba dapatkan dari berbagai sumber
        phoneNumber = global.number_bot || process.env.BOT_NUMBER || global.phoneNumber;
        
        if (!phoneNumber) {
            console.log(chalk.yellow('\n📱 WHATSAPP PAIRING SYSTEM'));
            console.log(chalk.cyan('================================'));
            console.log(chalk.cyan('Format: 62xxx (tanpa +)'));
            console.log(chalk.cyan('Contoh: 6281234567890'));
            console.log(chalk.cyan('================================\n'));
            
            phoneNumber = await question(chalk.green('➡️  Masukkan nomor WhatsApp: '));
        }

        // Validasi dan format nomor
        const validation = await SessionManager.validatePhoneNumber(phoneNumber);
        if (!validation.valid) {
            console.log(chalk.red('❌ ' + validation.message));
            console.log(chalk.yellow('💡 Pastikan format nomor benar: 6281234567890'));
            return getPhoneNumberForPairing();
        }

        phoneNumber = validation.number;
        global.phoneNumber = phoneNumber;
        
        console.log(chalk.green('✅ Nomor WhatsApp diterima:'), phoneNumber);
        console.log(chalk.cyan('📱 Pastikan nomor ini terdaftar di WhatsApp dan dapat menerima SMS/telepon'));
        
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
// 🤖 ENHANCED WHATSAPP BOT WITH 405 FIX
// ==============================

async function startNazeBot() {
    console.log(chalk.blue('🚀 Starting WhatsApp Bot with Enhanced Session Management...'));
    
    // Clear session jika menggunakan --new flag
    if (useNewAuth) {
        await SessionManager.clearSessionFiles();
    }
    
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
                keys: makeCacheableSignalKeyStore ? 
                    makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent' })) : 
                    state.keys,
            },
            browser: Browsers.ubuntu('Chrome'),
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false, // Disable untuk hindari error
            maxMsgRetryCount: 3, // Reduce retry attempts
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 30000,
            connectTimeoutMs: 30000,
            transactionOpts: {
                maxCommitRetries: 5,
                delayBetweenTriesMs: 1000,
            },
            // 🔧 OPTIMIZED SETTINGS FOR BETTER STABILITY
            fireInitQueries: true,
            emitOwnEvents: true,
            defaultSocketTimeout: 30000,
            keepAliveIntervalMs: 10000,
            retryRequestDelayMs: 250,
            maxCachedMessages: 50,
            linkPreviewImageThumbnailWidth: 192,
        };

        const naze = makeWASocket(socketConfig);
        nazeInstance = naze;
        global.naze = naze;

        // ==============================
        // 📱 ENHANCED PAIRING SYSTEM
        // ==============================

        naze.ev.on('creds.update', saveCreds);

        naze.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update;

            console.log(chalk.cyan('🔗 Connection Update:'), connection, 
                      lastDisconnect?.error?.message ? `- ${lastDisconnect.error.message}` : '');

            // Update dashboard
            if (global.setConnectionStatus) {
                global.setConnectionStatus(connection, getStatusMessage(connection));
            }

            // 🔑 ENHANCED PAIRING CODE SYSTEM WITH 405 PREVENTION
            if (pairingCode && connection === 'connecting' && !naze.authState.creds.registered) {
                console.log(chalk.yellow('🔄 Pairing System: Checking authentication...'));
                
                // Periksa apakah session mungkin bermasalah
                if (state.creds.registered === false && state.creds.account) {
                    console.log(chalk.yellow('⚠️ Previous session detected but not registered, clearing...'));
                    await SessionManager.clearSessionFiles();
                    setTimeout(startNazeBot, 3000);
                    return;
                }

                if (!global.phoneNumber) {
                    await getPhoneNumberForPairing();
                }

                if (global.phoneNumber && !pairingStarted) {
                    pairingStarted = true;
                    console.log(chalk.blue('📱 Starting pairing process for:'), global.phoneNumber);
                    
                    // Delay untuk memastikan koneksi stabil
                    setTimeout(async () => {
                        try {
                            console.log(chalk.yellow('🔄 Requesting pairing code from WhatsApp...'));
                            
                            // Request pairing code dengan timeout
                            const codePromise = naze.requestPairingCode(global.phoneNumber);
                            const timeoutPromise = new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Pairing code request timeout')), 15000)
                            );
                            
                            const code = await Promise.race([codePromise, timeoutPromise]);
                            
                            if (code) {
                                console.log(chalk.green('🔐 PAIRING CODE BERHASIL DIBUAT!'));
                                console.log(chalk.white.bgRed.bold(` KODE PAIRING: ${code} `));
                                console.log(chalk.yellow('⏰ Kode berlaku selama 25 detik'));
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

                                // Auto expire setelah 25 detik
                                setTimeout(() => {
                                    if (global.pairingCode === code) {
                                        global.pairingCode = 'EXPIRED';
                                        if (global.setPairingCode) {
                                            global.setPairingCode('EXPIRED - Request new code');
                                        }
                                        console.log(chalk.red('❌ Pairing code expired'));
                                        pairingStarted = false;
                                    }
                                }, 25000);
                            }
                        } catch (error) {
                            console.error(chalk.red('❌ Gagal meminta pairing code:'), error.message);
                            pairingStarted = false;
                            
                            if (error.message.includes('rate limit') || error.message.includes('too many')) {
                                console.log(chalk.yellow('⚠️ Terlalu banyak percobaan, tunggu 60 detik'));
                                setTimeout(() => { pairingStarted = false; }, 60000);
                            } else if (error.message.includes('timeout')) {
                                console.log(chalk.yellow('⚠️ Request timeout, coba lagi...'));
                                setTimeout(() => { pairingStarted = false; }, 10000);
                            } else if (error.message.includes('405') || error.message.includes('not authorized')) {
                                console.log(chalk.red('❌ Error 405 detected, clearing session...'));
                                await SessionManager.clearSessionFiles();
                                setTimeout(startNazeBot, 5000);
                            }
                        }
                    }, 5000); // Increased delay for stability
                }
            }

            // QR Code fallback
            if (qr && !pairingCode) {
                console.log(chalk.yellow('📲 QR Code received - Scan dengan WhatsApp'));
                qrcode.generate(qr, { small: true });
                global.qrCode = qr;
                if (global.setQrCode) {
                    global.setQrCode(qr);
                }
            }

            // Handle connection close - ENHANCED 405 DETECTION
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message;
                
                console.log(chalk.red('🔌 Connection closed:'), reason, errorMessage ? `- ${errorMessage}` : '');
                
                // Deteksi error 405 dari message juga
                if (errorMessage?.includes('405') || errorMessage?.includes('not authorized')) {
                    console.log(chalk.red('🔍 Detected 405 error from message, handling...'));
                    handleDisconnect(405, naze);
                } else {
                    pairingStarted = false;
                    handleDisconnect(reason, naze);
                }
            }

            // Handle connection open
            if (connection === 'open') {
                console.log(chalk.green('✅ BERHASIL TERHUBUNG KE WHATSAPP!'));
                reconnectAttempts = 0; // Reset reconnect counter
                pairingStarted = false;
                
                global.botInfo = {
                    id: naze.user?.id,
                    name: naze.user?.name || naze.user?.verifiedName || 'NazeBot',
                    phone: naze.user?.id?.split(':')[0] || global.phoneNumber,
                    platform: naze.user?.platform || 'unknown'
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

                console.log(chalk.green(`🤖 Bot connected as: ${global.botInfo.name} (${global.botInfo.phone})`));
                console.log(chalk.cyan('📊 Platform:'), global.botInfo.platform);
            }

            if (isNewLogin) {
                console.log(chalk.green('🆕 New login detected - session updated'));
            }

            if (receivedPendingNotifications) {
                console.log(chalk.yellow('⏳ Processing pending notifications...'));
                setTimeout(() => naze.ev.flush(), 2000);
            }
        });

        // Bind store
        if (store.bind) {
            store.bind(naze.ev);
        }

        // Enhanced keep alive dengan error handling
        const keepAliveInterval = setInterval(async () => {
            if (naze?.user?.id && connection === 'open') {
                try {
                    await naze.sendPresenceUpdate('available');
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Keep alive failed:'), error.message);
                    if (error.message.includes('405') || error.message.includes('not authorized')) {
                        clearInterval(keepAliveInterval);
                        handleDisconnect(405, naze);
                    }
                }
            }
        }, 45000); // Reduced interval

        // Cleanup on disconnect
        naze.ev.on('connection.update', (update) => {
            if (update.connection === 'close') {
                clearInterval(keepAliveInterval);
            }
        });

        return naze;

    } catch (error) {
        console.error(chalk.red('❌ Bot initialization failed:'), error.message);
        
        // Handle 405 during initialization
        if (error.message.includes('405') || error.message.includes('not authorized')) {
            console.log(chalk.red('🔄 405 error during init, clearing session...'));
            await SessionManager.clearSessionFiles();
            setTimeout(startNazeBot, 5000);
        } else {
            throw error;
        }
    }
}

// ==============================
// 🌐 WEB DASHBOARD FUNCTIONS (SAMA SEBELUMNYA)
// ==============================

global.handlePairingRequest = async function(phoneNumber) {
    console.log(chalk.blue('📱 Pairing request from dashboard:'), phoneNumber);
    
    try {
        const validation = await SessionManager.validatePhoneNumber(phoneNumber);
        if (!validation.valid) {
            return { success: false, message: validation.message };
        }

        global.phoneNumber = validation.number;
        pairingStarted = false;

        if (global.setPhoneNumber) {
            global.setPhoneNumber(validation.number);
        }
        if (global.setConnectionStatus) {
            global.setConnectionStatus('waiting_pairing', 'Phone number set - starting pairing');
        }

        if (global.naze) {
            console.log(chalk.yellow('🔄 Restarting connection for pairing...'));
            global.naze.ws.close();
            setTimeout(startNazeBot, 2000);
        }

        return {
            success: true,
            phone: validation.number,
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
            pairingStarted = false;
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
    reconnectAttempts = 0;

    if (global.naze) {
        global.naze.ws.close();
    }

    SessionManager.clearSessionFiles().then(() => {
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
    });

    return { success: true, message: 'Session cleared' };
};

// ==============================
// 🎯 MAIN APPLICATION
// ==============================

async function main() {
    console.log(chalk.magenta(`
╔═══════════════════════════════════════╗
║           NAZE BOT v2.1               ║
║         ENHANCED SESSION FIX          ║
║          ERROR 405 RESOLVED           ║
╚═══════════════════════════════════════╝
    `));

    console.log(chalk.blue('🔧 Starting System...'));
    console.log('   - Pairing Mode:', pairingCode ? 'ENABLED' : 'QR CODE');
    console.log('   - New Session:', useNewAuth ? 'YES' : 'NO');
    console.log('   - Web Dashboard:', global.setConnectionStatus ? 'ENABLED' : 'DISABLED');
    
    try {
        await startNazeBot();
        
        console.log(chalk.green(`
✅ System Ready:
├── WhatsApp Connection: ACTIVE
├── Pairing System: READY
├── Session Manager: ACTIVE
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
// 🛡️ ENHANCED PROCESS MANAGEMENT
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
    if (error.message.includes('405')) {
        console.log(chalk.yellow('🔄 405 detected, restarting...'));
        SessionManager.clearSessionFiles().then(() => {
            setTimeout(startNazeBot, 3000);
        });
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
});

// Start the application
main().catch(error => {
    console.error(chalk.red('❌ Critical error:'), error);
    process.exit(1);
});
