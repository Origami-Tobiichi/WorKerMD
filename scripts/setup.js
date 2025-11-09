// scripts/setup.js
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting WhatsApp Bot setup for Netlify...');

// Create necessary directories
const directories = [
  'public',
  'sessions',
  'temp',
  'logs'
];

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Create static HTML file for Netlify
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot - Static Deployment</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            padding: 20px;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 3rem;
            border-radius: 20px;
            text-align: center;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #333;
        }
        
        .logo {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            color: #667eea;
        }
        
        .status {
            display: inline-block;
            background: #28a745;
            color: white;
            padding: 0.5rem 1.5rem;
            border-radius: 25px;
            margin: 1rem 0;
            font-weight: bold;
        }
        
        .info {
            background: rgba(102, 126, 234, 0.1);
            padding: 1.5rem;
            border-radius: 10px;
            margin: 1.5rem 0;
            text-align: left;
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin: 2rem 0;
        }
        
        .feature {
            background: rgba(102, 126, 234, 0.1);
            padding: 1rem;
            border-radius: 10px;
            text-align: center;
        }
        
        .warning {
            background: rgba(255, 152, 0, 0.2);
            padding: 1rem;
            border-radius: 10px;
            margin: 1rem 0;
            border: 1px solid rgba(255, 152, 0, 0.5);
        }
        
        .buttons {
            margin-top: 2rem;
        }
        
        .btn {
            display: inline-block;
            padding: 0.8rem 2rem;
            margin: 0.5rem;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 25px;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            font-size: 1rem;
        }
        
        .btn:hover {
            background: #764ba2;
            transform: translateY(-2px);
        }
        
        .note {
            margin-top: 2rem;
            padding: 1rem;
            background: rgba(0, 0, 0, 0.1);
            border-radius: 10px;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🤖</div>
        <h1>WhatsApp Bot</h1>
        <div class="status">Static Deployment - Bot Ready</div>
        
        <div class="info">
            <h3>📋 About This Bot</h3>
            <p>This is a feature-rich WhatsApp bot built with Baileys Multi Device library. This static deployment page is for demonstration purposes.</p>
        </div>
        
        <div class="features">
            <div class="feature">
                <strong>🎯 Multi Device</strong>
                <p>Supports multiple WhatsApp accounts</p>
            </div>
            <div class="feature">
                <strong>⚡ Fast</strong>
                <p>Lightning fast responses</p>
            </div>
            <div class="feature">
                <strong>🔧 Modular</strong>
                <p>Easy to customize and extend</p>
            </div>
        </div>
        
        <div class="warning">
            <strong>⚠️ Note for Netlify Deployment</strong>
            <p>This static site is for demonstration purposes. The actual WhatsApp bot requires a persistent server environment and cannot run on Netlify's static hosting.</p>
            <p><strong>Recommended hosting:</strong> Railway, Heroku, VPS, or other always-on services.</p>
        </div>
        
        <div class="buttons">
            <button class="btn" onclick="showDemo()">View Demo</button>
            <button class="btn" onclick="showFeatures()">Features</button>
        </div>
        
        <div class="note">
            <p><strong>Built with ❤️ using Node.js and Baileys</strong></p>
            <p>Version 1.0.8 | Static Deployment</p>
        </div>
    </div>

    <script>
        function showDemo() {
            alert('This is a static demonstration page. The actual bot runs on a server environment.');
        }
        
        function showFeatures() {
            const features = [
                'Multi-device support',
                'QR code authentication', 
                'Web dashboard',
                'Plugin system',
                'Multi-bot management',
                'Anti-spam protection'
            ];
            alert('Bot Features:\\n\\n' + features.map(f => '✓ ' + f).join('\\n'));
        }
    </script>
</body>
</html>`;

// Write HTML file
fs.writeFileSync('public/index.html', htmlContent);
console.log('📄 Created static HTML file: public/index.html');

// Create netlify.toml if not exists
const netlifyConfig = `[build]
  command = "npm run build"
  publish = "public"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# Environment variables for configuration
[build.environment]
  NODE_ENV = "production"

# For functions (if needed)
[functions]
  directory = "netlify/functions"`;

if (!fs.existsSync('netlify.toml')) {
  fs.writeFileSync('netlify.toml', netlifyConfig);
  console.log('⚙️ Created netlify.toml configuration');
}

console.log('✅ Setup completed successfully!');
console.log('📦 Ready for Netlify deployment!');
