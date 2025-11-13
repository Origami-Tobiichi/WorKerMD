const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');

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
global.qrCode = global.qrCode || null;

// Rate limiting
const pairingRateLimit = {
    attempts: 0,
    maxAttempts: 5,
    lastAttempt: 0,
    cooldown: 60000
};

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

// HTML Dashboard (sama seperti sebelumnya, tapi disimpan dalam variabel)
const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Naze Bot - Complete Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
    <style>
        /* CSS styles dari versi sebelumnya */
        :root { --primary: #667eea; --secondary: #764ba2; --success: #28a745; --warning: #ffc107; --danger: #dc3545; --info: #17a2b8; }
        body { background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); min-height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px 0; }
        .dashboard-card { background: rgba(255, 255, 255, 0.95); border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); margin-bottom: 20px; padding: 25px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); }
        .status-indicator { width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: 8px; }
        .status-online { background: var(--success); animation: pulse 2s infinite; }
        .status-offline { background: var(--danger); }
        .status-connecting { background: var(--warning); animation: pulse 1.5s infinite; }
        .status-pairing { background: var(--info); animation: pulse 1s infinite; }
        .status-waiting { background: #fd7e14; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .platform-badge { background: linear-gradient(135deg, #FF6B6B, #4ECDC4); color: white; }
        .pairing-code { font-size: 2.5rem; font-weight: bold; letter-spacing: 5px; text-align: center; padding: 20px; border: 3px dashed var(--success); border-radius: 15px; background: #f8f9fa; color: var(--success); margin: 15px 0; font-family: 'Courier New', monospace; }
        .phone-input { border-radius: 12px; padding: 15px; font-size: 1.1rem; border: 2px solid #e9ecef; transition: all 0.3s ease; }
        .phone-input:focus { border-color: var(--primary); box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25); }
        .btn-pairing { background: linear-gradient(135deg, var(--success), #20c997); color: white; border: none; padding: 15px 25px; border-radius: 12px; font-weight: 600; font-size: 1.1rem; transition: all 0.3s ease; }
        .btn-pairing:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(40, 167, 69, 0.3); }
        .btn-qr { background: linear-gradient(135deg, var(--info), #6f42c1); color: white; border: none; padding: 12px 20px; border-radius: 10px; font-weight: 600; }
        .connection-guide { background: linear-gradient(135deg, #25D366, #128C7E); color: white; border-radius: 15px; padding: 25px; margin: 20px 0; }
        .qr-container { background: white; padding: 20px; border-radius: 12px; text-align: center; margin: 15px 0; }
        .tab-content { padding: 20px 0; }
        .nav-tabs .nav-link.active { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; border: none; border-radius: 10px 10px 0 0; }
        .nav-tabs .nav-link { color: var(--primary); font-weight: 500; }
    </style>
</head>
<body>
    <div class="container py-4">
        <!-- Header -->
        <div class="dashboard-card text-center mb-4">
            <div class="row align-items-center">
                <div class="col-auto">
                    <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center;">
                        <i class="fab fa-whatsapp fa-2x text-white"></i>
                    </div>
                </div>
                <div class="col">
                    <h1 class="display-5 fw-bold text-dark mb-2">Naze Bot Dashboard</h1>
                    <p class="lead text-muted mb-3">Complete Pairing System • Koyeb Deployment</p>
                    <span class="badge platform-badge fs-6"><i class="fas fa-cloud me-1"></i>Koyeb Platform</span>
                </div>
            </div>
        </div>

        <!-- Connection Status & Methods -->
        <div class="row">
            <div class="col-md-6">
                <div class="dashboard-card h-100">
                    <h4 class="mb-3"><i class="fas fa-plug me-2"></i>Connection Status</h4>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div><span class="status-indicator status-connecting" id="statusIndicator"></span><strong id="connectionStatus">connecting</strong></div>
                        <span class="badge bg-warning" id="statusBadge">Connecting...</span>
                    </div>
                    <div class="progress mb-3" style="height: 12px;"><div class="progress-bar progress-bar-striped progress-bar-animated" id="progressBar" style="width: 50%"></div></div>
                    <div class="text-center text-muted small" id="progressText">Initializing connection system...</div>
                    <div id="botInfoSection" style="display: none;" class="mt-4 p-3 bg-light rounded">
                        <h6><i class="fas fa-robot me-2"></i>Bot Information</h6>
                        <div id="botInfoContent">Loading bot information...</div>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="dashboard-card h-100">
                    <h4 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>Connection Methods</h4>
                    <ul class="nav nav-tabs" id="connectionTabs" role="tablist">
                        <li class="nav-item" role="presentation"><button class="nav-link active" id="pairing-tab" data-bs-toggle="tab" data-bs-target="#pairing" type="button" role="tab"><i class="fas fa-key me-1"></i>Pairing Code</button></li>
                        <li class="nav-item" role="presentation"><button class="nav-link" id="qr-tab" data-bs-toggle="tab" data-bs-target="#qr" type="button" role="tab"><i class="fas fa-qrcode me-1"></i>QR Code</button></li>
                    </ul>

                    <div class="tab-content" id="connectionTabsContent">
                        <!-- Pairing Code Tab -->
                        <div class="tab-pane fade show active" id="pairing" role="tabpanel">
                            <div id="phoneFormSection">
                                <form id="phoneForm">
                                    <div class="mb-3">
                                        <label class="form-label fw-bold"><i class="fas fa-phone me-2"></i>WhatsApp Phone Number</label>
                                        <input type="tel" class="form-control phone-input" id="phoneInput" placeholder="6281234567890 or 081234567890" required pattern="[0-9+\\-\\s()]{10,15}">
                                        <div class="form-text"><i class="fas fa-info-circle me-1"></i>Enter your WhatsApp number in international format</div>
                                    </div>
                                    <button type="submit" class="btn btn-pairing w-100 py-3 fw-bold" id="submitBtn"><i class="fas fa-paper-plane me-2"></i>Generate Pairing Code</button>
                                </form>
                                <div id="formMessage" class="mt-3"></div>
                            </div>
                            <div id="pairingCodeSection" style="display: none;" class="mt-4">
                                <h5 class="text-center"><i class="fas fa-key me-2"></i>Your Pairing Code</h5>
                                <div class="pairing-code" id="pairingCodeDisplay">Loading...</div>
                                <p class="text-muted text-center mt-3"><i class="fas fa-info-circle me-1"></i>Enter this code in WhatsApp to link your device</p>
                                <div class="text-center"><button class="btn btn-outline-secondary btn-sm" onclick="copyPairingCode()"><i class="fas fa-copy me-1"></i>Copy Code</button></div>
                            </div>
                        </div>

                        <!-- QR Code Tab -->
                        <div class="tab-pane fade" id="qr" role="tabpanel">
                            <div class="text-center">
                                <p class="text-muted mb-3"><i class="fas fa-qrcode me-1"></i>Scan QR code with WhatsApp to connect instantly</p>
                                <div id="qrCodeSection" style="display: none;">
                                    <div class="qr-container"><div id="qrcode"></div></div>
                                    <p class="text-muted small mt-2">Open WhatsApp → Linked Devices → Scan QR Code</p>
                                </div>
                                <div id="noQrCode" class="text-muted py-4">
                                    <i class="fas fa-sync fa-spin fa-2x mb-3"></i>
                                    <p>Waiting for QR code generation...</p>
                                    <button class="btn btn-qr" onclick="checkQRCode()"><i class="fas fa-sync me-1"></i>Check for QR Code</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- System Information -->
        <div class="dashboard-card">
            <h5 class="mb-3"><i class="fas fa-server me-2"></i>System Information</h5>
            <div class="row">
                <div class="col-md-4">
                    <table class="table table-sm">
                        <tr><td><strong>Platform:</strong></td><td id="platformInfo">Koyeb</td></tr>
                        <tr><td><strong>Uptime:</strong></td><td id="uptimeInfo">0s</td></tr>
                        <tr><td><strong>Memory Usage:</strong></td><td id="memoryInfo">Loading...</td></tr>
                    </table>
                </div>
                <div class="col-md-4">
                    <table class="table table-sm">
                        <tr><td><strong>Node.js:</strong></td><td id="nodeVersion">Loading...</td></tr>
                        <tr><td><strong>Bot Version:</strong></td><td>2.0.0</td></tr>
                        <tr><td><strong>Status:</strong></td><td><span class="badge bg-success" id="systemStatus">ACTIVE</span></td></tr>
                    </table>
                </div>
                <div class="col-md-4">
                    <table class="table table-sm">
                        <tr><td><strong>Connection:</strong></td><td id="connectionType">Waiting</td></tr>
                        <tr><td><strong>Pairing Code:</strong></td><td id="pairingStatus">Not generated</td></tr>
                        <tr><td><strong>QR Code:</strong></td><td id="qrStatus">Not available</td></tr>
                    </table>
                </div>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="dashboard-card text-center">
            <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Quick Actions</h5>
            <div class="btn-group flex-wrap">
                <button class="btn btn-outline-primary" onclick="updateStatus()"><i class="fas fa-sync-alt me-2"></i>Refresh Status</button>
                <button class="btn btn-outline-warning" onclick="restartBot()"><i class="fas fa-redo me-2"></i>Restart Bot</button>
                <button class="btn btn-outline-danger" onclick="clearSession()"><i class="fas fa-times me-2"></i>Clear Session</button>
                <button class="btn btn-outline-info" onclick="showLogs()"><i class="fas fa-terminal me-2"></i>View Logs</button>
            </div>
        </div>

        <!-- Connection Guide -->
        <div class="connection-guide">
            <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>Connection Guide</h5>
            <div class="row">
                <div class="col-md-6">
                    <h6><i class="fas fa-key me-2"></i>Pairing Code Method</h6>
                    <ol>
                        <li>Enter your WhatsApp number</li>
                        <li>Click "Generate Pairing Code"</li>
                        <li>Wait for the pairing code to appear</li>
                        <li>Open WhatsApp → Linked Devices</li>
                        <li>Select "Link a Device"</li>
                        <li>Enter the pairing code</li>
                        <li>Wait for connection confirmation</li>
                    </ol>
                </div>
                <div class="col-md-6">
                    <h6><i class="fas fa-qrcode me-2"></i>QR Code Method</h6>
                    <ol>
                        <li>Switch to QR Code tab</li>
                        <li>Wait for QR code to appear</li>
                        <li>Open WhatsApp on your phone</li>
                        <li>Go to Settings → Linked Devices</li>
                        <li>Tap on "Link a Device"</li>
                        <li>Scan the QR code</li>
                        <li>Wait for automatic connection</li>
                    </ol>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        let currentPairingCode = null;
        let qrCodeGenerated = false;

        function updateStatus() {
            fetch('/api/status')
                .then(response => response.json())
                .then(data => {
                    updateConnectionStatus(data);
                    updateSystemInfo(data);
                    updatePairingInfo(data);
                    updateQRCode(data);
                    updateBotInfo(data);
                })
                .catch(error => {
                    console.error('Error:', error);
                    showErrorStatus();
                });
        }

        function updateConnectionStatus(data) {
            document.getElementById('connectionStatus').textContent = data.connection_status;
            document.getElementById('statusBadge').textContent = data.status;
            const indicator = document.getElementById('statusIndicator');
            indicator.className = 'status-indicator status-' + data.connection_status;
            const progressConfig = {
                'online': { width: '100%', text: 'Connected to WhatsApp', badge: 'bg-success' },
                'pairing': { width: '75%', text: 'Ready for pairing', badge: 'bg-info' },
                'waiting_pairing': { width: '60%', text: 'Waiting for pairing code', badge: 'bg-primary' },
                'connecting': { width: '50%', text: 'Connecting...', badge: 'bg-warning' },
                'offline': { width: '25%', text: 'Disconnected', badge: 'bg-danger' }
            };
            const config = progressConfig[data.connection_status] || { width: '50%', text: 'Initializing...', badge: 'bg-secondary' };
            document.getElementById('progressBar').style.width = config.width;
            document.getElementById('progressText').textContent = config.text;
            document.getElementById('statusBadge').className = 'badge ' + config.badge;
        }

        function updateSystemInfo(data) {
            if (data.performance) {
                document.getElementById('memoryInfo').textContent = Math.round(data.performance.memory.heapUsed / 1024 / 1024) + ' MB';
                document.getElementById('uptimeInfo').textContent = Math.round(data.performance.uptime) + ' seconds';
            }
            if (data.versions) {
                document.getElementById('nodeVersion').textContent = data.versions.node;
            }
        }

        function updatePairingInfo(data) {
            if (data.pairing_code) {
                currentPairingCode = data.pairing_code;
                document.getElementById('pairingCodeDisplay').textContent = data.pairing_code;
                document.getElementById('pairingCodeSection').style.display = 'block';
                document.getElementById('pairingStatus').textContent = 'Active';
                document.getElementById('pairingStatus').className = 'badge bg-success';
            } else {
                document.getElementById('pairingCodeSection').style.display = 'none';
                document.getElementById('pairingStatus').textContent = 'Not generated';
                document.getElementById('pairingStatus').className = 'badge bg-secondary';
            }
            if (data.phone_number) {
                document.getElementById('phoneInput').value = data.phone_number;
            }
        }

        function updateQRCode(data) {
            if (data.qr_code) {
                document.getElementById('qrCodeSection').style.display = 'block';
                document.getElementById('noQrCode').style.display = 'none';
                document.getElementById('qrStatus').textContent = 'Available';
                document.getElementById('qrStatus').className = 'badge bg-success';
                const qrcodeElement = document.getElementById('qrcode');
                qrcodeElement.innerHTML = '';
                QRCode.toCanvas(qrcodeElement, data.qr_code, { width: 200, margin: 1 }, function(error) {
                    if (error) console.error('QR Code error:', error);
                });
            } else {
                document.getElementById('qrCodeSection').style.display = 'none';
                document.getElementById('noQrCode').style.display = 'block';
                document.getElementById('qrStatus').textContent = 'Not available';
                document.getElementById('qrStatus').className = 'badge bg-secondary';
            }
        }

        function updateBotInfo(data) {
            if (data.bot_info) {
                document.getElementById('botInfoSection').style.display = 'block';
                document.getElementById('botInfoContent').innerHTML = \`
                    <table class="table table-sm table-borderless mb-0">
                        <tr><td><strong>Name:</strong></td><td>\${data.bot_info.name || 'Unknown'}</td></tr>
                        <tr><td><strong>Phone:</strong></td><td>\${data.bot_info.phone || 'Not set'}</td></tr>
                        <tr><td><strong>Status:</strong></td><td><span class="badge bg-success">Connected</span></td></tr>
                    </table>
                \`;
                document.getElementById('connectionType').textContent = 'Connected';
                document.getElementById('connectionType').className = 'badge bg-success';
            } else {
                document.getElementById('botInfoSection').style.display = 'none';
                document.getElementById('connectionType').textContent = 'Disconnected';
                document.getElementById('connectionType').className = 'badge bg-secondary';
            }
        }

        function showErrorStatus() {
            document.getElementById('connectionStatus').textContent = 'error';
            document.getElementById('statusBadge').textContent = 'Connection Error';
            document.getElementById('statusIndicator').className = 'status-indicator status-offline';
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
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone.length < 10) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter a valid phone number (min 10 digits)</div>';
                return;
            }
            formMessage.innerHTML = '<div class="alert alert-info"><i class="fas fa-spinner fa-spin me-2"></i>Processing pairing request...</div>';
            fetch('/api/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: cleanPhone })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    formMessage.innerHTML = '<div class="alert alert-success"><i class="fas fa-check me-2"></i>' + result.message + '</div>';
                    updateStatus();
                    const checkInterval = setInterval(() => {
                        updateStatus();
                        if (currentPairingCode) clearInterval(checkInterval);
                    }, 2000);
                    setTimeout(() => clearInterval(checkInterval), 30000);
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger"><i class="fas fa-times me-2"></i>' + result.error + '</div>';
                }
            })
            .catch(error => {
                formMessage.innerHTML = '<div class="alert alert-danger"><i class="fas fa-times me-2"></i>Network error: ' + error.message + '</div>';
            });
        });

        function copyPairingCode() {
            if (currentPairingCode) {
                navigator.clipboard.writeText(currentPairingCode).then(() => {
                    alert('Pairing code copied to clipboard!');
                });
            }
        }

        function checkQRCode() {
            updateStatus();
        }

        function restartBot() {
            if (confirm('Restart the WhatsApp bot? This will temporarily disconnect.')) {
                fetch('/api/restart', { method: 'POST' })
                    .then(response => response.json())
                    .then(result => {
                        alert(result.message);
                        updateStatus();
                    })
                    .catch(() => alert('Error restarting bot'));
            }
        }

        function clearSession() {
            if (confirm('Clear current session? This will disconnect the bot and remove all pairing data.')) {
                fetch('/api/clear-session', { method: 'POST' })
                    .then(response => response.json())
                    .then(result => {
                        alert(result.message);
                        updateStatus();
                    })
                    .catch(() => alert('Error clearing session'));
            }
        }

        function showLogs() {
            alert('Check the Koyeb deployment logs for detailed information and QR codes.');
        }

        // Initialize
        document.getElementById('platformInfo').textContent = navigator.platform;
        setInterval(updateStatus, 3000);
        updateStatus();
        fetch('/api/status').then(response => response.json()).then(data => {
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
    res.setHeader('X-XSS-Protection', '1; mode=block');
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
        qr_code: global.qrCode,
        bot_info: global.botInfo,
        performance: {
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage(),
            platform: 'Koyeb'
        },
        versions: {
            node: process.version,
            platform: process.platform,
            arch: process.arch
        },
        features: {
            pairing: true,
            qr_code: true,
            web_dashboard: true,
            auto_reconnect: true
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
            error: 'Too many pairing attempts. Please try again in 5 minutes.' 
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

    pairingRateLimit.attempts++;
    pairingRateLimit.lastAttempt = now;

    // Call the pairing handler from index.js
    if (global.handlePairingRequest) {
        const result = global.handlePairingRequest(cleanNumber);
        res.json(result);
    } else {
        res.status(500).json({ 
            success: false, 
            error: 'Pairing system not available' 
        });
    }
});

// Restart Bot
app.post('/api/restart', (req, res) => {
    console.log(chalk.yellow('🔄 Restart requested via API'));
    
    if (global.handleRestartRequest) {
        const result = global.handleRestartRequest();
        res.json(result);
    } else {
        res.json({ 
            success: true, 
            message: 'Restart command received' 
        });
    }
});

// Clear Session
app.post('/api/clear-session', (req, res) => {
    console.log(chalk.yellow('🗑️ Clear session requested via API'));
    
    if (global.handleClearSession) {
        const result = global.handleClearSession();
        res.json(result);
    } else {
        // Fallback if function not available
        global.phoneNumber = null;
        global.pairingCode = null;
        global.botInfo = null;
        global.qrCode = null;
        global.connectionStatus = 'initializing';
        global.botStatus = 'Session cleared';
        
        res.json({ 
            success: true, 
            message: 'Session cleared successfully' 
        });
    }
});

// Health check for Koyeb
app.get('/health', (req, res) => {
    const status = global.connectionStatus === 'online' ? 'healthy' : 'initializing';
    
    res.json({ 
        status: status,
        service: 'WhatsApp Bot',
        connection: global.connectionStatus,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime())
    });
});

// System info
app.get('/api/system', (req, res) => {
    res.json({
        platform: process.platform,
        node_version: process.version,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        env: process.env.NODE_ENV || 'production'
    });
});

// ==============================
// 🔧 MANAGEMENT FUNCTIONS
// ==============================

function setPairingCode(code) {
    global.pairingCode = code;
    if (code) {
        global.connectionStatus = 'pairing';
        global.botStatus = 'Pairing code generated - Ready for connection';
        console.log(chalk.green(`🔐 Pairing code set: ${code}`));
    } else {
        console.log(chalk.yellow('🗑️ Pairing code cleared'));
    }
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log(chalk.blue(`🔌 Status: ${status} - ${message}`));
}

function setBotInfo(info) {
    global.botInfo = info;
    if (info) {
        console.log(chalk.green(`🤖 Bot connected: ${info.name || 'Unknown'} (${info.phone || 'No phone'})`));
    } else {
        console.log(chalk.yellow('🤖 Bot info cleared'));
    }
}

function setPhoneNumber(phone) {
    global.phoneNumber = phone;
    if (phone) {
        console.log(chalk.blue(`📱 Phone number set: ${phone}`));
    } else {
        console.log(chalk.yellow('📱 Phone number cleared'));
    }
}

function setQrCode(qr) {
    global.qrCode = qr;
    if (qr) {
        console.log(chalk.green('📱 QR code generated'));
    } else {
        console.log(chalk.yellow('📱 QR code cleared'));
    }
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

    try {
        const availablePort = await findAvailablePort(CURRENT_PORT);
        CURRENT_PORT = availablePort;
        
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
                console.log(chalk.green('║           Naze Bot Dashboard          ║'));
                console.log(chalk.green('╚═══════════════════════════════════════╝'));
                console.log(chalk.cyan(`🌐 Dashboard URL: http://0.0.0.0:${CURRENT_PORT}`));
                console.log(chalk.blue(`📊 API Status: http://0.0.0.0:${CURRENT_PORT}/api/status`));
                console.log(chalk.green(`📱 Pairing System: http://0.0.0.0:${CURRENT_PORT}/`));
                console.log(chalk.green(`❤️ Health Check: http://0.0.0.0:${CURRENT_PORT}/health`));
                console.log(chalk.magenta(`🚀 Ready on Koyeb`));
                
                resolve(CURRENT_PORT);
            });
        });
    } catch (error) {
        console.error(chalk.red('❌ Failed to start server:'), error);
        throw error;
    }
}

module.exports = { 
    app, 
    startServer, 
    setPairingCode,
    setConnectionStatus, 
    setBotInfo,
    setPhoneNumber,
    setQrCode
};

// Start server if run directly
if (require.main === module) {
    console.log(chalk.blue('🚀 Starting standalone web server...'));
    startServer().catch(console.error);
}
