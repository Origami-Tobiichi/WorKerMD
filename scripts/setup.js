// scripts/static-build.js
const fs = require('fs');
const path = require('path');

console.log('🚀 Building static site for Netlify...');

// Ensure public directory exists
if (!fs.existsSync('public')) {
  fs.mkdirSync('public', { recursive: true });
}

// Create Netlify-compatible static HTML
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot - Web Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        :root {
            --primary-color: #667eea;
            --secondary-color: #764ba2;
            --success-color: #28a745;
            --warning-color: #ffc107;
            --danger-color: #dc3545;
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
        }
        .status-indicator { 
            width: 12px; 
            height: 12px; 
            border-radius: 50%; 
            display: inline-block; 
            margin-right: 8px; 
        }
        .status-offline { background: var(--danger-color); }
        .status-online { background: var(--success-color); }
        .bot-avatar { 
            width: 80px; 
            height: 80px; 
            border-radius: 50%; 
            object-fit: cover; 
            border: 3px solid var(--primary-color); 
        }
        .deployment-card {
            border-left: 4px solid var(--primary-color);
            background: rgba(102, 126, 234, 0.05);
        }
        .warning-card {
            border-left: 4px solid var(--warning-color);
            background: rgba(255, 193, 7, 0.1);
        }
        .feature-card {
            transition: transform 0.3s ease;
        }
        .feature-card:hover {
            transform: translateY(-5px);
        }
        .btn-deploy {
            background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
            border: none;
            color: white;
            padding: 12px 25px;
            border-radius: 25px;
            text-decoration: none;
            display: inline-block;
            margin: 5px;
            transition: all 0.3s ease;
        }
        .btn-deploy:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            color: white;
        }
    </style>
