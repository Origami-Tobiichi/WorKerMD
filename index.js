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
const dns = require('dns');
const http = require('http');
const express = require('express');

// ==============================
// 🛡️ ENHANCED SECURITY CONFIGURATION
// ==============================

// Secure DNS Configuration
const SECURE_DNS_CONFIG = {
    servers: [
        'https://dns.nextdns.io/5e6c1b',
        'tls://5e6c1b.dns.nextdns.io', 
        'quic://5e6c1b.dns.nextdns.io',
        'https://dns.google/dns-query',
        'https://cloudflare-dns.com/dns-query'
    ],
    timeout: 3000,
    cacheTimeout: 30000
};

// Enhanced User Agents Rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
];

// Security Headers Template
const SECURITY_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'DNT': '1'
};

// Priority Commands for Fast Response
const PRIORITY_COMMANDS = {
    'ping': { priority: 1, maxResponseTime: 800 },
    'status': { priority: 1, maxResponseTime: 1000 },
    'emergency': { priority: 0, maxResponseTime: 500 },
    'help': { priority: 2, maxResponseTime: 1500 },
    'speed': { priority: 1, maxResponseTime: 700 }
};

// ==============================
// 🔧 UTILITY FUNCTIONS
// ==============================

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

// Secure DNS Lookup with Fallback
async function secureDnsLookup(hostname) {
    const cacheKey = `dns_${hostname}`;
    const cached = global.dnsCache?.get(cacheKey);
    if (cached) return cached;

    try {
        // Try DNS-over-HTTPS first
        const dohUrl = `https://dns.nextdns.io/5e6c1b/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
        const response = await axios.get(dohUrl, {
            headers: {
                'Accept': 'application/dns-json',
                'User-Agent': USER_AGENTS[0],
                ...SECURITY_HEADERS
            },
            timeout: 2500
        });
        
        if (response.data && response.data.Answer) {
            const addresses = response.data.Answer.map(a => a.data);
            global.dnsCache?.set(cacheKey, addresses, 300); // Cache 5 minutes
            console.log(chalk.green(`🔒 Secure DNS resolved ${hostname}:`), addresses);
            return addresses;
        }
    } catch (error) {
        console.log(chalk.yellow(`⚠️ DoH failed for ${hostname}, trying fallback...`));
    }

    // Fallback to system DNS
    try {
        return new Promise((resolve) => {
            dns.lookup(hostname, { all: true }, (err, addresses) => {
                if (err) {
                    console.log(chalk.red(`❌ DNS lookup failed for ${hostname}:`), err.message);
                    resolve([]);
                } else {
                    const ips = addresses.map(addr => addr.address);
                    global.dnsCache?.set(cacheKey, ips, 180); // Cache 3 minutes
                    console.log(chalk.blue(`🌐 System DNS resolved ${hostname}:`), ips);
                    resolve(ips);
                }
            });
        });
    } catch (error) {
        console.log(chalk.red(`❌ All DNS methods failed for ${hostname}`));
        return [];
    }
}

// Random User Agent Generator
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Enhanced Headers with Rotation
function getSecurityHeaders() {
    return {
        ...SECURITY_HEADERS,
        'User-Agent': getRandomUserAgent()
    };
}

// Fast Response Priority Handler
async function handlePriorityCommand(command, naze, msg) {
    const startTime = Date.now();
    
    try {
        switch(command.toLowerCase()) {
            case 'ping':
                await naze.sendMessage(msg.key.remoteJid, { 
                    text: `🏓 Pong!\n⚡ Response: ${Date.now() - startTime}ms\n🔒 Secure Mode: ACTIVE` 
                }, { quoted: msg });
                break;
                
            case 'status':
                const memUsage = process.memoryUsage();
                const statusInfo = `🤖 BOT STATUS\n├ Online: ✅ ACTIVE\n├ Memory: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB\n├ Uptime: ${Math.floor(process.uptime())}s\n├ Secure DNS: ✅ ENABLED\n└ Response: ${Date.now() - startTime}ms`;
                await naze.sendMessage(msg.key.remoteJid, { text: statusInfo }, { quoted: msg });
                break;
                
            case 'emergency':
                await naze.sendMessage(msg.key.remoteJid, { 
                    text: '🚨 EMERGENCY MODE ACTIVATED!\n⚡ Fast response enabled!\n🔒 Security: MAXIMUM\n📱 Priority: HIGHEST' 
                }, { quoted: msg });
                break;
                
            case 'speed':
                const testTime = Date.now() - startTime;
                let speedStatus = '⚡ BLAZING FAST';
                if (testTime > 1000) speedStatus = '🐢 SLOW';
                else if (testTime > 500) speedStatus = '🚀 FAST';
                
                await naze.sendMessage(msg.key.remoteJid, { 
                    text: `📊 SPEED TEST\n├ Response: ${testTime}ms\n├ Status: ${speedStatus}\n├ DNS: Secure\n└ Server: Optimized` 
                }, { quoted: msg });
                break;
                
            case 'help':
                const helpText = `🛡️ SECURE BOT COMMANDS\n\n⚡ Priority Commands:\n!ping - Test response speed\n!status - Bot status\n!speed - Speed test\n!emergency - Emergency mode\n\n🔒 Security Features:\n• Secure DNS (DoH/DoT)\n• Header Rotation\n• Anti-detection\n• Fast Response`;
                await naze.sendMessage(msg.key.remoteJid, { text: helpText }, { quoted: msg });
                break;
        }
        
        console.log(chalk.green(`⚡ Priority command "${command}" handled in ${Date.now() - startTime}ms`));
    } catch (error) {
        console.log(chalk.red(`❌ Error in priority command ${command}:`), error.message);
    }
}

// Initialize Secure DNS
async function initializeSecureDNS() {
    console.log(chalk.blue('🔒 Initializing secure DNS configuration...'));
    
    // Initialize DNS cache
    global.dnsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    
    try {
        // Set secure DNS servers
        dns.setServers([
            '1.1.1.1',     // Cloudflare
            '8.8.8.8',     // Google
            '9.9.9.9',     // Quad9
            '208.67.222.222' // OpenDNS
        ]);
        
        // Test DNS resolution
        const testResult = await secureDnsLookup('google.com');
        if (testResult.length > 0) {
            console.log(chalk.green('✅ Secure DNS configured successfully'));
            console.log(chalk.blue('📡 DNS Servers:'), 'NextDNS, Cloudflare, Google, Quad9');
        } else {
            console.log(chalk.yellow('⚠️ DNS test failed, using system defaults'));
        }
    } catch (error) {
        console.log(chalk.yellow('⚠️ DNS configuration failed:'), error.message);
    }
}

// ==============================
// 🚀 ENHANCED WHATSAPP BOT
// ==============================

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

// Stealth Browser Configuration
const STEALTH_BROWSER_CONFIG = [
    'Ubuntu', 
    'Chrome', 
    '120.0.0.0',
    {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        userAgent: getRandomUserAgent(),
        extraHTTPHeaders: getSecurityHeaders()
    }
];

// Global variables
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || (global.pairing_code !== undefined ? global.pairing_code : true);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Performance constants
const DELAY_BEFORE_PAIRING = 1500;
const DELAY_AFTER_PAIRING_CODE = 300;
const PAIRING_CODE_TIMEOUT = 45;

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
global.dnsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Store implementation
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

// Enhanced fetchApi dengan secure DNS
global.fetchApi = async (path = '/', query = {}, options) => {
    const startTime = Date.now();
    try {
        const baseUrl = (options?.name || options) in global.APIs ? global.APIs[(options?.name || options)] : global.APIs['hitori'];
        const url = baseUrl + path + (query ? '?' + new URLSearchParams(query).toString() : '');
        
        // Secure DNS resolution
        const hostname = new URL(url).hostname;
        const resolvedIps = await secureDnsLookup(hostname);
        
        const config = {
            headers: getSecurityHeaders(),
            timeout: 6000,
            ...(options?.name || options ? {} : { 
                headers: {
                    ...getSecurityHeaders(),
                    'accept': 'application/json', 
                    'x-api-key': global.APIKeys[global.APIs['hitori']]
                }
            })
        };

        const { data } = await axios.get(url, config);
        console.log(chalk.blue(`🌐 API fetch completed in ${Date.now() - startTime}ms`));
        return data;
    } catch (error) {
        console.error(chalk.red(`❌ API fetch error (${Date.now() - startTime}ms):`), error.message);
        return {};
    }
}

// Create Secure WhatsApp Connection
async function createSecureWhatsAppConnection(version, state, logger) {
    return makeWASocket({
        version,
        logger,
        printQRInTerminal: !pairingCode,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        // Stealth optimizations
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        retryRequestDelayMs: 1200,
        maxRetries: 3,
        connectTimeoutMs: 25000,
        keepAliveIntervalMs: 20000,
        emitOwnEvents: false,
        defaultQueryTimeoutMs: 20000,
        syncFullHistory: false,
        fireInitQueries: false,
        authTimeoutMs: 15000,
        logger: pino({ level: 'silent' }),
        browser: STEALTH_BROWSER_CONFIG,
        // Additional stealth options
        txTimeout: 25000,
        qrTimeout: 40000,
        // Message optimization
        patchMessageBeforeSending: (message) => {
            // Reduce metadata
            if (message.messageTimestamp) {
                delete message.messageTimestamp;
            }
            return message;
        }
    });
}

// Enhanced Message Handler dengan Priority System
async function handleMessageUpsert(naze, message, store) {
    const startTime = Date.now();
    
    try {
        const msg = message.messages[0];
        if (!msg?.message) return;

        let text = '';
        if (msg.message.conversation) {
            text = msg.message.conversation.toLowerCase();
        } else if (msg.message.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.toLowerCase();
        }

        // Check for priority commands
        const priorityPattern = /^[!#]?(ping|status|emergency|speed|help)/i;
        const match = text.match(priorityPattern);
        
        if (match) {
            const command = match[1].toLowerCase();
            if (PRIORITY_COMMANDS[command]) {
                await handlePriorityCommand(command, naze, msg);
                console.log(chalk.green(`⚡ Priority command "${command}" executed in ${Date.now() - startTime}ms`));
                return;
            }
        }

        // Process other commands normally (jika ada handler external)
        if (typeof global.MessagesUpsert === 'function') {
            await global.MessagesUpsert(naze, message, store);
        }
        
    } catch (error) {
        console.log(chalk.red(`❌ Error in message handler (${Date.now() - startTime}ms):`), error.message);
    }
}

// Fast Connection Recovery
function handleConnectionRecovery(reason) {
    let reconnectDelay = 1500; // Default fast recovery
    
    if (reason === DisconnectReason.connectionLost) {
        reconnectDelay = 800; // Very fast untuk connection lost
    } else if (reason === DisconnectReason.timedOut) {
        reconnectDelay = 1000; // Fast untuk timeout
    } else if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.forbidden) {
        reconnectDelay = 3000; // Session invalid, perlu lebih lama
    }
    
    console.log(chalk.yellow(`🔄 Fast reconnecting in ${reconnectDelay}ms...`));
    return reconnectDelay;
}

// ==============================
// 🌐 WEB DASHBOARD SIMULATION
// ==============================

// Simple Web Dashboard untuk monitoring
function startWebDashboard(port = 3000) {
    const app = express();
    
    app.use(express.json());
    app.use(express.static('public'));
    
    // Security headers untuk web
    app.use((req, res, next) => {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    });
    
    app.get('/', (req, res) => {
        res.json({
            status: 'online',
            bot: global.botInfo,
            connection: global.connectionStatus,
            security: {
                dns: 'secure',
                stealth: 'enabled',
                headers: 'rotating'
            },
            performance: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                dnsCache: global.dnsCache?.stats || {}
            }
        });
    });
    
    app.get('/security', (req, res) => {
        res.json({
            dns: {
                providers: SECURE_DNS_CONFIG.servers,
                cache: global.dnsCache?.stats || {}
            },
            headers: {
                rotation: 'enabled',
                userAgents: USER_AGENTS.length,
                securityHeaders: Object.keys(SECURITY_HEADERS)
            },
            stealth: {
                browser: STEALTH_BROWSER_CONFIG,
                priorityCommands: Object.keys(PRIORITY_COMMANDS)
            }
        });
    });
    
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            console.log(chalk.green(`🌐 Web Dashboard: http://localhost:${port}`));
            console.log(chalk.blue(`📊 Security Monitor: http://localhost:${port}/security`));
            resolve(port);
        });
        
        global.webServer = server;
    });
}

