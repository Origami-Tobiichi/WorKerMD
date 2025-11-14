const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { exec, spawn } = require('child_process');

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

//  PERBAIKAN: Rate limiting system yang lebih ketat
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
        description: 'WhatsApp Bot with Web Dashboard'
    };
}

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
}

app.use(express.static(publicPath));

//  HTML CONTENT LENGKAP DENGAN MANAGEMENT PANEL
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot - Dashboard</title>
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
            background: #6f42c1; 
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
            border-left: 4px solid #6f42c1;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        .rate-limit-alert .btn {
            background: rgba(255,255,255,0.2);
            color: white;
            border: 1px solid rgba(255,255,255,0.3);
        }
        .security-badge {
            font-size: 0.75rem;
            padding: 3px 8px;
            border-radius: 10px;
        }
        .whatsapp-guide {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }
        .whatsapp-guide ol {
            margin: 0;
            padding-left: 20px;
        }
        .whatsapp-guide li {
            margin: 8px 0;
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
    </style>
</head>
<body>
    <div id="notificationArea"></div>

    <div class="container py-4">
        <!-- Admin Login Modal -->
        <div class="admin-login fade-in" id="adminLogin" style="display: none;">
            <div class="text-center mb-4">
                <i class="fas fa-lock fa-3x text-primary mb-3"></i>
                <h3>Admin Authentication</h3>
                <p class="text-muted">Enter admin password to access management panel</p>
            </div>
            <form id="adminLoginForm">
                <div class="mb-3">
                    <label class="form-label">Password</label>
                    <input type="password" class="form-control" id="adminPassword" required>
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
                                <span class="security-badge bg-success ms-2">
                                    <i class="fas fa-shield-alt me-1"></i>Anti-Spam
                                </span>
                            </h1>
                            <p class="lead text-muted mb-3" id="botDescription">WhatsApp Bot with Web Dashboard</p>
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
                                    <small class="text-muted">Uptime: <span id="uptime">0</span>s</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="whatsapp-guide fade-in mb-4" id="connectionGuide">
                    <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>How to Connect Your WhatsApp</h5>
                    <ol>
                        <li>Enter your WhatsApp number below (any format)</li>
                        <li>Click "Start WhatsApp Connection"</li>
                        <li>Wait for the pairing code to appear</li>
                        <li>Open WhatsApp on your phone</li>
                        <li>Go to <strong>Settings  Linked Devices  Link a Device</strong></li>
                        <li>Enter the pairing code when prompted</li>
                        <li>Wait for connection confirmation</li>
                    </ol>
                </div>

                <div class="alert rate-limit-alert mb-4" id="rateLimitAlert" style="display: none;">
                    <h5 class="mb-2"><i class="fas fa-shield-alt me-2"></i>Anti-Spam Protection Active</h5>
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
                    <h5 class="mb-2"><i class="fas fa-exclamation-triangle me-2"></i>Session Issues Detected</h5>
                    <p class="mb-3">There are problems with the current WhatsApp session. Messages may not be decrypting properly.</p>
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
                                     Initializing Bot...
                                </div>
                            </div>

                            <div class="mt-3 p-3 bg-light rounded" id="antiSpamStatus">
                                <div class="d-flex justify-content-between align-items-center">
                                    <small class="text-muted">
                                        <i class="fas fa-shield-alt me-1"></i>
                                        Anti-Spam Protection
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
                            <h5 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>WhatsApp Authentication</h5>
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
                                                Enter your phone number in any format
                                            </div>
                                            <div class="phone-examples mt-2">
                                                <small class="text-muted">
                                                    <strong>Accepted formats:</strong><br>
                                                     <code>6281234567890</code> (International)<br>
                                                     <code>081234567890</code> (Local Indonesia)<br>
                                                     <code>1234567890</code> (US)<br>
                                                     <code>441234567890</code> (UK)
                                                </small>
                                            </div>
                                        </div>
                                        <button type="submit" class="btn btn-primary w-100 py-2 fw-bold" id="submitBtn">
                                            <i class="fas fa-paper-plane me-2"></i>Start WhatsApp Connection
                                        </button>
                                    </form>
                                    <div id="formMessage"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Management Panel Section -->
                <div class="dashboard-card mt-4 fade-in" id="managementPanel" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h4><i class="fas fa-cogs me-2"></i>Bot Management Panel</h4>
                        <button class="btn btn-sm btn-outline-secondary" onclick="hideManagementPanel()">
                            <i class="fas fa-times me-1"></i>Close
                        </button>
                    </div>
                    
                    <!-- Navigation Tabs -->
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
                    </ul>
                    
                    <!-- Tab Content -->
                    <div class="tab-content" id="managementTabsContent">
                        <!-- Owner Settings Tab -->
                        <div class="tab-pane fade show active" id="owner" role="tabpanel">
                            <div class="row">
                                <div class="col-md-8">
                                    <h5><i class="fas fa-users me-2"></i>Manage Owners</h5>
                                    <p class="text-muted">Add or remove bot owners. Owners have full access to all features.</p>
                                    
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
                                            <div class="form-text">Enter phone number in international format</div>
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
                                    <h5><i class="fas fa-edit me-2"></i>Bot Information</h5>
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
                                            <i class="fas fa-save me-2"></i>Save Settings
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
                                            <i class="fas fa-robot me-2"></i>Add Bot
                                        </button>
                                    </form>
                                </div>
                                <div class="col-md-6">
                                    <h5><i class="fas fa-list me-2"></i>Active Bots</h5>
                                    <div id="botsList" class="mt-3">
                                        <!-- Bots will be listed here -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card mt-4 fade-in" id="botInfoSection" style="display: none;">
                    <h5 class="mb-3"><i class="fas fa-robot me-2"></i>Bot Information</h5>
                    <div class="row mt-3">
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-id-card text-primary me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">ID</div>
                                    <div class="text-muted small bot-info-id">Loading...</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-user text-success me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Name</div>
                                    <div class="text-muted small bot-info-name">Loading...</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-phone text-info me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Phone</div>
                                    <div class="text-muted small bot-info-phone">Loading...</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

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
                            <i class="fas fa-tools me-2"></i>Advanced Fix
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
        }

        function loadOwners() {
            fetch('/api/settings')
                .then(r => r.json())
                .then(data => {
                    const ownersList = document.getElementById('currentOwnersList');
                    if (data.owner && data.owner.length > 0) {
                        ownersList.innerHTML = data.owner.map(owner => \`
                            <div class="d-flex justify-content-between align-items-center mb-2 p-2 bg-white rounded">
                                <span>+\${owner}</span>
                                <button class="btn btn-sm btn-outline-danger remove-owner" data-owner="\${owner}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        \`).join('');
                        
                        document.querySelectorAll('.remove-owner').forEach(btn => {
                            btn.addEventListener('click', function() {
                                const ownerToRemove = this.getAttribute('data-owner');
                                removeOwner(ownerToRemove);
                            });
                        });
                    } else {
                        ownersList.innerHTML = '<div class="text-muted">No owners configured</div>';
                    }
                })
                .catch(error => {
                    console.error('Error loading owners:', error);
                });
        }

        function loadPremiumUsers() {
            fetch('/api/premium-users')
                .then(r => r.json())
                .then(data => {
                    const premiumList = document.getElementById('premiumUsersList');
                    if (data.premium_users && data.premium_users.length > 0) {
                        premiumList.innerHTML = data.premium_users.map(user => \`
                            <div class="d-flex justify-content-between align-items-center mb-2 p-2 bg-light rounded">
                                <div>
                                    <strong>+\${user.number}</strong>
                                    <br><small class="text-muted">Added: \${new Date(user.addedAt).toLocaleDateString()}</small>
                                    \${user.duration && user.duration !== 'permanent' ? \`<br><small class="text-muted">Expires: \${new Date(user.expiresAt).toLocaleDateString()}</small>\` : ''}
                                </div>
                                <button class="btn btn-sm btn-outline-danger remove-premium" data-number="\${user.number}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        \`).join('');
                        
                        document.querySelectorAll('.remove-premium').forEach(btn => {
                            btn.addEventListener('click', function() {
                                const numberToRemove = this.getAttribute('data-number');
                                removePremiumUser(numberToRemove);
                            });
                        });
                    } else {
                        premiumList.innerHTML = '<div class="alert alert-info">No premium users</div>';
                    }
                })
                .catch(error => {
                    console.error('Error loading premium users:', error);
                });
        }

        function loadBots() {
            fetch('/api/bots')
                .then(r => r.json())
                .then(data => {
                    const botsList = document.getElementById('botsList');
                    let botsHtml = '';
                    
                    if (data.main_bot && data.main_bot.phoneNumber) {
                        botsHtml += \`
                            <div class="bot-card \${data.main_bot.status === 'online' ? 'active' : ''}">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="mb-0">\${data.main_bot.botname || 'Main Bot'}</h6>
                                    <span class="badge bg-\${data.main_bot.status === 'online' ? 'success' : 'warning'}">\${data.main_bot.status}</span>
                                </div>
                                <div class="text-muted small">
                                    <div>+\${data.main_bot.phoneNumber}</div>
                                    <div>Main Bot</div>
                                </div>
                            </div>
                        \`;
                    }
                    
                    if (data.additional_bots && data.additional_bots.length > 0) {
                        data.additional_bots.forEach(bot => {
                            botsHtml += \`
                                <div class="bot-card \${bot.status === 'active' ? 'active' : ''}">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <h6 class="mb-0">\${bot.botname}</h6>
                                        <span class="badge bg-\${bot.status === 'active' ? 'success' : 'secondary'}">\${bot.status}</span>
                                    </div>
                                    <div class="text-muted small">
                                        <div>+\${bot.phoneNumber}</div>
                                        <div>Added: \${new Date(bot.createdAt).toLocaleDateString()}</div>
                                    </div>
                                    <div class="mt-2">
                                        <button class="btn btn-sm btn-outline-primary start-pairing" data-bot-id="\${bot.id}">
                                            <i class="fas fa-qrcode me-1"></i>Pair
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger remove-bot" data-bot-id="\${bot.id}">
                                            <i class="fas fa-trash me-1"></i>Remove
                                        </button>
                                    </div>
                                </div>
                            \`;
                        });
                    } else {
                        botsHtml += '<div class="alert alert-info">No additional bots</div>';
                    }
                    
                    botsList.innerHTML = botsHtml;
                    
                    document.querySelectorAll('.start-pairing').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const botId = this.getAttribute('data-bot-id');
                            startBotPairing(botId);
                        });
                    });
                    
                    document.querySelectorAll('.remove-bot').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const botId = this.getAttribute('data-bot-id');
                            removeBot(botId);
                        });
                    });
                })
                .catch(error => {
                    console.error('Error loading bots:', error);
                });
        }

        function loadBotSettings() {
            fetch('/api/settings')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('botNameInput').value = data.botname || '';
                    document.getElementById('packNameInput').value = data.packname || '';
                    document.getElementById('authorInput').value = data.author || '';
                })
                .catch(error => {
                    console.error('Error loading bot settings:', error);
                });
        }

        // Form handlers untuk management panel
        document.getElementById('adminLoginForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const password = document.getElementById('adminPassword').value;
            
            fetch('/api/verify-admin', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({password: password})
            })
            .then(r => r.json())
            .then(result => {
                if (result.status === 'success') {
                    isAdminAuthenticated = true;
                    hideAdminLogin();
                    showManagementPanel();
                    showNotification('Admin access granted', 'success');
                } else {
                    showNotification('Invalid password', 'danger');
                }
            })
            .catch(error => {
                showNotification('Error verifying admin access', 'danger');
            });
        });

        document.getElementById('ownerForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const newOwner = document.getElementById('newOwnerInput').value.trim();
            if (newOwner) {
                addOwner(newOwner);
            }
        });

        document.getElementById('premiumForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const phone = document.getElementById('premiumPhoneInput').value.trim();
            const duration = document.getElementById('premiumDuration').value;
            if (phone) {
                addPremiumUser(phone, duration);
            }
        });

        document.getElementById('botSettingsForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const botname = document.getElementById('botNameInput').value.trim();
            const packname = document.getElementById('packNameInput').value.trim();
            const author = document.getElementById('authorInput').value.trim();
            updateBotSettings(botname, packname, author);
        });

        document.getElementById('addBotForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const phone = document.getElementById('botPhoneInput').value.trim();
            const botname = document.getElementById('newBotNameInput').value.trim();
            const packname = document.getElementById('newPackNameInput').value.trim();
            addNewBot(phone, botname, packname);
        });

        // API call functions untuk management
        function addOwner(phoneNumber) {
            fetch('/api/settings')
                .then(r => r.json())
                .then(currentSettings => {
                    const updatedOwners = [...(currentSettings.owner || []), phoneNumber.replace(/\\D/g, '')];
                    
                    fetch('/api/update-owner', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({owners: updatedOwners})
                    })
                    .then(r => r.json())
                    .then(result => {
                        if (result.status === 'success') {
                            showNotification('Owner added successfully', 'success');
                            loadOwners();
                            document.getElementById('newOwnerInput').value = '';
                        } else {
                            showNotification('Error adding owner: ' + result.error, 'danger');
                        }
                    })
                    .catch(error => {
                        showNotification('Error adding owner', 'danger');
                    });
                })
                .catch(error => {
                    showNotification('Error loading current settings', 'danger');
                });
        }

        function removeOwner(ownerToRemove) {
            if (confirm('Are you sure you want to remove this owner?')) {
                fetch('/api/settings')
                    .then(r => r.json())
                    .then(currentSettings => {
                        const updatedOwners = (currentSettings.owner || []).filter(owner => owner !== ownerToRemove);
                        
                        if (updatedOwners.length === 0) {
                            showNotification('Cannot remove all owners', 'warning');
                            return;
                        }
                        
                        fetch('/api/update-owner', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({owners: updatedOwners})
                        })
                        .then(r => r.json())
                        .then(result => {
                            if (result.status === 'success') {
                                showNotification('Owner removed successfully', 'success');
                                loadOwners();
                            } else {
                                showNotification('Error removing owner: ' + result.error, 'danger');
                            }
                        })
                        .catch(error => {
                            showNotification('Error removing owner', 'danger');
                        });
                    })
                    .catch(error => {
                        showNotification('Error loading current settings', 'danger');
                    });
            }
        }

        function addPremiumUser(phoneNumber, duration) {
            fetch('/api/add-premium', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({phoneNumber, duration})
            })
            .then(r => r.json())
            .then(result => {
                if (result.status === 'success') {
                    showNotification('Premium user added successfully', 'success');
                    loadPremiumUsers();
                    document.getElementById('premiumPhoneInput').value = '';
                } else {
                    showNotification('Error adding premium user: ' + result.error, 'danger');
                }
            })
            .catch(error => {
                showNotification('Error adding premium user', 'danger');
            });
        }

        function removePremiumUser(phoneNumber) {
            if (confirm('Remove premium status from this user?')) {
                fetch('/api/remove-premium', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber})
                })
                .then(r => r.json())
                .then(result => {
                    if (result.status === 'success') {
                        showNotification('Premium user removed successfully', 'success');
                        loadPremiumUsers();
                    } else {
                        showNotification('Error removing premium user: ' + result.error, 'danger');
                    }
                })
                .catch(error => {
                    showNotification('Error removing premium user', 'danger');
                });
            }
        }

        function updateBotSettings(botname, packname, author) {
            fetch('/api/update-bot-settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({botname, packname, author})
            })
            .then(r => r.json())
            .then(result => {
                if (result.status === 'success') {
                    showNotification('Bot settings updated successfully', 'success');
                    // Update displayed bot name
                    document.getElementById('botName').textContent = botname;
                } else {
                    showNotification('Error updating settings: ' + result.error, 'danger');
                }
            })
            .catch(error => {
                showNotification('Error updating settings', 'danger');
            });
        }

        function addNewBot(phoneNumber, botname, packname) {
            fetch('/api/add-bot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({phoneNumber, botname, packname})
            })
            .then(r => r.json())
            .then(result => {
                if (result.status === 'success') {
                    showNotification('Bot added successfully', 'success');
                    loadBots();
                    document.getElementById('addBotForm').reset();
                } else {
                    showNotification('Error adding bot: ' + result.error, 'danger');
                }
            })
            .catch(error => {
                showNotification('Error adding bot', 'danger');
            });
        }

        function removeBot(botId) {
            if (confirm('Are you sure you want to remove this bot?')) {
                fetch('/api/remove-bot', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({botId})
                })
                .then(r => r.json())
                .then(result => {
                    if (result.status === 'success') {
                        showNotification('Bot removed successfully', 'success');
                        loadBots();
                    } else {
                        showNotification('Error removing bot: ' + result.error, 'danger');
                    }
                })
                .catch(error => {
                    showNotification('Error removing bot', 'danger');
                });
            }
        }

        function startBotPairing(botId) {
            fetch('/api/start-bot-pairing', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({botId})
            })
            .then(r => r.json())
            .then(result => {
                if (result.status === 'success') {
                    showNotification('Bot pairing started', 'success');
                    loadBots();
                } else {
                    showNotification('Error starting pairing: ' + result.error, 'danger');
                }
            })
            .catch(error => {
                showNotification('Error starting pairing', 'danger');
            });
        }

        // Original dashboard functions (tetap seperti sebelumnya)
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
                    'online': { width: '100%', text: ' Connected to WhatsApp' },
                    'pairing': { width: '75%', text: ' Enter Pairing Code in WhatsApp' },
                    'connecting': { width: '50%', text: ' Connecting to WhatsApp Servers...' },
                    'waiting_phone': { width: '25%', text: ' Waiting for Phone Number' },
                    'initializing': { width: '0%', text: ' Initializing Bot...' }
                };
                
                const config = progressConfig[data.connection_status] || { width: '0%', text: ' Initializing...' };
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
                            <strong>Go to WhatsApp  Linked Devices  Link a Device  Enter this code</strong>
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
            updateAntiSpamStatus(rateLimitData);
        }

        function updateAntiSpamStatus(rateLimitInfo) {
            const attemptsElement = document.getElementById('attemptsCount');
            const nextAttemptElement = document.getElementById('nextAttemptTime');
            const spamStatusElement = document.getElementById('spamStatus');
            
            if (!rateLimitInfo) return;
            
            if (attemptsElement) {
                attemptsElement.textContent = \`Attempts: \${rateLimitInfo.attempts || 0}/\${CONFIG.MAX_PAIRING_ATTEMPTS} (60s cooldown)\`;
            }
            
            if (spamStatusElement) {
                const now = Date.now();
                const lastRequest = rateLimitInfo.lastRequest || 0;
                const timeSinceLast = now - lastRequest;
                const cooldownRemaining = CONFIG.RATE_LIMIT_DELAY - timeSinceLast;
                
                if (cooldownRemaining > 0) {
                    spamStatusElement.textContent = 'Cooling Down';
                    spamStatusElement.className = 'badge bg-warning';
                    if (nextAttemptElement) {
                        nextAttemptElement.textContent = \`Next attempt: \${formatTime(Math.ceil(cooldownRemaining / 1000))}\`;
                    }
                } else {
                    spamStatusElement.textContent = 'Ready';
                    spamStatusElement.className = 'badge bg-success';
                    if (nextAttemptElement) {
                        nextAttemptElement.textContent = 'Next attempt: Ready';
                    }
                }
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

        function handleOnlineStatus() {
            const authStatusSection = document.getElementById('authStatusSection');
            if (!authStatusSection) return;
            
            authStatusSection.innerHTML = \`
                <div class="alert alert-success text-center py-4 fade-in online-pulse" id="onlineStatusSection">
                    <i class="fas fa-check-circle fa-3x mb-3 text-success"></i>
                    <h4 class="mb-2">Connected Successfully!</h4>
                    <p class="mb-0 text-muted">Your bot is now connected to WhatsApp</p>
                </div>
            \`;
            
            if (isFirstOnline) {
                showNotification(' Successfully connected to WhatsApp!', 'success');
                isFirstOnline = false;
            }
            
            document.getElementById('botInfoSection').style.display = 'block';
        }

        function updateBotInfoSection(botInfo) {
            if (!botInfo) return;
            
            const botInfoSection = document.getElementById('botInfoSection');
            if (botInfoSection) {
                const idElement = botInfoSection.querySelector('.bot-info-id');
                const nameElement = botInfoSection.querySelector('.bot-info-name');
                const phoneElement = botInfoSection.querySelector('.bot-info-phone');
                
                if (idElement) idElement.textContent = botInfo.id || 'N/A';
                if (nameElement) nameElement.textContent = botInfo.name || 'N/A';
                if (phoneElement) phoneElement.textContent = '+' + (botInfo.phone || 'N/A');
                
                botInfoSection.style.display = 'block';
            }
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

        // Event listeners untuk tombol utama
        document.getElementById('phoneForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');
            const formMessage = document.getElementById('formMessage');
            
            if (!phone) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter a phone number</div>';
                return;
            }
            
            const cleanPhone = phone.replace(/\D/g, '');
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
                    formMessage.innerHTML = '<div class="alert alert-success">Phone number accepted! Starting WhatsApp connection...</div>';
                    showNotification('Phone number accepted! Starting connection...', 'success');
                    
                    pollingInterval = CONFIG.POLLING_INTERVAL_ACTIVE;
                    
                } else if (result.status === 'rate_limited') {
                    formMessage.innerHTML = '<div class="alert alert-warning">Too many attempts. Please wait before trying again.</div>';
                    showNotification(result.message, 'warning');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start WhatsApp Connection';
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger">Error: ' + (result.message || result.error) + '</div>';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start WhatsApp Connection';
                }
            } catch (error) {
                formMessage.innerHTML = '<div class="alert alert-danger">Network error: Could not connect to server</div>';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Start WhatsApp Connection';
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

        document.getElementById('changeNumberBtn')?.addEventListener('click', () => {
            if (confirm('Change phone number? This will clear the current session.')) {
                fetch('/api/clear-session', {method: 'POST'})
                    .then(() => {
                        showNotification('Session cleared. Ready for new number.', 'info');
                        setTimeout(() => location.reload(), 1000);
                    })
                    .catch(error => {
                        showNotification('Error clearing session', 'danger');
                    });
            }
        });

        document.getElementById('checkSessionBtn')?.addEventListener('click', () => {
            fetch('/api/session-status')
                .then(r => r.json())
                .then(data => {
                    const message = data.has_session ? 
                        ' Session exists and is active' : 
                        ' No active session found';
                    showNotification(message, data.has_session ? 'success' : 'warning');
                })
                .catch(error => {
                    showNotification('Error checking session status', 'danger');
                });
        });

        document.getElementById('fixSessionBtn')?.addEventListener('click', () => {
            if (confirm('Attempt to fix session issues? This will clear problematic session files but keep your authentication.')) {
                fetch('/api/fix-session', {method: 'POST'})
                    .then(r => r.json())
                    .then(result => {
                        showNotification(result.message, 'warning');
                        setTimeout(() => location.reload(), 2000);
                    })
                    .catch(error => {
                        showNotification('Error fixing session', 'danger');
                    });
            }
        });

        document.getElementById('clearAndRestartBtn')?.addEventListener('click', () => {
            if (confirm('Completely clear session and restart? This will remove all session data and require full re-authentication.')) {
                fetch('/api/clear-and-restart', {method: 'POST'})
                    .then(r => r.json())
                    .then(result => {
                        showNotification(result.message, 'warning');
                        setTimeout(() => location.reload(), 3000);
                    })
                    .catch(error => {
                        showNotification('Error during clear and restart', 'danger');
                    });
            }
        });

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

        document.getElementById('managementPanelBtn')?.addEventListener('click', showManagementPanel);

        function startSmartPolling() {
            updateStatus();
            setTimeout(startSmartPolling, pollingInterval);
        }

        document.addEventListener('DOMContentLoaded', function() {
            console.log(' WhatsApp Bot Dashboard initialized');
            
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
            
            startSmartPolling();
            
            setTimeout(() => {
                showNotification('Welcome to WhatsApp Bot Dashboard! Anti-spam protection is active.', 'info');
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

const htmlPath = path.join(publicPath, 'index.html');
fs.writeFileSync(htmlPath, htmlContent);

app.use(express.json());
app.use(express.static('public'));

//  FUNGSI BARU: Format dan validasi nomor di server
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    console.log(' Formatting phone number:', phoneNumber, '->', cleanNumber);
    
    // Jika nomor diawali dengan 0, ganti dengan 62 (Indonesia)
    if (cleanNumber.startsWith('0')) {
        const formatted = '62' + cleanNumber.substring(1);
        console.log(' Formatted with 62:', formatted);
        return formatted;
    }
    
    // Country code yang umum
    const validCountryCodes = [
        '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', 
        '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', 
        '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', 
        '93', '94', '95', '98'
    ];
    
    // Cek jika sudah memiliki country code yang valid
    for (let i = 3; i >= 1; i--) {
        const countryCode = cleanNumber.substring(0, i);
        if (validCountryCodes.includes(countryCode)) {
            console.log(' Valid country code found:', countryCode);
            return cleanNumber;
        }
    }
    
    // Default: tambahkan 62 untuk Indonesia
    const formatted = '62' + cleanNumber;
    console.log(' Default formatting to 62:', formatted);
    return formatted;
}

function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Minimal 8 digit, maksimal 15 digit
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        console.log(' Invalid phone length:', cleanNumber.length);
        return false;
    }
    
    console.log(' Valid phone length:', cleanNumber.length);
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
            message: `System cooling down. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts
        });
    }
    
    if (now < pairingRateLimit.blockUntil) {
        const waitTime = Math.ceil((pairingRateLimit.blockUntil - now) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Too many pairing attempts. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts
        });
    }
    
    if (pairingRateLimit.attempts >= pairingRateLimit.maxAttempts) {
        pairingRateLimit.blockUntil = now + pairingRateLimit.cooldownPeriod;
        const waitTime = Math.ceil(pairingRateLimit.cooldownPeriod / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Maximum pairing attempts reached. Please wait ${formatTime(waitTime)} before trying again.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts
        });
    }
    
    const timeSinceLastRequest = now - pairingRateLimit.lastRequest;
    if (timeSinceLastRequest < pairingRateLimit.minInterval && pairingRateLimit.lastRequest > 0) {
        const waitTime = Math.ceil((pairingRateLimit.minInterval - timeSinceLastRequest) / 1000);
        return res.status(429).json({
            status: 'rate_limited',
            message: `Please wait ${formatTime(waitTime)} before next attempt.`,
            remainingTime: waitTime,
            attempts: pairingRateLimit.attempts,
            maxAttempts: pairingRateLimit.maxAttempts
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

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

//  ENDPOINT BARU: Verify admin access
app.post('/api/verify-admin', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }
    
    if (password === global.webSettings.adminPassword) {
        res.json({ status: 'success', message: 'Admin access granted' });
    } else {
        res.status(401).json({ status: 'error', message: 'Invalid password' });
    }
});

//  ENDPOINT BARU: Get current settings
app.get('/api/settings', (req, res) => {
    res.json({
        owner: global.owner,
        botname: global.botname,
        packname: global.packname,
        author: global.author,
        premium_users: global.db?.premium || [],
        multi_bot: global.multiBot,
        web_settings: global.webSettings
    });
});

//  ENDPOINT BARU: Update owner
app.post('/api/update-owner', checkRateLimit, (req, res) => {
    const { owners } = req.body;
    
    if (!owners || !Array.isArray(owners)) {
        return res.status(400).json({ error: 'Owners must be an array' });
    }
    
    // Validasi nomor owner
    const validOwners = owners.filter(owner => {
        const cleanNumber = owner.replace(/\D/g, '');
        return cleanNumber.length >= 8 && cleanNumber.length <= 15;
    });
    
    if (validOwners.length === 0) {
        return res.status(400).json({ error: 'No valid phone numbers provided' });
    }
    
    global.owner = validOwners.map(owner => owner.replace(/\D/g, ''));
    
    // Simpan ke database jika ada
    if (global.db) {
        global.db.settings = global.db.settings || {};
        global.db.settings.owner = global.owner;
    }
    
    console.log(' Owner list updated:', global.owner);
    
    res.json({ 
        status: 'success', 
        message: 'Owner list updated successfully',
        owners: global.owner 
    });
});

//  ENDPOINT BARU: Add premium user
app.post('/api/add-premium', checkRateLimit, (req, res) => {
    const { phoneNumber, duration } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (!isValidPhoneNumber(cleanNumber)) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    // Initialize premium array if not exists
    if (!global.db.premium) {
        global.db.premium = [];
    }
    
    const premiumUser = {
        number: cleanNumber,
        addedAt: new Date().toISOString(),
        duration: duration || 'permanent', // permanent, 30days, 7days, etc.
        expiresAt: duration && duration !== 'permanent' ? 
            new Date(Date.now() + (parseInt(duration) * 24 * 60 * 60 * 1000)).toISOString() : 
            null
    };
    
    // Check if user already premium
    const existingIndex = global.db.premium.findIndex(user => user.number === cleanNumber);
    if (existingIndex !== -1) {
        global.db.premium[existingIndex] = premiumUser;
    } else {
        global.db.premium.push(premiumUser);
    }
    
    console.log(' Premium user added:', cleanNumber);
    
    res.json({ 
        status: 'success', 
        message: 'Premium user added successfully',
        user: premiumUser 
    });
});

//  ENDPOINT BARU: Remove premium user
app.post('/api/remove-premium', checkRateLimit, (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (global.db.premium) {
        global.db.premium = global.db.premium.filter(user => user.number !== cleanNumber);
    }
    
    console.log(' Premium user removed:', cleanNumber);
    
    res.json({ 
        status: 'success', 
        message: 'Premium user removed successfully' 
    });
});

//  ENDPOINT BARU: Get premium users
app.get('/api/premium-users', (req, res) => {
    res.json({
        premium_users: global.db?.premium || [],
        total: global.db?.premium?.length || 0
    });
});

//  ENDPOINT BARU: Update bot settings
app.post('/api/update-bot-settings', checkRateLimit, (req, res) => {
    const { botname, packname, author } = req.body;
    
    if (botname) global.botname = botname;
    if (packname) global.packname = packname;
    if (author) global.author = author;
    
    // Simpan ke database jika ada
    if (global.db) {
        global.db.settings = global.db.settings || {};
        global.db.settings.botname = global.botname;
        global.db.settings.packname = global.packname;
        global.db.settings.author = global.author;
    }
    
    console.log(' Bot settings updated:', { botname, packname, author });
    
    res.json({ 
        status: 'success', 
        message: 'Bot settings updated successfully',
        settings: {
            botname: global.botname,
            packname: global.packname,
            author: global.author
        }
    });
});

//  ENDPOINT BARU: Add additional bot
app.post('/api/add-bot', checkRateLimit, (req, res) => {
    if (!global.multiBot.enabled) {
        return res.status(400).json({ error: 'Multi-bot feature is disabled' });
    }
    
    const { phoneNumber, botname, packname } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (!isValidPhoneNumber(cleanNumber)) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    // Check if max bots reached
    if (global.multiBot.bots.length >= global.multiBot.maxBots) {
        return res.status(400).json({ error: `Maximum ${global.multiBot.maxBots} bots allowed` });
    }
    
    // Check if bot already exists
    if (global.multiBot.bots.some(bot => bot.phoneNumber === cleanNumber)) {
        return res.status(400).json({ error: 'Bot with this number already exists' });
    }
    
    const newBot = {
        id: 'bot-' + Date.now(),
        phoneNumber: cleanNumber,
        botname: botname || `Bot ${global.multiBot.bots.length + 1}`,
        packname: packname || 'WhatsApp Bot',
        status: 'pending', // pending, active, error
        createdAt: new Date().toISOString(),
        sessionPath: `nazedev_${cleanNumber}`
    };
    
    global.multiBot.bots.push(newBot);
    
    console.log(' Additional bot added:', newBot);
    
    res.json({ 
        status: 'success', 
        message: 'Bot added successfully. Please start the pairing process.',
        bot: newBot 
    });
});

//  ENDPOINT BARU: Get all bots
app.get('/api/bots', (req, res) => {
    res.json({
        main_bot: {
            phoneNumber: global.phoneNumber,
            botname: global.botname,
            status: global.connectionStatus
        },
        additional_bots: global.multiBot.bots,
        multi_bot_enabled: global.multiBot.enabled
    });
});

//  ENDPOINT BARU: Remove bot
app.post('/api/remove-bot', checkRateLimit, (req, res) => {
    const { botId } = req.body;
    
    if (!botId) {
        return res.status(400).json({ error: 'Bot ID is required' });
    }
    
    const botIndex = global.multiBot.bots.findIndex(bot => bot.id === botId);
    
    if (botIndex === -1) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    const removedBot = global.multiBot.bots.splice(botIndex, 1)[0];
    
    // Clean up session files for removed bot
    try {
        const sessionPath = path.join(__dirname, removedBot.sessionPath);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true });
            console.log(' Removed session files for bot:', removedBot.phoneNumber);
        }
    } catch (error) {
        console.log(' Error removing session files:', error.message);
    }
    
    console.log(' Bot removed:', removedBot);
    
    res.json({ 
        status: 'success', 
        message: 'Bot removed successfully',
        bot: removedBot 
    });
});

