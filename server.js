const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');

// Koyeb-specific configuration
const IS_KOYEB = process.env.KOYEB_APP || process.env.NODE_ENV === 'production';
const KOYEB_PORT = process.env.PORT || 3000;
const KOYEB_HOST = '0.0.0.0';
const KOYEB_APP_NAME = process.env.KOYEB_APP_NAME || 'whatsapp-bot';
const KOYEB_SERVICE_NAME = process.env.KOYEB_SERVICE_NAME || 'whatsapp-service';

// Enhanced chalk implementation for Koyeb
let chalk;
try {
    chalk = require('chalk');
} catch (error) {
    chalk = new Proxy({}, {
        get: (target, prop) => (text) => String(text)
    });
}

const app = express();
let server = null;
let CURRENT_PORT = KOYEB_PORT;
let isServerRunning = false;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 3000;

// Koyeb Deployment Banner HTML
const deploymentBanner = `
<div class="deployment-banner">
    <div class="banner-content">
        <div class="banner-icon">🚀</div>
        <div class="banner-text">
            <h3>Koyeb Deployment Successful!</h3>
            <p>Your WhatsApp Bot has been successfully deployed on Koyeb Cloud.</p>
        </div>
    </div>
    <div class="banner-stats">
        <div class="stat-item">
            <span class="stat-label">Environment:</span>
            <span class="stat-value">Koyeb Cloud</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">App Name:</span>
            <span class="stat-value">${KOYEB_APP_NAME}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Service:</span>
            <span class="stat-value">${KOYEB_SERVICE_NAME}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Status:</span>
            <span class="stat-value ready">Ready</span>
        </div>
    </div>
</div>
`;

// Koyeb Rate limiting system
class KoyebRateLimit {
    constructor() {
        this.pairingRateLimit = {
            lastRequest: 0,
            minInterval: 45000,
            maxAttempts: 3,
            attempts: 0,
            resetTime: Date.now(),
            blockUntil: 0,
            cooldownPeriod: 240000,
            globalCooldown: 0
        };
        
        this.ipAttempts = new Map();
        this.suspiciousIPs = new Map();
        this.cleanupInterval = setInterval(() => this.cleanupOldEntries(), 45000);
    }

    checkIPLimit(ip) {
        const now = Date.now();
        const windowMs = 45000;
        const maxAttempts = 8;
        
        if (!this.ipAttempts.has(ip)) {
            this.ipAttempts.set(ip, []);
        }
        
        const attempts = this.ipAttempts.get(ip).filter(time => time > now - windowMs);
        this.ipAttempts.set(ip, attempts);
        
        if (attempts.length >= maxAttempts) {
            if (!this.suspiciousIPs.has(ip)) {
                this.suspiciousIPs.set(ip, now);
                console.log(chalk.red(`🚨 Koyeb suspicious activity from IP: ${ip}`));
            }
            return false;
        }
        
        attempts.push(now);
        return true;
    }

    isSuspiciousIP(ip) {
        const markedTime = this.suspiciousIPs.get(ip);
        if (!markedTime) return false;
        
        if (Date.now() - markedTime > 2700000) {
            this.suspiciousIPs.delete(ip);
            return false;
        }
        
        return true;
    }

    cleanupOldEntries() {
        const now = Date.now();
        const windowMs = 45000;
        
        for (const [ip, attempts] of this.ipAttempts.entries()) {
            const filtered = attempts.filter(time => time > now - windowMs);
            if (filtered.length === 0) {
                this.ipAttempts.delete(ip);
            } else {
                this.ipAttempts.set(ip, filtered);
            }
        }
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

const koyebRateLimit = new KoyebRateLimit();

// Koyeb security middleware
function koyebSecurityMiddleware(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    
    if (koyebRateLimit.isSuspiciousIP(clientIP)) {
        return res.status(403).json({
            status: 'error',
            message: 'Koyeb: Access denied due to suspicious activity'
        });
    }
    
    if (!koyebRateLimit.checkIPLimit(clientIP)) {
        return res.status(429).json({
            status: 'error',
            message: 'Koyeb: Too many requests from your IP address'
        });
    }
    
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    next();
}

app.use(koyebSecurityMiddleware);

// Koyeb global variables
global.botStatus = '🚀 Starting Koyeb WhatsApp Bot...';
global.connectionStatus = 'initializing';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;
global.qrCode = null;
global.sessionIssues = false;

// Koyeb multi-bot initialization
if (!global.multiBot) {
    global.multiBot = {
        enabled: false,
        bots: [],
        maxBots: 1,
        activeBot: null
    };
}

// Koyeb web settings
if (!global.webSettings) {
    global.webSettings = {
        allowOwnerChange: true,
        allowPremiumManagement: false,
        allowBotSettings: true,
        allowMultiBot: false,
        adminPassword: crypto.createHash('sha256').update('koyeb@bot123').digest('hex'),
        maxLoginAttempts: 3,
        sessionTimeout: 1800000,
        corsOrigins: ['*']
    };
}

// Koyeb port finding
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
            .listen(startPort, KOYEB_HOST);
    });
}

