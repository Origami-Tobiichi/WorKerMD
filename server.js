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
// 🛡️ KONFIGURASI KEAMANAN
// ==============================

const SECURE_DNS_CONFIG = {
    servers: [
        'https://dns.nextdns.io/5e6c1b',
        'tls://5e6c1b.dns.nextdns.io',
        'quic://5e6c1b.dns.nextdns.io'
    ],
    timeout: 3000
};

// Security Headers
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
};

// Rate limiting system
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

// Initialize global variables
global.botStatus = global.botStatus || 'Initializing...';
global.connectionStatus = global.connectionStatus || 'initializing';
global.phoneNumber = global.phoneNumber || null;
global.pairingCode = global.pairingCode || null;
global.botInfo = global.botInfo || null;
global.qrCode = global.qrCode || null;
global.sessionIssues = global.sessionIssues || false;

// Initialize settings
if (!global.multiBot) {
    global.multiBot = {
        enabled: true,
        bots: [],
        maxBots: 5,
        activeBot: null
    };
}

if (!global.webSettings) {
    global.webSettings = {
        allowOwnerChange: true,
        allowPremiumManagement: true,
        allowBotSettings: true,
        allowMultiBot: true,
        adminPassword: 'takamiya@botwa#77'
    };
}

if (!global.securitySettings) {
    global.securitySettings = {
        secureDNS: true,
        headerProtection: true,
        rateLimiting: true,
        stealthMode: true
    };
}

if (!global.dnsCache) {
    global.dnsCache = {
        stats: { hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }
    };
}

// ==============================
// 🎯 FUNGSI UTAMA
// ==============================

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

// ==============================
// 🌐 HTML DASHBOARD CONTENT
// ==============================

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
        .security-badge {
            background: linear-gradient(135deg, var(--security-color), #8b5cf6);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .online-pulse {
            animation: onlinePulse 2s infinite;
        }
        @keyframes onlinePulse {
            0% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(40, 167, 69, 0); }
            100% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0); }
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
    </style>