//  ENDPOINT BARU: Start bot pairing
app.post('/api/start-bot-pairing', checkRateLimit, (req, res) => {
    const { botId } = req.body;
    
    if (!botId) {
        return res.status(400).json({ error: 'Bot ID is required' });
    }
    
    const bot = global.multiBot.bots.find(b => b.id === botId);
    
    if (!bot) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Update bot status
    bot.status = 'pairing';
    bot.lastPairingAttempt = new Date().toISOString();
    
    // TODO: Implement actual bot pairing logic untuk multi-bot
    // Untuk sekarang kita simpan dulu statusnya
    
    console.log(' Starting pairing for bot:', bot.phoneNumber);
    
    res.json({ 
        status: 'success', 
        message: 'Bot pairing process started. Please check the console for QR code or pairing code.',
        bot: bot 
    });
});

// Endpoint yang sudah ada sebelumnya
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
        }
    });
});

app.get('/api/package-info', (req, res) => {
    res.json(packageInfo);
});

app.post('/api/pair', checkRateLimit, (req, res) => {
    let { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    console.log(' Raw phone number received:', phoneNumber);
    
    const formattedNumber = formatPhoneNumber(phoneNumber);
    
    if (!formattedNumber) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }
    
    if (!isValidPhoneNumber(formattedNumber)) {
        return res.status(400).json({ error: 'Phone number must be 8-15 digits long' });
    }

    console.log(' Formatted phone number:', formattedNumber);
    
    pairingRateLimit.lastRequest = Date.now();
    pairingRateLimit.attempts++;
    
    if (pairingRateLimit.attempts >= pairingRateLimit.maxAttempts) {
        pairingRateLimit.blockUntil = Date.now() + pairingRateLimit.cooldownPeriod;
        pairingRateLimit.globalCooldown = Date.now() + 60000;
    }
    
    global.phoneNumber = formattedNumber;
    global.botStatus = 'Phone number received';
    global.connectionStatus = 'waiting_phone';
    global.pairingCode = null;
    global.sessionIssues = false;

    res.json({ 
        status: 'success', 
        message: 'Phone number received. Starting WhatsApp connection...',
        phone: formattedNumber,
        attempts: pairingRateLimit.attempts,
        maxAttempts: pairingRateLimit.maxAttempts
    });
});

