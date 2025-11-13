const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');

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
// 🌐 HTML DASHBOARD - SIMPLE & WORKING
// ==============================

const HTML_DASHBOARD = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot Dashboard</title>
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
        .whatsapp-guide {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea, #764ba2);
            border: none;
        }
    </style>
</head>
<body>
    <div class="container py-4">
        <!-- Header -->
        <div class="dashboard-card text-center mb-4">
            <h1 class="display-4 fw-bold text-primary">
                <i class="fab fa-whatsapp me-2"></i>WhatsApp Bot Dashboard
            </h1>
            <p class="lead text-muted">Secure Connection • Real-time Monitoring</p>
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
                </div>
            </div>

            <div class="col-md-6">
                <div class="dashboard-card h-100">
                    <h4><i class="fas fa-mobile-alt me-2"></i>WhatsApp Connection</h4>
                    <form id="phoneForm">
                        <div class="mb-3">
                            <label class="form-label">Phone Number</label>
                            <input type="tel" class="form-control" id="phoneInput" 
                                   placeholder="6281234567890" required>
                        </div>
                        <button type="submit" class="btn btn-primary w-100">
                            <i class="fas fa-paper-plane me-2"></i>Start Connection
                        </button>
                    </form>
                    <div id="formMessage" class="mt-3"></div>
                </div>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="dashboard-card text-center">
            <h5 class="mb-3"><i class="fas fa-bolt me-2"></i>Quick Actions</h5>
            <div class="btn-group flex-wrap">
                <button class="btn btn-outline-primary" onclick="updateStatus()">
                    <i class="fas fa-sync-alt me-2"></i>Refresh
                </button>
                <button class="btn btn-outline-warning" onclick="restartBot()">
                    <i class="fas fa-redo me-2"></i>Restart
                </button>
                <button class="btn btn-outline-danger" onclick="clearSession()">
                    <i class="fas fa-trash me-2"></i>Clear Session
                </button>
            </div>
        </div>

        <!-- Connection Guide -->
        <div class="whatsapp-guide">
            <h5><i class="fas fa-info-circle me-2"></i>Connection Guide</h5>
            <ol class="mb-0">
                <li>Enter your WhatsApp number</li>
                <li>Click "Start Connection"</li>
                <li>Wait for pairing code</li>
                <li>Open WhatsApp → Linked Devices → Link a Device</li>
                <li>Enter the pairing code</li>
            </ol>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
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
                        'online': { width: '100%', text: 'Connected to WhatsApp' },
                        'pairing': { width: '75%', text: 'Enter pairing code' },
                        'connecting': { width: '50%', text: 'Connecting...' },
                        'waiting_phone': { width: '25%', text: 'Waiting for phone number' }
                    };
                    
                    const config = progressConfig[data.connection_status] || { width: '50%', text: 'Connecting...' };
                    document.getElementById('progressBar').style.width = config.width;
                    document.getElementById('progressText').textContent = config.text;
                })
                .catch(error => {
                    console.error('Error:', error);
                });
        }

        function restartBot() {
            if (confirm('Restart the bot?')) {
                fetch('/api/restart')
                    .then(() => alert('Bot restarting...'))
                    .catch(() => alert('Error restarting bot'));
            }
        }

        function clearSession() {
            if (confirm('Clear session? This will require re-authentication.')) {
                fetch('/api/clear-session', { method: 'POST' })
                    .then(() => {
                        alert('Session cleared');
                        location.reload();
                    })
                    .catch(() => alert('Error clearing session'));
            }
        }

        // Handle form submission
        document.getElementById('phoneForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const phone = document.getElementById('phoneInput').value.trim();
            const formMessage = document.getElementById('formMessage');
            
            if (!phone) {
                formMessage.innerHTML = '<div class="alert alert-danger">Please enter phone number</div>';
                return;
            }

            fetch('/api/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: phone })
            })
            .then(response => response.json())
            .then(result => {
                if (result.status === 'success') {
                    formMessage.innerHTML = '<div class="alert alert-success">Phone number accepted!</div>';
                    updateStatus();
                } else {
                    formMessage.innerHTML = '<div class="alert alert-danger">Error: ' + (result.error || 'Unknown error') + '</div>';
                }
            })
            .catch(error => {
                formMessage.innerHTML = '<div class="alert alert-danger">Network error</div>';
            });
        });

        // Auto-update every 3 seconds
        setInterval(updateStatus, 3000);
        
        // Initial update
        updateStatus();
    </script>
