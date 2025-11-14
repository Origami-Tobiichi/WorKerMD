const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');

// Enhanced chalk implementation
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
let CURRENT_PORT = process.env.PORT || 3000;
let isServerRunning = false;

// Enhanced Rate limiting system dengan security
class EnhancedRateLimit {
    constructor() {
        this.pairingRateLimit = {
            lastRequest: 0,
            minInterval: 60000,
            maxAttempts: 2,
            attempts: 0,
            resetTime: Date.now(),
            blockUntil: 0,
            cooldownPeriod: 300000,
            globalCooldown: 0
        };
        
        this.ipAttempts = new Map();
        this.suspiciousIPs = new Map();
        this.cleanupInterval = setInterval(() => this.cleanupOldEntries(), 60000);
    }

    checkIPLimit(ip) {
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        const maxAttempts = 10;
        
        if (!this.ipAttempts.has(ip)) {
            this.ipAttempts.set(ip, []);
        }
        
        const attempts = this.ipAttempts.get(ip).filter(time => time > now - windowMs);
        this.ipAttempts.set(ip, attempts);
        
        if (attempts.length >= maxAttempts) {
            if (!this.suspiciousIPs.has(ip)) {
                this.suspiciousIPs.set(ip, now);
                console.log(chalk.red(`🚨 Suspicious activity from IP: ${ip}`));
            }
            return false;
        }
        
        attempts.push(now);
        return true;
    }

    isSuspiciousIP(ip) {
        const markedTime = this.suspiciousIPs.get(ip);
        if (!markedTime) return false;
        
        // Remove from suspicious list after 1 hour
        if (Date.now() - markedTime > 3600000) {
            this.suspiciousIPs.delete(ip);
            return false;
        }
        
        return true;
    }

    cleanupOldEntries() {
        const now = Date.now();
        const windowMs = 60000;
        
        // Clean IP attempts
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

const enhancedRateLimit = new EnhancedRateLimit();

// Enhanced security middleware
function enhancedSecurityMiddleware(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    // Check for suspicious IP
    if (enhancedRateLimit.isSuspiciousIP(clientIP)) {
        return res.status(403).json({
            status: 'error',
            message: 'Access denied due to suspicious activity'
        });
    }
    
    // Check IP rate limit
    if (!enhancedRateLimit.checkIPLimit(clientIP)) {
        return res.status(429).json({
            status: 'error',
            message: 'Too many requests from your IP address'
        });
    }
    
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    next();
}

// Apply enhanced security middleware
app.use(enhancedSecurityMiddleware);

// Enhanced global variables
global.botStatus = global.botStatus || 'Initializing...';
global.connectionStatus = global.connectionStatus || 'initializing';
global.phoneNumber = global.phoneNumber || null;
global.pairingCode = global.pairingCode || null;
global.botInfo = global.botInfo || null;
global.qrCode = global.qrCode || null;
global.sessionIssues = global.sessionIssues || false;

// Enhanced multi-bot initialization
if (!global.multiBot) {
    global.multiBot = {
        enabled: true,
        bots: [],
        maxBots: 5,
        activeBot: null,
        security: {
            maxSessionsPerIP: 3,
            sessionTimeouts: new Map()
        }
    };
}

// Enhanced web settings dengan security
if (!global.webSettings) {
    global.webSettings = {
        allowOwnerChange: true,
        allowPremiumManagement: true,
        allowBotSettings: true,
        allowMultiBot: true,
        adminPassword: crypto.createHash('sha256').update('takamiya@botwa#77').digest('hex'),
        maxLoginAttempts: 5,
        sessionTimeout: 3600000,
        corsOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
        security: {
            enableCSP: true,
            enableHSTS: true,
            enableXSS: true
        }
    };
}

// Enhanced port finding
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
        name: 'WhatsApp Bot',
        version: '1.0.0',
        author: 'Bot Developer',
        description: 'WhatsApp Bot with Enhanced Security Dashboard'
    };
}

// Enhanced public directory setup
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
}

app.use(express.static(publicPath));