app.post('/api/reset-rate-limit', (req, res) => {
    const now = Date.now();
    
    if (now < pairingRateLimit.globalCooldown) {
        const waitTime = Math.ceil((pairingRateLimit.globalCooldown - now) / 1000);
        return res.status(429).json({
            status: 'error',
            message: `Cannot reset yet. Please wait ${formatTime(waitTime)}.`
        });
    }
    
    pairingRateLimit.attempts = 0;
    pairingRateLimit.resetTime = Date.now();
    pairingRateLimit.blockUntil = 0;
    
    console.log(' Rate limit reset manually');
    res.json({ 
        status: 'success', 
        message: 'Rate limit reset successfully. You can try pairing again.' 
    });
});

function clearSessionFiles() {
    return new Promise((resolve, reject) => {
        console.log(chalk.yellow(' Clearing session files...'));
        
        const commands = [];
        
        if (process.platform === 'win32') {
            commands.push(
                'rmdir /s /q nazedev 2>nul || echo "nazedev not found"',
                'del baileys_store.json 2>nul || echo "baileys_store.json not found"',
                'del session.json 2>nul || echo "session.json not found"',
                'del sessions.json 2>nul || echo "sessions.json not found"',
                'rmdir /s /q baileys 2>nul || echo "baileys not found"',
                'rmdir /s /q tmp 2>nul || echo "tmp not found"'
            );
        } else {
            commands.push(
                'rm -rf ./nazedev || echo "nazedev not found"',
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
                    console.log(chalk.gray(`    ${cmd.split(' ')[0]}: ${stdout || stderr || 'cleaned'}`));
                } else {
                    console.log(chalk.green(`    ${cmd.split(' ')[0]} cleaned`));
                }
                
                if (completed === totalCommands) {
                    console.log(chalk.green(' All session files cleared successfully'));
                    resolve();
                }
            });
        });
    });
}

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
        global.botStatus = 'Session cleared';
        global.connectionStatus = 'initializing';
        global.sessionIssues = false;
        
        res.json({ status: 'success', message: 'Session cleared successfully' });
    } catch (error) {
        console.log(chalk.red(' Error clearing session:'), error);
        res.status(500).json({ status: 'error', message: 'Failed to clear session files' });
    }
});

