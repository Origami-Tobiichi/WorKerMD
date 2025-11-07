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

// Set view engine to EJS
app.set('view engine', 'ejs');
const viewsPath = path.join(__dirname, 'views');
app.set('views', viewsPath);

// Create views directory if not exists
if (!fs.existsSync(viewsPath)) {
    fs.mkdirSync(viewsPath, { recursive: true });
}

// Create index.ejs if not exists
const indexEjsPath = path.join(viewsPath, 'index.ejs');
if (!fs.existsSync(indexEjsPath)) {
    const basicTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= bot_name %> - Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        body { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
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
        .status-online { background: #28a745; } 
        .status-offline { background: #dc3545; }
        .status-connecting { background: #ffc107; } 
        .status-pairing { background: #17a2b8; }
        .status-waiting_phone { background: #fd7e14; } 
        .status-initializing { background: #6c757d; }
        .status-error { 
            background: #dc3545; 
            animation: pulse 1.5s infinite; 
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
            border: 3px solid #007bff; 
        }
        .issue-alert { 
            border-left: 4px solid #dc3545; 
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
    </style>
</head>
<body>
    <!-- Notification Area -->
    <div id="notificationArea"></div>

    <div class="container py-4">
        <div class="row justify-content-center">
            <div class="col-lg-10">
                <!-- Header -->
                <div class="dashboard-card text-center mb-4 fade-in">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <img src="https://cdn.pixabay.com/photo/2021/08/27/22/33/whatsapp-6579607_960_720.png" class="bot-avatar">
                        </div>
                        <div class="col">
                            <h1 class="display-5 fw-bold text-primary mb-2">
                                <i class="fab fa-whatsapp me-2"></i><%= bot_name %>
                            </h1>
                            <p class="lead text-muted mb-3"><%= description %></p>
                            <div class="row text-center">
                                <div class="col-md-3">
                                    <small class="text-muted">Version: <%= version %></small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Author: <%= author %></small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Port: <span id="currentPort"><%= currentPort %></span></small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Uptime: <span id="uptime"><%= uptime %></span>s</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Session Issues Alert -->
                <% if (sessionIssues) { %>
                <div class="alert alert-warning issue-alert mb-4">
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
                <% } %>

                <div class="row">
                    <!-- Connection Status -->
                    <div class="col-md-6">
                        <div class="dashboard-card h-100 fade-in" id="connectionStatusCard">
                            <h4 class="mb-3"><i class="fas fa-plug me-2"></i>Connection Status</h4>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div>
                                    <span class="status-indicator status-<%= connectionStatus %>" id="statusIndicator"></span>
                                    <strong id="connectionStatusText"><%= connectionStatus %></strong>
                                </div>
                                <span class="badge bg-<%= 
                                    connectionStatus === 'online' ? 'success' : 
                                    connectionStatus === 'offline' ? 'danger' : 
                                    connectionStatus === 'connecting' ? 'warning' : 
                                    connectionStatus === 'pairing' ? 'info' : 
                                    connectionStatus === 'error' ? 'danger' : 'secondary'
                                %>" id="statusBadge"><%= botStatus %></span>
                            </div>
                            
                            <div class="connection-progress mt-4">
                                <div class="progress mb-3" style="height: 10px;">
                                    <div class="progress-bar progress-bar-striped progress-bar-animated" id="progressBar" style="width: 
                                        <%= connectionStatus === 'online' ? '100%' : 
                                           connectionStatus === 'pairing' ? '75%' : 
                                           connectionStatus === 'connecting' ? '50%' : 
                                           connectionStatus === 'waiting_phone' ? '25%' : '0%' %>">
                                    </div>
                                </div>
                                <div class="small text-muted text-center" id="progressText">
                                    <%= 
                                        connectionStatus === 'online' ? '✅ Connected to WhatsApp' : 
                                        connectionStatus === 'pairing' ? '🔑 Enter Pairing Code in WhatsApp' : 
                                        connectionStatus === 'connecting' ? '🔄 Connecting to WhatsApp Servers...' : 
                                        connectionStatus === 'waiting_phone' ? '📱 Waiting for Phone Number' : '⚙️ Initializing Bot...'
                                    %>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- WhatsApp Authentication -->
                    <div class="col-md-6">
                        <div class="dashboard-card h-100 fade-in">
                            <h5 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>WhatsApp Authentication</h5>
                            <div id="authSection">
                                <% if (!phoneNumber) { %>
                                    <form id="phoneForm">
                                        <div class="mb-3">
                                            <label class="form-label fw-bold">WhatsApp Phone Number</label>
                                            <div class="input-group">
                                                <span class="input-group-text bg-light border-end-0">+</span>
                                                <input type="tel" class="form-control border-start-0" id="phoneInput" placeholder="6281234567890" required>
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
                                <% } else { %>
                                    <div class="alert alert-info fade-in">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div>
                                                <strong><i class="fas fa-phone me-2"></i>Phone Number:</strong> 
                                                <span id="currentPhone" class="fw-bold">+<%= phoneNumber %></span>
                                            </div>
                                            <button class="btn btn-sm btn-outline-danger" id="changePhoneBtn">
                                                <i class="fas fa-sync me-1"></i>Change
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <% if (pairingCode) { %>
                                        <div class="alert alert-warning text-center fade-in" id="pairingSection">
                                            <strong><i class="fas fa-key me-2"></i>Pairing Code</strong> 
                                            <div class="pairing-code mt-3" id="pairingCodeDisplay"><%= pairingCode %></div>
                                            <div class="mt-3">
                                                <p class="mb-2">
                                                    <i class="fas fa-info-circle me-2"></i>
                                                    Enter this code in <strong>WhatsApp → Linked Devices</strong>
                                                </p>
                                                <div class="mt-2">
                                                    <small class="text-muted">
                                                        <i class="fas fa-clock me-1"></i>
                                                        Expires in <span id="countdown" class="fw-bold">20</span> seconds
                                                    </small>
                                                </div>
                                            </div>
                                        </div>
                                    <% } else if (connectionStatus === 'online') { %>
                                        <div class="alert alert-success text-center py-4 fade-in online-pulse" id="onlineStatusSection">
                                            <i class="fas fa-check-circle fa-3x mb-3 text-success"></i>
                                            <h4 class="mb-2">Connected Successfully!</h4>
                                            <p class="mb-0 text-muted">Your bot is now connected to WhatsApp</p>
                                        </div>
                                    <% } else if (connectionStatus === 'connecting' || connectionStatus === 'pairing') { %>
                                        <div class="text-center py-4 fade-in" id="connectingSection">
                                            <div class="spinner-border text-warning mb-3" style="width: 3rem; height: 3rem;"></div>
                                            <h5 class="mb-2">Connecting to WhatsApp...</h5>
                                            <p class="text-muted mb-0" id="connectionDetail">
                                                <%= connectionStatus === 'pairing' ? 'Requesting pairing code...' : 'Establishing connection...' %>
                                            </p>
                                        </div>
                                    <% } else if (connectionStatus === 'error') { %>
                                        <div class="alert alert-danger text-center py-3 fade-in" id="errorSection">
                                            <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                                            <h5 class="mb-2">Connection Error</h5>
                                            <p class="mb-3">There was a problem establishing the connection</p>
                                            <button id="retryConnectionBtn" class="btn btn-warning">
                                                <i class="fas fa-redo me-1"></i>Retry Connection
                                            </button>
                                        </div>
                                    <% } %>
                                <% } %>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bot Info -->
                <% if (botInfo && connectionStatus === 'online') { %>
                <div class="dashboard-card mt-4 fade-in" id="botInfoSection">
                    <h5 class="mb-3"><i class="fas fa-robot me-2"></i>Bot Information</h5>
                    <div class="row mt-3">
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-id-card text-primary me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">ID</div>
                                    <div class="text-muted small bot-info-id"><%= botInfo.id %></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-user text-success me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Name</div>
                                    <div class="text-muted small bot-info-name"><%= botInfo.name %></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 mb-3">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-phone text-info me-2 fa-lg"></i>
                                <div>
                                    <div class="fw-bold">Phone</div>
                                    <div class="text-muted small bot-info-phone">+<%= botInfo.phone %></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <% } else if (connectionStatus === 'online' && !botInfo) { %>
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
                <% } %>

                <!-- Controls -->
                <div class="dashboard-card text-center mt-4 fade-in">
                    <div class="btn-group btn-group-lg">
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
        // Configuration
        const CONFIG = {
            POLLING_INTERVAL_NORMAL: 3000,    // 3 seconds for normal state
            POLLING_INTERVAL_ACTIVE: 1000,    // 1 second for active states
            POLLING_INTERVAL_ONLINE: 2000,    // 2 seconds for online state
            PAIRING_CODE_TIMEOUT: 20,         // 20 seconds for pairing code
            MAX_RETRIES: 5
        };

        let pollingInterval = CONFIG.POLLING_INTERVAL_NORMAL;
        let currentStatus = '<%= connectionStatus %>';
        let pairingCodeCountdown = null;
        let isFirstOnline = true;

        // Smart polling based on current status
        function getPollingInterval() {
            const status = document.getElementById('connectionStatusText')?.textContent || currentStatus;
            
            // Faster polling for active states
            if (['connecting', 'pairing', 'waiting_phone', 'waiting_qr'].includes(status)) {
                return CONFIG.POLLING_INTERVAL_ACTIVE;
            }
            
            // Medium polling for online state
            if (status === 'online') {
                return CONFIG.POLLING_INTERVAL_ONLINE;
            }
            
            return CONFIG.POLLING_INTERVAL_NORMAL;
        }

        // Show notification
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
            
            // Auto remove after 5 seconds
            setTimeout(() => {
                if (document.getElementById(notificationId)) {
                    document.getElementById(notificationId).remove();
                }
            }, 5000);
        }

        // Update status with smart detection
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
                    showNotification('Connection to server lost', 'danger');
                });
        }

        function processStatusUpdate(data) {
            const oldStatus = currentStatus;
            currentStatus = data.connection_status;

            // ✅ PERBAIKAN: Force update ketika status berubah ke online
            if (data.connection_status === 'online' && oldStatus !== 'online') {
                console.log('🔄 Status changed to online - updating UI immediately');
                handleOnlineStatus(data);
                return; // Skip other processing since we're doing a full update
            }
            
            // Update basic status elements
            updateStatusElements(data);
            
            // Special handling for pairing code
            if (data.pairing_code) {
                handlePairingCodeUpdate(data.pairing_code, oldStatus);
            }
            
            // Special handling for status changes
            handleStatusChange(data, oldStatus);
            
            // Update phone number if changed
            if (data.phone_number && !document.getElementById('currentPhone')) {
                handlePhoneNumberUpdate(data.phone_number);
            }
            
            // Update polling interval based on new status
            pollingInterval = getPollingInterval();
        }

        // ✅ FUNCTION BARU: Handle status online secara khusus
        function handleOnlineStatus(data) {
            // Update semua elemen status
            updateStatusElements(data);
            
            // Tampilkan notifikasi (hanya sekali)
            if (isFirstOnline) {
                showNotification('✅ Successfully connected to WhatsApp!', 'success');
                isFirstOnline = false;
            }
            
            // Update bagian authentication
            updateAuthSectionForOnline();
            
            // Update bot info section
            if (data.bot_info) {
                updateBotInfoSection(data.bot_info);
            } else {
                // Jika bot info belum tersedia, tampilkan loading
                showBotInfoLoading();
            }
            
            // Add online animation
            const statusCard = document.getElementById('connectionStatusCard');
            if (statusCard) {
                statusCard.classList.add('online-pulse');
            }
        }

        // ✅ FUNCTION BARU: Update bagian authentication untuk status online
        function updateAuthSectionForOnline() {
            const authSection = document.getElementById('authSection');
            if (!authSection) return;
            
            // Hapus semua section yang sedang aktif
            const activeSections = ['pairingSection', 'connectingSection', 'errorSection', 'onlineStatusSection'];
            activeSections.forEach(sectionId => {
                const section = document.getElementById(sectionId);
                if (section) section.remove();
            });
            
            // Tambahkan section online
            const onlineHTML = \`
                <div class="alert alert-success text-center py-4 fade-in online-pulse" id="onlineStatusSection">
                    <i class="fas fa-check-circle fa-3x mb-3 text-success"></i>
                    <h4 class="mb-2">Connected Successfully!</h4>
                    <p class="mb-0 text-muted">Your bot is now connected to WhatsApp</p>
                </div>
            \`;
            
            // Insert setelah phone number alert
            const phoneAlert = authSection.querySelector('.alert-info');
            if (phoneAlert) {
                phoneAlert.insertAdjacentHTML('afterend', onlineHTML);
            } else {
                authSection.innerHTML += onlineHTML;
            }
            
            // Trigger animation
            setTimeout(() => {
                const newSection = document.getElementById('onlineStatusSection');
                if (newSection) {
                    newSection.classList.add('fade-in');
                }
            }, 10);
        }

        // ✅ FUNCTION BARU: Tampilkan loading untuk bot info
        function showBotInfoLoading() {
            let botInfoSection = document.getElementById('botInfoSection');
            
            if (!botInfoSection) {
                const controlsCard = document.querySelector('.dashboard-card.text-center.mt-4');
                if (controlsCard) {
                    botInfoSection = document.createElement('div');
                    botInfoSection.id = 'botInfoSection';
                    botInfoSection.className = 'dashboard-card mt-4 fade-in';
                    botInfoSection.innerHTML = \`
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
                    \`;
                    controlsCard.parentNode.insertBefore(botInfoSection, controlsCard);
                }
            } else {
                botInfoSection.style.display = 'block';
                botInfoSection.querySelector('.bot-info-id').textContent = 'Loading...';
                botInfoSection.querySelector('.bot-info-name').textContent = 'Loading...';
                botInfoSection.querySelector('.bot-info-phone').textContent = 'Loading...';
            }
        }

        // ✅ FUNCTION BARU: Update bagian bot info
        function updateBotInfoSection(botInfo) {
            if (!botInfo) return;
            
            let botInfoSection = document.getElementById('botInfoSection');
            
            if (!botInfoSection) {
                showBotInfoLoading();
                botInfoSection = document.getElementById('botInfoSection');
            }
            
            if (botInfoSection) {
                // Update konten
                const idElement = botInfoSection.querySelector('.bot-info-id');
                const nameElement = botInfoSection.querySelector('.bot-info-name');
                const phoneElement = botInfoSection.querySelector('.bot-info-phone');
                
                if (idElement) idElement.textContent = botInfo.id || 'N/A';
                if (nameElement) nameElement.textContent = botInfo.name || 'N/A';
                if (phoneElement) phoneElement.textContent = '+' + (botInfo.phone || 'N/A');
                
                // Tampilkan section jika hidden
                botInfoSection.style.display = 'block';
                
                // Add animation
                botInfoSection.classList.add('fade-in');
            }
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
                statusBadge.className = 'badge bg-' + (
                    data.connection_status === 'online' ? 'success' : 
                    data.connection_status === 'offline' ? 'danger' : 
                    data.connection_status === 'connecting' ? 'warning' : 
                    data.connection_status === 'pairing' ? 'info' : 
                    data.connection_status === 'error' ? 'danger' : 'secondary'
                );
            }
            
            // Update status indicator
            const statusIndicator = document.getElementById('statusIndicator');
            if (statusIndicator) {
                statusIndicator.className = 'status-indicator status-' + data.connection_status;
                
                // Add/remove online pulse
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
                    'online': { width: '100%', text: '✅ Connected to WhatsApp' },
                    'pairing': { width: '75%', text: '🔑 Enter Pairing Code in WhatsApp' },
                    'connecting': { width: '50%', text: '🔄 Connecting to WhatsApp Servers...' },
                    'waiting_phone': { width: '25%', text: '📱 Waiting for Phone Number' },
                    'initializing': { width: '0%', text: '⚙️ Initializing Bot...' }
                };
                
                const config = progressConfig[data.connection_status] || { width: '0%', text: '⚙️ Initializing...' };
                progressBar.style.width = config.width;
                progressText.textContent = config.text;
            }
            
            // Update uptime
            const uptimeElement = document.getElementById('uptime');
            if (uptimeElement) {
                uptimeElement.textContent = data.uptime;
            }
        }

        function handlePairingCodeUpdate(pairingCode, oldStatus) {
            const pairingDisplay = document.getElementById('pairingCodeDisplay');
            const pairingSection = document.getElementById('pairingSection');
            
            if (pairingCode) {
                // If pairing code section doesn't exist, create it
                if (!pairingSection) {
                    updateAuthSectionForPairing(pairingCode);
                } else {
                    // Update existing pairing code
                    if (pairingDisplay) {
                        pairingDisplay.textContent = pairingCode;
                    }
                }
                
                // Start countdown if not already running
                if (!pairingCodeCountdown) {
                    startPairingCodeCountdown();
                }
                
                // Show notification for new pairing code
                if (oldStatus !== 'pairing') {
                    showNotification('Pairing code generated! Enter it in WhatsApp.', 'success');
                }
            }
        }

        // ✅ FUNCTION BARU: Update auth section untuk pairing
        function updateAuthSectionForPairing(pairingCode) {
            const authSection = document.getElementById('authSection');
            if (!authSection) return;
            
            // Hapus section yang sedang aktif
            const activeSections = ['connectingSection', 'errorSection', 'onlineStatusSection'];
            activeSections.forEach(sectionId => {
                const section = document.getElementById(sectionId);
                if (section) section.remove();
            });
            
            // Tambahkan pairing section
            const pairingHTML = \`
                <div class="alert alert-warning text-center fade-in" id="pairingSection">
                    <strong><i class="fas fa-key me-2"></i>Pairing Code</strong> 
                    <div class="pairing-code mt-3" id="pairingCodeDisplay">\${pairingCode}</div>
                    <div class="mt-3">
                        <p class="mb-2">
                            <i class="fas fa-info-circle me-2"></i>
                            Enter this code in <strong>WhatsApp → Linked Devices</strong>
                        </p>
                        <div class="mt-2">
                            <small class="text-muted">
                                <i class="fas fa-clock me-1"></i>
                                Expires in <span id="countdown" class="fw-bold">20</span> seconds
                            </small>
                        </div>
                    </div>
                </div>
            \`;
            
            // Insert setelah phone number alert
            const phoneAlert = authSection.querySelector('.alert-info');
            if (phoneAlert) {
                phoneAlert.insertAdjacentHTML('afterend', pairingHTML);
            }
            
            // Start countdown
            startPairingCodeCountdown();
        }

        function handleStatusChange(data, oldStatus) {
            // Reload page on significant status changes (kecuali connecting→online)
            const significantChanges = [
                'initializing→waiting_phone',
                'waiting_phone→connecting', 
                'connecting→pairing',
                'online→error',
                'error→connecting'
            ];
            
            const changeKey = \`\${oldStatus}→\${data.connection_status}\`;
            
            if (significantChanges.includes(changeKey)) {
                console.log(\`🔄 Status changed from \${oldStatus} to \${data.connection_status} - reloading page\`);
                setTimeout(() => location.reload(), 500);
                return;
            }
            
            // ✅ TIDAK PERLU reload untuk connecting→online, karena sudah dihandle oleh handleOnlineStatus
            
            // Update connection detail text
            const connectionDetail = document.getElementById('connectionDetail');
            if (connectionDetail) {
                if (data.connection_status === 'pairing') {
                    connectionDetail.textContent = 'Requesting pairing code from WhatsApp...';
                } else if (data.connection_status === 'connecting') {
                    connectionDetail.textContent = 'Establishing secure connection...';
                }
            }
        }

        function handlePhoneNumberUpdate(phoneNumber) {
            // If phone number is set but not displayed, reload page
            console.log('🔄 Phone number updated but not displayed - reloading page');
            showNotification('Phone number received! Loading...', 'info');
            setTimeout(() => location.reload(), 1000);
        }

        function startPairingCodeCountdown() {
            let countdown = CONFIG.PAIRING_CODE_TIMEOUT;
            const countdownElement = document.getElementById('countdown');
            
            if (!countdownElement) return;
            
            pairingCodeCountdown = setInterval(() => {
                countdown--;
                countdownElement.textContent = countdown;
                
                if (countdown <= 0) {
                    clearInterval(pairingCodeCountdown);
                    pairingCodeCountdown = null;
                    showNotification('Pairing code expired', 'warning');
                    // The bot will automatically request a new code if needed
                }
            }, 1000);
        }

        // Phone form submission
        document.getElementById('phoneForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');
            const formMessage = document.getElementById('formMessage');
            
            if (!phone || phone.length < 10) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter a valid phone number (minimum 10 digits)</div>';
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
                    
                    // Wait a bit then reload to show connection progress
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                    
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

        // Control buttons
        document.getElementById('changePhoneBtn')?.addEventListener('click', () => {
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
        });

        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            showNotification('Refreshing status...', 'info');
            location.reload();
        });

        document.getElementById('restartBtn')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to restart the bot? This will temporarily disconnect from WhatsApp.')) {
                fetch('/api/restart')
                    .then(() => {
                        showNotification('Bot restarting...', 'warning');
                        setTimeout(() => location.reload(), 3000);
                    })
                    .catch(error => {
                        showNotification('Error restarting bot', 'danger');
                    });
            }
        });

        document.getElementById('clearSessionBtn')?.addEventListener('click', () => {
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

        document.getElementById('advancedFixBtn')?.addEventListener('click', () => {
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

        document.getElementById('retryConnectionBtn')?.addEventListener('click', () => {
            fetch('/api/retry-connection', {method: 'POST'})
                .then(r => r.json())
                .then(result => {
                    showNotification(result.message, 'info');
                    setTimeout(() => location.reload(), 1000);
                })
                .catch(error => {
                    showNotification('Error retrying connection', 'danger');
                });
        });

        // Smart polling with dynamic interval
        function startSmartPolling() {
            updateStatus();
            setTimeout(startSmartPolling, pollingInterval);
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 WhatsApp Bot Dashboard initialized');
            console.log('📊 Current status:', currentStatus);
            console.log('⏰ Polling interval:', getPollingInterval(), 'ms');
            
            startSmartPolling();
            
            // Show welcome notification
            if (currentStatus === 'initializing') {
                showNotification('Welcome to WhatsApp Bot Dashboard!', 'info');
            }
            
            // Reset first online flag jika sudah online
            if (currentStatus === 'online') {
                isFirstOnline = false;
            }
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                // Page became visible, force immediate update
                updateStatus();
            }
        });
    </script>
</body>
</html>`;
    fs.writeFileSync(indexEjsPath, basicTemplate);
}

app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.render('index', {
        bot_name: packageInfo.name,
        version: packageInfo.version,
        author: packageInfo.author,
        description: packageInfo.description,
        botStatus: global.botStatus,
        connectionStatus: global.connectionStatus,
        phoneNumber: global.phoneNumber,
        pairingCode: global.pairingCode,
        botInfo: global.botInfo,
        sessionIssues: global.sessionIssues,
        currentPort: CURRENT_PORT,
        uptime: Math.floor((Date.now() - (global.webUptime || Date.now())) / 1000)
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        status: global.botStatus,
        connection_status: global.connectionStatus,
        phone_number: global.phoneNumber,
        pairing_code: global.pairingCode,
        bot_info: global.botInfo,
        session_issues: global.sessionIssues,
        current_port: CURRENT_PORT,
        uptime: Math.floor((Date.now() - (global.webUptime || Date.now())) / 1000)
    });
});

app.post('/api/pair', (req, res) => {
    let { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    // Clean phone number
    let cleanedPhone = phoneNumber.replace(/\D/g, '');
    if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '62' + cleanedPhone.substring(1);
    }
    if (!cleanedPhone.startsWith('62')) {
        cleanedPhone = '62' + cleanedPhone;
    }

    if (cleanedPhone.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number. Minimum 10 digits required.' });
    }

    console.log('📱 Phone number received from web:', cleanedPhone);
    
    global.phoneNumber = cleanedPhone;
    global.botStatus = 'Phone number received';
    global.connectionStatus = 'waiting_phone';
    global.pairingCode = null;
    global.sessionIssues = false;

    // Clear session for fresh pairing
    clearSessionFiles().then(() => {
        console.log('✅ Session cleared for pairing');
    }).catch(err => {
        console.log('⚠️ Error clearing session:', err);
    });

    res.json({ 
        status: 'success', 
        message: 'Phone number received. Starting WhatsApp connection...',
        phone: cleanedPhone
    });
});

// Function to clear session files
function clearSessionFiles() {
    return new Promise((resolve, reject) => {
        exec('rm -rf ./nazedev/* ./baileys_store.json ./session ./sessions', (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

app.post('/api/clear-session', (req, res) => {
    global.phoneNumber = null;
    global.pairingCode = null;
    global.botInfo = null;
    global.botStatus = 'Session cleared';
    global.connectionStatus = 'initializing';
    global.sessionIssues = false;
    
    clearSessionFiles().then(() => {
        res.json({ status: 'success', message: 'Session cleared successfully' });
    }).catch(error => {
        res.status(500).json({ status: 'error', message: 'Failed to clear session' });
    });
});

app.post('/api/fix-session', (req, res) => {
    console.log('🛠️ Attempting to fix session issues...');
    global.botStatus = 'Fixing session issues...';
    global.sessionIssues = false;
    
    // Clear problematic session files but keep auth state
    exec('rm -f ./nazedev/app-state-sync-* ./nazedev/pre-key-* ./baileys_store.json', (error) => {
        if (error) {
            console.log('❌ Error fixing session:', error);
            res.json({ status: 'error', message: 'Failed to fix session' });
        } else {
            console.log('✅ Session files cleaned');
            global.botStatus = 'Session fixed, reconnecting...';
            res.json({ status: 'success', message: 'Session issues fixed. Reconnecting...' });
        }
    });
});

app.post('/api/advanced-fix', (req, res) => {
    console.log('🔧 Running advanced session repair...');
    global.botStatus = 'Advanced session repair...';
    
    // Clear all session data completely
    exec('rm -rf ./nazedev ./baileys_store.json ./session ./sessions ./tmp', (error) => {
        if (error) {
            console.log('❌ Error in advanced fix:', error);
            res.json({ status: 'error', message: 'Advanced fix failed' });
        } else {
            console.log('✅ All session data cleared');
            global.phoneNumber = null;
            global.pairingCode = null;
            global.botInfo = null;
            global.botStatus = 'Session completely reset';
            global.connectionStatus = 'initializing';
            global.sessionIssues = false;
            res.json({ status: 'success', message: 'Advanced repair completed. Ready for new pairing.' });
        }
    });
});

app.post('/api/clear-and-restart', (req, res) => {
    console.log('🔄 Clear and restart requested...');
    
    exec('rm -rf ./nazedev ./baileys_store.json && pkill -f "node.*index.js"', (error) => {
        if (error) {
            console.log('⚠️ Cleanup error (may be normal):', error);
        }
        
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.botStatus = 'Cleared and restarting...';
        global.connectionStatus = 'initializing';
        global.sessionIssues = false;
        
        // Restart the bot process
        setTimeout(() => {
            const newProcess = spawn(process.argv[0], [path.join(__dirname, 'index.js'), '--pairing-code'], {
                stdio: 'inherit',
                detached: true
            });
            
            newProcess.unref();
        }, 2000);
        
        res.json({ status: 'success', message: 'Session cleared and restarting bot process...' });
    });
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
    console.log('🔑 Pairing code set:', code);
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log('🔄 Status updated:', status, message);
}

function setBotInfo(info) {
    global.botInfo = info;
    global.connectionStatus = 'online';
    global.botStatus = 'Connected to WhatsApp';
    console.log('🤖 Bot info updated:', info);
}

function setSessionIssues(hasIssues) {
    global.sessionIssues = hasIssues;
    if (hasIssues) {
        global.botStatus = 'Session issues detected';
        global.connectionStatus = 'error';
        console.log('⚠️ Session issues detected');
    } else {
        console.log('✅ Session issues cleared');
    }
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
                console.log(chalk.green(`🚀 Web Dashboard running on http://localhost:${CURRENT_PORT}`));
                console.log(chalk.blue(`📊 Health check: http://localhost:${CURRENT_PORT}/health`));
                console.log(chalk.blue(`📱 API Status: http://localhost:${CURRENT_PORT}/api/status`));
                isServerRunning = true;
                global.webUptime = Date.now();
                resolve(CURRENT_PORT);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(`❌ Port ${CURRENT_PORT} is in use, trying ${CURRENT_PORT + 1}...`));
                    CURRENT_PORT = CURRENT_PORT + 1;
                    startServer().then(resolve).catch(reject);
                } else {
                    console.log(chalk.red('❌ Server error:'), err);
                    reject(err);
                }
            });
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        throw error;
    }
}

module.exports = { 
    app, 
    startServer, 
    setPairingCode,
    setConnectionStatus, 
    setBotInfo,
    setSessionIssues
};

// Auto-start server jika file ini di-run langsung
if (require.main === module) {
    startServer().catch(console.error);
}