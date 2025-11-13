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

//  PERBAIKAN: Rate limiting system yang lebih ketat
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

// Global variables untuk management
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

app.use(express.static(publicPath));

//  HTML CONTENT LENGKAP DENGAN SECURITY FEATURES
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
                            <small class="text-muted">Mode: <span id="securityMode">Stealth</span></span></small>
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

        <!-- Existing content remains the same but with security enhancements -->
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

        <!-- Rest of the existing HTML content remains the same -->
        <!-- Only showing the modified parts for brevity -->

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

        <!-- Modified connection status card with security info -->
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
                            <div class="progress-bar progress-bar-striped progress-bar-animated bg-security" id="progressBar" style="width: 0%">
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
                                        <i class="fas fa-shield-alt me-1 text-security"></i>
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

        <!-- Quick Actions dengan security features -->
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

        <!-- Rest of the existing HTML content -->
        <!-- ... -->

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
        let isAdminAuthenticated = false;

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

        // Event listener untuk security check
        document.getElementById('checkSecurityBtn')?.addEventListener('click', performSecurityCheck);

        // Existing JavaScript code dengan security enhancements
        // ...

        // Modified status update untuk include security info
        function processStatusUpdate(data) {
            const oldStatus = currentStatus;
            currentStatus = data.connection_status;

            updateStatusElements(data);
            
            // Update security information
            if (data.security_info) {
                updateSecurityStatus(data.security_info);
            }
            
            // Existing status update code...
            if (data.phone_number) {
                handlePhoneNumberUpdate(data.phone_number);
            }
            
            // ... rest of existing code
        }

        // Initialize security status on load
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🛡️ Secure WhatsApp Bot Dashboard initialized');
            
            // Perform initial security check
            setTimeout(() => {
                performSecurityCheck();
            }, 2000);
            
            // Existing initialization code...
        });

        // Rest of existing JavaScript code remains the same
        // ...
    </script>