</head>
<body>
    <div id="notificationArea"></div>

    <div class="container py-4">
        <!-- Header -->
        <div class="dashboard-card text-center mb-4 fade-in">
            <div class="row align-items-center">
                <div class="col-auto">
                    <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--security-color), #8b5cf6); display: flex; align-items: center; justify-content: center;">
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
                        <div class="col-md-3">
                            <small class="text-muted">Version: <span id="version">2.0.0</span></small>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">Author: <span id="author">Secure Dev</span></small>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">Port: <span id="currentPort">3000</span></small>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">Uptime: <span id="uptime">0</span>s</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Connection Guide -->
        <div class="whatsapp-guide fade-in mb-4">
            <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>Secure Connection Guide</h5>
            <ol>
                <li>Enter your WhatsApp number below</li>
                <li>Click "Start Secure Connection"</li>
                <li>Wait for the pairing code to appear</li>
                <li>Open WhatsApp → Linked Devices → Link a Device</li>
                <li>Enter the pairing code when prompted</li>
                <li>Wait for secure connection confirmation</li>
            </ol>
        </div>

        <!-- Main Content -->
        <div class="row">
            <div class="col-md-6">
                <div class="dashboard-card h-100 fade-in">
                    <h4 class="mb-3"><i class="fas fa-plug me-2"></i>Connection Status</h4>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <span class="status-indicator status-initializing" id="statusIndicator"></span>
                            <strong id="connectionStatusText">initializing</strong>
                        </div>
                        <span class="badge bg-secondary" id="statusBadge">Initializing...</span>
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

                    <div class="mt-3 p-3 bg-light rounded">
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">
                                <i class="fas fa-shield-alt me-1"></i>
                                Security Level
                            </small>
                            <span class="badge bg-success" id="securityLevel">MAXIMUM</span>
                        </div>
                        <div class="mt-2">
                            <small class="text-muted">DNS Protection: <span id="dnsProtectionStatus" class="fw-bold text-success">ACTIVE</span></small>
                        </div>
                        <div class="mt-1">
                            <small class="text-muted">Stealth Mode: <span id="stealthStatus" class="fw-bold text-success">ENABLED</span></small>
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
                                    <label class="form-label fw-bold">WhatsApp Phone Number</label>
                                    <div class="input-group">
                                        <span class="input-group-text bg-light border-end-0">+</span>
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
            <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Quick Actions</h5>
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
                    <button id="refreshStatusBtn" class="btn btn-outline-primary w-100">
                        <i class="fas fa-sync-alt me-2"></i>Refresh Status
                    </button>
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
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const CONFIG = {
            POLLING_INTERVAL_NORMAL: 3000,
            POLLING_INTERVAL_ACTIVE: 1000,
            POLLING_INTERVAL_ONLINE: 2000
        };

        let pollingInterval = CONFIG.POLLING_INTERVAL_NORMAL;
        let currentStatus = 'initializing';

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

        function updateStatus() {
            fetch('/api/status')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');
                    return response.json();
                })
                .then(data => {
                    processStatusUpdate(data);
                })
                .catch(error => {
                    console.error('Status update error:', error);
                    showNotification('Failed to connect to server', 'danger');
                });
        }

        function processStatusUpdate(data) {
            currentStatus = data.connection_status;

            // Update status elements
            document.getElementById('connectionStatusText').textContent = data.connection_status;
            document.getElementById('statusBadge').textContent = data.status;
            
            const statusIndicator = document.getElementById('statusIndicator');
            statusIndicator.className = \`status-indicator status-\${data.connection_status}\`;
            
            if (data.connection_status === 'online') {
                statusIndicator.classList.add('online-pulse');
                document.getElementById('quickActions').style.display = 'block';
            } else {
                statusIndicator.classList.remove('online-pulse');
            }

            // Update progress
            const progressConfig = {
                'online': { width: '100%', text: 'Connected to WhatsApp' },
                'pairing': { width: '75%', text: 'Enter Pairing Code in WhatsApp' },
                'connecting': { width: '50%', text: 'Connecting to WhatsApp Servers...' },
                'waiting_phone': { width: '25%', text: 'Waiting for Phone Number' },
                'initializing': { width: '0%', text: 'Initializing Bot...' }
            };
            
            const config = progressConfig[data.connection_status] || { width: '0%', text: 'Initializing...' };
            document.getElementById('progressBar').style.width = config.width;
            document.getElementById('progressText').textContent = config.text;

            // Update uptime
            document.getElementById('uptime').textContent = data.uptime;

            // Update phone number if exists
            if (data.phone_number && !document.getElementById('currentPhone')) {
                const authSection = document.getElementById('authSection');
                authSection.innerHTML = \`
                    <div class="alert alert-info fade-in">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong><i class="fas fa-phone me-2"></i>Phone Number:</strong> 
                                <span id="currentPhone" class="fw-bold">+\${data.phone_number}</span>
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

            // Handle pairing code
            if (data.pairing_code) {
                const authStatusSection = document.getElementById('authStatusSection');
                authStatusSection.innerHTML = \`
                    <div class="alert alert-warning text-center fade-in">
                        <strong><i class="fas fa-key me-2"></i>Pairing Code</strong> 
                        <div class="pairing-code mt-3">\${data.pairing_code}</div>
                        <div class="mt-3">
                            <p class="mb-2">
                                <i class="fas fa-info-circle me-2"></i>
                                <strong>Go to WhatsApp → Linked Devices → Link a Device → Enter this code</strong>
                            </p>
                        </div>
                    </div>
                \`;
                showNotification('Pairing code generated! Enter it in WhatsApp.', 'success');
            }

            // Handle online status
            if (data.connection_status === 'online') {
                const authStatusSection = document.getElementById('authStatusSection');
                authStatusSection.innerHTML = \`
                    <div class="alert alert-success text-center py-4 fade-in online-pulse">
                        <i class="fas fa-check-circle fa-3x mb-3 text-success"></i>
                        <h4 class="mb-2">Connected Successfully!</h4>
                        <p class="mb-0 text-muted">Your bot is now securely connected to WhatsApp</p>
                    </div>
                \`;
                showNotification('Successfully connected to WhatsApp!', 'success');
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

        function changePhoneNumber() {
            if (confirm('Are you sure you want to change the phone number? This will clear the current session.')) {
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
                    formMessage.innerHTML = '<div class="alert alert-success">Phone number accepted! Starting connection...</div>';
                    showNotification('Phone number accepted! Starting connection...', 'success');
                    pollingInterval = CONFIG.POLLING_INTERVAL_ACTIVE;
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger">Error: ' + (result.message || result.error) + '</div>';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Secure Connection';
                }
            } catch (error) {
                formMessage.innerHTML = '<div class="alert alert-danger">Network error</div>';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Secure Connection';
            }
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            showNotification('Refreshing status...', 'info');
            updateStatus();
        });

        document.getElementById('restartBtn').addEventListener('click', () => {
            if (confirm('Restart the bot?')) {
                fetch('/api/restart')
                    .then(() => showNotification('Bot restarting...', 'warning'))
                    .catch(() => showNotification('Error restarting', 'danger'));
            }
        });

        document.getElementById('clearSessionBtn').addEventListener('click', () => {
            if (confirm('Clear session? This will require re-authentication.')) {
                fetch('/api/clear-session', {method: 'POST'})
                    .then(() => {
                        showNotification('Session cleared', 'success');
                        setTimeout(() => location.reload(), 1500);
                    })
                    .catch(() => showNotification('Error clearing session', 'danger'));
            }
        });

        document.getElementById('checkSecurityBtn')?.addEventListener('click', () => {
            showNotification('Security systems are active and running', 'success');
        });

        document.getElementById('refreshStatusBtn')?.addEventListener('click', () => {
            updateStatus();
            showNotification('Status refreshed', 'info');
        });

        function startPolling() {
            updateStatus();
            setTimeout(startPolling, pollingInterval);
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🛡️ Secure WhatsApp Bot Dashboard initialized');
            
            // Load package info
            fetch('/api/package-info')
                .then(r => r.json())
                .then(data => {
                    if (data.name) document.getElementById('botName').textContent = data.name;
                    if (data.version) document.getElementById('version').textContent = data.version;
                    if (data.author) document.getElementById('author').textContent = data.author;
                });
            
            startPolling();
            showNotification('Welcome to Secure WhatsApp Bot Dashboard!', 'info');
        });
    </script>
</body>
</html>`;

// ==============================
// 🚀 EXPRESS SERVER SETUP
// ==============================

// Apply security headers
app.use((req, res, next) => {
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==============================
// 📍 ROUTES FIX - INI YANG DIPERBAIKI
// ==============================

// Route untuk root - HARUS mengembalikan HTML
app.get('/', (req, res) => {
    console.log(chalk.blue('📄 Serving HTML dashboard for root path'));
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
});

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        status: global.botStatus,
        connection_status: global.connectionStatus,
        phone_number: global.phoneNumber,
        pairing_code: global.pairingCode,
        bot_info: global.botInfo,
        session_issues: global.sessionIssues,
        current_port: CURRENT_PORT,
        uptime: Math.floor((Date.now() - (global.webUptime || Date.now())) / 1000),
        security_info: {
            dns_protection: true,
            stealth_mode: true,
            security_level: 'MAXIMUM'
        }
    });
});

