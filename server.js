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
    minInterval: 60000,   // 60 detik antara request (lebih aman)
    maxAttempts: 2,       // Hanya 2 percobaan per periode
    attempts: 0,
    resetTime: Date.now(),
    blockUntil: 0,        // Waktu hingga bisa request lagi
    cooldownPeriod: 300000, // 5 menit cooldown setelah max attempts
    globalCooldown: 0     // Cooldown global untuk semua requests
};

// Initialize global variables
global.botStatus = global.botStatus || 'Initializing...';
global.connectionStatus = global.connectionStatus || 'initializing';
global.phoneNumber = global.phoneNumber || null;
global.pairingCode = global.pairingCode || null;
global.botInfo = global.botInfo || null;
global.qrCode = global.qrCode || null;
global.sessionIssues = global.sessionIssues || false;

// Function to find available port
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

// Load package.json
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

// Create public directory if not exists
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
}

// Serve static files from public directory
app.use(express.static(publicPath));

// HTML file content (sama seperti sebelumnya, tidak berubah)
const htmlPath = path.join(publicPath, 'index.html');
if (!fs.existsSync(htmlPath)) {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot - Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        /* CSS styles remain the same as before */
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
    </style>
</head>
<body>
    <!-- Notification Area -->
    <div id="notificationArea"></div>

    <div class="container py-4">
        <div class="row justify-content-center">
            <div class="col-lg-10">
                <!-- Header -->
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

                <!-- WhatsApp Connection Guide -->
                <div class="whatsapp-guide fade-in mb-4" id="connectionGuide">
                    <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>How to Connect Your WhatsApp</h5>
                    <ol>
                        <li>Enter your WhatsApp number below (international format without +)</li>
                        <li>Click "Start WhatsApp Connection"</li>
                        <li>Wait for the pairing code to appear</li>
                        <li>Open WhatsApp on your phone</li>
                        <li>Go to <strong>Settings  Linked Devices  Link a Device</strong></li>
                        <li>Enter the pairing code when prompted</li>
                        <li>Wait for connection confirmation</li>
                    </ol>
                </div>

                <!-- Rate Limit Alert -->
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

                <!-- Session Issues Alert -->
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
                    <!-- Connection Status -->
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

                            <!-- Anti-Spam Status -->
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

                    <!-- WhatsApp Authentication -->
                    <div class="col-md-6">
                        <div class="dashboard-card h-100 fade-in">
                            <h5 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>WhatsApp Authentication</h5>
                            <div id="authSection">
                                <!-- Phone Input Form -->
                                <div id="phoneFormContainer">
                                    <form id="phoneForm">
                                        <div class="mb-3">
                                            <label class="form-label fw-bold">WhatsApp Phone Number</label>
                                            <div class="input-group">
                                                <span class="input-group-text bg-light border-end-0">+</span>
                                                <input type="tel" class="form-control border-start-0" id="phoneInput" placeholder="6281234567890" required pattern="[0-9]{10,15}" title="Enter 10-15 digits without country code">
                                            </div>
                                            <div class="form-text">
                                                <i class="fas fa-info-circle me-1"></i>
                                                Enter your phone number in international format without +
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

                <!-- Bot Info -->
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

                <!-- Quick Actions -->
                <div class="dashboard-card mt-4 fade-in" id="quickActions" style="display: none;">
                    <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Quick Actions</h5>
                    <div class="row">
                        <div class="col-md-4 mb-2">
                            <button id="quickRestartBtn" class="btn btn-outline-warning w-100">
                                <i class="fas fa-redo me-2"></i>Quick Restart
                            </button>
                        </div>
                        <div class="col-md-4 mb-2">
                            <button id="changeNumberBtn" class="btn btn-outline-info w-100">
                                <i class="fas fa-sync me-2"></i>Change Number
                            </button>
                        </div>
                        <div class="col-md-4 mb-2">
                            <button id="checkSessionBtn" class="btn btn-outline-secondary w-100">
                                <i class="fas fa-search me-2"></i>Check Session
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Controls -->
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
        // Configuration -  PERBAIKAN: Konfigurasi yang lebih aman
        const CONFIG = {
            POLLING_INTERVAL_NORMAL: 3000,
            POLLING_INTERVAL_ACTIVE: 1000,
            POLLING_INTERVAL_ONLINE: 2000,
            PAIRING_CODE_TIMEOUT: 30, // 30 detik
            MAX_RETRIES: 5,
            RATE_LIMIT_DELAY: 60000, // 60 detik
            MAX_PAIRING_ATTEMPTS: 2,
            COOLDOWN_PERIOD: 300000 // 5 menit
        };

        let pollingInterval = CONFIG.POLLING_INTERVAL_NORMAL;
        let currentStatus = 'initializing';
        let pairingCodeCountdown = null;
        let isFirstOnline = true;
        let retryCount = 0;
        let rateLimitCountdown = null;

        // Utility Functions
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
                    retryCount = 0; // Reset retry count on successful response
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

            // Update basic status elements
            updateStatusElements(data);
            
            // Handle phone number display
            if (data.phone_number) {
                handlePhoneNumberUpdate(data.phone_number);
            }
            
            // Handle pairing code
            if (data.pairing_code) {
                handlePairingCodeUpdate(data.pairing_code);
            }
            
            // Handle session issues
            if (data.session_issues) {
                document.getElementById('sessionIssuesAlert').style.display = 'block';
            } else {
                document.getElementById('sessionIssuesAlert').style.display = 'none';
            }
            
            // Handle bot info
            if (data.bot_info && data.connection_status === 'online') {
                updateBotInfoSection(data.bot_info);
            }
            
            // Handle online status
            if (data.connection_status === 'online' && oldStatus !== 'online') {
                handleOnlineStatus();
            }
            
            // Show/hide quick actions
            if (data.connection_status === 'online') {
                document.getElementById('quickActions').style.display = 'block';
            }
            
            // Handle rate limiting
            if (data.rate_limited) {
                handleRateLimit(data.rate_limited);
            } else {
                document.getElementById('rateLimitAlert').style.display = 'none';
                updateAntiSpamStatus(data.rate_limit_info);
            }
            
            // Update polling interval based on status
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
            // Update connection status text
            const connectionStatusElement = document.getElementById('connectionStatusText');
            if (connectionStatusElement) {
                connectionStatusElement.textContent = data.connection_status;
            }
            
            // Update status badge
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
            
            // Update status indicator
            const statusIndicator = document.getElementById('statusIndicator');
            if (statusIndicator) {
                statusIndicator.className = \`status-indicator status-\${data.connection_status}\`;
                
                if (data.connection_status === 'online') {
                    statusIndicator.classList.add('online-pulse');
                } else {
                    statusIndicator.classList.remove('online-pulse');
                }
            }
            
            // Update progress bar
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
            
            // Update uptime
            const uptimeElement = document.getElementById('uptime');
            if (uptimeElement) {
                uptimeElement.textContent = data.uptime;
            }
        }

        function handlePhoneNumberUpdate(phoneNumber) {
            const authSection = document.getElementById('authSection');
            if (!authSection) return;
            
            // Replace form with phone number display
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
                
                // Add event listener for change phone button
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
                    updateStatus(); // Refresh status to update UI
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
            
            // Show bot info section
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

        // Event Listeners
        document.getElementById('phoneForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');
            const formMessage = document.getElementById('formMessage');
            
            if (!phone || phone.length < 10 || phone.length > 15 || !/^\d+$/.test(phone)) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter a valid phone number (10-15 digits without country code)</div>';
                return;
            }
            
            // Disable button and show loading
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
                    formMessage.innerHTML = '<div class="alert alert-success">Phone number received! Starting WhatsApp connection...</div>';
                    showNotification('Phone number accepted! Starting connection...', 'success');
                    
                    // Switch to faster polling
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

        // Control buttons (tetap sama seperti sebelumnya)
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

        // Quick Actions
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

        // Rate limit actions
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

        // Smart polling with dynamic interval
        function startSmartPolling() {
            updateStatus();
            setTimeout(startSmartPolling, pollingInterval);
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            console.log(' WhatsApp Bot Dashboard initialized');
            
            // Load initial package info
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
            
            // Show welcome notification
            setTimeout(() => {
                showNotification('Welcome to WhatsApp Bot Dashboard! Anti-spam protection is active.', 'info');
            }, 1000);
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                updateStatus();
            }
        });

        // Handle beforeunload
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
    fs.writeFileSync(htmlPath, htmlContent);
}

app.use(express.json());
app.use(express.static('public'));

//  PERBAIKAN: Enhanced rate limiting middleware yang lebih ketat
function checkRateLimit(req, res, next) {
    const now = Date.now();
    
    // Reset attempts setelah 5 menit
    if (now - pairingRateLimit.resetTime > pairingRateLimit.cooldownPeriod) {
        pairingRateLimit.attempts = 0;
        pairingRateLimit.resetTime = now;
        pairingRateLimit.blockUntil = 0;
        pairingRateLimit.globalCooldown = 0;
    }
    
    // Cek jika sedang dalam masa global cooldown
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
    
    // Cek jika sedang dalam masa block
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
    
    // Cek jika sudah melebihi batas maksimal
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
    
    // Cek jika request terlalu cepat
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

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

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

//  PERBAIKAN: Terapkan rate limiting yang lebih ketat pada endpoint pair
app.post('/api/pair', checkRateLimit, (req, res) => {
    let { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    // Clean phone number dengan validasi yang lebih ketat
    let cleanedPhone = phoneNumber.replace(/\D/g, '');
    
    // Validasi panjang nomor
    if (cleanedPhone.length < 10 || cleanedPhone.length > 15) {
        return res.status(400).json({ error: 'Invalid phone number. Must be 10-15 digits.' });
    }
    
    // Validasi format nomor
    if (!/^\d+$/.test(cleanedPhone)) {
        return res.status(400).json({ error: 'Invalid phone number. Only digits allowed.' });
    }
    
    // Format nomor telepon
    if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '62' + cleanedPhone.substring(1);
    }
    if (!cleanedPhone.startsWith('62') && !cleanedPhone.startsWith('1')) {
        cleanedPhone = '62' + cleanedPhone;
    }

    console.log(' Phone number received from web:', cleanedPhone);
    
    // Update rate limit
    pairingRateLimit.lastRequest = Date.now();
    pairingRateLimit.attempts++;
    
    // Jika mencapai batas maksimal, set block period
    if (pairingRateLimit.attempts >= pairingRateLimit.maxAttempts) {
        pairingRateLimit.blockUntil = Date.now() + pairingRateLimit.cooldownPeriod;
        // Juga set global cooldown untuk mencegah spam
        pairingRateLimit.globalCooldown = Date.now() + 60000; // 1 menit global cooldown
    }
    
    global.phoneNumber = cleanedPhone;
    global.botStatus = 'Phone number received';
    global.connectionStatus = 'waiting_phone';
    global.pairingCode = null;
    global.sessionIssues = false;

    res.json({ 
        status: 'success', 
        message: 'Phone number received. Starting WhatsApp connection...',
        phone: cleanedPhone,
        attempts: pairingRateLimit.attempts,
        maxAttempts: pairingRateLimit.maxAttempts
    });
});

//  PERBAIKAN: Endpoint untuk reset rate limit dengan protection
app.post('/api/reset-rate-limit', (req, res) => {
    const now = Date.now();
    
    // Cek jika masih dalam global cooldown
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

// Function to clear session files (tetap sama)
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

// Endpoint lainnya tetap sama seperti sebelumnya
app.post('/api/clear-session', async (req, res) => {
    try {
        await clearSessionFiles();
        
        // Reset rate limit ketika session di-clear
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
    
    // Clear problematic session files but keep auth state
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
        
        // Reset rate limit
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
        
        // Reset rate limit
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
        
        // Restart process after short delay
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

// Quick restart endpoint
app.post('/api/quick-restart', (req, res) => {
    console.log(' Quick restart requested...');
    
    global.botStatus = 'Quick restarting...';
    global.connectionStatus = 'connecting';
    
    res.json({ status: 'success', message: 'Quick restart initiated' });
    
    // Trigger quick restart in main process
    if (typeof global.quickRestart === 'function') {
        setTimeout(() => {
            global.quickRestart();
        }, 1000);
    }
});

// Session status endpoint
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

// Status functions for bot
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

// Function untuk akses rate limit info
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

// Start server
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

// Auto-start server jika file ini di-run langsung
if (require.main === module) {
    startServer().catch(console.error);
}