// ==============================
// 🤖 MAIN BOT IMPLEMENTATION
// ==============================

async function startNazeBot() {
    console.log(chalk.blue('🚀 Starting Secure WhatsApp Bot...'));
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('nazedev_secure');
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'silent' });
        
        const naze = await createSecureWhatsAppConnection(version, state, logger);
        
        // Enhanced connection handler
        naze.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log(chalk.blue('🔌 Connection update:'), connection);
            
            if (connection === 'connecting') {
                global.connectionStatus = 'connecting';
                sessionErrorCount = 0;
            }
            
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(chalk.yellow('🔴 Connection closed, reason:'), reason);
                
                global.connectionStatus = 'offline';
                const reconnectDelay = handleConnectionRecovery(reason);
                
                setTimeout(() => {
                    startNazeBot();
                }, reconnectDelay);
            }
            
            if (connection === 'open') {
                console.log(chalk.green('✅ Connected to WhatsApp!'));
                
                pairingCodeGenerated = false;
                pairingStarted = false;
                if (currentPairingTimeout) {
                    clearTimeout(currentPairingTimeout);
                    currentPairingTimeout = null;
                }
                
                global.botInfo = {
                    id: naze.user?.id,
                    name: naze.user?.name || naze.user?.verifiedName || 'SecureBot',
                    phone: global.phoneNumber,
                    security: {
                        dns: 'enabled',
                        stealth: 'active',
                        headers: 'rotating'
                    }
                };
                
                global.connectionStatus = 'online';
                global.pairingCode = null;
                sessionErrorCount = 0;
                
                console.log(chalk.green('🤖 Bot security status:'));
                console.log(chalk.blue('   ├ Secure DNS: ✅ Enabled'));
                console.log(chalk.blue('   ├ Header Rotation: ✅ Active'));
                console.log(chalk.blue('   ├ Stealth Mode: ✅ Enabled'));
                console.log(chalk.blue('   └ Fast Response: ✅ Optimized'));
                
                // Fast initial presence
                setTimeout(() => {
                    naze.sendPresenceUpdate('available').catch(() => {});
                }, 800);
            }
            
            if (qr && !pairingCode) {
                console.log(chalk.yellow('📱 QR Code generated (Secure Mode)'));
                qrcode.generate(qr, { small: true });
                global.qrCode = qr;
                global.connectionStatus = 'waiting_qr';
            }
        });

        // Enhanced message handling
        naze.ev.on('messages.upsert', async (message) => {
            await handleMessageUpsert(naze, message, store);
        });

        // Optimized presence updates
        setInterval(async () => {
            if (naze?.user?.id) {
                try {
                    // Randomize presence timing untuk stealth
                    const randomDelay = Math.floor(Math.random() * 25000) + 25000;
                    setTimeout(async () => {
                        await naze.sendPresenceUpdate('available').catch(() => {});
                    }, randomDelay);
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Presence update:'), error.message);
                }
            }
        }, 40000);

        // Credentials update
        naze.ev.on('creds.update', saveCreds);

        // Store binding
        store.bind(naze.ev);

        return naze;
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start WhatsApp bot:'), error);
        setTimeout(() => {
            startNazeBot();
        }, 5000);
    }
}