</body>
</html>
`;

// ==============================
// 🚀 EXPRESS SERVER SETUP
// ==============================

// Initialize global variables
global.botStatus = 'Initializing...';
global.connectionStatus = 'connecting';
global.phoneNumber = null;
global.pairingCode = null;
global.botInfo = null;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==============================
// 📍 ROUTES - FIXED
// ==============================

// ROUTE 1: Root path - RETURN HTML DASHBOARD
app.get('/', (req, res) => {
    console.log(chalk.green('🌐 Serving HTML dashboard for /'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(HTML_DASHBOARD);
});

// ROUTE 2: API Status - RETURN JSON
app.get('/api/status', (req, res) => {
    res.json({
        status: global.botStatus,
        connection_status: global.connectionStatus,
        phone_number: global.phoneNumber,
        pairing_code: global.pairingCode,
        bot_info: global.botInfo,
        security: {
            dns: "secure",
            stealth: "enabled", 
            headers: "rotating"
        },
        performance: {
            uptime: Math.floor((Date.now() - (global.webUptime || Date.now())) / 1000),
            memory: process.memoryUsage(),
            dnsCache: global.dnsCache?.stats || { hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }
        }
    });
});

// ROUTE 3: Pair phone number
app.post('/api/pair', (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }

    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.length < 8) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    global.phoneNumber = cleanNumber;
    global.connectionStatus = 'waiting_phone';
    global.botStatus = 'Waiting for pairing code...';

    console.log(chalk.green(`📱 Phone number set: ${cleanNumber}`));

    res.json({ 
        status: 'success', 
        message: 'Phone number accepted',
        phone: cleanNumber 
    });
});

// ROUTE 4: Clear session
app.post('/api/clear-session', (req, res) => {
    global.phoneNumber = null;
    global.pairingCode = null;
    global.botInfo = null;
    global.connectionStatus = 'initializing';
    global.botStatus = 'Session cleared';

    console.log(chalk.yellow('🗑️ Session cleared'));

    res.json({ 
        status: 'success', 
        message: 'Session cleared successfully' 
    });
});

// ROUTE 5: Restart bot
app.get('/api/restart', (req, res) => {
    global.botStatus = 'Restarting...';
    global.connectionStatus = 'connecting';

    console.log(chalk.yellow('🔄 Bot restarting...'));

    res.json({ 
        status: 'success', 
        message: 'Restart command sent' 
    });
});

// ROUTE 6: Package info
app.get('/api/package-info', (req, res) => {
    res.json({
        name: 'WhatsApp Bot',
        version: '2.0.0',
        author: 'Bot Developer',
        description: 'WhatsApp Bot with Web Dashboard'
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

function setSessionIssues(hasIssues) {
    if (hasIssues) {
        global.botStatus = 'Session issues detected';
        console.log(chalk.red('❌ Session issues detected'));
    } else {
        console.log(chalk.green('✅ Session issues resolved'));
    }
}

function getRateLimitInfo() {
    return {
        attempts: 0,
        maxAttempts: 3
    };
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
        
        server.listen(CURRENT_PORT, (err) => {
            if (err) {
                if (err.code === 'EADDRINUSE') {
                    console.log(chalk.yellow(`🔄 Port ${CURRENT_PORT} busy, trying ${CURRENT_PORT + 1}...`));
                    return startServer(CURRENT_PORT + 1).then(resolve).catch(reject);
                }
                console.log(chalk.red('❌ Server error:'), err);
                return reject(err);
            }
            
            isServerRunning = true;
            global.webUptime = Date.now();
            
            console.log(chalk.green('╔═══════════════════════════════════════╗'));
            console.log(chalk.green('║        WhatsApp Bot Dashboard        ║'));
            console.log(chalk.green('╚═══════════════════════════════════════╝'));
            console.log(chalk.cyan(`🌐 Dashboard URL: http://localhost:${CURRENT_PORT}`));
            console.log(chalk.blue(`📊 API Status: http://localhost:${CURRENT_PORT}/api/status`));
            console.log(chalk.green(`🛡️ Security: DNS Protection + Stealth Mode`));
            console.log(chalk.yellow(`⚡ Auto-refresh: Every 3 seconds`));
            console.log(chalk.magenta(`📱 Ready for WhatsApp connection`));
            
            resolve(CURRENT_PORT);
        });
    });
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

// Start server if run directly
if (require.main === module) {
    startServer().catch(console.error);
}