app.post('/api/fix-session', (req, res) => {
    console.log(' Attempting to fix session issues...');
    global.botStatus = 'Fixing session issues...';
    global.sessionIssues = false;
    
    const cmd = process.platform === 'win32'
        ? 'del nazedev\\app-state-sync-* 2>nul & del nazedev\\pre-key-* 2>nul & del baileys_store.json 2>nul'
        : 'rm -f ./nazedev/app-state-sync-* ./nazedev/pre-key-* ./baileys_store.json';
        
    exec(cmd, (error) => {
        if (error) {
            console.log(' Error fixing session:', error);
            res.json({ status: 'error', message: 'Failed to fix session' });
        } else {
            console.log(' Session files cleaned');
            global.botStatus = 'Session fixed, reconnecting...';
            res.json({ status: 'success', message: 'Session issues fixed. Reconnecting...' });
        }
    });
});

app.post('/api/advanced-fix', async (req, res) => {
    console.log(' Running advanced session repair...');
    global.botStatus = 'Advanced session repair...';
    
    try {
        await clearSessionFiles();
        console.log(' All session data cleared');
        
        pairingRateLimit.attempts = 0;
        pairingRateLimit.resetTime = Date.now();
        pairingRateLimit.blockUntil = 0;
        pairingRateLimit.globalCooldown = 0;
        
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.botStatus = 'Session completely reset';
        global.connectionStatus = 'initializing';
        global.sessionIssues = false;
        
        res.json({ status: 'success', message: 'Advanced repair completed. Ready for new pairing.' });
    } catch (error) {
        console.log(' Error in advanced fix:', error);
        res.status(500).json({ status: 'error', message: 'Advanced fix failed' });
    }
});

