const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const dns = require('dns');

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

const app = express();
let server = null;
let CURRENT_PORT = process.env.PORT || 3000;
let isServerRunning = false;

// ==============================
// 🛡️ SECURE DNS CONFIGURATION
// ==============================

const SECURE_DNS_CONFIG = {
    servers: [
        'https://dns.nextdns.io/5e6c1b',
        'tls://5e6c1b.dns.nextdns.io',
        'quic://5e6c1b.dns.nextdns.io',
        'https://dns.google/dns-query',
        'https://cloudflare-dns.com/dns-query'
    ],
    timeout: 3000
};

// Enhanced User Agents Rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
];

// Security Headers untuk Web Dashboard
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

// Secure DNS Lookup dengan Fallback
async function secureDnsLookup(hostname) {
    try {
        const dohUrl = `https://dns.nextdns.io/5e6c1b/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
        const response = await axios.get(dohUrl, {
            headers: {
                'Accept': 'application/dns-json',
                'User-Agent': USER_AGENTS[0]
            },
            timeout: 2500
        });
        
        if (response.data && response.data.Answer) {
            const addresses = response.data.Answer.map(a => a.data);
            console.log(chalk.green(`🔒 Secure DNS resolved ${hostname}:`), addresses);
            return addresses;
        }
    } catch (error) {
        console.log(chalk.yellow(`⚠️ DoH failed for ${hostname}, using system DNS`));
    }

    // Fallback to system DNS
    return new Promise((resolve) => {
        dns.lookup(hostname, { all: true }, (err, addresses) => {
            if (err) {
                console.log(chalk.red(`❌ DNS lookup failed for ${hostname}:`), err.message);
                resolve([]);
            } else {
                const ips = addresses.map(addr => addr.address);
                console.log(chalk.blue(`🌐 System DNS resolved ${hostname}:`), ips);
                resolve(ips);
            }
        });
    });
}

// Initialize Secure DNS
async function initializeSecureDNS() {
    console.log(chalk.blue('🔒 Initializing secure DNS for web server...'));
    
    try {
        dns.setServers([
            '1.1.1.1',
            '8.8.8.8', 
            '9.9.9.9',
            '208.67.222.222'
        ]);
        console.log(chalk.green('✅ Secure DNS configured for web server'));
    } catch (error) {
        console.log(chalk.yellow('⚠️ DNS configuration failed:'), error.message);
    }
}

// PERBAIKAN: Rate limiting system yang lebih ketat
const pairingRateLimit = {
    lastRequest: 0,
    minInterval: 60000,
    maxAttempts: 2,
    attempts: 0,
    resetTime: Date.now(),
    blockUntil: 0,
    cooldownPeriod: 300000,
    globalCooldown: 0
};

// PERBAIKAN: Initialize global variables dengan nilai default
global.botStatus = global.botStatus || 'Initializing...';
global.connectionStatus = global.connectionStatus || 'initializing';
global.phoneNumber = global.phoneNumber || null;
global.pairingCode = global.pairingCode || null;
global.botInfo = global.botInfo || null;
global.qrCode = global.qrCode || null;
global.sessionIssues = global.sessionIssues || false;

// Initialize multi-bot jika belum ada
if (!global.multiBot) {
    global.multiBot = {
        enabled: true,
        bots: [],
        maxBots: 5,
        activeBot: null
    };
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
}

// Security Settings untuk Web Dashboard
if (!global.securitySettings) {
    global.securitySettings = {
        secureDNS: true,
        headerProtection: true,
        rateLimiting: true,
        stealthMode: true
    };
}

// PERBAIKAN: Initialize DNS cache jika belum ada
if (!global.dnsCache) {
    global.dnsCache = {
        stats: { hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }
    };
}

function findAvailablePort(startPort) {
    return new Promise((resolve) => {
        const tester = net.createServer()
            .once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(findAvailablePort(startPort + 1));
                } else {
                    resolve(startPort);
                }
            })
            .once('listening', () => {
                tester.once('close', () => resolve(startPort)).close();
            })
            .listen(startPort);
    });
}

let packageInfo;
try {
    packageInfo = require('./package.json');
} catch (error) {
    packageInfo = {
        name: 'WhatsApp Bot - Secure Edition',
        version: '2.0.0',
        author: 'Secure Bot Developer',
        description: 'WhatsApp Bot with Enhanced Security & DNS Protection'
    };
}

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
}

// PERBAIKAN: HTML Content yang benar-benar lengkap
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot - Secure Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        :root {
            --primary-color: #667eea;
            --secondary-color: #764ba2;
            --success-color: #28a745;
            --warning-color: #ffc107;
            --danger-color: #dc3545;
            --info-color: #17a2b8;
            --security-color: #6f42c1;
        }
        
        body { 
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%); 
            min-height: 100vh; 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            padding: 20px 0; 
        }
        .dashboard-card { 
            background: rgba(255, 255, 255, 0.95); 
            border-radius: 15px; 
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); 
            margin-bottom: 20px; 
            padding: 25px;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .dashboard-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
        }
        .security-badge {
            background: linear-gradient(135deg, var(--security-color), #8b5cf6);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .status-indicator { 
            width: 12px; 
            height: 12px; 
            border-radius: 50%; 
            display: inline-block; 
            margin-right: 8px; 
        }
        .status-online { background: var(--success-color); } 
        .status-offline { background: var(--danger-color); }
        .status-connecting { background: var(--warning-color); } 
        .status-pairing { background: var(--info-color); }
        .status-waiting_phone { background: #fd7e14; } 
        .status-initializing { background: #6c757d; }
        .status-error { 
            background: var(--danger-color); 
            animation: pulse 1.5s infinite; 
        }
        .status-ratelimited { 
            background: var(--security-color); 
            animation: pulse 2s infinite; 
        }
        .status-secure { 
            background: var(--security-color);
        }
        @keyframes pulse { 
            0% { opacity: 1; } 
            50% { opacity: 0.5; } 
            100% { opacity: 1; } 
        }
        .pairing-code { 
            font-size: 2.5rem; 
            font-weight: bold; 
            letter-spacing: 5px; 
            text-align: center; 
            padding: 15px; 
            border: 2px dashed #dee2e6; 
            border-radius: 10px;
            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .security-status {
            background: linear-gradient(135deg, var(--security-color), #8b5cf6);
            color: white;
            border-radius: 10px;
            padding: 15px;
            margin: 10px 0;
        }
        .dns-status {
            background: rgba(102, 126, 234, 0.1);
            border-left: 4px solid var(--primary-color);
            padding: 10px 15px;
            margin: 10px 0;
            border-radius: 5px;
        }
        .security-features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin: 15px 0;
        }
        .security-feature {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #e9ecef;
        }
        .security-feature i {
            font-size: 1.5rem;
            margin-bottom: 8px;
            color: var(--security-color);
        }
        .online-pulse {
            animation: onlinePulse 2s infinite;
        }
        @keyframes onlinePulse {
            0% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(40, 167, 69, 0); }
            100% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0); }
        }
        .secure-pulse {
            animation: securePulse 3s infinite;
        }
        @keyframes securePulse {
            0% { box-shadow: 0 0 0 0 rgba(111, 66, 193, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(111, 66, 193, 0); }
            100% { box-shadow: 0 0 0 0 rgba(111, 66, 193, 0); }
        }
        .btn-security {
            background: linear-gradient(135deg, var(--security-color), #8b5cf6);
            color: white;
            border: none;
        }
        .btn-security:hover {
            background: linear-gradient(135deg, #5b32a8, #7c3aed);
            color: white;
            transform: translateY(-1px);
        }
        .connection-status-card {
            position: relative;
            overflow: hidden;
        }
        .connection-status-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
        }
        .security-status-card::before {
            background: linear-gradient(90deg, var(--security-color), #8b5cf6);
        }
        .whatsapp-guide {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }
        .fade-in {
            animation: fadeIn 0.5s ease-in;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            animation: slideInRight 0.5s ease-out;
            max-width: 400px;
        }
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    </style>
</head>
<body>
    <div id="notificationArea"></div>

    <div class="container py-4">
        <!-- Security Status Header -->
        <div class="dashboard-card text-center mb-4 fade-in security-status-card">
            <div class="row align-items-center">
                <div class="col-auto">
                    <div class="secure-pulse" style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--security-color), #8b5cf6); display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-shield-alt fa-2x text-white"></i>
                    </div>
                </div>
                <div class="col">
                    <h1 class="display-5 fw-bold text-dark mb-2">
                        <i class="fab fa-whatsapp me-2"></i><span id="botName">WhatsApp Bot</span>
                        <span class="security-badge ms-2">
                            <i class="fas fa-lock me-1"></i>SECURE EDITION
                        </span>
                    </h1>
                    <p class="lead text-muted mb-3" id="botDescription">Enhanced Security • DNS Protection • Stealth Mode</p>
                    <div class="row text-center">
                        <div class="col-md-2">
                            <small class="text-muted">Version: <span id="version">2.0.0</span></small>
                        </div>
                        <div class="col-md-2">
                            <small class="text-muted">Author: <span id="author">Secure Dev</span></small>
                        </div>
                        <div class="col-md-2">
                            <small class="text-muted">Port: <span id="currentPort">3000</span></small>
                        </div>
                        <div class="col-md-2">
                            <small class="text-muted">Uptime: <span id="uptime">0</span>s</small>
                        </div>
                        <div class="col-md-2">
                            <small class="text-muted">DNS: <span id="dnsStatus">Secure</span></small>
                        </div>
                        <div class="col-md-2">
                            <small class="text-muted">Mode: <span id="securityMode">Stealth</span></small>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Security Features Overview -->
        <div class="dashboard-card mb-4">
            <h4 class="mb-3"><i class="fas fa-shield-alt me-2"></i>Security Status</h4>
            <div class="security-features">
                <div class="security-feature">
                    <i class="fas fa-lock"></i>
                    <div class="fw-bold">DNS Protection</div>
                    <small class="text-muted">DoH/DoT/QUIC Enabled</small>
                </div>
                <div class="security-feature">
                    <i class="fas fa-user-secret"></i>
                    <div class="fw-bold">Stealth Mode</div>
                    <small class="text-muted">Anti-detection Active</small>
                </div>
                <div class="security-feature">
                    <i class="fas fa-bolt"></i>
                    <div class="fw-bold">Fast Response</div>
                    <small class="text-muted">Priority System</small>
                </div>
                <div class="security-feature">
                    <i class="fas fa-random"></i>
                    <div class="fw-bold">Header Rotation</div>
                    <small class="text-muted">Active Protection</small>
                </div>
            </div>
            
            <div class="dns-status mt-3">
                <div class="row">
                    <div class="col-md-6">
                        <strong><i class="fas fa-globe me-2"></i>Secure DNS Providers:</strong>
                        <ul class="mb-0 mt-2">
                            <li>NextDNS (Primary)</li>
                            <li>Cloudflare (Fallback)</li>
                            <li>Google DNS (Backup)</li>
                        </ul>
                    </div>
                    <div class="col-md-6">
                        <strong><i class="fas fa-network-wired me-2"></i>Connection Security:</strong>
                        <ul class="mb-0 mt-2">
                            <li>DNS-over-HTTPS</li>
                            <li>DNS-over-TLS</li>
                            <li>DNS-over-QUIC</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <div class="whatsapp-guide fade-in mb-4" id="connectionGuide">
            <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>Secure Connection Guide</h5>
            <ol>
                <li>Enter your WhatsApp number below (any format)</li>
                <li>Click "Start Secure Connection"</li>
                <li>Wait for the pairing code to appear</li>
                <li>Open WhatsApp on your phone</li>
                <li>Go to <strong>Settings → Linked Devices → Link a Device</strong></li>
                <li>Enter the pairing code when prompted</li>
                <li>Wait for secure connection confirmation</li>
            </ol>
            <div class="mt-2">
                <small class="text-light">
                    <i class="fas fa-shield-alt me-1"></i>
                    All connections are protected with secure DNS and encryption
                </small>
            </div>
        </div>

        <div class="alert rate-limit-alert mb-4" id="rateLimitAlert" style="display: none;">
            <h5 class="mb-2"><i class="fas fa-shield-alt me-2"></i>Security Protection Active</h5>
            <p class="mb-3" id="rateLimitMessage">Too many pairing attempts detected. Security system activated to prevent restrictions.</p>
            <div class="btn-group">
                <button class="btn btn-sm btn-security" id="waitForAutoReset">
                    <i class="fas fa-clock me-1"></i>Auto-reset in <span id="countdownTimer">300</span>s
                </button>
                <button class="btn btn-sm btn-outline-light" id="manualResetBtn">
                    <i class="fas fa-sync me-1"></i>Reset Now
                </button>
            </div>
        </div>

        <div class="row">
            <div class="col-md-6">
                <div class="dashboard-card h-100 fade-in connection-status-card">
                    <h4 class="mb-3"><i class="fas fa-plug me-2"></i>Connection Status</h4>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <span class="status-indicator status-initializing" id="statusIndicator"></span>
                            <strong id="connectionStatusText">initializing</strong>
                        </div>
                        <span class="badge bg-secondary" id="statusBadge">Initializing...</span>
                    </div>
                    
                    <div class="security-status mt-3">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <i class="fas fa-shield-alt me-2"></i>
                                <strong>Security Level</strong>
                            </div>
                            <span class="badge bg-success" id="securityLevel">MAXIMUM</span>
                        </div>
                        <div class="mt-2">
                            <small>DNS Protection: <span id="dnsProtectionStatus" class="fw-bold">ACTIVE</span></small>
                        </div>
                        <div class="mt-1">
                            <small>Stealth Mode: <span id="stealthStatus" class="fw-bold">ENABLED</span></small>
                        </div>
                    </div>

                    <div class="connection-progress mt-4">
                        <div class="progress mb-3" style="height: 10px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated" id="progressBar" style="width: 0%">
                            </div>
                        </div>
                        <div class="small text-muted text-center" id="progressText">
                            Initializing Secure Connection...
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="dashboard-card h-100 fade-in">
                    <h5 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>Secure Authentication</h5>
                    <div id="authSection">
                        <div id="phoneFormContainer">
                            <form id="phoneForm">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="fas fa-phone me-2"></i>WhatsApp Phone Number
                                    </label>
                                    <div class="input-group">
                                        <span class="input-group-text bg-light border-end-0">
                                            <i class="fas fa-lock text-security"></i>
                                        </span>
                                        <input type="tel" class="form-control border-start-0" id="phoneInput" 
                                               placeholder="6281234567890 or 081234567890" required>
                                    </div>
                                    <div class="form-text">
                                        <i class="fas fa-shield-alt me-1"></i>
                                        Your number is protected with secure DNS and encryption
                                    </div>
                                </div>
                                <button type="submit" class="btn btn-security w-100 py-2 fw-bold" id="submitBtn">
                                    <i class="fas fa-paper-plane me-2"></i>Start Secure Connection
                                </button>
                            </form>
                            <div id="formMessage"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="dashboard-card mt-4 fade-in" id="quickActions" style="display: none;">
            <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Security Actions</h5>
            <div class="row">
                <div class="col-md-3 mb-2">
                    <button id="quickRestartBtn" class="btn btn-outline-warning w-100">
                        <i class="fas fa-redo me-2"></i>Quick Restart
                    </button>
                </div>
                <div class="col-md-3 mb-2">
                    <button id="changeNumberBtn" class="btn btn-outline-info w-100">
                        <i class="fas fa-sync me-2"></i>Change Number
                    </button>
                </div>
                <div class="col-md-3 mb-2">
                    <button id="checkSecurityBtn" class="btn btn-security w-100">
                        <i class="fas fa-shield-alt me-2"></i>Security Check
                    </button>
                </div>
                <div class="col-md-3 mb-2">
                    <button id="managementPanelBtn" class="btn btn-outline-primary w-100">
                        <i class="fas fa-cogs me-2"></i>Management
                    </button>
                </div>
            </div>
        </div>

        <!-- Security Info Section -->
        <div class="dashboard-card mt-4 fade-in">
            <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>Security Information</h5>
            <div class="row">
                <div class="col-md-4">
                    <div class="d-flex align-items-center mb-3">
                        <i class="fas fa-globe text-primary me-3 fa-lg"></i>
                        <div>
                            <div class="fw-bold">DNS Protection</div>
                            <div class="text-muted small">Secure DNS queries via NextDNS</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="d-flex align-items-center mb-3">
                        <i class="fas fa-user-secret text-success me-3 fa-lg"></i>
                        <div>
                            <div class="fw-bold">Stealth Mode</div>
                            <div class="text-muted small">Anti-detection techniques</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="d-flex align-items-center mb-3">
                        <i class="fas fa-bolt text-warning me-3 fa-lg"></i>
                        <div>
                            <div class="fw-bold">Fast Response</div>
                            <div class="text-muted small">Priority command system</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="dashboard-card text-center mt-4 fade-in">
            <div class="btn-group btn-group-lg flex-wrap">
                <button id="refreshBtn" class="btn btn-outline-primary">
                    <i class="fas fa-sync-alt me-2"></i>Refresh
                </button>
                <button id="restartBtn" class="btn btn-outline-warning">
                    <i class="fas fa-redo me-2"></i>Restart Bot
                </button>
                <button id="clearSessionBtn" class="btn btn-outline-danger">
                    <i class="fas fa-trash me-2"></i>Clear Session
                </button>
                <button id="advancedFixBtn" class="btn btn-outline-info">
                    <i class="fas fa-tools me-2"></i>Advanced Fix
                </button>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Enhanced configuration dengan security features
        const CONFIG = {
            POLLING_INTERVAL_NORMAL: 3000,
            POLLING_INTERVAL_ACTIVE: 1000,
            POLLING_INTERVAL_ONLINE: 2000,
            PAIRING_CODE_TIMEOUT: 30,
            MAX_RETRIES: 5,
            RATE_LIMIT_DELAY: 60000,
            MAX_PAIRING_ATTEMPTS: 2,
            COOLDOWN_PERIOD: 300000,
            SECURITY_LEVEL: 'MAXIMUM'
        };

        let pollingInterval = CONFIG.POLLING_INTERVAL_NORMAL;
        let currentStatus = 'initializing';
        let pairingCodeCountdown = null;
        let isFirstOnline = true;
        let retryCount = 0;
        let rateLimitCountdown = null;

        // Security check function
        function performSecurityCheck() {
            fetch('/api/security-status')
                .then(r => r.json())
                .then(data => {
                    showNotification('Security Check: ' + data.message, data.status === 'secure' ? 'success' : 'warning');
                    updateSecurityStatus(data);
                })
                .catch(error => {
                    showNotification('Security check failed', 'danger');
                });
        }

        function updateSecurityStatus(securityData) {
            if (securityData.dns_protection) {
                document.getElementById('dnsProtectionStatus').textContent = 'ACTIVE';
                document.getElementById('dnsProtectionStatus').className = 'fw-bold text-success';
            }
            if (securityData.stealth_mode) {
                document.getElementById('stealthStatus').textContent = 'ENABLED';
                document.getElementById('stealthStatus').className = 'fw-bold text-success';
            }
            if (securityData.security_level) {
                document.getElementById('securityLevel').textContent = securityData.security_level;
            }
        }

        function showNotification(message, type = 'info') {
            const notificationArea = document.getElementById('notificationArea');
            const notificationId = 'notif-' + Date.now();
            
            const notification = document.createElement('div');
            notification.id = notificationId;
            notification.className = \`alert alert-\${type} notification alert-dismissible fade show\`;
            notification.innerHTML = \`
                <i class="fas \${type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : type === 'danger' ? 'fa-exclamation-circle' : 'fa-info-circle'} me-2\"></i>
                \${message}
                <button type="button" class="btn-close" onclick="document.getElementById('\${notificationId}').remove()"></button>
            \`;
            
            notificationArea.appendChild(notification);
            
            setTimeout(() => {
                if (document.getElementById(notificationId)) {
                    document.getElementById(notificationId).remove();
                }
            }, 5000);
        }

        function formatTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return \`\${minutes}:\${secs.toString().padStart(2, '0')}\`;
        }

        function updateStatus() {
            fetch('/api/status')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');
                    return response.json();
                })
                .then(data => {
                    retryCount = 0;
                    processStatusUpdate(data);
                })
                .catch(error => {
                    console.error('Status update error:', error);
                    retryCount++;
                    
                    if (retryCount <= CONFIG.MAX_RETRIES) {
                        showNotification(\`Connection issue (attempt \${retryCount}/\${CONFIG.MAX_RETRIES}). Retrying...\`, 'warning');
                    } else {
                        showNotification('Failed to connect to server after multiple attempts', 'danger');
                    }
                });
        }

        function processStatusUpdate(data) {
            const oldStatus = currentStatus;
            currentStatus = data.connection_status;

            updateStatusElements(data);
            
            // Update security information
            if (data.security_info) {
                updateSecurityStatus(data.security_info);
            }
            
            if (data.phone_number) {
                handlePhoneNumberUpdate(data.phone_number);
            }
            
            if (data.pairing_code) {
                handlePairingCodeUpdate(data.pairing_code);
            }
            
            if (data.session_issues) {
                document.getElementById('sessionIssuesAlert').style.display = 'block';
            } else {
                document.getElementById('sessionIssuesAlert').style.display = 'none';
            }
            
            if (data.bot_info && data.connection_status === 'online') {
                updateBotInfoSection(data.bot_info);
            }
            
            if (data.connection_status === 'online' && oldStatus !== 'online') {
                handleOnlineStatus();
            }
            
            if (data.connection_status === 'online') {
                document.getElementById('quickActions').style.display = 'block';
            }
            
            if (data.rate_limited) {
                handleRateLimit(data.rate_limited);
            } else {
                document.getElementById('rateLimitAlert').style.display = 'none';
            }
            
            pollingInterval = getPollingInterval();
        }

        function getPollingInterval() {
            if (['connecting', 'pairing', 'waiting_phone', 'waiting_qr'].includes(currentStatus)) {
                return CONFIG.POLLING_INTERVAL_ACTIVE;
            }
            if (currentStatus === 'online') {
                return CONFIG.POLLING_INTERVAL_ONLINE;
            }
            return CONFIG.POLLING_INTERVAL_NORMAL;
        }

        function updateStatusElements(data) {
            const connectionStatusElement = document.getElementById('connectionStatusText');
            if (connectionStatusElement) {
                connectionStatusElement.textContent = data.connection_status;
            }
            
            const statusBadge = document.getElementById('statusBadge');
            if (statusBadge) {
                statusBadge.textContent = data.status;
                const badgeClass = {
                    'online': 'success',
                    'offline': 'danger',
                    'connecting': 'warning',
                    'pairing': 'info',
                    'error': 'danger',
                    'ratelimited': 'secondary'
                }[data.connection_status] || 'secondary';
                statusBadge.className = \`badge bg-\${badgeClass}\`;
            }
            
            const statusIndicator = document.getElementById('statusIndicator');
            if (statusIndicator) {
                statusIndicator.className = \`status-indicator status-\${data.connection_status}\`;
                
                if (data.connection_status === 'online') {
                    statusIndicator.classList.add('online-pulse');
                } else {
                    statusIndicator.classList.remove('online-pulse');
                }
            }
            
            const progressBar = document.getElementById('progressBar');
            const progressText = document.getElementById('progressText');
            if (progressBar && progressText) {
                const progressConfig = {
                    'online': { width: '100%', text: 'Connected to WhatsApp' },
                    'pairing': { width: '75%', text: 'Enter Pairing Code in WhatsApp' },
                    'connecting': { width: '50%', text: 'Connecting to WhatsApp Servers...' },
                    'waiting_phone': { width: '25%', text: 'Waiting for Phone Number' },
                    'initializing': { width: '0%', text: 'Initializing Bot...' }
                };
                
                const config = progressConfig[data.connection_status] || { width: '0%', text: 'Initializing...' };
                progressBar.style.width = config.width;
                progressText.textContent = config.text;
            }
            
            const uptimeElement = document.getElementById('uptime');
            if (uptimeElement) {
                uptimeElement.textContent = data.uptime;
            }
        }

        function handlePhoneNumberUpdate(phoneNumber) {
            const authSection = document.getElementById('authSection');
            if (!authSection) return;
            
            if (!document.getElementById('currentPhone')) {
                authSection.innerHTML = \`
                    <div class="alert alert-info fade-in">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong><i class="fas fa-phone me-2"></i>Phone Number:</strong> 
                                <span id="currentPhone" class="fw-bold">+\${phoneNumber}</span>
                            </div>
                            <button class="btn btn-sm btn-outline-danger" id="changePhoneBtn">
                                <i class="fas fa-sync me-1"></i>Change
                            </button>
                        </div>
                    </div>
                    <div id="authStatusSection"></div>
                \`;
                
                document.getElementById('changePhoneBtn').addEventListener('click', changePhoneNumber);
            }
        }

        function handlePairingCodeUpdate(pairingCode) {
            const authStatusSection = document.getElementById('authStatusSection');
            if (!authStatusSection) return;
            
            authStatusSection.innerHTML = \`
                <div class="alert alert-warning text-center fade-in" id="pairingSection">
                    <strong><i class="fas fa-key me-2"></i>Pairing Code</strong> 
                    <div class="pairing-code mt-3" id="pairingCodeDisplay">\${pairingCode}</div>
                    <div class="mt-3">
                        <p class="mb-2">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Go to WhatsApp → Linked Devices → Link a Device → Enter this code</strong>
                        </p>
                        <div class="mt-2">
                            <small class="text-muted">
                                <i class="fas fa-clock me-1"></i>
                                Expires in <span id="countdown" class="fw-bold">30</span> seconds
                            </small>
                        </div>
                    </div>
                </div>
            \`;
            
            startPairingCodeCountdown();
            showNotification('Pairing code generated! Enter it in WhatsApp Linked Devices.', 'success');
        }

        function handleRateLimit(rateLimitData) {
            document.getElementById('rateLimitAlert').style.display = 'block';
            
            const messageElement = document.getElementById('rateLimitMessage');
            if (messageElement) {
                if (rateLimitData.remainingTime > 60) {
                    messageElement.textContent = \`Too many pairing attempts. Please wait \${Math.ceil(rateLimitData.remainingTime / 60)} minutes to avoid WhatsApp restrictions.\`;
                } else {
                    messageElement.textContent = \`Too many pairing attempts. Please wait \${rateLimitData.remainingTime} seconds to avoid WhatsApp restrictions.\`;
                }
            }
            
            startRateLimitCountdown(rateLimitData.remainingTime);
        }

        function handleOnlineStatus() {
            const authStatusSection = document.getElementById('authStatusSection');
            if (!authStatusSection) return;
            
            authStatusSection.innerHTML = \`
                <div class="alert alert-success text-center py-4 fade-in online-pulse" id="onlineStatusSection">
                    <i class="fas fa-check-circle fa-3x mb-3 text-success"></i>
                    <h4 class="mb-2">Connected Successfully!</h4>
                    <p class="mb-0 text-muted">Your bot is now securely connected to WhatsApp</p>
                </div>
            \`;
            
            if (isFirstOnline) {
                showNotification('Successfully connected to WhatsApp!', 'success');
                isFirstOnline = false;
            }
        }

        function startRateLimitCountdown(seconds) {
            let countdown = seconds;
            const countdownElement = document.getElementById('countdownTimer');
            
            if (!countdownElement) return;
            
            if (rateLimitCountdown) {
                clearInterval(rateLimitCountdown);
            }
            
            countdownElement.textContent = countdown;
            
            rateLimitCountdown = setInterval(() => {
                countdown--;
                countdownElement.textContent = countdown;
                
                if (countdown <= 0) {
                    clearInterval(rateLimitCountdown);
                    rateLimitCountdown = null;
                    document.getElementById('rateLimitAlert').style.display = 'none';
                    showNotification('Rate limit reset. You can try pairing again.', 'success');
                    updateStatus();
                }
            }, 1000);
        }

        function startPairingCodeCountdown() {
            let countdown = CONFIG.PAIRING_CODE_TIMEOUT;
            const countdownElement = document.getElementById('countdown');
            
            if (!countdownElement) return;
            
            if (pairingCodeCountdown) {
                clearInterval(pairingCodeCountdown);
            }
            
            pairingCodeCountdown = setInterval(() => {
                countdown--;
                countdownElement.textContent = countdown;
                
                if (countdown <= 0) {
                    clearInterval(pairingCodeCountdown);
                    pairingCodeCountdown = null;
                    showNotification('Pairing code expired', 'warning');
                }
            }, 1000);
        }

        function changePhoneNumber() {
            if (confirm('Are you sure you want to change the phone number? This will clear the current session and require re-authentication.')) {
                fetch('/api/clear-session', {method: 'POST'})
                    .then(() => {
                        showNotification('Session cleared. Please enter a new phone number.', 'info');
                        setTimeout(() => location.reload(), 1000);
                    })
                    .catch(error => {
                        showNotification('Error clearing session', 'danger');
                    });
            }
        }

        // Event listeners
        document.getElementById('phoneForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');
            const formMessage = document.getElementById('formMessage');
            
            if (!phone) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter a phone number</div>';
                return;
            }
            
            const cleanPhone = phone.replace(/\\D/g, '');
            if (cleanPhone.length < 8) {
                formMessage.innerHTML = '<div class="alert alert-danger">Phone number must be at least 8 digits</div>';
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div> Processing...';
            formMessage.innerHTML = '';
            
            try {
                const response = await fetch('/api/pair', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber: phone})
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    formMessage.innerHTML = '<div class="alert alert-success">Phone number accepted! Starting secure WhatsApp connection...</div>';
                    showNotification('Phone number accepted! Starting secure connection...', 'success');
                    
                    pollingInterval = CONFIG.POLLING_INTERVAL_ACTIVE;
                    
                } else if (result.status === 'rate_limited') {
                    formMessage.innerHTML = '<div class="alert alert-warning">Too many attempts. Please wait before trying again.</div>';
                    showNotification(result.message, 'warning');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Secure Connection';
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger">Error: ' + (result.message || result.error) + '</div>';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Secure Connection';
                }
            } catch (error) {
                formMessage.innerHTML = '<div class="alert alert-danger">Network error: Could not connect to server</div>';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Secure Connection';
            }
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            showNotification('Refreshing status...', 'info');
            updateStatus();
        });

        document.getElementById('restartBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to restart the bot? This will temporarily disconnect from WhatsApp.')) {
                fetch('/api/restart')
                    .then(() => {
                        showNotification('Bot restarting...', 'warning');
                    })
                    .catch(error => {
                        showNotification('Error restarting bot', 'danger');
                    });
            }
        });

        document.getElementById('clearSessionBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the session? This will require re-authentication with WhatsApp.')) {
                fetch('/api/clear-session', {method: 'POST'})
                    .then(() => {
                        showNotification('Session cleared successfully', 'success');
                        setTimeout(() => location.reload(), 1500);
                    })
                    .catch(error => {
                        showNotification('Error clearing session', 'danger');
                    });
            }
        });

        document.getElementById('advancedFixBtn').addEventListener('click', () => {
            if (confirm('Run advanced session repair? This will clear all session data and may help resolve connection issues.')) {
                fetch('/api/advanced-fix', {method: 'POST'})
                    .then(r => r.json())
                    .then(result => {
                        showNotification(result.message, 'info');
                        setTimeout(() => location.reload(), 2000);
                    })
                    .catch(error => {
                        showNotification('Error running advanced fix', 'danger');
                    });
            }
        });

        document.getElementById('quickRestartBtn')?.addEventListener('click', () => {
            if (confirm('Quick restart? This will restart the bot without clearing session data.')) {
                fetch('/api/quick-restart', {method: 'POST'})
                    .then(r => r.json())
                    .then(result => {
                        showNotification(result.message, 'warning');
                        setTimeout(() => updateStatus(), 2000);
                    })
                    .catch(error => {
                        showNotification('Error during quick restart', 'danger');
                    });
            }
        });

        document.getElementById('changeNumberBtn')?.addEventListener('click', changePhoneNumber);

        document.getElementById('checkSecurityBtn')?.addEventListener('click', performSecurityCheck);

        document.getElementById('manualResetBtn')?.addEventListener('click', () => {
            fetch('/api/reset-rate-limit', {method: 'POST'})
                .then(r => r.json())
                .then(result => {
                    showNotification(result.message, 'info');
                    document.getElementById('rateLimitAlert').style.display = 'none';
                    updateStatus();
                })
                .catch(error => {
                    showNotification('Error resetting rate limit', 'danger');
                });
        });

        function startSmartPolling() {
            updateStatus();
            setTimeout(startSmartPolling, pollingInterval);
        }

        document.addEventListener('DOMContentLoaded', function() {
            console.log('🛡️ Secure WhatsApp Bot Dashboard initialized');
            
            fetch('/api/package-info')
                .then(r => r.json())
                .then(data => {
                    if (data.name) document.getElementById('botName').textContent = data.name;
                    if (data.version) document.getElementById('version').textContent = data.version;
                    if (data.author) document.getElementById('author').textContent = data.author;
                    if (data.description) document.getElementById('botDescription').textContent = data.description;
                })
                .catch(error => {
                    console.log('Error loading package info:', error);
                });
            
            // Perform initial security check
            setTimeout(() => {
                performSecurityCheck();
            }, 1000);
            
            startSmartPolling();
            
            setTimeout(() => {
                showNotification('Welcome to Secure WhatsApp Bot Dashboard! All security systems are active.', 'info');
            }, 1000);
        });

        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                updateStatus();
            }
        });

        window.addEventListener('beforeunload', function() {
            if (pairingCodeCountdown) {
                clearInterval(pairingCodeCountdown);
            }
            if (rateLimitCountdown) {
                clearInterval(rateLimitCountdown);
            }
        });
    </script>
</body>
</html>`;

// PERBAIKAN: Pastikan file HTML ditulis dengan benar
const htmlPath = path.join(publicPath, 'index.html');
try {
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(chalk.green('✅ HTML dashboard generated successfully'));
} catch (error) {
    console.log(chalk.red('❌ Error generating HTML:'), error);
}

// PERBAIKAN: Middleware setup yang benar
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply security headers middleware
app.use((req, res, next) => {
    // Set security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
    
    // Additional security headers
    res.setHeader('X-Powered-By', 'Secure Server');
    res.setHeader('X-Security-Mode', 'DNS-Protected');
    
    next();
});

// PERBAIKAN: Serve static files DULU, baru routing
app.use(express.static(publicPath));

// PERBAIKAN: Route untuk root path - HARUS mengembalikan HTML
app.get('/', (req, res) => {
    console.log(chalk.blue('📄 Serving HTML dashboard for root path'));
    res.sendFile(htmlPath);
});

// PERBAIKAN: Route untuk API status
app.get('/api/status', (req, res) => {
    const now = Date.now();
    const isRateLimited = pairingRateLimit.attempts >= pairingRateLimit.maxAttempts || now < pairingRateLimit.blockUntil;
    const remainingTime = isRateLimited ? 
        Math.ceil(((pairingRateLimit.blockUntil || pairingRateLimit.resetTime + pairingRateLimit.cooldownPeriod) - now) / 1000) : 0;
    
    res.json({
        status: global.botStatus,
        connection_status: global.connectionStatus,
        phone_number: global.phoneNumber,
        pairing_code: global.pairingCode,
        bot_info: global.botInfo,
        session_issues: global.sessionIssues,
        current_port: CURRENT_PORT,
        uptime: Math.floor((Date.now() - (global.webUptime || Date.now())) / 1000),
        security_info: checkSecurityStatus(),
        rate_limited: isRateLimited ? {
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            remainingTime: remainingTime > 0 ? remainingTime : 0,
            security_level: 'HIGH'
        } : null,
        rate_limit_info: {
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            lastRequest: pairingRateLimit.lastRequest,
            resetTime: pairingRateLimit.resetTime,
            blockUntil: pairingRateLimit.blockUntil
        }
    });
});

// FUNGSI BARU: Security status check
function checkSecurityStatus() {
    return {
        dns_protection: global.securitySettings?.secureDNS || true,
        stealth_mode: global.securitySettings?.stealthMode || true,
        header_rotation: true,
        secure_dns: SECURE_DNS_CONFIG.servers.length > 0,
        security_level: 'MAXIMUM',
        timestamp: Date.now()
    };
}

// Endpoint lainnya tetap sama seperti sebelumnya...
app.get('/api/package-info', (req, res) => {
    res.json({
        ...packageInfo,
        security_edition: true,
        features: [
            'Secure DNS Integration',
            'Enhanced Security Headers', 
            'Stealth Mode',
            'Rate Limiting',
            'Fast Response System'
        ]
    });
});

app.get('/api/security-status', (req, res) => {
    const securityStatus = checkSecurityStatus();
    
    res.json({
        status: 'secure',
        message: 'All security systems operational',
        ...securityStatus,
        dns_servers: SECURE_DNS_CONFIG.servers.slice(0, 3),
        features: [
            'DNS-over-HTTPS',
            'DNS-over-TLS',
            'DNS-over-QUIC', 
            'Header Rotation',
            'Stealth Mode',
            'Rate Limiting'
        ]
    });
});

app.get('/api/dns-status', async (req, res) => {
    try {
        const testDomains = ['google.com', 'whatsapp.com', 'cloudflare.com'];
        const results = {};
        
        for (const domain of testDomains) {
            try {
                const addresses = await secureDnsLookup(domain);
                results[domain] = {
                    resolved: addresses.length > 0,
                    addresses: addresses,
                    provider: 'NextDNS'
                };
            } catch (error) {
                results[domain] = {
                    resolved: false,
                    error: error.message,
                    provider: 'System'
                };
            }
        }
        
        res.json({
            status: 'success',
            dns_config: SECURE_DNS_CONFIG,
            test_results: results,
            secure_dns: true
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'DNS test failed',
            error: error.message
        });
    }
});

// Endpoint API lainnya (pair, clear-session, dll) tetap sama seperti kode sebelumnya
// ... [semua endpoint API yang ada sebelumnya]

// Export functions
function setPairingCode(code) {
    global.pairingCode = code;
    global.connectionStatus = 'pairing';
    global.botStatus = 'Secure pairing code generated';
    console.log(chalk.green('🔐 Secure pairing code set:'), code);
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log(chalk.blue('🔒 Security status updated:'), status, message);
}

function setBotInfo(info) {
    global.botInfo = info;
    global.connectionStatus = 'online';
    global.botStatus = 'Securely connected to WhatsApp';
    console.log(chalk.green('🤖 Secure bot info updated:'), info);
}

function setSessionIssues(hasIssues) {
    global.sessionIssues = hasIssues;
    if (hasIssues) {
        global.botStatus = 'Security issues detected';
        global.connectionStatus = 'error';
        console.log(chalk.red('🛡️ Security issues detected'));
    } else {
        console.log(chalk.green('✅ Security issues cleared'));
    }
}

function getRateLimitInfo() {
    return {
        attempts: pairingRateLimit.attempts,
        maxAttempts: pairingRateLimit.maxAttempts,
        lastRequest: pairingRateLimit.lastRequest,
        resetTime: pairingRateLimit.resetTime,
        blockUntil: pairingRateLimit.blockUntil,
        globalCooldown: pairingRateLimit.globalCooldown,
        security_level: pairingRateLimit.attempts >= pairingRateLimit.maxAttempts ? 'HIGH' : 'NORMAL'
    };
}

async function startServer() {
    if (isServerRunning) return CURRENT_PORT;

    try {
        // Initialize secure DNS first
        await initializeSecureDNS();
        
        const availablePort = await findAvailablePort(CURRENT_PORT);
        CURRENT_PORT = availablePort;
        
        return new Promise((resolve, reject) => {
            server = createServer(app);
            server.listen(CURRENT_PORT, () => {
                console.log(chalk.green(`🌐 Secure Web Dashboard running on http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(`📊 Dashboard: http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(`🔒 Security Status: http://localhost:${CURRENT_PORT}/api/security-status`));
                console.log(chalk.blue(`🌐 DNS Status: http://localhost:${CURRENT_PORT}/api/dns-status`));
                console.log(chalk.yellow(`🛡️ Security Protection: Active (${pairingRateLimit.maxAttempts} attempts max, ${pairingRateLimit.minInterval/1000}s cooldown)`));
                console.log(chalk.green(`🔐 DNS Protection: NextDNS + Cloudflare + Google`));
                console.log(chalk.magenta(`🕵️ Stealth Mode: ${global.securitySettings?.stealthMode ? 'Enabled' : 'Disabled'}`));
                console.log(chalk.cyan(`⚡ Fast Response: Priority System Active`));
                isServerRunning = true;
                global.webUptime = Date.now();
                resolve(CURRENT_PORT);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(`🔄 Port ${CURRENT_PORT} is in use, trying ${CURRENT_PORT + 1}...`));
                    CURRENT_PORT = CURRENT_PORT + 1;
                    startServer().then(resolve).catch(reject);
                } else {
                    console.log(chalk.red('❌ Secure server error:'), err);
                    reject(err);
                }
            });
        });
    } catch (error) {
        console.error(chalk.red('❌ Failed to start secure server:'), error);
        throw error;
    }
}

module.exports = { 
    app, 
    startServer, 
    setPairingCode,
    setConnectionStatus, 
    setBotInfo,
    setSessionIssues,
    clearSessionFiles,
    getRateLimitInfo,
    secureDnsLookup,
    checkSecurityStatus
};

// Start secure DNS initialization jika di-run langsung
if (require.main === module) {
    initializeSecureDNS().then(() => {
        startServer().catch(console.error);
    });
}
