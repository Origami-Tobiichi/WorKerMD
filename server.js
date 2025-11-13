const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');

// Simple chalk implementation
const chalk = {
    red: (t) => `❌ ${t}`, yellow: (t) => `⚠️ ${t}`, green: (t) => `✅ ${t}`, 
    blue: (t) => `🔵 ${t}`, cyan: (t) => `🔷 ${t}`
};

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

// Rate limiting untuk pairing
const pairingRateLimit = {
    attempts: 0,
    maxAttempts: 3,
    lastAttempt: 0,
    cooldown: 60000 // 1 menit
};

// ==============================
// 🌐 WEB DASHBOARD HTML
// ==============================

const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot - Koyeb</title>
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
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin-bottom: 20px;
            padding: 25px;
            backdrop-filter: blur(10px);
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
        .platform-badge {
            background: linear-gradient(135deg, #FF6B6B, #4ECDC4);
            color: white;
        }
        .pairing-code {
            font-size: 2rem;
            font-weight: bold;
            letter-spacing: 3px;
            text-align: center;
            padding: 15px;
            border: 2px dashed #28a745;
            border-radius: 10px;
            background: #f8f9fa;
            color: #28a745;
            margin: 10px 0;
        }
        .phone-input {
            border-radius: 10px;
            padding: 12px;
            font-size: 1.1rem;
        }
        .btn-pairing {
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 10px;
            font-weight: 600;
        }
        .btn-pairing:hover {
            background: linear-gradient(135deg, #218838, #1e9e8a);
            color: white;
        }
        .connection-guide {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            border-radius: 10px;
            padding: 20px;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container py-4">
        <!-- Header -->
        <div class="dashboard-card text-center mb-4">
            <h1 class="display-5 fw-bold text-primary">
                <i class="fab fa-whatsapp me-2"></i>WhatsApp Bot Dashboard
            </h1>
            <p class="lead text-muted">Koyeb Deployment • Complete Pairing System</p>
            <span class="badge platform-badge fs-6">
                <i class="fas fa-cloud me-1"></i>Koyeb Platform
            </span>
        </div>

        <!-- Connection Status -->
        <div class="row">
            <div class="col-md-6">
                <div class="dashboard-card h-100">
                    <h4><i class="fas fa-plug me-2"></i>Connection Status</h4>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <span class="status-indicator status-connecting" id="statusIndicator"></span>
                            <strong id="connectionStatus">connecting</strong>
                        </div>
                        <span class="badge bg-warning" id="statusBadge">Connecting...</span>
                    </div>
                    
                    <div class="progress mb-3" style="height: 10px;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             id="progressBar" style="width: 50%"></div>
                    </div>
                    <div class="text-center text-muted small" id="progressText">
                        Connecting to WhatsApp servers...
                    </div>

                    <!-- Pairing Code Display -->
                    <div id="pairingCodeSection" style="display: none;" class="mt-4">
                        <h5><i class="fas fa-key me-2"></i>Your Pairing Code</h5>
                        <div class="pairing-code" id="pairingCodeDisplay">Loading...</div>
                        <p class="text-muted text-center small mt-2">
                            <i class="fas fa-info-circle me-1"></i>
                            Enter this code in WhatsApp to link your device
                        </p>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="dashboard-card h-100">
                    <h4><i class="fas fa-mobile-alt me-2"></i>Phone Number & Pairing</h4>
                    
                    <!-- Phone Input Form -->
                    <div id="phoneFormSection">
                        <form id="phoneForm">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="fas fa-phone me-2"></i>WhatsApp Phone Number
                                </label>
                                <input type="tel" class="form-control phone-input" id="phoneInput" 
                                       placeholder="6281234567890 or 081234567890" required
                                       pattern="[0-9+\\-\\s()]{10,15}">
                                <div class="form-text">
                                    <i class="fas fa-info-circle me-1"></i>
                                    Enter your WhatsApp number in international format
                                </div>
                            </div>
                            <button type="submit" class="btn btn-pairing w-100 py-3 fw-bold" id="submitBtn">
                                <i class="fas fa-paper-plane me-2"></i>Generate Pairing Code
                            </button>
                        </form>
                        <div id="formMessage" class="mt-3"></div>
                    </div>

                    <!-- Connected Bot Info -->
                    <div id="botInfoSection" style="display: none;" class="mt-3">
                        <h5><i class="fas fa-robot me-2"></i>Connected Bot</h5>
                        <div class="alert alert-success">
                            <strong id="connectedBotName">Bot Name</strong><br>
                            <small>Phone: <span id="connectedBotPhone">Loading...</span></small><br>
                            <small>Status: <span class="badge bg-success">Connected</span></small>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- System Information -->
        <div class="dashboard-card">
            <h5><i class="fas fa-server me-2"></i>System Information</h5>
            <div class="row">
                <div class="col-md-6">
                    <table class="table table-sm">
                        <tr>
                            <td><strong>Platform:</strong></td>
                            <td id="platformInfo">Koyeb</td>
                        </tr>
                        <tr>
                            <td><strong>Uptime:</strong></td>
                            <td id="uptimeInfo">0s</td>
                        </tr>
                        <tr>
                            <td><strong>Memory Usage:</strong></td>
                            <td id="memoryInfo">Loading...</td>
                        </tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <table class="table table-sm">
                        <tr>
                            <td><strong>Node.js:</strong></td>
                            <td id="nodeVersion">Loading...</td>
                        </tr>
                        <tr>
                            <td><strong>Bot Version:</strong></td>
                            <td>2.0.0</td>
                        </tr>
                        <tr>
                            <td><strong>Status:</strong></td>
                            <td><span class="badge bg-success" id="systemStatus">ACTIVE</span></td>
                        </tr>
                    </table>
                </div>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="dashboard-card text-center">
            <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Quick Actions</h5>
            <div class="btn-group flex-wrap">
                <button class="btn btn-outline-primary" onclick="updateStatus()">
                    <i class="fas fa-sync-alt me-2"></i>Refresh Status
                </button>
                <button class="btn btn-outline-warning" onclick="restartBot()">
                    <i class="fas fa-redo me-2"></i>Restart Bot
                </button>
                <button class="btn btn-outline-info" onclick="clearPairing()">
                    <i class="fas fa-times me-2"></i>Clear Pairing
                </button>
                <button class="btn btn-outline-secondary" onclick="showTerminal()">
                    <i class="fas fa-terminal me-2"></i>Show Terminal
                </button>
            </div>
        </div>

        <!-- Connection Guide -->
        <div class="connection-guide">
            <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>Connection Guide</h5>
            <ol class="mb-0">
                <li>Enter your WhatsApp number above</li>
                <li>Click "Generate Pairing Code"</li>
                <li>Wait for the pairing code to appear</li>
                <li>Open WhatsApp on your phone</li>
                <li>Go to <strong>Settings → Linked Devices → Link a Device</strong></li>
                <li>Enter the pairing code when prompted</li>
                <li>Wait for connection confirmation</li>
            </ol>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        let currentPairingCode = null;

        function updateStatus() {
            fetch('/api/status')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('connectionStatus').textContent = data.connection_status;
                    document.getElementById('statusBadge').textContent = data.status;
                    
                    // Update status indicator
                    const indicator = document.getElementById('statusIndicator');
                    indicator.className = 'status-indicator status-' + data.connection_status;
                    
                    // Update progress
                    const progressConfig = {
                        'online': { width: '100%', text: 'Connected to WhatsApp', badge: 'bg-success' },
                        'pairing': { width: '75%', text: 'Enter pairing code', badge: 'bg-info' },
                        'connecting': { width: '50%', text: 'Connecting...', badge: 'bg-warning' },
                        'offline': { width: '25%', text: 'Disconnected', badge: 'bg-danger' }
                    };
                    
                    const config = progressConfig[data.connection_status] || { width: '50%', text: 'Connecting...', badge: 'bg-warning' };
                    document.getElementById('progressBar').style.width = config.width;
                    document.getElementById('progressText').textContent = config.text;
                    document.getElementById('statusBadge').className = 'badge ' + config.badge;

                    // Update system info
                    if (data.performance) {
                        document.getElementById('memoryInfo').textContent = 
                            Math.round(data.performance.memory.heapUsed / 1024 / 1024) + ' MB';
                        document.getElementById('uptimeInfo').textContent = 
                            Math.round(data.performance.uptime) + ' seconds';
                    }

                    // Update pairing code display
                    if (data.pairing_code) {
                        currentPairingCode = data.pairing_code;
                        document.getElementById('pairingCodeDisplay').textContent = data.pairing_code;
                        document.getElementById('pairingCodeSection').style.display = 'block';
                    } else {
                        document.getElementById('pairingCodeSection').style.display = 'none';
                    }

                    // Update bot info
                    if (data.bot_info) {
                        document.getElementById('botInfoSection').style.display = 'block';
                        document.getElementById('phoneFormSection').style.display = 'none';
                        document.getElementById('connectedBotName').textContent = data.bot_info.name || 'Unknown';
                        document.getElementById('connectedBotPhone').textContent = data.bot_info.phone || 'Not set';
                    } else {
                        document.getElementById('botInfoSection').style.display = 'none';
                        document.getElementById('phoneFormSection').style.display = 'block';
                    }

                    // Update phone number if set
                    if (data.phone_number) {
                        document.getElementById('phoneInput').value = data.phone_number;
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    document.getElementById('connectionStatus').textContent = 'error';
                    document.getElementById('statusBadge').textContent = 'Connection Error';
                    document.getElementById('statusIndicator').className = 'status-indicator status-offline';
                });
        }

        function restartBot() {
            if (confirm('Restart the bot? This will temporarily disconnect WhatsApp.')) {
                fetch('/api/restart')
                    .then(() => alert('Bot restarting...'))
                    .catch(() => alert('Error restarting bot'));
            }
        }

        function clearPairing() {
            if (confirm('Clear current pairing? This will disconnect the current session.')) {
                fetch('/api/clear-pairing', { method: 'POST' })
                    .then(() => {
                        alert('Pairing cleared');
                        updateStatus();
                    })
                    .catch(() => alert('Error clearing pairing'));
            }
        }

        function showTerminal() {
            alert('Check the Koyeb logs/terminal for QR code and detailed connection information.');
        }

        // Handle phone form submission
        document.getElementById('phoneForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const formMessage = document.getElementById('formMessage');
            
            if (!phone) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter phone number</div>';
                return;
            }

            // Basic phone validation
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone.length < 10) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter a valid phone number</div>';
                return;
            }

            formMessage.innerHTML = '<div class="alert alert-info">Sending pairing request...</div>';

            fetch('/api/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: cleanPhone })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    formMessage.innerHTML = '<div class="alert alert-success">' + result.message + '</div>';
                    updateStatus();
                    
                    // Check for pairing code periodically
                    const checkInterval = setInterval(() => {
                        fetch('/api/pairing-code')
                            .then(r => r.json())
                            .then(data => {
                                if (data.pairing_code) {
                                    formMessage.innerHTML = '<div class="alert alert-success">Pairing code generated! Check the pairing code section above.</div>';
                                    clearInterval(checkInterval);
                                    updateStatus();
                                }
                            });
                    }, 2000);
                    
                    // Stop checking after 30 seconds
                    setTimeout(() => clearInterval(checkInterval), 30000);
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger">' + (result.error || 'Unknown error') + '</div>';
                }
            })
            .catch(error => {
                formMessage.innerHTML = '<div class="alert alert-danger">Network error: ' + error.message + '</div>';
            });
        });

        // Initialize system info
        document.getElementById('platformInfo').textContent = navigator.platform;
        document.getElementById('nodeVersion').textContent = 'Unknown';

        // Auto-update every 3 seconds
        setInterval(updateStatus, 3000);
        
        // Initial update
        updateStatus();

        // Get Node.js version from server
        fetch('/api/status')
            .then(response => response.json())
            .then(data => {
                if (data.versions) {
                    document.getElementById('nodeVersion').textContent = data.versions.node;
                }
            });
    </script>