let packageInfo;
try {
    packageInfo = require('./package.json');
} catch (error) {
    packageInfo = {
        name: 'Koyeb WhatsApp Bot',
        version: '1.0.0',
        author: 'Koyeb Deployment',
        description: 'WhatsApp Bot optimized for Koyeb Cloud'
    };
}

// Koyeb public directory setup
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
}

app.use(express.static(publicPath));

// Koyeb HTML Content dengan deployment banner
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Koyeb WhatsApp Bot - Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        :root {
            --primary-color: #667eea;
            --secondary-color: #764ba2;
            --success-color: #28a745;
            --warning-color: #ffc107;
            --danger-color: #dc3545;
            --koyeb-color: #6f42c1;
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
        }
        .deployment-banner {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 20px;
            border-left: 5px solid var(--success-color);
        }
        .banner-content {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        .banner-icon {
            font-size: 3rem;
            margin-right: 20px;
        }
        .banner-text h3 {
            margin: 0;
            font-weight: bold;
        }
        .banner-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .stat-item {
            background: rgba(255,255,255,0.1);
            padding: 10px 15px;
            border-radius: 10px;
            display: flex;
            justify-content: between;
        }
        .stat-label {
            font-weight: bold;
            margin-right: 10px;
        }
        .stat-value.ready {
            color: #28a745;
            font-weight: bold;
        }
        .koyeb-badge {
            background: linear-gradient(135deg, var(--koyeb-color), #8e44ad);
            color: white;
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 0.7rem;
            font-weight: bold;
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
        .status-pairing { background: var(--koyeb-color); }
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
        .koyeb-alert {
            border-left: 4px solid var(--koyeb-color);
            background: linear-gradient(135deg, var(--koyeb-color), #8e44ad);
            color: white;
        }
        .bot-avatar { 
            width: 80px; 
            height: 80px; 
            border-radius: 50%; 
            object-fit: cover; 
            border: 3px solid var(--primary-color); 
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
        .btn-primary {
            background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
            border: none;
        }
        .whatsapp-guide {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }
        .auto-start-badge {
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .retry-badge {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            color: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
    </style>
</head>
<body>
    <div id="notificationArea"></div>

    <div class="container py-4">
        <!-- Koyeb Deployment Banner -->
        ${deploymentBanner}

        <!-- Koyeb Header -->
        <div class="dashboard-card text-center mb-4 fade-in" id="headerCard">
            <div class="row align-items-center">
                <div class="col-auto">
                    <img src="https://cdn.pixabay.com/photo/2021/08/27/22/33/whatsapp-6579607_960_720.png" class="bot-avatar">
                </div>
                <div class="col">
                    <h1 class="display-5 fw-bold text-primary mb-2">
                        <i class="fab fa-whatsapp me-2"></i>Koyeb WhatsApp Bot
                        <span class="koyeb-badge ms-2">
                            <i class="fas fa-cloud me-1"></i>Cloud Optimized
                        </span>
                        <span class="auto-start-badge ms-2">
                            <i class="fas fa-bolt me-1"></i>Auto Start
                        </span>
                        <span class="retry-badge ms-2" id="retryBadge" style="display: none;">
                            <i class="fas fa-redo me-1"></i>Retrying...
                        </span>
                    </h1>
                    <p class="lead text-muted mb-3">WhatsApp Bot successfully deployed on Koyeb Cloud</p>
                    <div class="row text-center">
                        <div class="col-md-3">
                            <small class="text-muted">Port: <span id="currentPort">${KOYEB_PORT}</span></small>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">Host: <span>0.0.0.0</span></small>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">App: <span>${KOYEB_APP_NAME}</span></small>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">Status: <span class="text-success" id="deploymentStatus">Ready</span></small>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="alert koyeb-alert mb-4 fade-in">
            <h5 class="mb-2"><i class="fas fa-rocket me-2"></i>Koyeb Auto-Start Active</h5>
            <p class="mb-3">Your WhatsApp Bot has been automatically started and is ready for connection setup.</p>
            <div class="d-flex gap-2">
                <span class="badge bg-success">Auto Deploy</span>
                <span class="badge bg-info">Cloud Optimized</span>
                <span class="badge bg-warning">Auto Restart</span>
                <span class="badge bg-danger" id="retryCounter" style="display: none;">Retry: 0/5</span>
            </div>
        </div>

        <div class="whatsapp-guide fade-in mb-4" id="connectionGuide">
            <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>Koyeb Connection Guide</h5>
            <ol>
                <li>Enter your WhatsApp number below (any format)</li>
                <li>Click "Start WhatsApp Connection"</li>
                <li>Wait for the pairing code to appear</li>
                <li>Open WhatsApp on your phone</li>
                <li>Go to <strong>Settings → Linked Devices → Link a Device</strong></li>
                <li>Enter the pairing code when prompted</li>
                <li>Wait for connection confirmation</li>
            </ol>
            <div class="mt-3 p-2 bg-light rounded">
                <small><i class="fas fa-lightbulb me-2"></i><strong>Tip:</strong> The bot will automatically reconnect if the connection is lost.</small>
            </div>
        </div>

        <!-- Rest of the dashboard content remains the same -->
        <!-- Connection Status Card -->
        <div class="row">
            <div class="col-md-6">
                <div class="dashboard-card h-100 fade-in connection-status-card" id="connectionStatusCard">
                    <h4 class="mb-3"><i class="fas fa-plug me-2"></i>Koyeb Connection Status</h4>
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
                            Auto-starting Koyeb Bot...
                        </div>
                    </div>

                    <div class="mt-3 p-3 bg-light rounded" id="koyebStatus">
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">
                                <i class="fas fa-cloud me-1"></i>
                                Koyeb Cloud Status
                            </small>
                            <span class="badge bg-success" id="cloudStatus">Active</span>
                        </div>
                        <div class="mt-2">
                            <small class="text-muted" id="koyebAppInfo">App: ${KOYEB_APP_NAME}</small>
                        </div>
                        <div class="mt-1">
                            <small class="text-muted" id="koyebServiceInfo">Service: ${KOYEB_SERVICE_NAME}</small>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="dashboard-card h-100 fade-in">
                    <h5 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>Koyeb WhatsApp Authentication</h5>
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
                                        <i class="fas fa-info-circle me-1"></i>
                                        Koyeb cloud-optimized validation active
                                    </div>
                                    <div class="phone-examples mt-2">
                                        <small class="text-muted">
                                            <strong>Koyeb accepted formats:</strong><br>
                                            <code>6281234567890</code> (International)<br>
                                            <code>081234567890</code> (Local Indonesia)<br>
                                            <code>1234567890</code> (US)<br>
                                            <code>441234567890</code> (UK)
                                        </small>
                                    </div>
                                </div>
                                <button type="submit" class="btn btn-primary w-100 py-2 fw-bold" id="submitBtn">
                                    <i class="fas fa-paper-plane me-2"></i>Start Koyeb WhatsApp Connection
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
            <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Koyeb Quick Actions</h5>
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
                    <button id="checkSessionBtn" class="btn btn-outline-secondary w-100">
                        <i class="fas fa-search me-2"></i>Check Session
                    </button>
                </div>
                <div class="col-md-3 mb-2">
                    <button id="managementPanelBtn" class="btn btn-outline-primary w-100">
                        <i class="fas fa-cogs me-2"></i>Koyeb Settings
                    </button>
                </div>
            </div>
        </div>

        <div class="dashboard-card text-center mt-4 fade-in">
            <div class="btn-group btn-group-lg flex-wrap">
                <button id="refreshBtn" class="btn btn-outline-primary">
                    <i class="fas fa-sync-alt me-2"></i>Refresh Status
                </button>
                <button id="restartBtn" class="btn btn-outline-warning">
                    <i class="fas fa-redo me-2"></i>Restart Bot
                </button>
                <button id="clearSessionBtn" class="btn btn-outline-danger">
                    <i class="fas fa-trash me-2"></i>Clear Session
                </button>
                <button id="advancedFixBtn" class="btn btn-outline-info">
                    <i class="fas fa-tools me-2"></i>Koyeb Fix
                </button>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Koyeb-specific JavaScript configuration
        const CONFIG = {
            POLLING_INTERVAL_NORMAL: 4000,
            POLLING_INTERVAL_ACTIVE: 1500,
            POLLING_INTERVAL_ONLINE: 3000,
            PAIRING_CODE_TIMEOUT: 30,
            MAX_RETRIES: 5,
            AUTO_START_DELAY: 3000,
            RETRY_DELAY: 3000
        };

        let pollingInterval = CONFIG.POLLING_INTERVAL_NORMAL;
        let currentStatus = 'initializing';
        let isFirstLoad = true;
        let connectionRetries = 0;

        // Koyeb initialization
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 Koyeb WhatsApp Bot Dashboard initialized');
            
            // Show deployment success notification
            showNotification('🎉 Koyeb deployment successful! Bot is auto-starting...', 'success', 10000);
            
            // Start status polling immediately
            startSmartPolling();
            
            // Update UI with Koyeb info
            document.getElementById('koyebAppInfo').textContent = 'App: ${KOYEB_APP_NAME}';
            document.getElementById('koyebServiceInfo').textContent = 'Service: ${KOYEB_SERVICE_NAME}';
            
            // Auto-start indication
            setTimeout(() => {
                showNotification('🤖 Koyeb WhatsApp Bot is starting automatically...', 'info', 5000);
            }, 1000);
        });

        // Enhanced status polling for Koyeb with retry mechanism
        function updateStatus() {
            fetch('/api/status')
                .then(response => {
                    if (!response.ok) throw new Error('Koyeb network response was not ok');
                    return response.json();
                })
                .then(data => {
                    processKoyebStatusUpdate(data);
                    // Reset retry counter on successful connection
                    if (data.connection_status === 'online') {
                        connectionRetries = 0;
                        hideRetryIndicator();
                    }
                })
                .catch(error => {
                    console.error('Koyeb status update error:', error);
                    handleConnectionError();
                });
        }

        function handleConnectionError() {
            connectionRetries++;
            
            if (connectionRetries <= CONFIG.MAX_RETRIES) {
                showRetryIndicator();
                showNotification(`Koyeb connection issue, retrying... (${connectionRetries}/${CONFIG.MAX_RETRIES})`, 'warning', 3000);
                
                // Exponential backoff
                const backoffDelay = CONFIG.RETRY_DELAY * Math.pow(1.5, connectionRetries - 1);
                setTimeout(() => {
                    updateStatus();
                }, backoffDelay);
            } else {
                showNotification('❌ Koyeb connection failed after multiple retries. Please check your deployment.', 'danger', 10000);
                hideRetryIndicator();
            }
        }

        function showRetryIndicator() {
            const retryBadge = document.getElementById('retryBadge');
            const retryCounter = document.getElementById('retryCounter');
            
            if (retryBadge) retryBadge.style.display = 'inline-flex';
            if (retryCounter) {
                retryCounter.style.display = 'inline-flex';
                retryCounter.textContent = `Retry: ${connectionRetries}/${CONFIG.MAX_RETRIES}`;
            }
        }

        function hideRetryIndicator() {
            const retryBadge = document.getElementById('retryBadge');
            const retryCounter = document.getElementById('retryCounter');
            
            if (retryBadge) retryBadge.style.display = 'none';
            if (retryCounter) retryCounter.style.display = 'none';
        }

        function processKoyebStatusUpdate(data) {
            const oldStatus = currentStatus;
            currentStatus = data.connection_status;

            updateKoyebStatusElements(data);
            
            if (data.phone_number) {
                handlePhoneNumberUpdate(data.phone_number);
            }
            
            if (data.pairing_code) {
                handlePairingCodeUpdate(data.pairing_code);
            }
            
            if (data.bot_info && data.connection_status === 'online') {
                updateBotInfoSection(data.bot_info);
                showNotification('✅ Koyeb Bot successfully connected to WhatsApp!', 'success');
            }
            
            if (data.connection_status === 'online' && oldStatus !== 'online') {
                handleOnlineStatus();
            }
            
            if (data.connection_status === 'online') {
                document.getElementById('quickActions').style.display = 'block';
                document.getElementById('deploymentStatus').textContent = 'Connected';
                document.getElementById('deploymentStatus').className = 'text-success';
            }
            
            pollingInterval = getKoyebPollingInterval();
        }

        function getKoyebPollingInterval() {
            if (['connecting', 'pairing', 'waiting_phone', 'waiting_qr'].includes(currentStatus)) {
                return CONFIG.POLLING_INTERVAL_ACTIVE;
            }
            if (currentStatus === 'online') {
                return CONFIG.POLLING_INTERVAL_ONLINE;
            }
            return CONFIG.POLLING_INTERVAL_NORMAL;
        }

        function updateKoyebStatusElements(data) {
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
            }
            
            const progressBar = document.getElementById('progressBar');
            const progressText = document.getElementById('progressText');
            if (progressBar && progressText) {
                const progressConfig = {
                    'online': { width: '100%', text: '✅ Koyeb Bot connected to WhatsApp' },
                    'pairing': { width: '75%', text: '⌛ Enter pairing code in WhatsApp' },
                    'connecting': { width: '50%', text: '🔄 Koyeb Bot connecting to WhatsApp...' },
                    'waiting_phone': { width: '25%', text: '📱 Waiting for phone number' },
                    'initializing': { width: '0%', text: '🚀 Koyeb Bot initializing...' }
                };
                
                const config = progressConfig[data.connection_status] || { width: '0%', text: 'Initializing...' };
                progressBar.style.width = config.width;
                progressText.textContent = config.text;
            }
        }

        function startSmartPolling() {
            updateStatus();
            setTimeout(startSmartPolling, pollingInterval);
        }

        // Koyeb notification system
        function showNotification(message, type = 'info', duration = 5000) {
            const notificationArea = document.getElementById('notificationArea');
            const notificationId = 'koyeb-notif-' + Date.now();
            
            const icon = {
                'success': 'fa-check-circle',
                'warning': 'fa-exclamation-triangle',
                'danger': 'fa-exclamation-circle',
                'info': 'fa-info-circle'
            }[type] || 'fa-info-circle';

            const notification = document.createElement('div');
            notification.id = notificationId;
            notification.className = \`alert alert-\${type} notification alert-dismissible fade show\`;
            notification.innerHTML = \`
                <i class="fas \${icon} me-2\"></i>
                \${message}
                <button type="button" class="btn-close" onclick="document.getElementById('\${notificationId}').remove()"></button>
            \`;
            
            notificationArea.appendChild(notification);
            
            setTimeout(() => {
                if (document.getElementById(notificationId)) {
                    document.getElementById(notificationId).remove();
                }
            }, duration);
        }

        // Keep existing event handlers but update for Koyeb
        document.getElementById('phoneForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');
            const formMessage = document.getElementById('formMessage');
            
            if (!phone) {
                formMessage.innerHTML = '<div class="alert alert-danger">Koyeb: Please enter a phone number</div>';
                return;
            }
            
            const cleanPhone = phone.replace(/\\D/g, '');
            if (cleanPhone.length < 8) {
                formMessage.innerHTML = '<div class="alert alert-danger">Koyeb: Phone number must be at least 8 digits</div>';
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div> Koyeb Processing...';
            formMessage.innerHTML = '';
            
            try {
                const response = await fetch('/api/pair', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber: phone})
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    formMessage.innerHTML = '<div class="alert alert-success">Koyeb: Phone number accepted! Starting WhatsApp connection...</div>';
                    showNotification('Koyeb: Phone number accepted! Starting connection...', 'success');
                    pollingInterval = CONFIG.POLLING_INTERVAL_ACTIVE;
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger">Koyeb Error: ' + (result.message || result.error) + '</div>';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Koyeb WhatsApp Connection';
                }
            } catch (error) {
                formMessage.innerHTML = '<div class="alert alert-danger">Koyeb network error</div>';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Koyeb WhatsApp Connection';
            }
        });

        // Enhanced cleanup for Koyeb
        window.addEventListener('beforeunload', function() {
            showNotification('Koyeb dashboard closing...', 'info', 2000);
        });
    </script>
</body>
</html>`;

const htmlPath = path.join(publicPath, 'index.html');
fs.writeFileSync(htmlPath, htmlContent);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Koyeb phone number formatting
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    console.log('Koyeb formatting phone number:', phoneNumber, '->', cleanNumber);
    
    if (cleanNumber.startsWith('0')) {
        const formatted = '62' + cleanNumber.substring(1);
        console.log('Koyeb formatted with 62:', formatted);
        return formatted;
    }
    
    return cleanNumber;
}

function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log('Koyeb invalid phone length:', cleanNumber.length);
        return false;
    }
    
    console.log('Koyeb valid phone length:', cleanNumber.length);
    return true;
}

// Koyeb rate limiting check
function checkKoyebRateLimit(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (koyebRateLimit.isSuspiciousIP(clientIP)) {
        return res.status(403).json({
            status: 'error',
            message: 'Koyeb: Access denied'
        });
    }
    
    if (!koyebRateLimit.checkIPLimit(clientIP)) {
        return res.status(429).json({
            status: 'rate_limited',
            message: 'Koyeb: Too many requests',
            remainingTime: 45
        });
    }
    
    const pairingRL = koyebRateLimit.pairingRateLimit;
    
    if (now - pairingRL.resetTime > pairingRL.cooldownPeriod) {
        pairingRL.attempts = 0;
        pairingRL.resetTime = now;
        pairingRL.blockUntil = 0;
        pairingRL.globalCooldown = 0;
    }
    
    if (now < pairingRL.globalCooldown) {
        const waitTime = Math.ceil((pairingRL.globalCooldown - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Koyeb: System cooling down. Wait ${waitTime}s`,
            remainingTime: waitTime
        });
    }
    
    if (now < pairingRL.blockUntil) {
        const waitTime = Math.ceil((pairingRL.blockUntil - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Koyeb: Too many attempts. Wait ${waitTime}s`,
            remainingTime: waitTime
        });
    }
    
    if (pairingRL.attempts >= pairingRL.maxAttempts) {
        pairingRL.blockUntil = now + pairingRL.cooldownPeriod;
        const waitTime = Math.ceil(pairingRL.cooldownPeriod / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Koyeb: Max attempts. Wait ${waitTime}s`,
            remainingTime: waitTime
        });
    }
    
    const timeSinceLastRequest = now - pairingRL.lastRequest;
    if (timeSinceLastRequest < pairingRL.minInterval && pairingRL.lastRequest > 0) {
        const waitTime = Math.ceil((pairingRL.minInterval - timeSinceLastRequest) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Koyeb: Wait ${waitTime}s`,
            remainingTime: waitTime
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

// Koyeb routes
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Koyeb API endpoints
app.get('/api/status', (req, res) => {
    const now = Date.now();
    const isRateLimited = koyebRateLimit.pairingRateLimit.attempts >= koyebRateLimit.pairingRateLimit.maxAttempts || now < koyebRateLimit.pairingRateLimit.blockUntil;
    const remainingTime = isRateLimited ? 
        Math.ceil(((koyebRateLimit.pairingRateLimit.blockUntil || koyebRateLimit.pairingRateLimit.resetTime + koyebRateLimit.pairingRateLimit.cooldownPeriod) - now) / 1000) : 0;
    
    res.json({
        status: global.botStatus,
        connection_status: global.connectionStatus,
        phone_number: global.phoneNumber,
        pairing_code: global.pairingCode,
        bot_info: global.botInfo,
        session_issues: global.sessionIssues,
        current_port: CURRENT_PORT,
        environment: 'Koyeb',
        app_name: KOYEB_APP_NAME,
        service_name: KOYEB_SERVICE_NAME,
        rate_limited: isRateLimited ? {
            attempts: koyebRateLimit.pairingRateLimit.attempts,
            maxAttempts: koyebRateLimit.pairingRateLimit.maxAttempts,
            remainingTime: remainingTime > 0 ? remainingTime : 0
        } : null
    });
});

app.get('/api/package-info', (req, res) => {
    res.json(packageInfo);
});

app.post('/api/pair', checkKoyebRateLimit, (req, res) => {
    let { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Koyeb: Phone number required' });
    }

    console.log('Koyeb raw phone number received:', phoneNumber);
    
    const formattedNumber = formatPhoneNumber(phoneNumber);
    
    if (!formattedNumber) {
        return res.status(400).json({ error: 'Koyeb: Invalid phone number format' });
    }
    
    if (!isValidPhoneNumber(formattedNumber)) {
        return res.status(400).json({ error: 'Koyeb: Phone number must be 8-15 digits' });
    }

    console.log('Koyeb formatted phone number:', formattedNumber);
    
    koyebRateLimit.pairingRateLimit.lastRequest = Date.now();
    koyebRateLimit.pairingRateLimit.attempts++;
    
    if (koyebRateLimit.pairingRateLimit.attempts >= koyebRateLimit.pairingRateLimit.maxAttempts) {
        koyebRateLimit.pairingRateLimit.blockUntil = Date.now() + koyebRateLimit.pairingRateLimit.cooldownPeriod;
        koyebRateLimit.pairingRateLimit.globalCooldown = Date.now() + 45000;
    }
    
    global.phoneNumber = formattedNumber;
    global.botStatus = 'Koyeb: Phone number received';
    global.connectionStatus = 'waiting_phone';
    global.pairingCode = null;
    global.sessionIssues = false;

    res.json({ 
        status: 'success', 
        message: 'Koyeb: Phone number accepted',
        phone: formattedNumber,
        attempts: koyebRateLimit.pairingRateLimit.attempts,
        maxAttempts: koyebRateLimit.pairingRateLimit.maxAttempts
    });
});

// Koyeb session management
function clearKoyebSessionFiles() {
    return new Promise((resolve, reject) => {
        console.log(chalk.yellow('🧹 Koyeb clearing session files...'));
        
        const commands = IS_KOYEB ? [
            'rm -rf /tmp/nazedev* || echo "nazedev not found"',
            'rm -f /tmp/koyeb_db.json || echo "koyeb_db.json not found"',
            'rm -f /tmp/koyeb_store.json || echo "koyeb_store.json not found"'
        ] : [
            'rm -rf ./nazedev || echo "nazedev not found"',
            'rm -f ./baileys_store.json || echo "baileys_store.json not found"',
            'rm -f ./database.json || echo "database.json not found"'
        ];
        
        let completed = 0;
        const totalCommands = commands.length;
        
        commands.forEach(cmd => {
            exec(cmd, (error, stdout, stderr) => {
                completed++;
                if (error) {
                    console.log(chalk.gray(`   🧹 ${cmd.split(' ')[0]}: ${stdout || stderr || 'cleaned'}`));
                } else {
                    console.log(chalk.green(`   ✅ ${cmd.split(' ')[0]} cleaned`));
                }
                
                if (completed === totalCommands) {
                    console.log(chalk.green('✅ Koyeb session files cleared'));
                    resolve();
                }
            });
        });
    });
}

app.post('/api/clear-session', async (req, res) => {
    try {
        await clearKoyebSessionFiles();
        
        koyebRateLimit.pairingRateLimit.attempts = 0;
        koyebRateLimit.pairingRateLimit.resetTime = Date.now();
        koyebRateLimit.pairingRateLimit.blockUntil = 0;
        koyebRateLimit.pairingRateLimit.globalCooldown = 0;
        
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.botStatus = 'Koyeb: Session cleared';
        global.connectionStatus = 'initializing';
        global.sessionIssues = false;
        
        res.json({ status: 'success', message: 'Koyeb: Session cleared successfully' });
    } catch (error) {
        console.log(chalk.red('❌ Koyeb error clearing session:'), error);
        res.status(500).json({ status: 'error', message: 'Koyeb: Failed to clear session' });
    }
});

// Koyeb server functions
function setPairingCode(code) {
    global.pairingCode = code;
    global.connectionStatus = 'pairing';
    global.botStatus = 'Koyeb: Pairing code generated';
    console.log('Koyeb pairing code set:', code);
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log('Koyeb status updated:', status, message);
}

function setBotInfo(info) {
    global.botInfo = info;
    global.connectionStatus = 'online';
    global.botStatus = 'Koyeb: Connected to WhatsApp';
    console.log('Koyeb bot info updated:', info);
}

function setSessionIssues(hasIssues) {
    global.sessionIssues = hasIssues;
    if (hasIssues) {
        global.botStatus = 'Koyeb: Session issues detected';
        global.connectionStatus = 'error';
        console.log('🚨 Koyeb session issues detected');
    } else {
        console.log('✅ Koyeb session issues cleared');
    }
}

function getRateLimitInfo() {
    return koyebRateLimit.pairingRateLimit;
}

// Koyeb server startup dengan deployment banner dan retry mechanism
async function startServer() {
    if (isServerRunning) return CURRENT_PORT;

    try {
        const availablePort = await findAvailablePort(CURRENT_PORT);
        CURRENT_PORT = availablePort;
        
        return new Promise((resolve, reject) => {
            server = createServer(app);
            server.listen(CURRENT_PORT, KOYEB_HOST, () => {
                // Koyeb Deployment Success Banner
                console.log(chalk.green.bold('╔══════════════════════════════════════════════════════════════╗'));
                console.log(chalk.green.bold('║                   KOYEB DEPLOYMENT SUCCESS!                 ║'));
                console.log(chalk.green.bold('╠══════════════════════════════════════════════════════════════╣'));
                console.log(chalk.green.bold('║                                                              ║'));
                console.log(chalk.green.bold('║  🎉 Your WhatsApp Bot has been successfully deployed!       ║'));
                console.log(chalk.green.bold('║  🌐 Web Dashboard is now available at:                      ║'));
                console.log(chalk.green.bold('║                                                              ║'));
                console.log(chalk.green.bold(`║      http://0.0.0.0:${CURRENT_PORT}                                ║`));
                console.log(chalk.green.bold('║                                                              ║'));
                console.log(chalk.green.bold('║  🤖 WhatsApp Bot will start automatically in 3 seconds      ║'));
                console.log(chalk.green.bold('║  📱 Ready for WhatsApp connection setup                    ║'));
                console.log(chalk.green.bold('║                                                              ║'));
                console.log(chalk.green.bold('║  📊 App: ' + KOYEB_APP_NAME.padEnd(43) + '║'));
                console.log(chalk.green.bold('║  🔧 Service: ' + KOYEB_SERVICE_NAME.padEnd(39) + '║'));
                console.log(chalk.green.bold('║  🚀 Environment: Koyeb Cloud' + ' '.repeat(31) + '║'));
                console.log(chalk.green.bold('║                                                              ║'));
                console.log(chalk.green.bold('╚══════════════════════════════════════════════════════════════╝'));
                
                console.log(chalk.cyan('🛡️  Koyeb Security: Auto-start ✓ Cloud Optimized ✓'));
                console.log(chalk.yellow('⚡ Koyeb Performance: Fast Startup ✓ Auto Recovery ✓'));
                
                isServerRunning = true;
                global.webUptime = Date.now();
                retryCount = 0; // Reset retry count on successful start
                resolve(CURRENT_PORT);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(`🔄 Koyeb port ${CURRENT_PORT} in use, trying ${CURRENT_PORT + 1}...`));
                    CURRENT_PORT = CURRENT_PORT + 1;
                    startServer().then(resolve).catch(reject);
                } else {
                    console.log(chalk.red('❌ Koyeb server error:'), err);
                    
                    // Retry mechanism for other errors
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        console.log(chalk.yellow(`🔄 Koyeb retrying server start... (${retryCount}/${MAX_RETRIES})`));
                        setTimeout(() => {
                            startServer().then(resolve).catch(reject);
                        }, RETRY_DELAY * retryCount);
                    } else {
                        console.log(chalk.red(`❌ Koyeb failed to start server after ${MAX_RETRIES} retries`));
                        reject(err);
                    }
                }
            });
        });
    } catch (error) {
        console.error('❌ Koyeb failed to start server:', error);
        
        // Retry mechanism for promise rejections
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(chalk.yellow(`🔄 Koyeb retrying server start... (${retryCount}/${MAX_RETRIES})`));
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retryCount));
            return startServer();
        } else {
            console.log(chalk.red(`❌ Koyeb failed to start server after ${MAX_RETRIES} retries`));
            throw error;
        }
    }
}

// Koyeb cleanup
process.on('SIGINT', () => {
    koyebRateLimit.destroy();
    if (server) {
        server.close();
    }
});

// Enhanced error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.log(chalk.red('🚨 Koyeb uncaught exception:'), error);
    // Don't exit the process, let Koyeb handle the restart
});

process.on('unhandledRejection', (reason, promise) => {
    console.log(chalk.red('🚨 Koyeb unhandled rejection at:'), promise, 'reason:', reason);
    // Don't exit the process, let Koyeb handle the restart
});

module.exports = { 
    app, 
    startServer, 
    setPairingCode,
    setConnectionStatus, 
    setBotInfo,
    setSessionIssues,
    clearSessionFiles: clearKoyebSessionFiles,
    getRateLimitInfo
};

if (require.main === module) {
    startServer().catch(console.error);
}