app.post('/api/clear-and-restart', async (req, res) => {
    console.log(' Clear and restart requested...');
    
    try {
        await clearSessionFiles();
        
        pairingRateLimit.attempts = 0;
        pairingRateLimit.resetTime = Date.now();
        pairingRateLimit.blockUntil = 0;
        pairingRateLimit.globalCooldown = 0;
        
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.botStatus = 'Cleared and restarting...';
        global.connectionStatus = 'initializing';
        global.sessionIssues = false;
        
        res.json({ status: 'success', message: 'Session cleared and restarting bot process...' });
        
        setTimeout(() => {
            if (typeof global.quickRestart === 'function') {
                global.quickRestart();
            }
        }, 2000);
        
    } catch (error) {
        console.log(' Error during clear and restart:', error);
        res.status(500).json({ status: 'error', message: 'Failed to clear session' });
    }
});

app.post('/api/quick-restart', (req, res) => {
    console.log(' Quick restart requested...');
    
    global.botStatus = 'Quick restarting...';
    global.connectionStatus = 'connecting';
    
    res.json({ status: 'success', message: 'Quick restart initiated' });
    
    if (typeof global.quickRestart === 'function') {
        setTimeout(() => {
            global.quickRestart();
        }, 1000);
    }
});

app.get('/api/session-status', (req, res) => {
    try {
        const sessionExists = fs.existsSync('./nazedev') && 
                            fs.readdirSync('./nazedev').length > 0;
        
        res.json({
            has_session: sessionExists,
            phone_number: global.phoneNumber,
            connection_status: global.connectionStatus,
            session_files: sessionExists ? fs.readdirSync('./nazedev') : [],
            rate_limit: {
                attempts: pairingRateLimit.attempts,
                maxAttempts: pairingRateLimit.maxAttempts,
                lastRequest: pairingRateLimit.lastRequest,
                resetTime: pairingRateLimit.resetTime,
                blockUntil: pairingRateLimit.blockUntil,
                globalCooldown: pairingRateLimit.globalCooldown
            }
        });
    } catch (error) {
        res.json({
            has_session: false,
            phone_number: global.phoneNumber,
            connection_status: global.connectionStatus,
            session_files: [],
            rate_limit: {
                attempts: pairingRateLimit.attempts,
                maxAttempts: pairingRateLimit.maxAttempts,
                lastRequest: pairingRateLimit.lastRequest,
                resetTime: pairingRateLimit.resetTime,
                blockUntil: pairingRateLimit.blockUntil,
                globalCooldown: pairingRateLimit.globalCooldown
            }
        });
    }
});