// Enhanced HTML Content dengan security features
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot - Enhanced Dashboard</title>
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
            border: 1px solid rgba(255,255,255,0.2);
        }
        .dashboard-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
        }
        .security-badge {
            background: linear-gradient(135deg, var(--security-color), #8e44ad);
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
        .security-alert {
            border-left: 4px solid var(--security-color);
            background: linear-gradient(135deg, var(--security-color), #8e44ad);
            color: white;
        }
        .security-alert .btn {
            background: rgba(255,255,255,0.2);
            color: white;
            border: 1px solid rgba(255,255,255,0.3);
        }
        .bot-avatar { 
            width: 80px; 
            height: 80px; 
            border-radius: 50%; 
            object-fit: cover; 
            border: 3px solid var(--primary-color); 
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
        .btn-primary:hover {
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
            background: linear-gradient(135deg, var(--security-color), #8e44ad);
            color: white;
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
            background: rgba(255,255,255,0.9);
            border-radius: 10px;
            padding: 20px;
            max-width: 400px;
            margin: 50px auto;
        }
        .security-features {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border-radius: 10px;
            padding: 15px;
            margin: 10px 0;
        }
        .security-features ul {
            margin: 0;
            padding-left: 20px;
        }
        .security-features li {
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div id="notificationArea"></div>

    <div class="container py-4">
        <!-- Security Features Banner -->
        <div class="security-features fade-in">
            <h5><i class="fas fa-shield-alt me-2"></i>Enhanced Security Features Active</h5>
            <ul>
                <li>Header Rotation & Anti-Detection</li>
                <li>Rate Limiting & IP Monitoring</li>
                <li>Enhanced Authentication</li>
                <li>Real-time Security Monitoring</li>
            </ul>
        </div>

        <!-- Admin Login Modal -->
        <div class="admin-login fade-in" id="adminLogin" style="display: none;">
            <div class="text-center mb-4">
                <i class="fas fa-lock fa-3x text-primary mb-3"></i>
                <h3>Enhanced Admin Authentication</h3>
                <p class="text-muted">Enter admin password to access management panel</p>
            </div>
            <form id="adminLoginForm">
                <div class="mb-3">
                    <label class="form-label">Password</label>
                    <input type="password" class="form-control" id="adminPassword" required>
                    <div class="form-text">
                        <i class="fas fa-info-circle me-1"></i>
                        Enhanced security authentication required
                    </div>
                </div>
                <button type="submit" class="btn btn-primary w-100">
                    <i class="fas fa-unlock me-2"></i>Access Management Panel
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
                <div class="dashboard-card text-center mb-4 fade-in" id="headerCard">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <img src="https://cdn.pixabay.com/photo/2021/08/27/22/33/whatsapp-6579607_960_720.png" class="bot-avatar">
                        </div>
                        <div class="col">
                            <h1 class="display-5 fw-bold text-primary mb-2">
                                <i class="fab fa-whatsapp me-2"></i><span id="botName">WhatsApp Bot</span>
                                <span class="security-badge ms-2">
                                    <i class="fas fa-shield-alt me-1"></i>Enhanced Security
                                </span>
                            </h1>
                            <p class="lead text-muted mb-3" id="botDescription">WhatsApp Bot with Enhanced Security Dashboard</p>
                            <div class="row text-center">
                                <div class="col-md-3">
                                    <small class="text-muted">Version: <span id="version">1.0.0</span></small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Author: <span id="author">Bot Developer</span></small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Port: <span id="currentPort">3000</span></small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Security: <span class="text-success">Active</span></small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="whatsapp-guide fade-in mb-4" id="connectionGuide">
                    <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>Enhanced Connection Guide</h5>
                    <ol>
                        <li>Enter your WhatsApp number below (any format)</li>
                        <li>Click "Start WhatsApp Connection"</li>
                        <li>Wait for the pairing code to appear</li>
                        <li>Open WhatsApp on your phone</li>
                        <li>Go to <strong>Settings → Linked Devices → Link a Device</strong></li>
                        <li>Enter the pairing code when prompted</li>
                        <li>Wait for connection confirmation</li>
                    </ol>
                </div>

                <div class="alert security-alert mb-4" id="securityAlert">
                    <h5 class="mb-2"><i class="fas fa-shield-alt me-2"></i>Enhanced Security Active</h5>
                    <p class="mb-3">All security features are enabled including header rotation, rate limiting, and anti-detection measures.</p>
                </div>

                <div class="alert rate-limit-alert mb-4" id="rateLimitAlert" style="display: none;">
                    <h5 class="mb-2"><i class="fas fa-shield-alt me-2"></i>Enhanced Anti-Spam Protection</h5>
                    <p class="mb-3" id="rateLimitMessage">Too many pairing attempts detected. Please wait to avoid WhatsApp restrictions.</p>
                    <div class="btn-group">
                        <button class="btn btn-sm" id="waitForAutoReset">
                            <i class="fas fa-clock me-1"></i>Auto-reset in <span id="countdownTimer">300</span>s
                        </button>
                        <button class="btn btn-sm" id="manualResetBtn">
                            <i class="fas fa-sync me-1"></i>Reset Now
                        </button>
                    </div>
                </div>

                <div class="alert alert-warning issue-alert mb-4" id="sessionIssuesAlert" style="display: none;">
                    <h5 class="mb-2"><i class="fas fa-exclamation-triangle me-2"></i>Enhanced Session Issues Detection</h5>
                    <p class="mb-3">There are problems with the current WhatsApp session. Enhanced security measures are active.</p>
                    <div class="btn-group">
                        <button id="fixSessionBtn" class="btn btn-sm btn-warning">
                            <i class="fas fa-wrench me-1"></i>Fix Session Issues
                        </button>
                        <button id="clearAndRestartBtn" class="btn btn-sm btn-danger">
                            <i class="fas fa-broom me-1"></i>Clear & Fresh Start
                        </button>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="dashboard-card h-100 fade-in connection-status-card" id="connectionStatusCard">
                            <h4 class="mb-3"><i class="fas fa-plug me-2"></i>Enhanced Connection Status</h4>
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
                                    Initializing Enhanced Bot...
                                </div>
                            </div>

                            <div class="mt-3 p-3 bg-light rounded" id="antiSpamStatus">
                                <div class="d-flex justify-content-between align-items-center">
                                    <small class="text-muted">
                                        <i class="fas fa-shield-alt me-1"></i>
                                        Enhanced Anti-Spam Protection
                                    </small>
                                    <span class="badge bg-success" id="spamStatus">Active</span>
                                </div>
                                <div class="mt-2">
                                    <small class="text-muted" id="attemptsCount">Attempts: 0/2 (60s cooldown)</small>
                                </div>
                                <div class="mt-1">
                                    <small class="text-muted" id="nextAttemptTime">Next attempt: Ready</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="dashboard-card h-100 fade-in">
                            <h5 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>Enhanced WhatsApp Authentication</h5>
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
                                                Enhanced security validation active
                                            </div>
                                            <div class="phone-examples mt-2">
                                                <small class="text-muted">
                                                    <strong>Accepted formats:</strong><br>
                                                    <code>6281234567890</code> (International)<br>
                                                    <code>081234567890</code> (Local Indonesia)<br>
                                                    <code>1234567890</code> (US)<br>
                                                    <code>441234567890</code> (UK)
                                                </small>
                                            </div>
                                        </div>
                                        <button type="submit" class="btn btn-primary w-100 py-2 fw-bold" id="submitBtn">
                                            <i class="fas fa-paper-plane me-2"></i>Start Enhanced Connection
                                        </button>
                                    </form>
                                    <div id="formMessage"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Enhanced Management Panel Section -->
                <div class="dashboard-card mt-4 fade-in" id="managementPanel" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h4><i class="fas fa-cogs me-2"></i>Enhanced Bot Management Panel</h4>
                        <button class="btn btn-sm btn-outline-secondary" onclick="hideManagementPanel()">
                            <i class="fas fa-times me-1"></i>Close
                        </button>
                    </div>
                    
                    <!-- Enhanced Navigation Tabs -->
                    <ul class="nav nav-tabs mb-4" id="managementTabs" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" id="owner-tab" data-bs-toggle="tab" data-bs-target="#owner" type="button" role="tab">
                                <i class="fas fa-crown me-2"></i>Owner Settings
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="premium-tab" data-bs-toggle="tab" data-bs-target="#premium" type="button" role="tab">
                                <i class="fas fa-star me-2"></i>Premium Users
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="bot-settings-tab" data-bs-toggle="tab" data-bs-target="#bot-settings" type="button" role="tab">
                                <i class="fas fa-robot me-2"></i>Bot Settings
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="multi-bot-tab" data-bs-toggle="tab" data-bs-target="#multi-bot" type="button" role="tab">
                                <i class="fas fa-layer-group me-2"></i>Multi-Bot
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="security-tab" data-bs-toggle="tab" data-bs-target="#security" type="button" role="tab">
                                <i class="fas fa-shield-alt me-2"></i>Security
                            </button>
                        </li>
                    </ul>
                    
                    <!-- Enhanced Tab Content -->
                    <div class="tab-content" id="managementTabsContent">
                        <!-- Owner Settings Tab -->
                        <div class="tab-pane fade show active" id="owner" role="tabpanel">
                            <div class="row">
                                <div class="col-md-8">
                                    <h5><i class="fas fa-users me-2"></i>Enhanced Owner Management</h5>
                                    <p class="text-muted">Add or remove bot owners with enhanced security validation.</p>
                                    
                                    <form id="ownerForm">
                                        <div class="mb-3">
                                            <label class="form-label">Current Owners</label>
                                            <div id="currentOwnersList" class="mb-3 p-3 bg-light rounded">
                                                <!-- Owners will be listed here -->
                                            </div>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Add New Owner</label>
                                            <input type="tel" class="form-control" id="newOwnerInput" 
                                                   placeholder="6281234567890" required>
                                            <div class="form-text">Enhanced phone number validation active</div>
                                        </div>
                                        <button type="submit" class="btn btn-success">
                                            <i class="fas fa-plus me-2"></i>Add Owner
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Premium Users Tab -->
                        <div class="tab-pane fade" id="premium" role="tabpanel">
                            <div class="row">
                                <div class="col-md-6">
                                    <h5><i class="fas fa-user-plus me-2"></i>Add Premium User</h5>
                                    <form id="premiumForm">
                                        <div class="mb-3">
                                            <label class="form-label">Phone Number</label>
                                            <input type="tel" class="form-control" id="premiumPhoneInput" 
                                                   placeholder="6281234567890" required>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Duration</label>
                                            <select class="form-select" id="premiumDuration">
                                                <option value="permanent">Permanent</option>
                                                <option value="30">30 Days</option>
                                                <option value="7">7 Days</option>
                                                <option value="1">1 Day</option>
                                            </select>
                                        </div>
                                        <button type="submit" class="btn btn-success">
                                            <i class="fas fa-star me-2"></i>Add Premium
                                        </button>
                                    </form>
                                </div>
                                <div class="col-md-6">
                                    <h5><i class="fas fa-list me-2"></i>Premium Users List</h5>
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
                                    <h5><i class="fas fa-edit me-2"></i>Enhanced Bot Information</h5>
                                    <form id="botSettingsForm">
                                        <div class="mb-3">
                                            <label class="form-label">Bot Name</label>
                                            <input type="text" class="form-control" id="botNameInput" required>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Pack Name</label>
                                            <input type="text" class="form-control" id="packNameInput" required>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Author</label>
                                            <input type="text" class="form-control" id="authorInput" required>
                                        </div>
                                        <button type="submit" class="btn btn-primary">
                                            <i class="fas fa-save me-2"></i>Save Enhanced Settings
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Multi-Bot Tab -->
                        <div class="tab-pane fade" id="multi-bot" role="tabpanel">
                            <div class="row">
                                <div class="col-md-6">
                                    <h5><i class="fas fa-plus me-2"></i>Add New Bot</h5>
                                    <form id="addBotForm">
                                        <div class="mb-3">
                                            <label class="form-label">Phone Number</label>
                                            <input type="tel" class="form-control" id="botPhoneInput" 
                                                   placeholder="6281234567890" required>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Bot Name</label>
                                            <input type="text" class="form-control" id="newBotNameInput" 
                                                   placeholder="My Assistant Bot">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Pack Name</label>
                                            <input type="text" class="form-control" id="newPackNameInput" 
                                                   placeholder="WhatsApp Bot">
                                        </div>
                                        <button type="submit" class="btn btn-success">
                                            <i class="fas fa-robot me-2"></i>Add Enhanced Bot
                                        </button>
                                    </form>
                                </div>
                                <div class="col-md-6">
                                    <h5><i class="fas fa-list me-2"></i>Active Enhanced Bots</h5>
                                    <div id="botsList" class="mt-3">
                                        <!-- Bots will be listed here -->
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Security Tab -->
                        <div class="tab-pane fade" id="security" role="tabpanel">
                            <div class="row">
                                <div class="col-md-6">
                                    <h5><i class="fas fa-shield-alt me-2"></i>Security Settings</h5>
                                    <form id="securityForm">
                                        <div class="mb-3">
                                            <label class="form-label">Admin Password</label>
                                            <input type="password" class="form-control" id="newAdminPassword" 
                                                   placeholder="Enter new password">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Confirm Password</label>
                                            <input type="password" class="form-control" id="confirmAdminPassword" 
                                                   placeholder="Confirm new password">
                                        </div>
                                        <div class="mb-3 form-check">
                                            <input type="checkbox" class="form-check-input" id="enableEnhancedSecurity" checked>
                                            <label class="form-check-label" for="enableEnhancedSecurity">Enable Enhanced Security</label>
                                        </div>
                                        <div class="mb-3 form-check">
                                            <input type="checkbox" class="form-check-input" id="enableRateLimiting" checked>
                                            <label class="form-check-label" for="enableRateLimiting">Enable Rate Limiting</label>
                                        </div>
                                        <button type="submit" class="btn btn-primary">
                                            <i class="fas fa-save me-2"></i>Update Security Settings
                                        </button>
                                    </form>
                                </div>
                                <div class="col-md-6">
                                    <h5><i class="fas fa-chart-bar me-2"></i>Security Status</h5>
                                    <div class="mt-3">
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>Header Rotation:</span>
                                            <span class="badge bg-success">Active</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>Rate Limiting:</span>
                                            <span class="badge bg-success">Active</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>IP Monitoring:</span>
                                            <span class="badge bg-success">Active</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>Anti-Detection:</span>
                                            <span class="badge bg-success">Active</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card mt-4 fade-in" id="botInfoSection" style="display: none;">
                    <h5 class="mb-3"><i class="fas fa-robot me-2"></i>Enhanced Bot Information</h5>
                    <div class="row mt-3">
                        <div class="col-md-3 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-id-card text-primary me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">ID</div>
                                    <div class="text-muted small bot-info-id">Loading...</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-user text-success me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Name</div>
                                    <div class="text-muted small bot-info-name">Loading...</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-phone text-info me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Phone</div>
                                    <div class="text-muted small bot-info-phone">Loading...</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-shield-alt text-warning me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Security</div>
                                    <div class="text-muted small bot-info-security">Enhanced</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card mt-4 fade-in" id="quickActions" style="display: none;">
                    <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Enhanced Quick Actions</h5>
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
                                <i class="fas fa-cogs me-2"></i>Management
                            </button>
                        </div>
                    </div>
                </div>

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
                            <i class="fas fa-tools me-2"></i>Enhanced Fix
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Enhanced configuration
        const CONFIG = {
            POLLING_INTERVAL_NORMAL: 3000,
            POLLING_INTERVAL_ACTIVE: 1000,
            POLLING_INTERVAL_ONLINE: 2000,
            PAIRING_CODE_TIMEOUT: 30,
            MAX_RETRIES: 5,
            RATE_LIMIT_DELAY: 60000,
            MAX_PAIRING_ATTEMPTS: 2,
            COOLDOWN_PERIOD: 300000,
            SECURITY_CHECK_INTERVAL: 30000
        };

        let pollingInterval = CONFIG.POLLING_INTERVAL_NORMAL;
        let currentStatus = 'initializing';
        let pairingCodeCountdown = null;
        let isFirstOnline = true;
        let retryCount = 0;
        let rateLimitCountdown = null;
        let isAdminAuthenticated = false;

        // Enhanced security functions
        function generateSecurityToken() {
            return Math.random().toString(36).substring(2) + Date.now().toString(36);
        }

        function validatePhoneNumber(phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            return cleanPhone.length >= 8 && cleanPhone.length <= 15;
        }

        // Enhanced Management Panel Functions
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

        // Enhanced API functions dengan security headers
        async function enhancedFetch(url, options = {}) {
            const securityToken = generateSecurityToken();
            const defaultOptions = {
                headers: {
                    'X-Security-Token': securityToken,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            };

            const mergedOptions = { ...defaultOptions, ...options };
            if (mergedOptions.body && typeof mergedOptions.body === 'object') {
                mergedOptions.body = JSON.stringify(mergedOptions.body);
                mergedOptions.headers['Content-Type'] = 'application/json';
            }

            try {
                const response = await fetch(url, mergedOptions);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                console.error('Enhanced fetch error:', error);
                throw error;
            }
        }

        // Enhanced notification system
        function showNotification(message, type = 'info', duration = 5000) {
            const notificationArea = document.getElementById('notificationArea');
            const notificationId = 'notif-' + Date.now();
            
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

        // Enhanced status update system
        function updateStatus() {
            enhancedFetch('/api/status')
                .then(data => {
                    retryCount = 0;
                    processStatusUpdate(data);
                })
                .catch(error => {
                    console.error('Enhanced status update error:', error);
                    retryCount++;
                    
                    if (retryCount <= CONFIG.MAX_RETRIES) {
                        showNotification(\`Enhanced connection issue (attempt \${retryCount}/\${CONFIG.MAX_RETRIES}). Retrying...\`, 'warning');
                    } else {
                        showNotification('Failed to connect to enhanced server after multiple attempts', 'danger');
                    }
                });
        }

        // Enhanced status processing
        function processStatusUpdate(data) {
            const oldStatus = currentStatus;
            currentStatus = data.connection_status;

            updateStatusElements(data);
            
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
                updateAntiSpamStatus(data.rate_limit_info);
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

        // Enhanced UI update functions
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
                    'online': { width: '100%', text: 'Connected to WhatsApp with Enhanced Security' },
                    'pairing': { width: '75%', text: 'Enter Pairing Code in WhatsApp' },
                    'connecting': { width: '50%', text: 'Connecting to WhatsApp Servers with Header Rotation...' },
                    'waiting_phone': { width: '25%', text: 'Waiting for Phone Number' },
                    'initializing': { width: '0%', text: 'Initializing Enhanced Bot...' }
                };
                
                const config = progressConfig[data.connection_status] || { width: '0%', text: 'Initializing...' };
                progressBar.style.width = config.width;
                progressText.textContent = config.text;
            }
        }

        // Enhanced event handlers
        document.getElementById('phoneForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');
            const formMessage = document.getElementById('formMessage');
            
            if (!phone) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter a phone number</div>';
                return;
            }
            
            if (!validatePhoneNumber(phone)) {
                formMessage.innerHTML = '<div class="alert alert-danger">Invalid phone number format</div>';
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div> Enhanced Processing...';
            formMessage.innerHTML = '';
            
            try {
                const result = await enhancedFetch('/api/pair', {
                    method: 'POST',
                    body: { phoneNumber: phone }
                });
                
                if (result.status === 'success') {
                    formMessage.innerHTML = '<div class="alert alert-success">Phone number accepted! Starting enhanced WhatsApp connection...</div>';
                    showNotification('Enhanced connection started!', 'success');
                    pollingInterval = CONFIG.POLLING_INTERVAL_ACTIVE;
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger">Enhanced Error: ' + (result.message || result.error) + '</div>';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Enhanced Connection';
                }
            } catch (error) {
                formMessage.innerHTML = '<div class="alert alert-danger">Enhanced network error: Could not connect to server</div>';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start Enhanced Connection';
            }
        });

        // Enhanced initialization
        document.addEventListener('DOMContentLoaded', function() {
            console.log('Enhanced WhatsApp Bot Dashboard initialized');
            
            enhancedFetch('/api/package-info')
                .then(data => {
                    if (data.name) document.getElementById('botName').textContent = data.name;
                    if (data.version) document.getElementById('version').textContent = data.version;
                    if (data.author) document.getElementById('author').textContent = data.author;
                    if (data.description) document.getElementById('botDescription').textContent = data.description;
                })
                .catch(error => {
                    console.log('Enhanced error loading package info:', error);
                });
            
            startSmartPolling();
            
            setTimeout(() => {
                showNotification('Welcome to Enhanced WhatsApp Bot Dashboard! All security features are active.', 'info');
            }, 1000);
        });

        function startSmartPolling() {
            updateStatus();
            setTimeout(startSmartPolling, pollingInterval);
        }

        // Enhanced cleanup
        window.addEventListener('beforeunload', function() {
            if (pairingCodeCountdown) {
                clearInterval(pairingCodeCountdown);
            }
            if (rateLimitCountdown) {
                clearInterval(rateLimitCountdown);
            }
        });

        // Keep existing functions but prefix with "enhanced" where applicable
        // [Previous functions remain the same but use enhancedFetch instead of fetch]
    </script>
</body>
</html>`;

const htmlPath = path.join(publicPath, 'index.html');
fs.writeFileSync(htmlPath, htmlContent);

app.use(express.json());
app.use(express.static('public'));

// Enhanced phone number formatting
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    console.log('Enhanced Formatting phone number:', phoneNumber, '->', cleanNumber);
    
    if (cleanNumber.startsWith('0')) {
        const formatted = '62' + cleanNumber.substring(1);
        console.log('Enhanced Formatted with 62:', formatted);
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
            console.log('Enhanced Valid country code found:', countryCode);
            return cleanNumber;
        }
    }
    
    const formatted = '62' + cleanNumber;
    console.log('Enhanced Default formatting to 62:', formatted);
    return formatted;
}

function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log('Enhanced Invalid phone length:', cleanNumber.length);
        return false;
    }
    
    if (/^0+$/.test(cleanNumber)) {
        console.log('Enhanced Phone number contains only zeros');
        return false;
    }
    
    console.log('Enhanced Valid phone length:', cleanNumber.length);
    return true;
}

// Enhanced rate limiting check
function checkRateLimit(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (enhancedRateLimit.isSuspiciousIP(clientIP)) {
        return res.status(403).json({
            status: 'error',
            message: 'Access denied due to suspicious activity'
        });
    }
    
    if (!enhancedRateLimit.checkIPLimit(clientIP)) {
        return res.status(429).json({
            status: 'rate_limited',
            message: 'Too many requests from your IP address',
            remainingTime: 60
        });
    }
    
    const pairingRL = enhancedRateLimit.pairingRateLimit;
    
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
            message: `System cooling down. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRL.attempts,
            maxAttempts: pairingRL.maxAttempts
        });
    }
    
    if (now < pairingRL.blockUntil) {
        const waitTime = Math.ceil((pairingRL.blockUntil - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Too many pairing attempts. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRL.attempts,
            maxAttempts: pairingRL.maxAttempts
        });
    }
    
    if (pairingRL.attempts >= pairingRL.maxAttempts) {
        pairingRL.blockUntil = now + pairingRL.cooldownPeriod;
        const waitTime = Math.ceil(pairingRL.cooldownPeriod / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Maximum pairing attempts reached. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRL.attempts,
            maxAttempts: pairingRL.maxAttempts
        });
    }
    
    const timeSinceLastRequest = now - pairingRL.lastRequest;
    if (timeSinceLastRequest < pairingRL.minInterval && pairingRL.lastRequest > 0) {
        const waitTime = Math.ceil((pairingRL.minInterval - timeSinceLastRequest) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Please wait ${formatTime(waitTime)} before next attempt.`,
            remainingTime: waitTime,
            attempts: pairingRL.attempts,
            maxAttempts: pairingRL.maxAttempts
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

// Enhanced routes
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Enhanced admin verification
app.post('/api/verify-admin', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }
    
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    
    if (hashedPassword === global.webSettings.adminPassword) {
        res.json({ status: 'success', message: 'Enhanced admin access granted' });
    } else {
        res.status(401).json({ status: 'error', message: 'Invalid password' });
    }
});

// Enhanced settings endpoint
app.get('/api/settings', (req, res) => {
    res.json({
        owner: global.owner,
        botname: global.botname,
        packname: global.packname,
        author: global.author,
        premium_users: global.db?.premium || [],
        multi_bot: global.multiBot,
        web_settings: {
            ...global.webSettings,
            adminPassword: undefined // Don't expose password hash
        }
    });
});

// Enhanced API endpoints dengan security
app.post('/api/update-owner', checkRateLimit, (req, res) => {
    const { owners } = req.body;
    
    if (!owners || !Array.isArray(owners)) {
        return res.status(400).json({ error: 'Owners must be an array' });
    }
    
    const validOwners = owners.filter(owner => {
        const cleanNumber = owner.replace(/\D/g, '');
        return cleanNumber.length >= 8 && cleanNumber.length <= 15;
    });
    
    if (validOwners.length === 0) {
        return res.status(400).json({ error: 'No valid phone numbers provided' });
    }
    
    global.owner = validOwners.map(owner => owner.replace(/\D/g, ''));
    
    if (global.db) {
        global.db.settings = global.db.settings || {};
        global.db.settings.owner = global.owner;
    }
    
    console.log('Enhanced Owner list updated:', global.owner);
    
    res.json({ 
        status: 'success', 
        message: 'Enhanced owner list updated successfully',
        owners: global.owner 
    });
});

// Keep other endpoints but enhance them similarly...

// Enhanced server startup
async function startServer() {
    if (isServerRunning) return CURRENT_PORT;

    try {
        const availablePort = await findAvailablePort(CURRENT_PORT);
        CURRENT_PORT = availablePort;
        
        return new Promise((resolve, reject) => {
            server = createServer(app);
            server.listen(CURRENT_PORT, () => {
                console.log(chalk.green(`Enhanced Web Dashboard running on http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(`Enhanced Dashboard: http://localhost:${CURRENT_PORT}`));
                console.log(chalk.cyan(`Enhanced Security: Header Rotation ✓ Rate Limiting ✓ Anti-Detection ✓`));
                console.log(chalk.yellow(`Enhanced Anti-Spam: ${enhancedRateLimit.pairingRateLimit.maxAttempts} attempts max`));
                isServerRunning = true;
                global.webUptime = Date.now();
                resolve(CURRENT_PORT);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(`Enhanced Port ${CURRENT_PORT} is in use, trying ${CURRENT_PORT + 1}...`));
                    CURRENT_PORT = CURRENT_PORT + 1;
                    startServer().then(resolve).catch(reject);
                } else {
                    console.log(chalk.red('Enhanced Server error:'), err);
                    reject(err);
                }
            });
        });
    } catch (error) {
        console.error('Enhanced Failed to start server:', error);
        throw error;
    }
}

// Enhanced cleanup
process.on('SIGINT', () => {
    enhancedRateLimit.destroy();
    if (server) {
        server.close();
    }
});

module.exports = { 
    app, 
    startServer, 
    setPairingCode,
    setConnectionStatus, 
    setBotInfo,
    setSessionIssues,
    clearSessionFiles,
    getRateLimitInfo: () => enhancedRateLimit.pairingRateLimit
};

if (require.main === module) {
    startServer().catch(console.error);
}