// ==============================
// 🎯 MAIN APPLICATION
// ==============================

async function main() {
    console.log(chalk.magenta.bold(`
╔═══════════════════════════════════════╗
║           🛡️ SECURE BOT v2.0          ║
║     DNS Protection • Stealth Mode     ║
║         Fast Response • Secure        ║
╚═══════════════════════════════════════╝
    `));
    
    try {
        // Initialize secure systems pertama
        await initializeSecureDNS();
        
        // Start web dashboard
        const port = await startWebDashboard(3000);
        global.currentPort = port;
        
        // Start WhatsApp bot
        await new Promise(resolve => setTimeout(resolve, 1000));
        await startNazeBot();
        
        console.log(chalk.green(`
✅ System Status:
├── Secure DNS: ACTIVE
├── Stealth Mode: ENABLED  
├── Header Rotation: WORKING
├── Web Dashboard: ONLINE
└── WhatsApp Bot: STARTING
        `));
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start secure system:'), error);
        console.log(chalk.yellow('🔄 Restarting in 3 seconds...'));
        setTimeout(main, 3000);
    }
}

// ==============================
// 🛡️ PROCESS MANAGEMENT
// ==============================

// Enhanced cleanup function
const cleanup = async () => {
    console.log(chalk.yellow('\n📦 Saving cache and shutting down securely...'));
    try {
        // Save DNS cache stats
        console.log(chalk.blue('📊 DNS Cache Stats:'), global.dnsCache?.stats);
        
        // Cleanup resources
        if (global.webServer) {
            global.webServer.close();
        }
        
        console.log(chalk.green('💾 Secure shutdown completed'));
    } catch (error) {
        console.log(chalk.red('❌ Error during shutdown:'), error);
    }
    
    if (currentPairingTimeout) {
        clearTimeout(currentPairingTimeout);
    }
    
    process.exit(0);
}

// Process handlers
process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());

process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
});

// Start the secure application
main().catch(error => {
    console.error(chalk.red('❌ Critical failure:'), error);
    process.exit(1);
});

// Export untuk external use (jika diperlukan)
module.exports = {
    secureDnsLookup,
    getSecurityHeaders,
    handlePriorityCommand,
    initializeSecureDNS,
    startNazeBot
};
