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

// ⭐ PERUBAHAN PENTING: Gunakan port dari environment variable Koyeb
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
                    console.log(chalk.yellow(`🔄 Port ${startPort} sedang digunakan, mencoba port ${startPort + 1}...`));
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
        description: 'WhatsApp Bot with Web Dashboard - Optimized for Koyeb'
    };
}

// ⭐ MIDDLEWARE UNTUK KOYEB: Trust proxy dan security headers
app.set('trust proxy', 1);
app.use((req, res, next) => {
    // Security headers untuk Koyeb
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

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
    // Template EJS sama seperti sebelumnya, tapi disimpan di file terpisah
    const basicTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= bot_name %> - Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        /* Styles tetap sama seperti sebelumnya */
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
        /* ... (seluruh CSS tetap sama) ... */
    </style>
</head>
<body>
    <!-- Notification Area -->
    <div id="notificationArea"></div>

    <div class="container py-4">
        <!-- Koyeb Badge -->
        <div class="row justify-content-center mb-3">
            <div class="col-lg-10">
                <div class="alert alert-info text-center py-2">
                    <i class="fas fa-cloud me-2"></i>
                    <strong>Running on Koyeb</strong> - Server optimized for cloud deployment
                </div>
            </div>
        </div>

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
        // Configuration untuk Koyeb
        const CONFIG = {
            POLLING_INTERVAL_NORMAL: 3000,
            POLLING_INTERVAL_ACTIVE: 1000,
            POLLING_INTERVAL_ONLINE: 2000,
            PAIRING_CODE_TIMEOUT: 20,
            MAX_RETRIES: 5,
            // ⭐ Timeout yang lebih lama untuk Koyeb
            REQUEST_TIMEOUT: 10000
        };

        let pollingInterval = CONFIG.POLLING_INTERVAL_NORMAL;
        let currentStatus = '<%= connectionStatus %>';
        let pairingCodeCountdown = null;
        let isFirstOnline = true;

        // Smart polling based on current status
        function getPollingInterval() {
            const status = document.getElementById('connectionStatusText')?.textContent || currentStatus;
            
            if (['connecting', 'pairing', 'waiting_phone', 'waiting_qr'].includes(status)) {
                return CONFIG.POLLING_INTERVAL_ACTIVE;
            }
            
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
            
            setTimeout(() => {
                if (document.getElementById(notificationId)) {
                    document.getElementById(notificationId).remove();
                }
            }, 5000);
        }

        // ⭐ PERBAIKAN: Update status dengan timeout untuk Koyeb
        function updateStatus() {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

            fetch('/api/status', { signal: controller.signal })
                .then(response => {
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error('Network response was not ok');
                    return response.json();
                })
                .then(data => {
                    processStatusUpdate(data);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    if (error.name === 'AbortError') {
                        console.error('Status update timeout');
                        showNotification('Request timeout - server might be busy', 'warning');
                    } else {
                        console.error('Status update error:', error);
                        showNotification('Connection to server lost', 'danger');
                    }
                });
        }

        // ... (JavaScript lainnya tetap sama) ...
    </script>
</body>
</html>`;
    fs.writeFileSync(indexEjsPath, basicTemplate);
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ⭐ ROUTE HEALTH CHECK UNTUK KOYEB
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        platform: process.platform,
        node_version: process.version
    });
});

// ⭐ ROUTE UNTUK INFO SERVER KOYEB
app.get('/api/server-info', (req, res) => {
    res.json({
        platform: process.platform,
        node_version: process.version,
        memory: process.memoryUsage(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        koyeb: true
    });
});

app.use(express.static('public', {
    maxAge: '1h', // Cache static files untuk performa
    etag: false
}));

// Routes yang sudah ada tetap sama...
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

// ... (routes lainnya tetap sama) ...

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
        koyeb: true,
        server_time: new Date().toISOString()
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
        // ⭐ PERBAIKAN: Gunakan path yang compatible dengan Koyeb
        const commands = [
            'rm -rf ./nazedev/*',
            'rm -f ./baileys_store.json',
            'rm -rf ./session',
            'rm -rf ./sessions',
            'rm -rf ./tmp'
        ];
        
        let completed = 0;
        let hasError = false;

        commands.forEach(cmd => {
            exec(cmd, (error) => {
                completed++;
                if (error && !hasError) {
                    hasError = true;
                    reject(error);
                } else if (completed === commands.length && !hasError) {
                    resolve();
                }
            });
        });
    });
}

// ... (fungsi lainnya tetap sama) ...

// Start server dengan optimasi untuk Koyeb
async function startServer() {
    if (isServerRunning) return CURRENT_PORT;

    try {
        // ⭐ PERUBAHAN PENTING: Gunakan port dari Koyeb environment variable
        const availablePort = await findAvailablePort(CURRENT_PORT);
        CURRENT_PORT = availablePort;
        
        return new Promise((resolve, reject) => {
            server = createServer(app);
            
            // ⭐ KONFIGURASI SERVER UNTUK KOYEB
            server.keepAliveTimeout = 60000;
            server.headersTimeout = 65000;
            
            server.listen(CURRENT_PORT, '0.0.0.0', () => {
                console.log(chalk.green(`🚀 Web Dashboard running on port: ${CURRENT_PORT}`));
                console.log(chalk.blue(`📊 Health check: http://0.0.0.0:${CURRENT_PORT}/health`));
                console.log(chalk.blue(`📱 API Status: http://0.0.0.0:${CURRENT_PORT}/api/status`));
                console.log(chalk.yellow(`🌐 Koyeb Environment: ${process.env.NODE_ENV || 'production'}`));
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