app.post('/api/retry-connection', (req, res) => {
    global.botStatus = 'Retrying connection...';
    global.connectionStatus = 'connecting';
    global.sessionIssues = false;
    res.json({ status: 'success', message: 'Connection retry initiated' });
});

app.get('/api/restart', (req, res) => {
    global.botStatus = 'Restarting...';
    global.connectionStatus = 'connecting';
    res.json({ status: 'success', message: 'Restart command sent' });
});

function setPairingCode(code) {
    global.pairingCode = code;
    global.connectionStatus = 'pairing';
    global.botStatus = 'Pairing code generated';
    console.log(' Pairing code set:', code);
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log(' Status updated:', status, message);
}

function setBotInfo(info) {
    global.botInfo = info;
    global.connectionStatus = 'online';
    global.botStatus = 'Connected to WhatsApp';
    console.log(' Bot info updated:', info);
}

function setSessionIssues(hasIssues) {
    global.sessionIssues = hasIssues;
    if (hasIssues) {
        global.botStatus = 'Session issues detected';
        global.connectionStatus = 'error';
        console.log(' Session issues detected');
    } else {
        console.log(' Session issues cleared');
    }
}

function getRateLimitInfo() {
    return {
        attempts: pairingRateLimit.attempts,
        maxAttempts: pairingRateLimit.maxAttempts,
        lastRequest: pairingRateLimit.lastRequest,
        resetTime: pairingRateLimit.resetTime,
        blockUntil: pairingRateLimit.blockUntil,
        globalCooldown: pairingRateLimit.globalCooldown
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
                console.log(chalk.green(` Web Dashboard running on http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(` Dashboard: http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(` API Status: http://localhost:${CURRENT_PORT}/api/status`));
                console.log(chalk.yellow(`  Anti-Spam Protection: Active (${pairingRateLimit.maxAttempts} attempts max, ${pairingRateLimit.minInterval/1000}s cooldown)`));
                console.log(chalk.cyan(` Management Panel: Available with password '${global.webSettings.adminPassword}'`));
                console.log(chalk.magenta(` Multi-Bot Feature: ${global.multiBot.enabled ? 'Enabled' : 'Disabled'}`));
                isServerRunning = true;
                global.webUptime = Date.now();
                resolve(CURRENT_PORT);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(` Port ${CURRENT_PORT} is in use, trying ${CURRENT_PORT + 1}...`));
                    CURRENT_PORT = CURRENT_PORT + 1;
                    startServer().then(resolve).catch(reject);
                } else {
                    console.log(chalk.red(' Server error:'), err);
                    reject(err);
                }
            });
        });
    } catch (error) {
        console.error(' Failed to start server:', error);
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
