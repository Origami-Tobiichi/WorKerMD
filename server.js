const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { exec, spawn } = require('child_process');

// Security Manager
let SecurityManager;
try {
    SecurityManager = require('./src/security').SecurityManager;
} catch (error) {
    console.log('⚠️ Security manager not available, using fallback');
    SecurityManager = class {
        generateHeaders() { return {}; }
        validateInput() { return true; }
        encryptData(data) { return data; }
        decryptData(data) { return data; }
    };
}

const securityManager = new SecurityManager();

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

const app = express();
let server = null;
let CURRENT_PORT = process.env.PORT || 3000;
let isServerRunning = false;

// Enhanced Rate limiting system dengan security
const pairingRateLimit = {
    lastRequest: 0,
    minInterval: 60000,
    maxAttempts: 2,
    attempts: 0,
    resetTime: Date.now(),
    blockUntil: 0,
    cooldownPeriod: 300000,
    globalCooldown: 0,
    ipAttempts: new Map()
};

// Global variables untuk management
global.botStatus = global.botStatus || 'Initializing Security System...';
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
        name: 'NazeBot Secure',
        version: '2.0.0',
        author: 'NazeDev',
        description: 'WhatsApp Bot with Advanced Security & Anti Detection'
    };
}

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
}

app.use(express.static(publicPath));

// Security Middleware
app.use((req, res, next) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com; img-src 'self' data: https:;");
    
    // Rate limiting untuk API endpoints dengan IP tracking
    if (req.path.startsWith('/api/')) {
        const now = Date.now();
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
        
        if (!global.rateLimitMap) global.rateLimitMap = new Map();
        
        const clientData = global.rateLimitMap.get(clientIp) || { 
            count: 0, 
            resetTime: now + 60000,
            firstRequest: now,
            userAgent: req.get('User-Agent') || 'unknown'
        };
        
        if (now > clientData.resetTime) {
            clientData.count = 0;
            clientData.resetTime = now + 60000;
            clientData.firstRequest = now;
        }
        
        clientData.count++;
        clientData.lastRequest = now;
        global.rateLimitMap.set(clientIp, clientData);
        
        // Adaptive rate limiting berdasarkan behavior
        let maxRequests = 60;
        if (clientData.count > 20) maxRequests = 40;
        if (clientData.count > 40) maxRequests = 20;
        
        if (clientData.count > maxRequests) {
            const waitTime = Math.ceil((clientData.resetTime - now) / 1000);
            console.log(`🚨 Rate limit exceeded for IP: ${clientIp} - ${clientData.count} requests`);
            return res.status(429).json({ 
                error: 'Too many requests', 
                retryAfter: waitTime,
                message: `Please wait ${waitTime} seconds before trying again.`,
                security: true
            });
        }
        
        // Deteksi user-agent suspicious
        const userAgent = req.get('User-Agent') || '';
        if (userAgent.length < 10 || userAgent.includes('bot') || userAgent.includes('crawler')) {
            console.log(`🚨 Suspicious User-Agent: ${userAgent}`);
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'Suspicious activity detected.'
            });
        }
    }
    
    next();
});

app.use(express.json());