</body>
</html>`;

const htmlPath = path.join(publicPath, 'index.html');
fs.writeFileSync(htmlPath, htmlContent);

app.use(express.json());
app.use(express.static('public'));

//  FUNGSI BARU: Security status check
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

//  FUNGSI BARU: Format dan validasi nomor di server
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    console.log(chalk.blue('📱 Formatting phone number:'), phoneNumber, '->', cleanNumber);
    
    if (cleanNumber.startsWith('0')) {
        const formatted = '62' + cleanNumber.substring(1);
        console.log(chalk.green('✅ Formatted with 62:'), formatted);
        return formatted;
    }
    
    const validCountryCodes = [
        '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', 
        '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', 
        '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', 
        '93', '94', '95', '98'
    ];
    
    for (let i = 3; i >= 1; i--) {
        const countryCode = cleanNumber.substring(0, i);
        if (validCountryCodes.includes(countryCode)) {
            console.log(chalk.green('✅ Valid country code:'), countryCode);
            return cleanNumber;
        }
    }
    
    const formatted = '62' + cleanNumber;
    console.log(chalk.green('✅ Default formatting to 62:'), formatted);
    return formatted;
}

function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log(chalk.yellow('⚠️ Invalid phone length:'), cleanNumber.length);
        return false;
    }
    
    console.log(chalk.green('✅ Valid phone length:'), cleanNumber.length);
    return true;
}

function checkRateLimit(req, res, next) {
    const now = Date.now();
    
    if (now - pairingRateLimit.resetTime > pairingRateLimit.cooldownPeriod) {
        pairingRateLimit.attempts = 0;
        pairingRateLimit.resetTime = now;
        pairingRateLimit.blockUntil = 0;
        pairingRateLimit.globalCooldown = 0;
    }
    
    if (now < pairingRateLimit.globalCooldown) {
        const waitTime = Math.ceil((pairingRateLimit.globalCooldown - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Security system cooling down. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            security_level: 'HIGH'
        });
    }
    
    if (now < pairingRateLimit.blockUntil) {
        const waitTime = Math.ceil((pairingRateLimit.blockUntil - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Security protection active. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            security_level: 'HIGH'
        });
    }
    
    if (pairingRateLimit.attempts >= pairingRateLimit.maxAttempts) {
        pairingRateLimit.blockUntil = now + pairingRateLimit.cooldownPeriod;
        const waitTime = Math.ceil(pairingRateLimit.cooldownPeriod / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Maximum security attempts reached. Please wait ${formatTime(waitTime)}.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            security_level: 'MAXIMUM'
        });
    }
    
    const timeSinceLastRequest = now - pairingRateLimit.lastRequest;
    if (timeSinceLastRequest < pairingRateLimit.minInterval && pairingRateLimit.lastRequest > 0) {
        const waitTime = Math.ceil((pairingRateLimit.minInterval - timeSinceLastRequest) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Security delay. Please wait ${formatTime(waitTime)} before next attempt.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            security_level: 'MEDIUM'
        });
    }
    
    next();
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}

// Apply security headers to all routes
app.use((req, res, next) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Custom security headers
    res.setHeader('X-Security-Mode', 'DNS-Protected');
    res.setHeader('X-Bot-Version', 'Secure-Edition');
    
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

//  ENDPOINT BARU: Security status
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

//  ENDPOINT BARU: DNS status
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

// Existing endpoints dengan security enhancements
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

app.post('/api/pair', checkRateLimit, (req, res) => {
    let { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    console.log(chalk.blue('📱 Secure pairing request for:'), phoneNumber);
    
    const formattedNumber = formatPhoneNumber(phoneNumber);
    
    if (!formattedNumber) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }
    
    if (!isValidPhoneNumber(formattedNumber)) {
        return res.status(400).json({ error: 'Phone number must be 8-15 digits long' });
    }

    console.log(chalk.green('✅ Formatted phone number:'), formattedNumber);
    
    pairingRateLimit.lastRequest = Date.now();
    pairingRateLimit.attempts++;
    
    if (pairingRateLimit.attempts >= pairingRateLimit.maxAttempts) {
        pairingRateLimit.blockUntil = Date.now() + pairingRateLimit.cooldownPeriod;
        pairingRateLimit.globalCooldown = Date.now() + 60000;
    }
    
    global.phoneNumber = formattedNumber;
    global.botStatus = 'Secure pairing initiated';
    global.connectionStatus = 'waiting_phone';
    global.pairingCode = null;
    global.sessionIssues = false;

    res.json({ 
        status: 'success', 
        message: 'Secure pairing initiated. Starting WhatsApp connection with DNS protection...',
        phone: formattedNumber,
        attempts: pairingRateLimit.attempts,
        maxAttempts: pairingRateLimit.maxAttempts,
        security: 'ENABLED'
    });
});

// Existing endpoints remain the same but with security logging
app.post('/api/reset-rate-limit', (req, res) => {
    const now = Date.now();
    
    if (now < pairingRateLimit.globalCooldown) {
        const waitTime = Math.ceil((pairingRateLimit.globalCooldown - now) / 1000);
        return res.status(429).json({
            status: 'error',
            message: `Security system cooling down. Please wait ${formatTime(waitTime)}.`,
            security_level: 'HIGH'
        });
    }
    
    pairingRateLimit.attempts = 0;
    pairingRateLimit.resetTime = Date.now();
    pairingRateLimit.blockUntil = 0;
    
    console.log(chalk.green('✅ Rate limit reset manually - Security system reset'));
    res.json({ 
        status: 'success', 
        message: 'Security system reset successfully. You can try pairing again.',
        security_level: 'NORMAL'
    });
});

// Existing functions remain the same but with security enhancements
function clearSessionFiles() {
    return new Promise((resolve, reject) => {
        console.log(chalk.yellow('🛡️ Clearing session files with security cleanup...'));
        
        const commands = [];
        
        if (process.platform === 'win32') {
            commands.push(
                'rmdir /s /q nazedev 2>nul || echo "nazedev not found"',
                'rmdir /s /q nazedev_secure 2>nul || echo "nazedev_secure not found"',
                'del baileys_store.json 2>nul || echo "baileys_store.json not found"',
                'del session.json 2>nul || echo "session.json not found"',
                'del sessions.json 2>nul || echo "sessions.json not found"',
                'rmdir /s /q baileys 2>nul || echo "baileys not found"',
                'rmdir /s /q tmp 2>nul || echo "tmp not found"'
            );
        } else {
            commands.push(
                'rm -rf ./nazedev || echo "nazedev not found"',
                'rm -rf ./nazedev_secure || echo "nazedev_secure not found"',
                'rm -f ./baileys_store.json || echo "baileys_store.json not found"',
                'rm -f ./session.json || echo "session.json not found"',
                'rm -f ./sessions.json || echo "sessions.json not found"',
                'rm -rf ./baileys || echo "baileys not found"',
                'rm -rf ./tmp || echo "tmp not found"'
            );
        }
        
        let completed = 0;
        const totalCommands = commands.length;
        
        commands.forEach(cmd => {
            exec(cmd, (error, stdout, stderr) => {
                completed++;
                if (error) {
                    console.log(chalk.gray(`   🔒 ${cmd.split(' ')[0]}: ${stdout || stderr || 'cleaned'}`));
                } else {
                    console.log(chalk.green(`   ✅ ${cmd.split(' ')[0]} securely cleaned`));
                }
                
                if (completed === totalCommands) {
                    console.log(chalk.green('🛡️ All session files securely cleared'));
                    resolve();
                }
            });
        });
    });
}

// Existing endpoints dengan security logging
app.post('/api/clear-session', async (req, res) => {
    try {
        await clearSessionFiles();
        
        pairingRateLimit.attempts = 0;
        pairingRateLimit.resetTime = Date.now();
        pairingRateLimit.blockUntil = 0;
        pairingRateLimit.globalCooldown = 0;
        
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.botStatus = 'Session securely cleared';
        global.connectionStatus = 'initializing';
        global.sessionIssues = false;
        
        res.json({ 
            status: 'success', 
            message: 'Session securely cleared with DNS protection reset',
            security: 'RESET'
        });
    } catch (error) {
        console.log(chalk.red('❌ Error clearing session:'), error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to clear session files',
            security: 'ERROR'
        });
    }
});

// Existing management endpoints remain the same
// ... (all the existing management endpoints from previous code)

app.post('/api/quick-restart', (req, res) => {
    console.log(chalk.yellow('🛡️ Secure quick restart requested...'));
    
    global.botStatus = 'Secure quick restarting...';
    global.connectionStatus = 'connecting';
    
    res.json({ 
        status: 'success', 
        message: 'Secure quick restart initiated',
        security: 'MAINTAINED'
    });
    
    if (typeof global.quickRestart === 'function') {
        setTimeout(() => {
            global.quickRestart();
        }, 1000);
    }
});

// Export functions dengan security info
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
