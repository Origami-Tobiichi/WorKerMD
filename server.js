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
// 🌐 HTML DASHBOARD - OPTIMIZED FOR KOYEB
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
        .security-badge {
            background: linear-gradient(135deg, #fd7e14, #e44d26);
            color: white;
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
            <span class="badge security-badge fs-6">
                <i class="fas fa-shield-alt me-1"></i>Secure Mode Active
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
                </div>
            </div>

            <div class="col-md-6">
                <div class="dashboard-card h-100">
                    <h4><i class="fas fa-shield-alt me-2"></i>Security Status</h4>
                    <div class="row text-center">
                        <div class="col-6 mb-3">
                            <div class="p-3 bg-light rounded">
                                <i class="fas fa-lock fa-2x text-success mb-2"></i>
                                <div class="fw-bold">DNS Protection</div>
                                <small class="text-muted">Active</small>
                            </div>
                        </div>
                        <div class="col-6 mb-3">
                            <div class="p-3 bg-light rounded">
                                <i class="fas fa-user-secret fa-2x text-primary mb-2"></i>
                                <div class="fw-bold">Stealth Mode</div>
                                <small class="text-muted">Enabled</small>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="p-3 bg-light rounded">
                                <i class="fas fa-bolt fa-2x text-warning mb-2"></i>
                                <div class="fw-bold">Fast Response</div>
                                <small class="text-muted">Optimized</small>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="p-3 bg-light rounded">
                                <i class="fas fa-sync fa-2x text-info mb-2"></i>
                                <div class="fw-bold">Header Rotation</div>
                                <small class="text-muted">Active</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- System Information -->
        <div class="dashboard-card">
            <h5><i class="fas fa-info-circle me-2"></i>System Information</h5>
            <div class="row">
                <div class="col-md-6">
                    <table class="table table-sm">
                        <tr>
                            <td><strong>Platform:</strong></td>
                            <td id="platformInfo">Loading...</td>
                        </tr>
                        <tr>
                            <td><strong>Uptime:</strong></td>
                            <td id="uptimeInfo">Loading...</td>
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
                            <td><strong>Security Level:</strong></td>
                            <td><span class="badge bg-success">HIGH</span></td>
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
                <button class="btn btn-outline-info" onclick="showSecurityInfo()">
                    <i class="fas fa-shield-alt me-2"></i>Security Info
                </button>
            </div>
        </div>

        <!-- Connection Guide -->
        <div class="whatsapp-guide">
            <h5><i class="fas fa-info-circle me-2"></i>Connection Guide</h5>
            <ol class="mb-0">
                <li>Wait for QR code in terminal</li>
                <li>Open WhatsApp → Linked Devices → Link a Device</li>
                <li>Scan the QR code</li>
                <li>Connection will be established automatically</li>
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
                        'online': { width: '100%', text: 'Connected to WhatsApp', badge: 'bg-success' },
                        'pairing': { width: '75%', text: 'Scan QR code to connect', badge: 'bg-info' },
                        'connecting': { width: '50%', text: 'Connecting to servers...', badge: 'bg-warning' },
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
                    .then(() => {
                        alert('Bot restarting...');
                        updateStatus();
                    })
                    .catch(() => alert('Error restarting bot'));
            }
        }

        function showSecurityInfo() {
            alert('Security Features:\\n• Secure DNS (DoH/DoT)\\n• Header Rotation\\n• Stealth Mode\\n• Fast Response System\\n• Anti-detection');
        }

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
</html>
`;

// ==============================
// 🚀 EXPRESS SERVER SETUP
// ==============================

// Initialize global variables jika belum ada
if (!global.botStatus) global.botStatus = 'Initializing...';
if (!global.connectionStatus) global.connectionStatus = 'connecting';
if (!global.phoneNumber) global.phoneNumber = null;
if (!global.pairingCode) global.pairingCode = null;
if (!global.botInfo) global.botInfo = null;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// ==============================
// 📍 ROUTES - OPTIMIZED FOR KOYEB
// ==============================

// ROUTE 1: Root path - HTML DASHBOARD
app.get('/', (req, res) => {
    console.log(chalk.green('🌐 Serving HTML dashboard for /'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(HTML_DASHBOARD);
});

// ROUTE 2: API Status - JSON DATA
app.get('/api/status', (req, res) => {
    res.json({
        status: global.botStatus || 'Initializing',
        connection_status: global.connectionStatus || 'connecting',
        phone_number: global.phoneNumber,
        pairing_code: global.pairingCode,
        bot_info: global.botInfo,
        security: {
            dns: "secure",
            stealth: "enabled", 
            headers: "rotating",
            level: "high"
        },
        performance: {
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage(),
            dnsCache: global.dnsCache?.stats || { hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }
        },
        versions: {
            node: process.version,
            platform: process.platform
        },
        timestamp: new Date().toISOString()
    });
});

// ROUTE 3: Health check untuk Koyeb
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'WhatsApp Bot Dashboard'
    });
});

// ROUTE 4: Security info
app.get('/api/security', (req, res) => {
    res.json({
        features: [
            "Secure DNS (DoH/DoT)",
            "User-Agent Rotation", 
            "Stealth Browser Configuration",
            "Header Spoofing",
            "Fast Response System",
            "Priority Command Handling"
        ],
        dns_servers: [
            "NextDNS (Secure)",
            "Cloudflare",
            "Google DNS", 
            "Quad9"
        ],
        status: "active"
    });
});

// ROUTE 5: Restart bot
app.get('/api/restart', (req, res) => {
    global.botStatus = 'Restarting...';
    global.connectionStatus = 'connecting';

    console.log(chalk.yellow('🔄 Bot restart requested via API'));

    res.json({ 
        status: 'success', 
        message: 'Restart command sent',
        timestamp: new Date().toISOString()
    });
});

// ROUTE 6: System info
app.get('/api/system', (req, res) => {
    res.json({
        platform: process.platform,
        arch: process.arch,
        node_version: process.version,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        env: process.env.NODE_ENV || 'development'
    });
});

// ==============================
// 🔧 MANAGEMENT FUNCTIONS
// ==============================

function setPairingCode(code) {
    global.pairingCode = code;
    global.connectionStatus = 'pairing';
    global.botStatus = 'Pairing code generated';
    console.log(chalk.green(`🔐 Pairing code set: ${code}`));
}

function setConnectionStatus(status, message = '') {
    global.connectionStatus = status;
    global.botStatus = message || status;
    console.log(chalk.blue(`🔌 Status updated: ${status} - ${message}`));
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
// 🚀 START SERVER - KOYEB COMPATIBLE
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
            global.webUptime = Date.now();
            
            console.log(chalk.green('╔═══════════════════════════════════════╗'));
            console.log(chalk.green('║        WhatsApp Bot Dashboard        ║'));
            console.log(chalk.green('╚═══════════════════════════════════════╝'));
            console.log(chalk.cyan(`🌐 Dashboard URL: http://0.0.0.0:${CURRENT_PORT}`));
            console.log(chalk.blue(`📊 API Status: http://0.0.0.0:${CURRENT_PORT}/api/status`));
            console.log(chalk.green(`❤️ Health Check: http://0.0.0.0:${CURRENT_PORT}/health`));
            console.log(chalk.yellow(`⚡ Auto-refresh: Every 3 seconds`));
            console.log(chalk.magenta(`🚀 Ready for Koyeb deployment`));
            
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
    console.log(chalk.blue('🚀 Starting standalone web server...'));
    startServer().catch(console.error);
}