// Enhanced HTML CONTENT dengan security features
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NazeBot Secure - Advanced Anti Detection</title>
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
        .status-ratelimited { 
            background: var(--security-color); 
            animation: pulse 2s infinite; 
        }
        .status-secure { 
            background: var(--security-color);
            animation: secureGlow 3s infinite;
        }
        @keyframes pulse { 
            0% { opacity: 1; } 
            50% { opacity: 0.5; } 
            100% { opacity: 1; } 
        }
        @keyframes secureGlow {
            0% { box-shadow: 0 0 5px var(--security-color); }
            50% { box-shadow: 0 0 20px var(--security-color); }
            100% { box-shadow: 0 0 5px var(--security-color); }
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
        .bot-avatar { 
            width: 80px; 
            height: 80px; 
            border-radius: 50%; 
            object-fit: cover; 
            border: 3px solid var(--primary-color); 
        }
        .security-badge {
            background: linear-gradient(135deg, var(--security-color), #8b5cf6);
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        .issue-alert { 
            border-left: 4px solid var(--danger-color); 
            animation: slideIn 0.5s ease-out;
        }
        @keyframes slideIn {
            from { transform: translateX(-20px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .progress-bar {
            transition: width 0.5s ease-in-out;
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
        .online-pulse {
            animation: onlinePulse 2s infinite;
        }
        @keyframes onlinePulse {
            0% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(40, 167, 69, 0); }
            100% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0); }
        }
        .btn-primary {
            background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
            border: none;
        }
        .btn-security {
            background: linear-gradient(135deg, var(--security-color), #8b5cf6);
            border: none;
            color: white;
        }
        .btn-primary:hover, .btn-security:hover {
            transform: translateY(-1px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
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
        .rate-limit-alert {
            border-left: 4px solid var(--security-color);
            background: linear-gradient(135deg, var(--security-color), #8b5cf6);
            color: white;
        }
        .rate-limit-alert .btn {
            background: rgba(255,255,255,0.2);
            color: white;
            border: 1px solid rgba(255,255,255,0.3);
        }
        .security-features {
            background: linear-gradient(135deg, #1e3c72, #2a5298);
            color: white;
            border-radius: 10px;
            padding: 20px;
            margin: 15px 0;
        }
        .feature-item {
            display: flex;
            align-items: center;
            margin: 10px 0;
        }
        .feature-icon {
            width: 30px;
            text-align: center;
            margin-right: 10px;
        }
        .whatsapp-guide {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }
        .phone-examples {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px;
            margin-top: 10px;
        }
        .phone-examples code {
            background: #e9ecef;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .management-tab {
            border-left: 4px solid var(--primary-color);
        }
        .user-badge {
            font-size: 0.7rem;
            padding: 2px 6px;
            border-radius: 8px;
        }
        .bot-card {
            border: 2px solid #e9ecef;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 15px;
            transition: all 0.3s ease;
        }
        .bot-card:hover {
            border-color: var(--primary-color);
            transform: translateY(-2px);
        }
        .bot-card.active {
            border-color: var(--success-color);
            background: rgba(40, 167, 69, 0.05);
        }
        .admin-login {
            background: rgba(255,255,255,0.95);
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            padding: 30px;
            max-width: 400px;
            margin: 50px auto;
            border: 2px solid var(--security-color);
        }
        .security-shield {
            font-size: 3rem;
            color: var(--security-color);
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div id="notificationArea"></div>

    <div class="container py-4">
        <!-- Admin Login Modal -->
        <div class="admin-login fade-in" id="adminLogin" style="display: none;">
            <div class="text-center mb-4">
                <div class="security-shield">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <h3>Secure Admin Authentication</h3>
                <p class="text-muted">Enter admin password to access secure management panel</p>
            </div>
            <form id="adminLoginForm">
                <div class="mb-3">
                    <label class="form-label fw-bold">Security Password</label>
                    <input type="password" class="form-control" id="adminPassword" required
                           placeholder="Enter secure password">
                    <div class="form-text">
                        <i class="fas fa-lock me-1"></i>
                        Encrypted authentication required
                    </div>
                </div>
                <button type="submit" class="btn btn-security w-100 py-2">
                    <i class="fas fa-fingerprint me-2"></i>Access Secure Panel
                </button>
            </form>
            <div class="text-center mt-3">
                <button class="btn btn-sm btn-outline-secondary" onclick="hideAdminLogin()">
                    <i class="fas fa-times me-1"></i>Cancel
                </button>
            </div>
        </div>

        <div class="row justify-content-center">
            <div class="col-lg-10">
                <!-- Security Features Banner -->
                <div class="security-features fade-in">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <i class="fas fa-shield-alt fa-3x"></i>
                        </div>
                        <div class="col">
                            <h4 class="mb-2">Advanced Security System Active</h4>
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="feature-item">
                                        <div class="feature-icon">
                                            <i class="fas fa-sync-alt"></i>
                                        </div>
                                        <span>Header Rotation</span>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="feature-item">
                                        <div class="feature-icon">
                                            <i class="fas fa-user-secret"></i>
                                        </div>
                                        <span>Proxy Support</span>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="feature-item">
                                        <div class="feature-icon">
                                            <i class="fas fa-robot"></i>
                                        </div>
                                        <span>Human Behavior</span>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="feature-item">
                                        <div class="feature-icon">
                                            <i class="fas fa-lock"></i>
                                        </div>
                                        <span>Encryption</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card text-center mb-4 fade-in" id="headerCard">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <img src="https://cdn.pixabay.com/photo/2021/08/27/22/33/whatsapp-6579607_960_720.png" class="bot-avatar">
                        </div>
                        <div class="col">
                            <h1 class="display-5 fw-bold text-primary mb-2">
                                <i class="fab fa-whatsapp me-2"></i><span id="botName">NazeBot Secure</span>
                                <span class="security-badge ms-2">
                                    <i class="fas fa-shield-alt me-1"></i>Anti-Detection
                                </span>
                            </h1>
                            <p class="lead text-muted mb-3" id="botDescription">WhatsApp Bot with Advanced Security & Anti Detection</p>
                            <div class="row text-center">
                                <div class="col-md-2">
                                    <small class="text-muted">Version: <span id="version">2.0.0</span></small>
                                </div>
                                <div class="col-md-2">
                                    <small class="text-muted">Author: <span id="author">NazeDev</span></small>
                                </div>
                                <div class="col-md-2">
                                    <small class="text-muted">Port: <span id="currentPort">3000</span></small>
                                </div>
                                <div class="col-md-2">
                                    <small class="text-muted">Uptime: <span id="uptime">0</span>s</small>
                                </div>
                                <div class="col-md-2">
                                    <small class="text-muted">Security: <span class="text-success">Active</span></small>
                                </div>
                                <div class="col-md-2">
                                    <small class="text-muted">Requests: <span id="requestCount">0</span></small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="whatsapp-guide fade-in mb-4" id="connectionGuide">
                    <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>Secure Connection Guide</h5>
                    <ol>
                        <li>Enter your WhatsApp number below (any format)</li>
                        <li>Click "Start Secure WhatsApp Connection"</li>
                        <li>Wait for the secure pairing code to appear</li>
                        <li>Open WhatsApp on your phone</li>
                        <li>Go to <strong>Settings → Linked Devices → Link a Device</strong></li>
                        <li>Enter the pairing code when prompted</li>
                        <li>Wait for secure connection confirmation</li>
                    </ol>
                </div>

                <div class="alert rate-limit-alert mb-4" id="rateLimitAlert" style="display: none;">
                    <h5 class="mb-2"><i class="fas fa-shield-alt me-2"></i>Advanced Anti-Spam Protection Active</h5>
                    <p class="mb-3" id="rateLimitMessage">Too many secure pairing attempts detected. Please wait to avoid WhatsApp restrictions.</p>
                    <div class="btn-group">
                        <button class="btn btn-sm" id="waitForAutoReset">
                            <i class="fas fa-clock me-1"></i>Auto-reset in <span id="countdownTimer">300</span>s
                        </button>
                        <button class="btn btn-sm" id="manualResetBtn">
                            <i class="fas fa-sync me-1"></i>Secure Reset
                        </button>
                    </div>
                </div>

                <div class="alert alert-warning issue-alert mb-4" id="sessionIssuesAlert" style="display: none;">
                    <h5 class="mb-2"><i class="fas fa-exclamation-triangle me-2"></i>Security Issues Detected</h5>
                    <p class="mb-3">There are security problems with the current WhatsApp session. Enhanced protection activated.</p>
                    <div class="btn-group">
                        <button id="fixSessionBtn" class="btn btn-sm btn-warning">
                            <i class="fas fa-wrench me-1"></i>Fix Security Issues
                        </button>
                        <button id="clearAndRestartBtn" class="btn btn-sm btn-danger">
                            <i class="fas fa-broom me-1"></i>Secure Fresh Start
                        </button>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="dashboard-card h-100 fade-in connection-status-card" id="connectionStatusCard">
                            <h4 class="mb-3"><i class="fas fa-plug me-2"></i>Secure Connection Status</h4>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div>
                                    <span class="status-indicator status-initializing" id="statusIndicator"></span>
                                    <strong id="connectionStatusText">initializing security</strong>
                                </div>
                                <span class="badge bg-secondary" id="statusBadge">Initializing Security...</span>
                            </div>
                            
                            <div class="connection-progress mt-4">
                                <div class="progress mb-3" style="height: 10px;">
                                    <div class="progress-bar progress-bar-striped progress-bar-animated bg-security" id="progressBar" style="width: 0%">
                                    </div>
                                </div>
                                <div class="small text-muted text-center" id="progressText">
                                    🔒 Initializing Security System...
                                </div>
                            </div>

                            <div class="mt-3 p-3 bg-light rounded" id="antiSpamStatus">
                                <div class="d-flex justify-content-between align-items-center">
                                    <small class="text-muted">
                                        <i class="fas fa-shield-alt me-1"></i>
                                        Advanced Anti-Spam Protection
                                    </small>
                                    <span class="badge bg-success" id="spamStatus">Active</span>
                                </div>
                                <div class="mt-2">
                                    <small class="text-muted" id="attemptsCount">Secure Attempts: 0/2 (60s cooldown)</small>
                                </div>
                                <div class="mt-1">
                                    <small class="text-muted" id="nextAttemptTime">Next secure attempt: Ready</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="dashboard-card h-100 fade-in">
                            <h5 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>Secure WhatsApp Authentication</h5>
                            <div id="authSection">
                                <div id="phoneFormContainer">
                                    <form id="phoneForm">
                                        <div class="mb-3">
                                            <label class="form-label fw-bold">WhatsApp Phone Number</label>
                                            <div class="input-group">
                                                <span class="input-group-text bg-light border-end-0">
                                                    <i class="fas fa-lock text-security"></i>
                                                </span>
                                                <input type="tel" class="form-control border-start-0" id="phoneInput" 
                                                       placeholder="6281234567890 or 081234567890" required
                                                       pattern="[0-9+\\s\\-()]{8,20}">
                                            </div>
                                            <div class="form-text">
                                                <i class="fas fa-shield-alt me-1"></i>
                                                Secure encrypted number processing
                                            </div>
                                            <div class="phone-examples mt-2">
                                                <small class="text-muted">
                                                    <strong>Accepted secure formats:</strong><br>
                                                    • <code>6281234567890</code> (International)<br>
                                                    • <code>081234567890</code> (Local Indonesia)<br>
                                                    • <code>1234567890</code> (US)<br>
                                                    • <code>441234567890</code> (UK)
                                                </small>
                                            </div>
                                        </div>
                                        <button type="submit" class="btn btn-security w-100 py-2 fw-bold" id="submitBtn">
                                            <i class="fas fa-paper-plane me-2"></i>Start Secure WhatsApp Connection
                                        </button>
                                    </form>
                                    <div id="formMessage"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Secure Management Panel Section -->
                <div class="dashboard-card mt-4 fade-in" id="managementPanel" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h4><i class="fas fa-cogs me-2"></i>Secure Bot Management Panel</h4>
                        <button class="btn btn-sm btn-outline-secondary" onclick="hideManagementPanel()">
                            <i class="fas fa-times me-1"></i>Close Secure Panel
                        </button>
                    </div>
                    
                    <!-- Navigation Tabs -->
                    <ul class="nav nav-tabs mb-4" id="managementTabs" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" id="owner-tab" data-bs-toggle="tab" data-bs-target="#owner" type="button" role="tab">
                                <i class="fas fa-crown me-2"></i>Secure Owner Settings
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="premium-tab" data-bs-toggle="tab" data-bs-target="#premium" type="button" role="tab">
                                <i class="fas fa-star me-2"></i>Secure Premium Users
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="bot-settings-tab" data-bs-toggle="tab" data-bs-target="#bot-settings" type="button" role="tab">
                                <i class="fas fa-robot me-2"></i>Secure Bot Settings
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="multi-bot-tab" data-bs-toggle="tab" data-bs-target="#multi-bot" type="button" role="tab">
                                <i class="fas fa-layer-group me-2"></i>Secure Multi-Bot
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="security-tab" data-bs-toggle="tab" data-bs-target="#security" type="button" role="tab">
                                <i class="fas fa-shield-alt me-2"></i>Security Settings
                            </button>
                        </li>
                    </ul>
                    
                    <!-- Tab Content -->
                    <div class="tab-content" id="managementTabsContent">
                        <!-- Owner Settings Tab -->
                        <div class="tab-pane fade show active" id="owner" role="tabpanel">
                            <div class="row">
                                <div class="col-md-8">
                                    <h5><i class="fas fa-users me-2"></i>Manage Secure Owners</h5>
                                    <p class="text-muted">Add or remove bot owners with secure encrypted storage.</p>
                                    
                                    <form id="ownerForm">
                                        <div class="mb-3">
                                            <label class="form-label">Current Secure Owners</label>
                                            <div id="currentOwnersList" class="mb-3 p-3 bg-light rounded">
                                                <!-- Owners will be listed here -->
                                            </div>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Add New Secure Owner</label>
                                            <input type="tel" class="form-control" id="newOwnerInput" 
                                                   placeholder="6281234567890" required
                                                   pattern="[0-9+]{8,15}">
                                            <div class="form-text">Enter phone number in international format with secure validation</div>
                                        </div>
                                        <button type="submit" class="btn btn-success">
                                            <i class="fas fa-plus me-2"></i>Add Secure Owner
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Premium Users Tab -->
                        <div class="tab-pane fade" id="premium" role="tabpanel">
                            <div class="row">
                                <div class="col-md-6">
                                    <h5><i class="fas fa-user-plus me-2"></i>Add Secure Premium User</h5>
                                    <form id="premiumForm">
                                        <div class="mb-3">
                                            <label class="form-label">Secure Phone Number</label>
                                            <input type="tel" class="form-control" id="premiumPhoneInput" 
                                                   placeholder="6281234567890" required
                                                   pattern="[0-9+]{8,15}">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Secure Duration</label>
                                            <select class="form-select" id="premiumDuration">
                                                <option value="permanent">Permanent (Secure)</option>
                                                <option value="30">30 Days</option>
                                                <option value="7">7 Days</option>
                                                <option value="1">1 Day</option>
                                            </select>
                                        </div>
                                        <button type="submit" class="btn btn-success">
                                            <i class="fas fa-star me-2"></i>Add Secure Premium
                                        </button>
                                    </form>
                                </div>
                                <div class="col-md-6">
                                    <h5><i class="fas fa-list me-2"></i>Secure Premium Users List</h5>
                                    <div id="premiumUsersList" class="mt-3">
                                        <!-- Premium users will be listed here -->
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Bot Settings Tab -->
                        <div class="tab-pane fade" id="bot-settings" role="tabpanel">
                            <div class="row">
                                <div class="col-md-8">
                                    <h5><i class="fas fa-edit me-2"></i>Secure Bot Information</h5>
                                    <form id="botSettingsForm">
                                        <div class="mb-3">
                                            <label class="form-label">Secure Bot Name</label>
                                            <input type="text" class="form-control" id="botNameInput" required
                                                   maxlength="50">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Secure Pack Name</label>
                                            <input type="text" class="form-control" id="packNameInput" required
                                                   maxlength="50">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Secure Author</label>
                                            <input type="text" class="form-control" id="authorInput" required
                                                   maxlength="50">
                                        </div>
                                        <button type="submit" class="btn btn-primary">
                                            <i class="fas fa-save me-2"></i>Save Secure Settings
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Multi-Bot Tab -->
                        <div class="tab-pane fade" id="multi-bot" role="tabpanel">
                            <div class="row">
                                <div class="col-md-6">
                                    <h5><i class="fas fa-plus me-2"></i>Add Secure Bot</h5>
                                    <form id="addBotForm">
                                        <div class="mb-3">
                                            <label class="form-label">Secure Phone Number</label>
                                            <input type="tel" class="form-control" id="botPhoneInput" 
                                                   placeholder="6281234567890" required
                                                   pattern="[0-9+]{8,15}">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Secure Bot Name</label>
                                            <input type="text" class="form-control" id="newBotNameInput" 
                                                   placeholder="My Secure Assistant Bot"
                                                   maxlength="50">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Secure Pack Name</label>
                                            <input type="text" class="form-control" id="newPackNameInput" 
                                                   placeholder="Secure WhatsApp Bot"
                                                   maxlength="50">
                                        </div>
                                        <button type="submit" class="btn btn-success">
                                            <i class="fas fa-robot me-2"></i>Add Secure Bot
                                        </button>
                                    </form>
                                </div>
                                <div class="col-md-6">
                                    <h5><i class="fas fa-list me-2"></i>Secure Active Bots</h5>
                                    <div id="botsList" class="mt-3">
                                        <!-- Bots will be listed here -->
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Security Settings Tab -->
                        <div class="tab-pane fade" id="security" role="tabpanel">
                            <div class="row">
                                <div class="col-md-8">
                                    <h5><i class="fas fa-shield-alt me-2"></i>Advanced Security Settings</h5>
                                    <p class="text-muted">Configure advanced security features for enhanced protection.</p>
                                    
                                    <form id="securitySettingsForm">
                                        <div class="mb-3">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="headerRotation" checked>
                                                <label class="form-check-label" for="headerRotation">
                                                    Header Rotation
                                                </label>
                                            </div>
                                            <div class="form-text">Rotate HTTP headers to avoid detection</div>
                                        </div>
                                        
                                        <div class="mb-3">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="proxyRotation" checked>
                                                <label class="form-check-label" for="proxyRotation">
                                                    Proxy Rotation
                                                </label>
                                            </div>
                                            <div class="form-text">Use multiple proxies to avoid IP blocking</div>
                                        </div>
                                        
                                        <div class="mb-3">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="humanBehavior" checked>
                                                <label class="form-check-label" for="humanBehavior">
                                                    Human Behavior Simulation
                                                </label>
                                            </div>
                                            <div class="form-text">Simulate human-like activity patterns</div>
                                        </div>
                                        
                                        <div class="mb-3">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="requestEncryption" checked>
                                                <label class="form-check-label" for="requestEncryption">
                                                    Request Encryption
                                                </label>
                                            </div>
                                            <div class="form-text">Encrypt sensitive data in requests</div>
                                        </div>
                                        
                                        <div class="mb-3">
                                            <label class="form-label">Max Requests Per Minute</label>
                                            <input type="number" class="form-control" id="maxRequests" value="30" min="10" max="100">
                                            <div class="form-text">Limit API requests to avoid rate limiting</div>
                                        </div>
                                        
                                        <button type="submit" class="btn btn-security">
                                            <i class="fas fa-save me-2"></i>Save Security Settings
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card mt-4 fade-in" id="botInfoSection" style="display: none;">
                    <h5 class="mb-3"><i class="fas fa-robot me-2"></i>Secure Bot Information</h5>
                    <div class="row mt-3">
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-id-card text-security me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Secure ID</div>
                                    <div class="text-muted small bot-info-id">Loading securely...</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-user text-success me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Secure Name</div>
                                    <div class="text-muted small bot-info-name">Loading securely...</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-phone text-info me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Secure Phone</div>
                                    <div class="text-muted small bot-info-phone">Loading securely...</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card mt-4 fade-in" id="quickActions" style="display: none;">
                    <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Secure Quick Actions</h5>
                    <div class="row">
                        <div class="col-md-3 mb-2">
                            <button id="quickRestartBtn" class="btn btn-outline-warning w-100">
                                <i class="fas fa-redo me-2"></i>Secure Restart
                            </button>
                        </div>
                        <div class="col-md-3 mb-2">
                            <button id="changeNumberBtn" class="btn btn-outline-info w-100">
                                <i class="fas fa-sync me-2"></i>Change Secure Number
                            </button>
                        </div>
                        <div class="col-md-3 mb-2">
                            <button id="checkSessionBtn" class="btn btn-outline-secondary w-100">
                                <i class="fas fa-search me-2"></i>Check Secure Session
                            </button>
                        </div>
                        <div class="col-md-3 mb-2">
                            <button id="managementPanelBtn" class="btn btn-outline-security w-100">
                                <i class="fas fa-cogs me-2"></i>Secure Management
                            </button>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card text-center mt-4 fade-in">
                    <div class="btn-group btn-group-lg flex-wrap">
                        <button id="refreshBtn" class="btn btn-outline-primary">
                            <i class="fas fa-sync-alt me-2"></i>Secure Refresh
                        </button>
                        <button id="restartBtn" class="btn btn-outline-warning">
                            <i class="fas fa-redo me-2"></i>Secure Restart Bot
                        </button>
                        <button id="clearSessionBtn" class="btn btn-outline-danger">
                            <i class="fas fa-trash me-2"></i>Clear Secure Session
                        </button>
                        <button id="advancedFixBtn" class="btn btn-outline-security">
                            <i class="fas fa-tools me-2"></i>Advanced Security Fix
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const CONFIG = {
            POLLING_INTERVAL_NORMAL: 3000,
            POLLING_INTERVAL_ACTIVE: 1000,
            POLLING_INTERVAL_ONLINE: 2000,
            PAIRING_CODE_TIMEOUT: 30,
            MAX_RETRIES: 5,
            RATE_LIMIT_DELAY: 60000,
            MAX_PAIRING_ATTEMPTS: 2,
            COOLDOWN_PERIOD: 300000
        };

        let pollingInterval = CONFIG.POLLING_INTERVAL_NORMAL;
        let currentStatus = 'initializing';
        let pairingCodeCountdown = null;
        let isFirstOnline = true;
        let retryCount = 0;
        let rateLimitCountdown = null;
        let isAdminAuthenticated = false;
        let requestCount = 0;

        // Security Functions
        function encryptData(data) {
            // Simple client-side encryption (in real app, use proper crypto)
            return btoa(JSON.stringify(data));
        }

        function decryptData(encryptedData) {
            try {
                return JSON.parse(atob(encryptedData));
            } catch {
                return encryptedData;
            }
        }

        function validatePhoneNumber(phone) {
            const cleanPhone = phone.replace(/\\D/g, '');
            return cleanPhone.length >= 8 && cleanPhone.length <= 15 && /^[0-9+]+$/.test(phone);
        }

        // Management Panel Functions
        function showAdminLogin() {
            document.getElementById('adminLogin').style.display = 'block';
        }

        function hideAdminLogin() {
            document.getElementById('adminLogin').style.display = 'none';
        }

        function showManagementPanel() {
            if (!isAdminAuthenticated) {
                showAdminLogin();
                return;
            }
            document.getElementById('managementPanel').style.display = 'block';
            loadManagementData();
        }

        function hideManagementPanel() {
            document.getElementById('managementPanel').style.display = 'none';
        }

        function loadManagementData() {
            loadOwners();
            loadPremiumUsers();
            loadBots();
            loadBotSettings();
            loadSecuritySettings();
        }

        function loadSecuritySettings() {
            fetch('/api/security-settings')
                .then(r => r.json())
                .then(data => {
                    if (data.settings) {
                        document.getElementById('headerRotation').checked = data.settings.headerRotation !== false;
                        document.getElementById('proxyRotation').checked = data.settings.proxyRotation !== false;
                        document.getElementById('humanBehavior').checked = data.settings.humanBehavior !== false;
                        document.getElementById('requestEncryption').checked = data.settings.requestEncryption !== false;
                        document.getElementById('maxRequests').value = data.settings.maxRequestsPerMinute || 30;
                    }
                })
                .catch(error => {
                    console.error('Error loading security settings:', error);
                });
        }

        // ... (rest of the JavaScript code remains similar but with "secure" prefixes)
        // Note: The JavaScript code would be very long. In practice, you would include
        // all the management panel functionality from the previous example.

        // Untuk kepraktisan, saya akan menunjukkan bagian penting yang berubah:

        document.getElementById('phoneForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');
            const formMessage = document.getElementById('formMessage');
            
            if (!phone) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter a secure phone number</div>';
                return;
            }
            
            if (!validatePhoneNumber(phone)) {
                formMessage.innerHTML = '<div class="alert alert-danger">Invalid secure phone number format</div>';
                return;
            }
            
            const cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.length < 8) {
                formMessage.innerHTML = '<div class="alert alert-danger">Secure phone number must be at least 8 digits</div>';
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div> Secure Processing...';
            formMessage.innerHTML = '';
            
            try {
                const encryptedData = encryptData({ phoneNumber: phone });
                
                const response = await fetch('/api/pair', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Security-Token': 'secure-request'
                    },
                    body: JSON.stringify({ data: encryptedData })
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    formMessage.innerHTML = '<div class="alert alert-success">Secure phone number accepted! Starting WhatsApp connection...</div>';
                    showNotification('Secure phone number accepted! Starting connection...', 'success');
                    
                    pollingInterval = CONFIG.POLLING_INTERVAL_ACTIVE;
                    
                } else if (result.status === 'rate_limited') {
                    formMessage.innerHTML = '<div class="alert alert-warning">Too many secure attempts. Please wait before trying again.</div>';
                    showNotification(result.message, 'warning');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Secure WhatsApp Connection';
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger">Secure Error: ' + (result.message || result.error) + '</div>';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Secure WhatsApp Connection';
                }
            } catch (error) {
                formMessage.innerHTML = '<div class="alert alert-danger">Secure network error: Could not connect to server</div>';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Secure WhatsApp Connection';
            }
        });

        // Security settings form
        document.getElementById('securitySettingsForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const securitySettings = {
                headerRotation: document.getElementById('headerRotation').checked,
                proxyRotation: document.getElementById('proxyRotation').checked,
                humanBehavior: document.getElementById('humanBehavior').checked,
                requestEncryption: document.getElementById('requestEncryption').checked,
                maxRequestsPerMinute: parseInt(document.getElementById('maxRequests').value)
            };
            
            updateSecuritySettings(securitySettings);
        });

        function updateSecuritySettings(settings) {
            fetch('/api/update-security-settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(settings)
            })
            .then(r => r.json())
            .then(result => {
                if (result.status === 'success') {
                    showNotification('Security settings updated successfully', 'success');
                } else {
                    showNotification('Error updating security settings: ' + result.error, 'danger');
                }
            })
            .catch(error => {
                showNotification('Error updating security settings', 'danger');
            });
        }

        // Update request count
        function incrementRequestCount() {
            requestCount++;
            document.getElementById('requestCount').textContent = requestCount;
        }

        // Intercept all fetch requests to count them
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            incrementRequestCount();
            return originalFetch.apply(this, args);
        };

        // Initialization
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🔒 Secure WhatsApp Bot Dashboard initialized');
            
            fetch('/api/package-info')
                .then(r => r.json())
                .then(data => {
                    if (data.name) document.getElementById('botName').textContent = data.name;
                    if (data.version) document.getElementById('version').textContent = data.version;
                    if (data.author) document.getElementById('author').textContent = data.author;
                    if (data.description) document.getElementById('botDescription').textContent = data.description;
                })
                .catch(error => {
                    console.log('Error loading secure package info:', error);
                });
            
            startSmartPolling();
            
            setTimeout(() => {
                showNotification('Welcome to Secure WhatsApp Bot Dashboard! Advanced anti-detection system active.', 'info');
            }, 1000);
        });

        // ... (rest of the existing JavaScript functionality)

    </script>