</head>
<body>
    <div id="notificationArea"></div>

    <div class="container py-4">
        <div class="row justify-content-center">
            <div class="col-lg-10">
                <!-- Header Card -->
                <div class="dashboard-card text-center mb-4">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <img src="https://cdn.pixabay.com/photo/2021/08/27/22/33/whatsapp-6579607_960_720.png" class="bot-avatar">
                        </div>
                        <div class="col">
                            <h1 class="display-5 fw-bold text-primary mb-2">
                                <i class="fab fa-whatsapp me-2"></i>WhatsApp Bot
                                <span class="badge bg-warning ms-2">
                                    <i class="fas fa-info-circle me-1"></i>Demo
                                </span>
                            </h1>
                            <p class="lead text-muted mb-3">Advanced WhatsApp Bot with Web Dashboard</p>
                            <div class="row text-center">
                                <div class="col-md-3">
                                    <small class="text-muted">Version: 1.0.8</small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Author: Your Name</small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Platform: Static</small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">Status: <span class="badge bg-danger">Offline</span></small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Warning Alert -->
                <div class="alert alert-warning alert-dismissible fade show">
                    <h4 class="alert-heading"><i class="fas fa-exclamation-triangle me-2"></i>Static Demo Version</h4>
                    <p class="mb-3">This is a <strong>static demonstration only</strong>. The actual WhatsApp bot requires a Node.js server environment with persistent processes and WebSocket support.</p>
                    <hr>
                    <p class="mb-0">To use the full bot functionality, deploy to one of the supported platforms below.</p>
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>

                <!-- Connection Status (Static) -->
                <div class="row">
                    <div class="col-md-6">
                        <div class="dashboard-card h-100">
                            <h4 class="mb-3"><i class="fas fa-plug me-2"></i>Connection Status</h4>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div>
                                    <span class="status-indicator status-offline"></span>
                                    <strong>offline</strong>
                                </div>
                                <span class="badge bg-danger">Static Mode</span>
                            </div>
                            
                            <div class="progress mb-3" style="height: 10px;">
                                <div class="progress-bar bg-secondary" style="width: 100%"></div>
                            </div>
                            <div class="small text-muted text-center">
                                Static preview - Server not running
                            </div>

                            <div class="mt-3 p-3 bg-light rounded">
                                <div class="d-flex justify-content-between align-items-center">
                                    <small class="text-muted">
                                        <i class="fas fa-shield-alt me-1"></i>
                                        Anti-Spam Protection
                                    </small>
                                    <span class="badge bg-secondary">Inactive</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="dashboard-card h-100">
                            <h5 class="mb-3"><i class="fas fa-mobile-alt me-2"></i>WhatsApp Authentication</h5>
                            <div class="alert alert-info">
                                <h6><i class="fas fa-info-circle me-2"></i>Feature Available in Full Version</h6>
                                <p class="mb-2">In the full version, you can:</p>
                                <ul class="small mb-0">
                                    <li>Enter WhatsApp number</li>
                                    <li>Get QR code or pairing code</li>
                                    <li>Connect to WhatsApp Web</li>
                                    <li>Real-time status updates</li>
                                </ul>
                            </div>
                            <div class="text-center">
                                <button class="btn btn-primary w-100 py-2 fw-bold" onclick="showDeploymentGuide()">
                                    <i class="fas fa-rocket me-2"></i>Deploy Full Version
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quick Deployment Options -->
                <div class="dashboard-card deployment-card mt-4">
                    <h4 class="mb-4 text-center"><i class="fas fa-cloud-upload-alt me-2"></i>One-Click Deployment</h4>
                    <div class="row text-center">
                        <div class="col-md-4 mb-3">
                            <div class="card feature-card h-100">
                                <div class="card-body">
                                    <i class="fas fa-train fa-3x text-primary mb-3"></i>
                                    <h5>Railway</h5>
                                    <p class="text-muted small">Recommended for WhatsApp bots</p>
                                    <a href="https://railway.app/template/whatever?referralCode=your-code" 
                                       class="btn-deploy" target="_blank">
                                        <i class="fas fa-deploy me-2"></i>Deploy Now
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 mb-3">
                            <div class="card feature-card h-100">
                                <div class="card-body">
                                    <i class="fab fa-heroku fa-3x text-purple mb-3"></i>
                                    <h5>Heroku</h5>
                                    <p class="text-muted small">Free tier available</p>
                                    <a href="https://heroku.com/deploy?template=your-repo" 
                                       class="btn-deploy" target="_blank">
                                        <i class="fas fa-cloud me-2"></i>Deploy to Heroku
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 mb-3">
                            <div class="card feature-card h-100">
                                <div class="card-body">
                                    <i class="fab fa-docker fa-3x text-blue mb-3"></i>
                                    <h5>Docker</h5>
                                    <p class="text-muted small">Any VPS/Cloud</p>
                                    <button class="btn-deploy" onclick="showDockerGuide()">
                                        <i class="fas fa-terminal me-2"></i>Docker Guide
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Features Grid -->
                <div class="dashboard-card mt-4">
                    <h4 class="mb-4 text-center"><i class="fas fa-star me-2"></i>Bot Features</h4>
                    <div class="row">
                        <div class="col-md-3 col-6 mb-3">
                            <div class="text-center">
                                <i class="fas fa-qrcode fa-2x text-primary mb-2"></i>
                                <h6>QR Code Login</h6>
                                <small class="text-muted">Easy authentication</small>
                            </div>
                        </div>
                        <div class="col-md-3 col-6 mb-3">
                            <div class="text-center">
                                <i class="fas fa-cogs fa-2x text-success mb-2"></i>
                                <h6>Web Dashboard</h6>
                                <small class="text-muted">Real-time monitoring</small>
                            </div>
                        </div>
                        <div class="col-md-3 col-6 mb-3">
                            <div class="text-center">
                                <i class="fas fa-layer-group fa-2x text-info mb-2"></i>
                                <h6>Multi-Bot</h6>
                                <small class="text-muted">Multiple accounts</small>
                            </div>
                        </div>
                        <div class="col-md-3 col-6 mb-3">
                            <div class="text-center">
                                <i class="fas fa-shield-alt fa-2x text-warning mb-2"></i>
                                <h6>Anti-Spam</h6>
                                <small class="text-muted">Rate limiting</small>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Local Development -->
                <div class="dashboard-card warning-card mt-4">
                    <div class="row align-items-center">
                        <div class="col-md-8">
                            <h4><i class="fas fa-laptop-code me-2"></i>Run Locally</h4>
                            <p class="mb-2">Test the bot on your local machine before deploying:</p>
                            <code class="bg-dark text-light p-2 rounded d-block">
                                git clone [your-repo-url]<br>
                                cd whatsapp-bot<br>
                                npm install<br>
                                npm start
                            </code>
                        </div>
                        <div class="col-md-4 text-center">
                            <button class="btn btn-success btn-lg mt-3" onclick="showLocalGuide()">
                                <i class="fas fa-play me-2"></i>Run Locally
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        function showNotification(message, type = 'info') {
            const notificationArea = document.getElementById('notificationArea');
            const notificationId = 'notif-' + Date.now();
            
            const notification = document.createElement('div');
            notification.id = notificationId;
            notification.className = \`alert alert-\${type} alert-dismissible fade show position-fixed top-0 end-0 m-3\`;
            notification.style.zIndex = '1000';
            notification.style.maxWidth = '400px';
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

        function showDeploymentGuide() {
            const guide = 
                '🚀 Full Version Deployment Guide:\\n\\n' +
                '1. RAILWAY (Recommended):\\n' +
                '   • Best for WhatsApp bots\\n' + 
                '   • Persistent processes\\n' +
                '   • Free tier available\\n\\n' +
                '2. HEROKU:\\n' +
                '   • Easy deployment\\n' +
                '   • Free tier (with limits)\\n\\n' +
                '3. DOCKER/VPS:\\n' +
                '   • Full control\\n' +
                '   • Best performance\\n\\n' +
                '4. REPLIT:\\n' +
                '   • Browser-based\\n' +
                '   • Easy to use';
            
            showNotification('Check the deployment cards below for one-click setup!', 'info');
        }

        function showDockerGuide() {
            const dockerCommands = 
                '🐳 Docker Deployment:\\n\\n' +
                '1. Build image:\\n' +
                '   docker build -t whatsapp-bot .\\n\\n' +
                '2. Run container:\\n' +
                '   docker run -p 3000:3000 whatsapp-bot\\n\\n' +
                '3. Access dashboard:\\n' +
                '   http://localhost:3000';
            
            alert(dockerCommands);
        }

        function showLocalGuide() {
            const localSetup = 
                '💻 Local Development:\\n\\n' +
                '1. Prerequisites:\\n' +
                '   • Node.js 16+ installed\\n' +
                '   • Stable internet connection\\n\\n' +
                '2. Setup commands:\\n' +
                '   git clone [your-repo]\\n' +
                '   cd whatsapp-bot\\n' +
                '   npm install\\n' +
                '   npm start\\n\\n' +
                '3. Access dashboard:\\n' +
                '   http://localhost:3000\\n\\n' +
                '4. Connect WhatsApp:\\n' +
                '   • Enter your number\\n' +
                '   • Use QR/pairing code\\n' +
                '   • Start chatting!';
            
            alert(localSetup);
        }

        // Show welcome message
        setTimeout(() => {
            showNotification('Welcome to WhatsApp Bot Demo! Deploy to see full features.', 'info');
        }, 1000);

        console.log('WhatsApp Bot Static Demo Loaded');
    </script>
</body>
</html>`;

// Write the HTML file
fs.writeFileSync(path.join('public', 'index.html'), htmlContent);
console.log('✅ Created Netlify-compatible static site');

// Create netlify.toml
const netlifyConfig = `[build]
  command = "npm run build"
  publish = "public"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# Security headers
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"`;

fs.writeFileSync('netlify.toml', netlifyConfig);
console.log('✅ Created netlify.toml');

console.log('🎉 Netlify static site ready!');
console.log('📦 Deploy to Netlify:');
console.log('   1. Push to GitHub');
console.log('   2. Connect repo at https://netlify.com');
console.log('   3. Deploy automatically');
console.log('💡 For full bot functionality, use Railway/Heroku instead');