</body>
</html>`;

// ==============================
// 🚀 EXPRESS SERVER SETUP
// ==============================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});

// ==============================
// 📍 ROUTES
// ==============================

// Main dashboard
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(HTML_DASHBOARD);
});

// API Status
app.get('/api/status', (req, res) => {
    res.json({
        status: global.botStatus,
        connection_status: global.connectionStatus,
        phone_number: global.phoneNumber,
        pairing_code: global.pairingCode,
        bot_info: global.botInfo,
        performance: {
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage()
        },
        versions: {
            node: process.version,
            platform: process.platform
        },
        timestamp: new Date().toISOString()
    });
});

// Pair Phone Number
app.post('/api/pair', (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    // Rate limiting check
    const now = Date.now();
    if (now - pairingRateLimit.lastAttempt < pairingRateLimit.cooldown) {
        const waitTime = Math.ceil((pairingRateLimit.cooldown - (now - pairingRateLimit.lastAttempt)) / 1000);
        return res.status(429).json({ 
            success: false, 
            error: `Please wait ${waitTime} seconds before trying again` 
        });
    }

    if (pairingRateLimit.attempts >= pairingRateLimit.maxAttempts) {
        return res.status(429).json({ 
            success: false, 
            error: 'Too many pairing attempts. Please try again later.' 
        });
    }

    console.log(chalk.blue('📱 Pairing request for:'), phoneNumber);
    
    // Validate phone number
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        return res.status(400).json({ 
            success: false, 
            error: 'Phone number must be 10-15 digits long' 
        });
    }

    // Format phone number
    let formattedNumber = cleanNumber;
    if (cleanNumber.startsWith('0')) {
        formattedNumber = '62' + cleanNumber.substring(1);
    } else if (!cleanNumber.startsWith('62')) {
        formattedNumber = '62' + cleanNumber;
    }

    pairingRateLimit.attempts++;
    pairingRateLimit.lastAttempt = now;

    global.phoneNumber = formattedNumber;
    global.botStatus = 'Waiting for pairing code';
    global.connectionStatus = 'pairing';

    console.log(chalk.green('✅ Phone number accepted:'), formattedNumber);

    res.json({ 
        success: true, 
        message: 'Phone number accepted. Generating pairing code...',
        phone: formattedNumber
    });
});

// Get Pairing Code
app.get('/api/pairing-code', (req, res) => {
    res.json({
        pairing_code: global.pairingCode,
        status: global.pairingCode ? 'active' : 'not_generated'
    });
});

// Clear Pairing
app.post('/api/clear-pairing', (req, res) => {
    global.phoneNumber = null;
    global.pairingCode = null;
    global.botInfo = null;
    global.botStatus = 'Pairing cleared';
    global.connectionStatus = 'initializing';
    
    pairingRateLimit.attempts = 0;
    
    console.log(chalk.yellow('🗑️ Pairing cleared'));

    res.json({ 
        success: true, 
        message: 'Pairing cleared successfully' 
    });
});

// Health check for Koyeb
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'WhatsApp Bot',
        timestamp: new Date().toISOString()
    });
});

// Restart endpoint
app.get('/api/restart', (req, res) => {
    global.botStatus = 'Restarting...';
    global.connectionStatus = 'connecting';
    
    console.log(chalk.yellow('🔄 Bot restart requested via API'));
    
    res.json({ 
        success: true, 
        message: 'Restart command sent' 
    });
});

// System info
app.get('/api/system', (req, res) => {
    res.json({
        platform: process.platform,
        node_version: process.version,
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

// ==============================
// 🔧 MANAGEMENT FUNCTIONS
// ==============================

function setPairingCode(code) {
    global.pairingCode = code;
    global.connectionStatus = 'pairing';
    global.botStatus = 'Pairing code generated';
    console.log(chalk.green(`🔐 Pairing code: ${code}`));
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log(chalk.blue(`🔌 Status: ${status} - ${message}`));
}

function setBotInfo(info) {
    global.botInfo = info;
    global.connectionStatus = 'online';
    global.botStatus = 'Connected to WhatsApp';
    console.log(chalk.green(`🤖 Bot connected: ${info?.name || 'Unknown'}`));
}

function setPhoneNumber(phone) {
    global.phoneNumber = phone;
    console.log(chalk.blue(`📱 Phone number set: ${phone}`));
}

// ==============================
// 🚀 START SERVER
// ==============================

async function startServer(port = null) {
    if (isServerRunning) {
        console.log(chalk.yellow('⚠️ Server is already running'));
        return CURRENT_PORT;
    }

    if (port) {
        CURRENT_PORT = port;
    }

    return new Promise((resolve, reject) => {
        server = createServer(app);
        
        server.listen(CURRENT_PORT, '0.0.0.0', (err) => {
            if (err) {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(`🔄 Port ${CURRENT_PORT} busy, trying ${CURRENT_PORT + 1}...`));
                    return startServer(CURRENT_PORT + 1).then(resolve).catch(reject);
                }
                console.log(chalk.red('❌ Server error:'), err);
                return reject(err);
            }
            
            isServerRunning = true;
            console.log(chalk.green('╔═══════════════════════════════════════╗'));
            console.log(chalk.green('║        WhatsApp Bot Dashboard        ║'));
            console.log(chalk.green('╚═══════════════════════════════════════╝'));
            console.log(chalk.cyan(`🌐 Dashboard URL: http://0.0.0.0:${CURRENT_PORT}`));
            console.log(chalk.blue(`📊 API Status: http://0.0.0.0:${CURRENT_PORT}/api/status`));
            console.log(chalk.green(`📱 Pairing System: http://0.0.0.0:${CURRENT_PORT}/`));
            console.log(chalk.green(`❤️ Health Check: http://0.0.0.0:${CURRENT_PORT}/health`));
            console.log(chalk.magenta(`🚀 Ready on Koyeb`));
            
            resolve(CURRENT_PORT);
        });
    });
}

module.exports = { 
    app, 
    startServer, 
    setPairingCode,
    setConnectionStatus, 
    setBotInfo,
    setPhoneNumber
};

// Start server if run directly
if (require.main === module) {
    console.log(chalk.blue('🚀 Starting standalone web server...'));
    startServer().catch(console.error);
}