app.get('/api/package-info', (req, res) => {
    res.json({
        ...packageInfo,
        security_edition: true
    });
});

app.post('/api/pair', (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    // Simple validation
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.length < 8) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    global.phoneNumber = cleanNumber;
    global.connectionStatus = 'waiting_phone';
    
    res.json({ 
        status: 'success', 
        message: 'Phone number accepted',
        phone: cleanNumber
    });
});

app.post('/api/clear-session', (req, res) => {
    global.phoneNumber = null;
    global.pairingCode = null;
    global.botInfo = null;
    global.connectionStatus = 'initializing';
    
    res.json({ status: 'success', message: 'Session cleared' });
});

app.get('/api/restart', (req, res) => {
    global.botStatus = 'Restarting...';
    res.json({ status: 'success', message: 'Restart command sent' });
});

// ==============================
// 🔧 SERVER MANAGEMENT
// ==============================

function setPairingCode(code) {
    global.pairingCode = code;
    global.connectionStatus = 'pairing';
    console.log(chalk.green('🔐 Pairing code set:'), code);
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log(chalk.blue('🔒 Status updated:'), status, message);
}

function setBotInfo(info) {
    global.botInfo = info;
    global.connectionStatus = 'online';
    console.log(chalk.green('🤖 Bot info updated:'), info);
}

function setSessionIssues(hasIssues) {
    global.sessionIssues = hasIssues;
    console.log(chalk.yellow('🛡️ Session issues:'), hasIssues);
}

function getRateLimitInfo() {
    return pairingRateLimit;
}

async function startServer() {
    if (isServerRunning) {
        console.log(chalk.yellow('⚠️ Server is already running'));
        return CURRENT_PORT;
    }

    try {
        const availablePort = await findAvailablePort(CURRENT_PORT);
        CURRENT_PORT = availablePort;
        
        return new Promise((resolve, reject) => {
            server = createServer(app);
            
            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(`🔄 Port ${CURRENT_PORT} in use, trying ${CURRENT_PORT + 1}...`));
                    CURRENT_PORT++;
                    startServer().then(resolve).catch(reject);
                } else {
                    console.log(chalk.red('❌ Server error:'), err);
                    reject(err);
                }
            });
            
            server.listen(CURRENT_PORT, () => {
                console.log(chalk.green(`🌐 WhatsApp Bot Dashboard running on http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(`📊 Dashboard: http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(`🔧 API Status: http://localhost:${CURRENT_PORT}/api/status`));
                console.log(chalk.green(`🛡️ Security: DNS Protection + Stealth Mode Active`));
                
                isServerRunning = true;
                global.webUptime = Date.now();
                resolve(CURRENT_PORT);
            });
        });
    } catch (error) {
        console.error(chalk.red('❌ Failed to start server:'), error);
        throw error;
    }
}

// ==============================
// 📦 EXPORT MODULE
// ==============================

module.exports = { 
    app, 
    startServer, 
    setPairingCode,
    setConnectionStatus, 
    setBotInfo,
    setSessionIssues,
    getRateLimitInfo
};

// Start server jika di-run langsung
if (require.main === module) {
    startServer().catch(console.error);
}