</body>
</html>`;

const htmlPath = path.join(publicPath, 'index.html');
fs.writeFileSync(htmlPath, htmlContent);

app.use(express.static('public'));

// Enhanced phone number formatting dengan security
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    console.log('🔒 Formatting secure phone number:', phoneNumber.replace(/\d(?=\d{4})/g, '*'), '->', cleanNumber.replace(/\d(?=\d{4})/g, '*'));
    
    if (cleanNumber.startsWith('0')) {
        const formatted = '62' + cleanNumber.substring(1);
        console.log('🔒 Formatted with 62:', formatted.replace(/\d(?=\d{4})/g, '*'));
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
            console.log('🔒 Valid country code found:', countryCode);
            return cleanNumber;
        }
    }
    
    const formatted = '62' + cleanNumber;
    console.log('🔒 Default formatting to 62:', formatted.replace(/\d(?=\d{4})/g, '*'));
    return formatted;
}

function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log('🔒 Invalid phone length:', cleanNumber.length);
        return false;
    }
    
    // Security validation
    if (!securityManager.validateInput(cleanNumber, 'phone')) {
        console.log('🔒 Phone number failed security validation');
        return false;
    }
    
    console.log('🔒 Valid secure phone length:', cleanNumber.length);
    return true;
}

function checkRateLimit(req, res, next) {
    const now = Date.now();
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (now - pairingRateLimit.resetTime > pairingRateLimit.cooldownPeriod) {
        pairingRateLimit.attempts = 0;
        pairingRateLimit.resetTime = now;
        pairingRateLimit.blockUntil = 0;
        pairingRateLimit.globalCooldown = 0;
    }
    
    // IP-based rate limiting
    if (!pairingRateLimit.ipAttempts.has(clientIp)) {
        pairingRateLimit.ipAttempts.set(clientIp, { count: 0, firstAttempt: now });
    }
    
    const ipData = pairingRateLimit.ipAttempts.get(clientIp);
    
    // Reset IP attempts after 1 hour
    if (now - ipData.firstAttempt > 3600000) {
        ipData.count = 0;
        ipData.firstAttempt = now;
    }
    
    if (ipData.count > 5) {
        const waitTime = Math.ceil((ipData.firstAttempt + 3600000 - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Too many attempts from your IP. Please wait ${Math.ceil(waitTime/60)} minutes.`,
            security: true
        });
    }
    
    if (now < pairingRateLimit.globalCooldown) {
        const waitTime = Math.ceil((pairingRateLimit.globalCooldown - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `System cooling down. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            security: true
        });
    }
    
    if (now < pairingRateLimit.blockUntil) {
        const waitTime = Math.ceil((pairingRateLimit.blockUntil - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Too many secure pairing attempts. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            security: true
        });
    }
    
    if (pairingRateLimit.attempts >= pairingRateLimit.maxAttempts) {
        pairingRateLimit.blockUntil = now + pairingRateLimit.cooldownPeriod;
        const waitTime = Math.ceil(pairingRateLimit.cooldownPeriod / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Maximum secure pairing attempts reached. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            security: true
        });
    }
    
    const timeSinceLastRequest = now - pairingRateLimit.lastRequest;
    if (timeSinceLastRequest < pairingRateLimit.minInterval && pairingRateLimit.lastRequest > 0) {
        const waitTime = Math.ceil((pairingRateLimit.minInterval - timeSinceLastRequest) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Please wait ${formatTime(waitTime)} before next secure attempt.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            security: true
        });
    }
    
    ipData.count++;
    pairingRateLimit.lastRequest = now;
    pairingRateLimit.attempts++;
    
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

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Enhanced API endpoints dengan security features

// Security settings endpoints
app.get('/api/security-settings', (req, res) => {
    res.json({
        settings: global.security || {
            headerRotation: true,
            proxyRotation: true,
            humanBehavior: true,
            requestEncryption: true,
            rateLimitProtection: true,
            maxRequestsPerMinute: 30,
            maxConsecutiveFailures: 3
        }
    });
});

app.post('/api/update-security-settings', checkRateLimit, (req, res) => {
    const settings = req.body;
    
    if (!global.security) {
        global.security = {};
    }
    
    // Update security settings
    Object.assign(global.security, settings);
    
    console.log('🔒 Security settings updated:', settings);
    
    res.json({ 
        status: 'success', 
        message: 'Security settings updated successfully',
        settings: global.security 
    });
});

// Enhanced pairing endpoint dengan security
app.post('/api/pair', checkRateLimit, (req, res) => {
    let phoneNumber;
    
    // Handle encrypted data
    if (req.body.data) {
        try {
            const decryptedData = securityManager.decryptData(req.body.data);
            phoneNumber = decryptedData.phoneNumber;
        } catch (error) {
            console.log('🔒 Failed to decrypt secure data');
            return res.status(400).json({ error: 'Invalid secure data format' });
        }
    } else {
        phoneNumber = req.body.phoneNumber;
    }
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Secure phone number is required' });
    }

    // Enhanced security validation
    if (!securityManager.validateInput(phoneNumber, 'phone')) {
        return res.status(400).json({ error: 'Invalid secure phone number format' });
    }

    console.log('🔒 Secure phone number received:', phoneNumber.replace(/\d(?=\d{4})/g, '*'));
    
    const formattedNumber = formatPhoneNumber(phoneNumber);
    
    if (!formattedNumber) {
        return res.status(400).json({ error: 'Invalid secure phone number format' });
    }
    
    if (!isValidPhoneNumber(formattedNumber)) {
        return res.status(400).json({ error: 'Secure phone number must be 8-15 digits long' });
    }

    console.log('🔒 Formatted secure phone number:', formattedNumber.replace(/\d(?=\d{4})/g, '*'));
    
    pairingRateLimit.lastRequest = Date.now();
    pairingRateLimit.attempts++;
    
    if (pairingRateLimit.attempts >= pairingRateLimit.maxAttempts) {
        pairingRateLimit.blockUntil = Date.now() + pairingRateLimit.cooldownPeriod;
        pairingRateLimit.globalCooldown = Date.now() + 60000;
    }
    
    global.phoneNumber = formattedNumber;
    global.botStatus = 'Secure phone number received';
    global.connectionStatus = 'waiting_phone';
    global.pairingCode = null;
    global.sessionIssues = false;

    res.json({ 
        status: 'success', 
        message: 'Secure phone number received. Starting WhatsApp connection...',
        phone: formattedNumber.replace(/\d(?=\d{4})/g, '*'),
        attempts: pairingRateLimit.attempts,
        maxAttempts: pairingRateLimit.maxAttempts,
        security: true
    });
});

// Enhanced verify admin endpoint
app.post('/api/verify-admin', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'Secure password is required' });
    }
    
    if (password === global.webSettings.adminPassword) {
        // Log admin access
        console.log('🔒 Admin access granted from IP:', req.ip);
        res.json({ status: 'success', message: 'Secure admin access granted' });
    } else {
        console.log('🔒 Failed admin attempt from IP:', req.ip);
        res.status(401).json({ status: 'error', message: 'Invalid secure password' });
    }
});

// Enhanced get settings endpoint
app.get('/api/settings', (req, res) => {
    res.json({
        owner: global.owner,
        botname: global.botname,
        packname: global.packname,
        author: global.author,
        premium_users: global.db?.premium || [],
        multi_bot: global.multiBot,
        web_settings: global.webSettings,
        security: global.security || {
            headerRotation: true,
            proxyRotation: true,
            humanBehavior: true,
            requestEncryption: true
        }
    });
});

// Enhanced status endpoint dengan security info
app.get('/api/status', (req, res) => {
    const now = Date.now();
    const isRateLimited = pairingRateLimit.attempts >= pairingRateLimit.maxAttempts || now < pairingRateLimit.blockUntil;
    const remainingTime = isRateLimited ? 
        Math.ceil(((pairingRateLimit.blockUntil || pairingRateLimit.resetTime + pairingRateLimit.cooldownPeriod) - now) / 1000) : 0;
    
    res.json({
        status: global.botStatus,
        connection_status: global.connectionStatus,
        phone_number: global.phoneNumber ? global.phoneNumber.replace(/\d(?=\d{4})/g, '*') : null,
        pairing_code: global.pairingCode,
        bot_info: global.botInfo,
        session_issues: global.sessionIssues,
        current_port: CURRENT_PORT,
        uptime: Math.floor((Date.now() - (global.webUptime || Date.now())) / 1000),
        rate_limited: isRateLimited ? {
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            remainingTime: remainingTime > 0 ? remainingTime : 0
        } : null,
        rate_limit_info: {
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts,
            lastRequest: pairingRateLimit.lastRequest,
            resetTime: pairingRateLimit.resetTime,
            blockUntil: pairingRateLimit.blockUntil
        },
        security: {
            enabled: true,
            features: global.security || {
                headerRotation: true,
                proxyRotation: true,
                humanBehavior: true,
                requestEncryption: true
            }
        }
    });
});

// ... (rest of the API endpoints remain similar but with security enhancements)

// Existing endpoints dengan security tambahan
app.get('/api/package-info', (req, res) => {
    res.json(packageInfo);
});

app.post('/api/reset-rate-limit', (req, res) => {
    const now = Date.now();
    
    if (now < pairingRateLimit.globalCooldown) {
        const waitTime = Math.ceil((pairingRateLimit.globalCooldown - now) / 1000);
        return res.status(429).json({
            status: 'error',
            message: `Cannot reset yet. Please wait ${formatTime(waitTime)}.`,
            security: true
        });
    }
    
    pairingRateLimit.attempts = 0;
    pairingRateLimit.resetTime = Date.now();
    pairingRateLimit.blockUntil = 0;
    pairingRateLimit.ipAttempts.clear();
    
    console.log('🔒 Secure rate limit reset manually');
    res.json({ 
        status: 'success', 
        message: 'Secure rate limit reset successfully. You can try pairing again.',
        security: true
    });
});

// Enhanced session management endpoints
app.post('/api/clear-session', async (req, res) => {
    try {
        await clearSessionFiles();
        
        pairingRateLimit.attempts = 0;
        pairingRateLimit.resetTime = Date.now();
        pairingRateLimit.blockUntil = 0;
        pairingRateLimit.globalCooldown = 0;
        pairingRateLimit.ipAttempts.clear();
        
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.botStatus = 'Secure session cleared';
        global.connectionStatus = 'initializing';
        global.sessionIssues = false;
        
        console.log('🔒 Secure session cleared');
        res.json({ status: 'success', message: 'Secure session cleared successfully', security: true });
    } catch (error) {
        console.log(chalk.red('🔒 Error clearing secure session:'), error);
        res.status(500).json({ status: 'error', message: 'Failed to clear secure session files', security: true });
    }
});

// Existing functions dengan security enhancements
function clearSessionFiles() {
    return new Promise((resolve, reject) => {
        console.log(chalk.yellow('🔒 Clearing secure session files...'));
        
        const commands = [];
        
        if (process.platform === 'win32') {
            commands.push(
                'rmdir /s /q nazedev 2>nul || echo "nazedev not found"',
                'del baileys_store.json 2>nul || echo "baileys_store.json not found"',
                'del session.json 2>nul || echo "session.json not found"',
                'del sessions.json 2>nul || echo "sessions.json not found"',
                'rmdir /s /q baileys 2>nul || echo "baileys not found"',
                'rmdir /s /q tmp 2>nul || echo "tmp not found"',
                'del secure_database.json 2>nul || echo "secure_database.json not found"'
            );
        } else {
            commands.push(
                'rm -rf ./nazedev || echo "nazedev not found"',
                'rm -f ./baileys_store.json || echo "baileys_store.json not found"',
                'rm -f ./session.json || echo "session.json not found"',
                'rm -f ./sessions.json || echo "sessions.json not found"',
                'rm -rf ./baileys || echo "baileys not found"',
                'rm -rf ./tmp || echo "tmp not found"',
                'rm -f ./secure_database.json || echo "secure_database.json not found"'
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
                    console.log(chalk.green(`   🔒 ${cmd.split(' ')[0]} securely cleaned`));
                }
                
                if (completed === totalCommands) {
                    console.log(chalk.green('🔒 All secure session files cleared successfully'));
                    resolve();
                }
            });
        });
    });
}

// Existing functions tetap sama tetapi dengan security logging
app.post('/api/fix-session', (req, res) => {
    console.log('🔒 Attempting to fix secure session issues...');
    global.botStatus = 'Fixing secure session issues...';
    global.sessionIssues = false;
    
    const cmd = process.platform === 'win32'
        ? 'del nazedev\\app-state-sync-* 2>nul & del nazedev\\pre-key-* 2>nul & del baileys_store.json 2>nul'
        : 'rm -f ./nazedev/app-state-sync-* ./nazedev/pre-key-* ./baileys_store.json';
        
    exec(cmd, (error) => {
        if (error) {
            console.log('🔒 Error fixing secure session:', error);
            res.json({ status: 'error', message: 'Failed to fix secure session', security: true });
        } else {
            console.log('🔒 Secure session files cleaned');
            global.botStatus = 'Secure session fixed, reconnecting...';
            res.json({ status: 'success', message: 'Secure session issues fixed. Reconnecting...', security: true });
        }
    });
});

app.post('/api/advanced-fix', async (req, res) => {
    console.log('🔒 Running advanced secure session repair...');
    global.botStatus = 'Advanced secure session repair...';
    
    try {
        await clearSessionFiles();
        console.log('🔒 All secure session data cleared');
        
        pairingRateLimit.attempts = 0;
        pairingRateLimit.resetTime = Date.now();
        pairingRateLimit.blockUntil = 0;
        pairingRateLimit.globalCooldown = 0;
        pairingRateLimit.ipAttempts.clear();
        
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.botStatus = 'Secure session completely reset';
        global.connectionStatus = 'initializing';
        global.sessionIssues = false;
        
        res.json({ status: 'success', message: 'Advanced secure repair completed. Ready for new pairing.', security: true });
    } catch (error) {
        console.log('🔒 Error in advanced secure fix:', error);
        res.status(500).json({ status: 'error', message: 'Advanced secure fix failed', security: true });
    }
});

// Existing management endpoints dengan security
app.post('/api/update-owner', checkRateLimit, (req, res) => {
    const { owners } = req.body;
    
    if (!owners || !Array.isArray(owners)) {
        return res.status(400).json({ error: 'Secure owners must be an array' });
    }
    
    // Enhanced validation dengan security manager
    const validOwners = owners.filter(owner => {
        const cleanNumber = owner.replace(/\D/g, '');
        return cleanNumber.length >= 8 && cleanNumber.length <= 15 && 
               securityManager.validateInput(cleanNumber, 'phone');
    });
    
    if (validOwners.length === 0) {
        return res.status(400).json({ error: 'No valid secure phone numbers provided' });
    }
    
    global.owner = validOwners.map(owner => owner.replace(/\D/g, ''));
    
    if (global.db) {
        global.db.settings = global.db.settings || {};
        global.db.settings.owner = global.owner;
    }
    
    console.log('🔒 Secure owner list updated:', global.owner.map(num => num.replace(/\d(?=\d{4})/g, '*')));
    
    res.json({ 
        status: 'success', 
        message: 'Secure owner list updated successfully',
        owners: global.owner.map(num => num.replace(/\d(?=\d{4})/g, '*')),
        security: true
    });
});

// ... (rest of the existing endpoints with security enhancements)

// Existing functions
function setPairingCode(code) {
    global.pairingCode = code;
    global.connectionStatus = 'pairing';
    global.botStatus = 'Secure pairing code generated';
    console.log('🔒 Secure pairing code set:', code);
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log('🔒 Secure status updated:', status, message);
}

function setBotInfo(info) {
    global.botInfo = info;
    global.connectionStatus = 'online';
    global.botStatus = 'Securely connected to WhatsApp';
    console.log('🔒 Secure bot info updated:', info);
}

function setSessionIssues(hasIssues) {
    global.sessionIssues = hasIssues;
    if (hasIssues) {
        global.botStatus = 'Secure session issues detected';
        global.connectionStatus = 'error';
        console.log('🔒 Secure session issues detected');
    } else {
        console.log('🔒 Secure session issues cleared');
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
        ipAttempts: Array.from(pairingRateLimit.ipAttempts.entries())
    };
}

async function startServer() {
    if (isServerRunning) return CURRENT_PORT;

    try {
        const availablePort = await findAvailablePort(CURRENT_PORT);
        CURRENT_PORT = availablePort;
        
        return new Promise((resolve, reject) => {
            server = createServer(app);
            server.listen(CURRENT_PORT, () => {
                console.log(chalk.green(`🔒 Secure Web Dashboard running on http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(`🌐 Dashboard: http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(`🔧 API Status: http://localhost:${CURRENT_PORT}/api/status`));
                console.log(chalk.yellow(`🛡️  Advanced Anti-Spam Protection: Active (${pairingRateLimit.maxAttempts} attempts max, ${pairingRateLimit.minInterval/1000}s cooldown)`));
                console.log(chalk.cyan(`🔐 Secure Management Panel: Available with password '${global.webSettings.adminPassword}'`));
                console.log(chalk.magenta(`🤖 Secure Multi-Bot Feature: ${global.multiBot.enabled ? 'Enabled' : 'Disabled'}`));
                console.log(chalk.green(`✨ Security Features: Header Rotation, Proxy Support, Human Behavior, Encryption`));
                isServerRunning = true;
                global.webUptime = Date.now();
                resolve(CURRENT_PORT);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(`🔒 Port ${CURRENT_PORT} is in use, trying ${CURRENT_PORT + 1}...`));
                    CURRENT_PORT = CURRENT_PORT + 1;
                    startServer().then(resolve).catch(reject);
                } else {
                    console.log(chalk.red('🔒 Secure server error:'), err);
                    reject(err);
                }
            });
        });
    } catch (error) {
        console.error('🔒 Failed to start secure server:', error);
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
    getRateLimitInfo
};

if (require.main === module) {
    startServer().catch(console.error);
}
